-- FinTrack Accounts P2: stored invoice due dates and parent ledger accounts.
-- Run AFTER 055_accounts_p0_reversal_integrity.sql.
-- Additive: does not alter Daily Finance, Monthly Finance, Chit Fund, or Cashbook behaviour.

alter table public.acc_coa
  add column if not exists parent_id uuid references public.acc_coa(id) on delete set null;

alter table public.acc_vouchers
  add column if not exists due_date date;

create or replace function public.acc_set_coa_parent(input_id uuid, input_parent_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; account public.acc_coa; parent public.acc_coa;
begin
  org_id := public.acc_require_owner();
  select * into account from public.acc_coa where id = input_id and organization_id = org_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if input_parent_id is null then
    update public.acc_coa set parent_id = null where id = account.id;
    return;
  end if;
  if input_parent_id = account.id then raise exception 'An account cannot be its own parent'; end if;
  select * into parent from public.acc_coa where id = input_parent_id and organization_id = org_id;
  if parent.id is null then raise exception 'Parent account not found'; end if;
  if parent.group_type <> account.group_type then raise exception 'Parent must be in the same group'; end if;
  if parent.parent_id = account.id then raise exception 'Circular parent is not allowed'; end if;
  update public.acc_coa set parent_id = parent.id where id = account.id;
end;
$$;

create or replace function public.acc_set_voucher_due(input_voucher_id uuid, input_due date)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; voucher public.acc_vouchers;
begin
  org_id := public.acc_require_owner();
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  update public.acc_vouchers set due_date = input_due where id = voucher.id;
end;
$$;

grant execute on function public.acc_set_coa_parent(uuid, uuid) to authenticated;
grant execute on function public.acc_set_voucher_due(uuid, date) to authenticated;
