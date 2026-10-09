-- Chit Fund payment reversal. Paste in the Supabase SQL editor after 094.
-- Clears the collected amount on the existing row. Does not delete the row,
-- rename columns, or change auction, lift, dividend, or commission records.

create or replace function public.chit_apply_cash_upi_split(
  input_mode public.payment_mode, input_amount numeric, input_cash numeric, input_upi numeric
) returns numeric[] language plpgsql immutable set search_path = public
as $$
declare cash_amt numeric := round(coalesce(input_cash, 0), 2);
  upi_amt numeric := round(coalesce(input_upi, 0), 2);
  paid numeric := round(coalesce(input_amount, 0), 2);
begin
  if paid <= 0 then
    if cash_amt <> 0 or upi_amt <> 0 then raise exception 'Payment breakdown must be zero when no payment is recorded'; end if;
    return array[0, 0];
  end if;
  if input_mode = 'cash' and cash_amt = 0 and upi_amt = 0 then cash_amt := paid; end if;
  if input_mode = 'upi' and cash_amt = 0 and upi_amt = 0 then upi_amt := paid; end if;
  if input_mode = 'bank' then
    if cash_amt <> 0 or upi_amt <> 0 then raise exception 'Bank payments cannot include cash or UPI amounts'; end if;
    return array[0, 0];
  end if;
  if cash_amt < 0 or upi_amt < 0 then raise exception 'Cash and UPI amounts cannot be negative'; end if;
  if input_mode = 'cash' and (cash_amt <> paid or upi_amt <> 0) then raise exception 'Cash amount must equal total paid'; end if;
  if input_mode = 'upi' and (upi_amt <> paid or cash_amt <> 0) then raise exception 'UPI amount must equal total paid'; end if;
  if input_mode = 'cash_upi' and (cash_amt <= 0 or upi_amt <= 0 or round(cash_amt + upi_amt, 2) <> paid) then
    raise exception 'Cash and UPI amounts must equal total paid';
  end if;
  return array[cash_amt, upi_amt];
end;
$$;
revoke all on function public.chit_apply_cash_upi_split(public.payment_mode, numeric, numeric, numeric) from public, anon, authenticated;

drop function if exists public.chit_delete_installment_payment(uuid);
create or replace function public.chit_delete_installment_payment(input_installment_id uuid, input_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare row public.chit_installments;
  scheme_id uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Chit Fund payments'; end if;
  if nullif(trim(coalesce(input_reason, '')), '') is null then raise exception 'A reason is required to reverse this payment'; end if;
  select * into row from public.chit_installments
    where id = input_installment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Installment not found'; end if;
  if coalesce(row.amount_paid, 0) <= 0 then raise exception 'This payment is already reversed'; end if;
  if row.status = 'waived' then raise exception 'A waived installment cannot be reversed from payment delete'; end if;
  perform public.acc_assert_period_open(row.organization_id, coalesce(row.paid_date, current_date));
  select c.scheme_id into scheme_id from public.chit_cycles c where c.id = row.cycle_id;
  update public.chit_installments set amount_paid = 0, paid_date = null, payment_mode = null,
    payment_reference = null, cash_amount = 0, upi_amount = 0, notes = null, receipt_number = null,
    status = 'due', updated_at = now()
  where id = row.id and organization_id = row.organization_id;
  insert into public.chit_audit_log(organization_id, scheme_id, enrollment_id, action, before_data, after_data, actor_id)
  values (
    row.organization_id, scheme_id, row.enrollment_id, 'payment_reversed', to_jsonb(row),
    jsonb_build_object(
      'payment_id', row.id, 'member_id', row.enrollment_id, 'scheme_id', scheme_id,
      'amount', row.amount_paid, 'previous_status', row.status, 'status', 'due',
      'reason', trim(input_reason), 'paid_date', row.paid_date, 'payment_mode', row.payment_mode,
      'payment_reference', row.payment_reference
    ),
    auth.uid()
  );
end;
$$;
grant execute on function public.chit_delete_installment_payment(uuid, text) to authenticated;

drop function if exists public.chit_delete_fixed_payment(uuid);
create or replace function public.chit_delete_fixed_payment(input_payment_id uuid, input_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare row public.fixed_chit_payments;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Fixed Chit payments'; end if;
  if nullif(trim(coalesce(input_reason, '')), '') is null then raise exception 'A reason is required to reverse this payment'; end if;
  select * into row from public.fixed_chit_payments
    where id = input_payment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Payment schedule item not found'; end if;
  if coalesce(row.amount_paid, 0) <= 0 then raise exception 'This payment is already reversed'; end if;
  perform public.acc_assert_period_open(row.organization_id, coalesce(row.paid_date, current_date));
  update public.fixed_chit_payments set amount_paid = 0, paid_date = null,
    payment_mode = null, payment_reference = null, notes = null,
    cash_amount = 0, upi_amount = 0,
    collected_by = null, receipt_number = null, status = 'due', updated_at = now()
  where id = row.id and organization_id = row.organization_id;
  insert into public.chit_audit_log(organization_id, scheme_id, enrollment_id, action, before_data, after_data, actor_id)
  values (
    row.organization_id, row.scheme_id, row.enrollment_id, 'payment_reversed', to_jsonb(row),
    jsonb_build_object(
      'payment_id', row.id, 'member_id', row.enrollment_id, 'scheme_id', row.scheme_id,
      'amount', row.amount_paid, 'previous_status', row.status, 'status', 'due',
      'reason', trim(input_reason), 'paid_date', row.paid_date, 'payment_mode', row.payment_mode,
      'payment_reference', row.payment_reference
    ),
    auth.uid()
  );
end;
$$;
grant execute on function public.chit_delete_fixed_payment(uuid, text) to authenticated;

drop function if exists public.chit_delete_predefined_payment(uuid);
create or replace function public.chit_delete_predefined_payment(input_payment_id uuid, input_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare row public.predefined_chit_payments;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete predefined Chit payments'; end if;
  if nullif(trim(coalesce(input_reason, '')), '') is null then raise exception 'A reason is required to reverse this payment'; end if;
  select * into row from public.predefined_chit_payments
    where id = input_payment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Payment schedule item not found'; end if;
  if coalesce(row.amount_paid, 0) <= 0 then raise exception 'This payment is already reversed'; end if;
  perform public.acc_assert_period_open(row.organization_id, coalesce(row.paid_date, current_date));
  update public.predefined_chit_payments set amount_paid = 0, paid_date = null,
    payment_mode = null, payment_reference = null, notes = null,
    cash_amount = 0, upi_amount = 0,
    collected_by = null, receipt_number = null, status = 'due', updated_at = now()
  where id = row.id and organization_id = row.organization_id;
  insert into public.chit_audit_log(organization_id, scheme_id, enrollment_id, action, before_data, after_data, actor_id)
  values (
    row.organization_id, row.scheme_id, row.enrollment_id, 'payment_reversed', to_jsonb(row),
    jsonb_build_object(
      'payment_id', row.id, 'member_id', row.enrollment_id, 'scheme_id', row.scheme_id,
      'amount', row.amount_paid, 'previous_status', row.status, 'status', 'due',
      'reason', trim(input_reason), 'paid_date', row.paid_date, 'payment_mode', row.payment_mode,
      'payment_reference', row.payment_reference
    ),
    auth.uid()
  );
end;
$$;
grant execute on function public.chit_delete_predefined_payment(uuid, text) to authenticated;
