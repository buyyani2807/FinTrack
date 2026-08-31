-- FT-008 and FT-014. Run after 044_ft001_ft006_integrity.sql.
-- Does not change Daily/Monthly collection, interest, or Chit prize formulas.

-- ---------------------------------------------------------------------------
-- FT-008 — Daily bankruptcy loss is unreturned capital (disbursed − collected)
-- ---------------------------------------------------------------------------
create or replace function public.set_finance_account_status(account_id uuid, new_status text, action_note text)
returns void language plpgsql security definer set search_path = public
as $$
declare receivable numeric; capital_loss numeric; account_kind public.finance_kind; previous_status text;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can change account status'; end if;
  if new_status not in ('active', 'closed', 'bankrupt') then raise exception 'Invalid account status'; end if;
  if new_status in ('closed', 'bankrupt') and nullif(trim(action_note), '') is null then
    raise exception 'A closure or bankruptcy reason is required';
  end if;
  select kind, status into account_kind, previous_status from public.finance_accounts
    where id = account_id and organization_id = public.current_organization_id();
  if account_kind is null then raise exception 'Account not found'; end if;
  select
    case when account_kind = 'daily' then greatest(0, a.collection_amount - coalesce(sum(p.total_amount), 0))
         else greatest(0, a.principal - coalesce(sum(p.principal_amount), 0)) end,
    case when account_kind = 'daily' then greatest(0, a.disbursed_amount - coalesce(sum(p.total_amount), 0))
         else greatest(0, a.principal - coalesce(sum(p.principal_amount), 0)) end
    into receivable, capital_loss
  from public.finance_accounts a
  left join public.payments p on p.finance_account_id = a.id
  where a.id = account_id
  group by a.id, a.kind, a.collection_amount, a.principal, a.disbursed_amount;
  if new_status = 'closed' and receivable > 0 then
    raise exception 'This account still has an outstanding balance of % and cannot be closed. Mark it bankrupt only if unrecoverable.', receivable;
  end if;
  update public.finance_accounts set
    status = new_status,
    loss_amount = case when new_status = 'bankrupt' then capital_loss else 0 end,
    status_changed_at = now(), status_changed_by = auth.uid(),
    status_note = nullif(trim(action_note), ''), status_note_at = now(), status_note_by = auth.uid()
  where id = account_id;
  perform public.write_finance_audit(account_id,
    case when new_status = 'closed' then 'account_closed' when new_status = 'bankrupt' then 'account_marked_bankrupt' else 'account_reopened' end,
    jsonb_build_object('previous_status', previous_status, 'new_status', new_status, 'outstanding_at_action', receivable, 'capital_loss', capital_loss, 'note', nullif(trim(action_note), '')));
end;
$$;

grant execute on function public.set_finance_account_status(uuid,text,text) to authenticated;

update public.finance_accounts a
set loss_amount = greatest(0, a.disbursed_amount - coalesce((
  select sum(p.total_amount) from public.payments p where p.finance_account_id = a.id
), 0))
where a.status = 'bankrupt' and a.kind = 'daily';

-- ---------------------------------------------------------------------------
-- FT-014 — Assign many collection accounts in one RPC
-- ---------------------------------------------------------------------------
create or replace function public.assign_collection_agents_batch(input_assignments jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare item jsonb; account uuid; agent uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can assign collection agents'; end if;
  if input_assignments is null or jsonb_typeof(input_assignments) <> 'array' then
    raise exception 'Assignment list is required';
  end if;
  for item in select value from jsonb_array_elements(input_assignments)
  loop
    account := nullif(item->>'account_id', '')::uuid;
    agent := nullif(item->>'agent_id', '')::uuid;
    if account is null then raise exception 'Account is required'; end if;
    if agent is not null and not exists (
      select 1 from public.profiles
      where id = agent and organization_id = public.current_organization_id() and role = 'staff'
    ) then raise exception 'Collection agent not found'; end if;
    update public.finance_accounts
      set collection_agent_id = agent
      where id = account and organization_id = public.current_organization_id();
    if not found then raise exception 'Account not found'; end if;
    perform public.write_finance_audit(account, 'collection_agent_assigned', jsonb_build_object('agent_id', agent));
  end loop;
end;
$$;

grant execute on function public.assign_collection_agents_batch(jsonb) to authenticated;
revoke all on function public.assign_collection_agents_batch(jsonb) from public, anon;
