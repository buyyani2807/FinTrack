-- Run after 003_account_management.sql.
-- Allows a financier to correct an account created with the wrong finance type.
drop function if exists public.update_finance_account(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric);

create function public.update_finance_account(
  account_id uuid, customer_full_name text, customer_phone text, customer_address text,
  account_kind public.finance_kind, account_collection_amount numeric, account_disbursed_amount numeric,
  account_daily_collection numeric, account_principal numeric, account_monthly_interest_rate numeric,
  account_penalty_rate numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare org_id uuid; customer_uuid uuid;
begin
  select organization_id, customer_id into org_id, customer_uuid from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id();
  if org_id is null then raise exception 'Finance account not found in this workspace'; end if;
  update public.customers set full_name = trim(customer_full_name), phone = trim(customer_phone),
    address = nullif(trim(customer_address), '') where id = customer_uuid;
  update public.finance_accounts set kind = account_kind, collection_amount = account_collection_amount,
    disbursed_amount = account_disbursed_amount, daily_collection = account_daily_collection,
    principal = account_principal, monthly_interest_rate = account_monthly_interest_rate,
    penalty_rate = coalesce(account_penalty_rate, 0) where id = account_id;
end;
$$;
grant execute on function public.update_finance_account(uuid,text,text,text,public.finance_kind,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;
