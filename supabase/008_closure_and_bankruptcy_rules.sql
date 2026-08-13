-- Run AFTER 007_operations_roles_audit.sql.
-- Makes closure and bankruptcy reasons mandatory and protects their financial meaning.

alter table public.finance_accounts add column if not exists status_note text;
alter table public.finance_accounts add column if not exists status_note_at timestamptz;
alter table public.finance_accounts add column if not exists status_note_by uuid references auth.users(id);

create or replace function public.set_finance_account_status(account_id uuid, new_status text, action_note text)
returns void language plpgsql security definer set search_path = public
as $$
declare balance numeric; account_kind public.finance_kind; previous_status text;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can change account status'; end if;
  if new_status not in ('active', 'closed', 'bankrupt') then raise exception 'Invalid account status'; end if;
  if new_status in ('closed', 'bankrupt') and nullif(trim(action_note), '') is null then
    raise exception 'A closure or bankruptcy reason is required';
  end if;
  select kind, status into account_kind, previous_status from public.finance_accounts
    where id = account_id and organization_id = public.current_organization_id();
  if account_kind is null then raise exception 'Account not found'; end if;
  select case when account_kind = 'daily' then greatest(0, a.collection_amount - coalesce(sum(p.total_amount), 0))
              else greatest(0, a.principal - coalesce(sum(p.principal_amount), 0)) end into balance
  from public.finance_accounts a left join public.payments p on p.finance_account_id = a.id where a.id = account_id
  group by a.id, a.kind, a.collection_amount, a.principal;
  if new_status = 'closed' and balance > 0 then
    raise exception 'This account still has an outstanding balance of % and cannot be closed. Mark it bankrupt only if unrecoverable.', balance;
  end if;
  update public.finance_accounts set
    status = new_status,
    loss_amount = case when new_status = 'bankrupt' then balance else 0 end,
    status_changed_at = now(), status_changed_by = auth.uid(),
    status_note = nullif(trim(action_note), ''), status_note_at = now(), status_note_by = auth.uid()
  where id = account_id;
  perform public.write_finance_audit(account_id,
    case when new_status = 'closed' then 'account_closed' when new_status = 'bankrupt' then 'account_marked_bankrupt' else 'account_reopened' end,
    jsonb_build_object('previous_status', previous_status, 'new_status', new_status, 'outstanding_at_action', balance, 'note', nullif(trim(action_note), '')));
end;
$$;

grant execute on function public.set_finance_account_status(uuid,text,text) to authenticated;
