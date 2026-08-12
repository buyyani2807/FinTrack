-- Run this migration in Supabase SQL Editor after schema.sql.
-- These functions derive organization_id from the signed-in user, never the browser.

create or replace function public.create_finance_account(
  customer_full_name text, customer_phone text, customer_address text,
  account_kind public.finance_kind, account_start_date date,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; new_customer_id uuid; new_account_id uuid;
begin
  select organization_id into org_id from public.profiles where id = auth.uid();
  if org_id is null then raise exception 'No financier workspace found'; end if;
  insert into public.customers (organization_id, full_name, phone, address)
  values (org_id, trim(customer_full_name), trim(customer_phone), nullif(trim(customer_address), ''))
  returning id into new_customer_id;
  insert into public.finance_accounts (
    organization_id, customer_id, kind, start_date, collection_amount, disbursed_amount,
    daily_collection, principal, monthly_interest_rate, penalty_rate
  ) values (
    org_id, new_customer_id, account_kind, account_start_date, account_collection_amount,
    account_disbursed_amount, account_daily_collection, account_principal,
    account_monthly_interest_rate, coalesce(account_penalty_rate, 0)
  ) returning id into new_account_id;
  return new_account_id;
end;
$$;

create or replace function public.record_finance_payment(
  account_id uuid, payment_date date, payment_mode public.payment_mode,
  amount_total numeric, amount_interest numeric default 0, amount_principal numeric default 0,
  amount_penalty numeric default 0, payment_ref text default null, payment_notes text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; payment_id uuid;
begin
  select organization_id into org_id from public.profiles where id = auth.uid();
  if not exists (select 1 from public.finance_accounts where id = account_id and organization_id = org_id) then
    raise exception 'Finance account not found in this workspace';
  end if;
  insert into public.payments (organization_id, finance_account_id, paid_on, mode, total_amount,
    interest_amount, principal_amount, penalty_amount, payment_reference, notes, created_by)
  values (org_id, account_id, payment_date, payment_mode, amount_total, amount_interest,
    amount_principal, amount_penalty, nullif(trim(payment_ref), ''), nullif(trim(payment_notes), ''), auth.uid())
  returning id into payment_id;
  return payment_id;
end;
$$;

grant execute on function public.create_finance_account(text,text,text,public.finance_kind,date,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.record_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text) to authenticated;
