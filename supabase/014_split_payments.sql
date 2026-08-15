-- Split collection payments: store Cash + UPI as one payment with a validated breakdown.
-- Run after 013_production_security_and_deletion.sql.

alter type public.payment_mode add value if not exists 'cash_upi';

alter table public.payments add column if not exists cash_amount numeric(12,2) not null default 0;
alter table public.payments add column if not exists upi_amount numeric(12,2) not null default 0;
alter table public.payments drop constraint if exists payments_cash_amount_nonnegative;
alter table public.payments drop constraint if exists payments_upi_amount_nonnegative;
alter table public.payments add constraint payments_cash_amount_nonnegative check (cash_amount >= 0);
alter table public.payments add constraint payments_upi_amount_nonnegative check (upi_amount >= 0);

drop function if exists public.record_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text);
create function public.record_finance_payment(
  account_id uuid, payment_date date, payment_mode public.payment_mode, amount_total numeric,
  amount_interest numeric, amount_principal numeric, amount_penalty numeric,
  payment_ref text, payment_notes text, payment_cash_amount numeric, payment_upi_amount numeric
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; payment_id uuid; account_status text;
begin
  if not public.is_active_finance_member() then raise exception 'Your collection agent account is inactive'; end if;
  select organization_id, status into org_id, account_status from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id()
    and (public.is_financier_owner() or collection_agent_id = auth.uid());
  if org_id is null then raise exception 'Account not found or not assigned to you'; end if;
  if account_status <> 'active' then raise exception 'Collections are disabled for this account because it is %', account_status; end if;
  if amount_total <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if payment_cash_amount < 0 or payment_upi_amount < 0 then raise exception 'Cash and UPI amounts cannot be negative'; end if;
  if payment_mode = 'cash_upi' and (payment_cash_amount <= 0 or payment_upi_amount <= 0 or payment_cash_amount + payment_upi_amount <> amount_total) then
    raise exception 'Cash and UPI amounts must both be positive and equal the total collected';
  end if;
  if payment_mode = 'cash' and (payment_cash_amount <> amount_total or payment_upi_amount <> 0) then raise exception 'Cash amount must equal the total collected'; end if;
  if payment_mode = 'upi' and (payment_upi_amount <> amount_total or payment_cash_amount <> 0) then raise exception 'UPI amount must equal the total collected'; end if;
  if payment_mode = 'bank' and (payment_cash_amount <> 0 or payment_upi_amount <> 0) then raise exception 'Bank-transfer payments cannot include cash or UPI amounts'; end if;

  insert into public.payments(organization_id, finance_account_id, paid_on, mode, total_amount, interest_amount, principal_amount, penalty_amount, payment_reference, notes, cash_amount, upi_amount, created_by, collected_by)
  values(org_id, account_id, payment_date, payment_mode, amount_total, amount_interest, amount_principal, amount_penalty, nullif(trim(payment_ref), ''), nullif(trim(payment_notes), ''), payment_cash_amount, payment_upi_amount, auth.uid(), auth.uid()) returning id into payment_id;
  perform public.write_finance_audit(account_id, 'payment_recorded', jsonb_build_object('amount', amount_total, 'date', payment_date, 'mode', payment_mode, 'cash_amount', payment_cash_amount, 'upi_amount', payment_upi_amount), payment_id);
  return payment_id;
end;
$$;
grant execute on function public.record_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text,numeric,numeric) to authenticated;

drop function if exists public.update_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text);
create function public.update_finance_payment(
  payment_id uuid, payment_date date, payment_mode public.payment_mode,
  amount_total numeric, amount_interest numeric, amount_principal numeric,
  amount_penalty numeric, payment_ref text, payment_notes text, payment_cash_amount numeric, payment_upi_amount numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare account_id uuid; before_data jsonb;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can edit recorded payments'; end if;
  if amount_total <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if payment_cash_amount < 0 or payment_upi_amount < 0 then raise exception 'Cash and UPI amounts cannot be negative'; end if;
  if payment_mode = 'cash_upi' and (payment_cash_amount <= 0 or payment_upi_amount <= 0 or payment_cash_amount + payment_upi_amount <> amount_total) then raise exception 'Cash and UPI amounts must both be positive and equal the total collected'; end if;
  if payment_mode = 'cash' and (payment_cash_amount <> amount_total or payment_upi_amount <> 0) then raise exception 'Cash amount must equal the total collected'; end if;
  if payment_mode = 'upi' and (payment_upi_amount <> amount_total or payment_cash_amount <> 0) then raise exception 'UPI amount must equal the total collected'; end if;
  if payment_mode = 'bank' and (payment_cash_amount <> 0 or payment_upi_amount <> 0) then raise exception 'Bank-transfer payments cannot include cash or UPI amounts'; end if;
  select finance_account_id, to_jsonb(p) into account_id, before_data from public.payments p
    where p.id = payment_id and p.organization_id = public.current_organization_id();
  if account_id is null then raise exception 'Payment not found'; end if;
  update public.payments set paid_on = payment_date, mode = payment_mode, total_amount = amount_total,
    interest_amount = coalesce(amount_interest, 0), principal_amount = coalesce(amount_principal, 0), penalty_amount = coalesce(amount_penalty, 0),
    payment_reference = nullif(trim(payment_ref), ''), notes = nullif(trim(payment_notes), ''), cash_amount = payment_cash_amount, upi_amount = payment_upi_amount,
    updated_by = auth.uid(), updated_at = now() where id = payment_id;
  perform public.write_finance_audit(account_id, 'payment_corrected', jsonb_build_object('before', before_data, 'cash_amount', payment_cash_amount, 'upi_amount', payment_upi_amount), payment_id);
end;
$$;
grant execute on function public.update_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text,numeric,numeric) to authenticated;
