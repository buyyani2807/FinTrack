-- Chit Fund installment payment recording with Cash/UPI breakdown.
-- Run after 020_chit_scheme_full_edit.sql.
alter table public.chit_installments add column if not exists cash_amount numeric(14,2) not null default 0;
alter table public.chit_installments add column if not exists upi_amount numeric(14,2) not null default 0;
alter table public.chit_installments drop constraint if exists chit_installments_cash_nonnegative;
alter table public.chit_installments drop constraint if exists chit_installments_upi_nonnegative;
alter table public.chit_installments add constraint chit_installments_cash_nonnegative check (cash_amount >= 0);
alter table public.chit_installments add constraint chit_installments_upi_nonnegative check (upi_amount >= 0);

drop function if exists public.chit_update_installment_payment(uuid,numeric,date,public.payment_mode,text);
create or replace function public.chit_update_installment_payment(
  input_installment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text,
  input_cash_amount numeric, input_upi_amount numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare due numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record or edit Chit Fund payments'; end if;
  select net_amount_due into due from public.chit_installments
    where id = input_installment_id and organization_id = public.current_organization_id();
  if due is null then raise exception 'Installment not found'; end if;
  if input_amount_paid < 0 or input_amount_paid > due then raise exception 'Payment must be between zero and the amount due'; end if;
  if coalesce(input_cash_amount, 0) < 0 or coalesce(input_upi_amount, 0) < 0 then raise exception 'Cash and UPI amounts cannot be negative'; end if;
  if input_amount_paid = 0 and (coalesce(input_cash_amount, 0) <> 0 or coalesce(input_upi_amount, 0) <> 0) then raise exception 'Payment breakdown must be zero when no payment is recorded'; end if;
  if input_amount_paid > 0 and input_payment_mode = 'cash' and (round(input_cash_amount, 2) <> round(input_amount_paid, 2) or coalesce(input_upi_amount, 0) <> 0) then raise exception 'Cash amount must equal total paid'; end if;
  if input_amount_paid > 0 and input_payment_mode = 'upi' and (round(input_upi_amount, 2) <> round(input_amount_paid, 2) or coalesce(input_cash_amount, 0) <> 0) then raise exception 'UPI amount must equal total paid'; end if;
  if input_amount_paid > 0 and input_payment_mode = 'cash_upi' and (input_cash_amount <= 0 or input_upi_amount <= 0 or round(input_cash_amount + input_upi_amount, 2) <> round(input_amount_paid, 2)) then raise exception 'Cash and UPI amounts must equal total paid'; end if;
  update public.chit_installments set amount_paid = round(input_amount_paid, 2), paid_date = case when input_amount_paid > 0 then coalesce(input_paid_date, current_date) else null end,
    payment_mode = case when input_amount_paid > 0 then input_payment_mode else null end, payment_reference = nullif(trim(input_payment_reference), ''),
    cash_amount = coalesce(input_cash_amount, 0), upi_amount = coalesce(input_upi_amount, 0),
    status = case when input_amount_paid = 0 then 'due' when input_amount_paid < net_amount_due then 'partially_paid' else 'paid' end, updated_at = now()
  where id = input_installment_id;
end;
$$;
grant execute on function public.chit_update_installment_payment(uuid,numeric,date,public.payment_mode,text,numeric,numeric) to authenticated;
