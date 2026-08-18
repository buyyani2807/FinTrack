-- Production safeguards. Run after 014_split_payments.sql.
-- This migration is additive and keeps the existing collection API signatures.

-- Reject invalid component values at the database boundary, including direct RPC/API calls.
alter table public.finance_accounts
  drop constraint if exists finance_accounts_daily_values_nonnegative;
alter table public.finance_accounts
  add constraint finance_accounts_daily_values_nonnegative check (
    (kind = 'daily' and collection_amount > 0 and disbursed_amount > 0 and daily_collection > 0)
    or kind = 'monthly'
  );
alter table public.finance_accounts
  drop constraint if exists finance_accounts_monthly_values_nonnegative;
alter table public.finance_accounts
  add constraint finance_accounts_monthly_values_nonnegative check (
    (kind = 'monthly' and principal > 0 and monthly_interest_rate >= 0 and penalty_rate >= 0)
    or kind = 'daily'
  );
alter table public.payments
  drop constraint if exists payments_components_nonnegative;
alter table public.payments
  add constraint payments_components_nonnegative check (
    interest_amount >= 0 and principal_amount >= 0 and penalty_amount >= 0
  );

-- Serialize collection creation for an account/date and reject a second collection.
-- This protects against double-clicks, retries, two tabs, and concurrent staff/owner requests.
create or replace function public.record_finance_payment(
  account_id uuid, payment_date date, payment_mode public.payment_mode, amount_total numeric,
  amount_interest numeric, amount_principal numeric, amount_penalty numeric,
  payment_ref text, payment_notes text, payment_cash_amount numeric, payment_upi_amount numeric
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; payment_id uuid; account_status text;
begin
  if not public.is_active_finance_member() then raise exception 'Your collection agent account is inactive'; end if;
  perform pg_advisory_xact_lock(hashtext(account_id::text || ':' || payment_date::text));
  select organization_id, status into org_id, account_status from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id()
    and (public.is_financier_owner() or collection_agent_id = auth.uid());
  if org_id is null then raise exception 'Account not found or not assigned to you'; end if;
  if account_status <> 'active' then raise exception 'Collections are disabled for this account because it is %', account_status; end if;
  if exists (select 1 from public.payments where finance_account_id = account_id and paid_on = payment_date) then
    raise exception 'A collection is already recorded for this account on this date';
  end if;
  if amount_total <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if coalesce(amount_interest, 0) < 0 or coalesce(amount_principal, 0) < 0 or coalesce(amount_penalty, 0) < 0 then
    raise exception 'Payment components cannot be negative';
  end if;
  if payment_cash_amount < 0 or payment_upi_amount < 0 then raise exception 'Cash and UPI amounts cannot be negative'; end if;
  if payment_mode = 'cash_upi' and (payment_cash_amount <= 0 or payment_upi_amount <= 0 or round(payment_cash_amount + payment_upi_amount, 2) <> round(amount_total, 2)) then
    raise exception 'Cash and UPI amounts must both be positive and equal the total collected';
  end if;
  if payment_mode = 'cash' and (round(payment_cash_amount, 2) <> round(amount_total, 2) or payment_upi_amount <> 0) then raise exception 'Cash amount must equal the total collected'; end if;
  if payment_mode = 'upi' and (round(payment_upi_amount, 2) <> round(amount_total, 2) or payment_cash_amount <> 0) then raise exception 'UPI amount must equal the total collected'; end if;
  if payment_mode = 'bank' and (payment_cash_amount <> 0 or payment_upi_amount <> 0) then raise exception 'Bank-transfer payments cannot include cash or UPI amounts'; end if;
  insert into public.payments(organization_id, finance_account_id, paid_on, mode, total_amount, interest_amount, principal_amount, penalty_amount, payment_reference, notes, cash_amount, upi_amount, created_by, collected_by)
  values(org_id, account_id, payment_date, payment_mode, round(amount_total, 2), coalesce(amount_interest, 0), coalesce(amount_principal, 0), coalesce(amount_penalty, 0), nullif(trim(payment_ref), ''), nullif(trim(payment_notes), ''), round(payment_cash_amount, 2), round(payment_upi_amount, 2), auth.uid(), auth.uid()) returning id into payment_id;
  perform public.write_finance_audit(account_id, 'payment_recorded', jsonb_build_object('amount', amount_total, 'date', payment_date, 'mode', payment_mode, 'cash_amount', payment_cash_amount, 'upi_amount', payment_upi_amount), payment_id);
  return payment_id;
end;
$$;

grant execute on function public.record_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text,numeric,numeric) to authenticated;
