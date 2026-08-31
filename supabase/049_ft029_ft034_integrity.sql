-- FT-029, FT-030, FT-032. Run after 048_ft028_ft031_integrity.sql.
-- Does not change Daily/Monthly installment formulas or Chit prize math.

create or replace function public.assert_finance_payment_integrity(
  p_account_id uuid,
  p_payment_id uuid,
  p_payment_date date,
  p_amount_total numeric,
  p_amount_interest numeric,
  p_amount_principal numeric,
  p_amount_penalty numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare
  account_kind public.finance_kind;
  remaining numeric;
begin
  if coalesce(p_amount_interest, 0) < 0 or coalesce(p_amount_principal, 0) < 0 or coalesce(p_amount_penalty, 0) < 0 then
    raise exception 'Payment components cannot be negative';
  end if;
  if exists (
    select 1 from public.payments
    where finance_account_id = p_account_id
      and paid_on = p_payment_date
      and (p_payment_id is null or id <> p_payment_id)
  ) then
    raise exception 'A collection is already recorded for this account on this date';
  end if;

  select kind into account_kind
  from public.finance_accounts
  where id = p_account_id and organization_id = public.current_organization_id();
  if account_kind is null then raise exception 'Account not found'; end if;

  if account_kind = 'monthly' then
    if round(coalesce(p_amount_interest, 0) + coalesce(p_amount_principal, 0) + coalesce(p_amount_penalty, 0), 2)
       <> round(p_amount_total, 2) then
      raise exception 'Interest, principal and penalty must equal the total collected';
    end if;
    select greatest(0, round(a.principal - coalesce(sum(p.principal_amount), 0), 2))
      into remaining
      from public.finance_accounts a
      left join public.payments p on p.finance_account_id = a.id and (p_payment_id is null or p.id <> p_payment_id)
      where a.id = p_account_id
      group by a.principal;
    if round(coalesce(p_amount_principal, 0), 2) > remaining then
      raise exception 'Principal repaid cannot exceed the remaining principal of %', remaining;
    end if;
  else
    select greatest(0, round(a.collection_amount - coalesce(sum(p.total_amount), 0), 2))
      into remaining
      from public.finance_accounts a
      left join public.payments p on p.finance_account_id = a.id and (p_payment_id is null or p.id <> p_payment_id)
      where a.id = p_account_id
      group by a.collection_amount;
    if round(p_amount_total, 2) > remaining then
      raise exception 'Collection amount cannot exceed the remaining balance of %', remaining;
    end if;
  end if;
end;
$$;

revoke all on function public.assert_finance_payment_integrity(uuid, uuid, date, numeric, numeric, numeric, numeric) from public, anon, authenticated;

create or replace function public.record_finance_payment(
  account_id uuid, payment_date date, payment_mode public.payment_mode, amount_total numeric,
  amount_interest numeric, amount_principal numeric, amount_penalty numeric,
  payment_ref text, payment_notes text, payment_cash_amount numeric, payment_upi_amount numeric
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; payment_id uuid; account_status text; receipt_no text;
begin
  if not public.is_active_finance_member() then raise exception 'Your collection agent account is inactive'; end if;
  perform pg_advisory_xact_lock(hashtext(account_id::text || ':' || payment_date::text));
  select organization_id, status into org_id, account_status from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id()
    and (public.is_financier_owner() or collection_agent_id = auth.uid());
  if org_id is null then raise exception 'Account not found or not assigned to you'; end if;
  if account_status <> 'active' then raise exception 'Collections are disabled for this account because it is %', account_status; end if;
  if amount_total <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if payment_cash_amount < 0 or payment_upi_amount < 0 then raise exception 'Cash and UPI amounts cannot be negative'; end if;
  if payment_mode = 'cash_upi' and (payment_cash_amount <= 0 or payment_upi_amount <= 0 or round(payment_cash_amount + payment_upi_amount, 2) <> round(amount_total, 2)) then
    raise exception 'Cash and UPI amounts must both be positive and equal the total collected';
  end if;
  if payment_mode = 'cash' and (round(payment_cash_amount, 2) <> round(amount_total, 2) or payment_upi_amount <> 0) then raise exception 'Cash amount must equal the total collected'; end if;
  if payment_mode = 'upi' and (round(payment_upi_amount, 2) <> round(amount_total, 2) or payment_cash_amount <> 0) then raise exception 'UPI amount must equal the total collected'; end if;
  if payment_mode = 'bank' and (payment_cash_amount <> 0 or payment_upi_amount <> 0) then raise exception 'Bank-transfer payments cannot include cash or UPI amounts'; end if;
  perform public.assert_finance_payment_integrity(
    account_id, null, payment_date, amount_total, amount_interest, amount_principal, amount_penalty
  );
  receipt_no := public.fintrack_next_receipt_number(org_id);
  insert into public.payments(
    organization_id, finance_account_id, paid_on, mode, total_amount, interest_amount, principal_amount,
    penalty_amount, payment_reference, notes, cash_amount, upi_amount, created_by, collected_by, receipt_number
  ) values (
    org_id, account_id, payment_date, payment_mode, round(amount_total, 2), coalesce(amount_interest, 0),
    coalesce(amount_principal, 0), coalesce(amount_penalty, 0), nullif(trim(payment_ref), ''),
    nullif(trim(payment_notes), ''), round(payment_cash_amount, 2), round(payment_upi_amount, 2),
    auth.uid(), auth.uid(), receipt_no
  ) returning id into payment_id;
  perform public.write_finance_audit(account_id, 'payment_recorded', jsonb_build_object(
    'amount', amount_total, 'date', payment_date, 'mode', payment_mode,
    'cash_amount', payment_cash_amount, 'upi_amount', payment_upi_amount, 'receipt_number', receipt_no
  ), payment_id);
  perform public.log_receipt_activity('finance', payment_id, 'generated');
  perform public.accounts_sync_finance_payment(payment_id);
  return payment_id;
end;
$$;

create or replace function public.update_finance_payment(
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
  if payment_mode = 'cash_upi' and (payment_cash_amount <= 0 or payment_upi_amount <= 0 or round(payment_cash_amount + payment_upi_amount, 2) <> round(amount_total, 2)) then
    raise exception 'Cash and UPI amounts must both be positive and equal the total collected';
  end if;
  if payment_mode = 'cash' and (round(payment_cash_amount, 2) <> round(amount_total, 2) or payment_upi_amount <> 0) then raise exception 'Cash amount must equal the total collected'; end if;
  if payment_mode = 'upi' and (round(payment_upi_amount, 2) <> round(amount_total, 2) or payment_cash_amount <> 0) then raise exception 'UPI amount must equal the total collected'; end if;
  if payment_mode = 'bank' and (payment_cash_amount <> 0 or payment_upi_amount <> 0) then raise exception 'Bank-transfer payments cannot include cash or UPI amounts'; end if;
  select finance_account_id, to_jsonb(p) into account_id, before_data from public.payments p
    where p.id = payment_id and p.organization_id = public.current_organization_id();
  if account_id is null then raise exception 'Payment not found'; end if;
  perform public.assert_finance_payment_integrity(
    account_id, payment_id, payment_date, amount_total, amount_interest, amount_principal, amount_penalty
  );
  update public.payments set paid_on = payment_date, mode = payment_mode, total_amount = round(amount_total, 2),
    interest_amount = coalesce(amount_interest, 0), principal_amount = coalesce(amount_principal, 0), penalty_amount = coalesce(amount_penalty, 0),
    payment_reference = nullif(trim(payment_ref), ''), notes = nullif(trim(payment_notes), ''),
    cash_amount = round(payment_cash_amount, 2), upi_amount = round(payment_upi_amount, 2),
    updated_by = auth.uid(), updated_at = now() where id = payment_id;
  perform public.write_finance_audit(account_id, 'payment_corrected', jsonb_build_object('before', before_data, 'cash_amount', payment_cash_amount, 'upi_amount', payment_upi_amount), payment_id);
  perform public.accounts_sync_finance_payment(payment_id);
end;
$$;
