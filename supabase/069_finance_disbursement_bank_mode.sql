-- Finance disbursement "Paid out by" Bank transfer was accepted in the UI but
-- create/update RPCs coerced any non-upi / non-cash_upi mode to cash, so cashbook
-- always posted to the cash ledger. Sync already supported bank; only save path was wrong.
-- Run after 068_transaction_whatsapp_confirmations.sql (or after 050).

create or replace function public.create_finance_account(
  customer_full_name text, customer_phone text, customer_address text, account_kind public.finance_kind, account_start_date date,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric,
  payout_mode public.payment_mode default 'cash',
  payout_cash_amount numeric default null,
  payout_upi_amount numeric default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  new_customer_id uuid;
  new_account_id uuid;
  v_total numeric;
  v_mode public.payment_mode;
  v_cash numeric;
  v_upi numeric;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can create accounts'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  v_total := case when account_kind = 'daily' then account_disbursed_amount else account_principal end;
  v_mode := coalesce(payout_mode, 'cash');
  if v_mode = 'upi' then
    v_cash := 0;
    v_upi := round(case when coalesce(payout_upi_amount, 0) > 0 then payout_upi_amount else v_total end, 2);
  elsif v_mode = 'cash_upi' then
    v_cash := round(coalesce(payout_cash_amount, 0), 2);
    v_upi := round(coalesce(payout_upi_amount, 0), 2);
  elsif v_mode = 'bank' then
    v_cash := 0;
    v_upi := 0;
  else
    v_mode := 'cash';
    v_cash := round(case when coalesce(payout_cash_amount, 0) > 0 then payout_cash_amount else v_total end, 2);
    v_upi := 0;
  end if;
  if v_mode = 'cash_upi' and (v_cash <= 0 or v_upi <= 0 or round(v_cash + v_upi, 2) <> round(v_total, 2)) then
    raise exception 'Cash and UPI payout amounts must both be positive and equal the amount paid to the customer';
  end if;
  if v_mode = 'cash' and (round(v_cash, 2) <> round(v_total, 2) or v_upi <> 0) then
    raise exception 'Cash payout must equal the amount paid to the customer';
  end if;
  if v_mode = 'upi' and (round(v_upi, 2) <> round(v_total, 2) or v_cash <> 0) then
    raise exception 'UPI payout must equal the amount paid to the customer';
  end if;
  if v_mode = 'bank' and (v_cash <> 0 or v_upi <> 0 or coalesce(v_total, 0) <= 0) then
    raise exception 'Bank transfer payout must equal the amount paid to the customer';
  end if;
  insert into public.customers(organization_id, full_name, phone, address)
    values (org_id, trim(customer_full_name), trim(customer_phone), nullif(trim(customer_address), ''))
    returning id into new_customer_id;
  insert into public.finance_accounts(
    organization_id, customer_id, kind, start_date, collection_amount, disbursed_amount, daily_collection,
    principal, monthly_interest_rate, penalty_rate, collection_order,
    disbursement_mode, disbursement_cash_amount, disbursement_upi_amount
  ) values (
    org_id, new_customer_id, account_kind, account_start_date, account_collection_amount, account_disbursed_amount,
    account_daily_collection, account_principal, account_monthly_interest_rate, coalesce(account_penalty_rate, 0),
    (select coalesce(max(collection_order), 0) + 1 from public.finance_accounts where organization_id = org_id),
    v_mode, v_cash, v_upi
  ) returning id into new_account_id;
  perform public.write_finance_audit(new_account_id, 'account_created', jsonb_build_object(
    'kind', account_kind, 'start_date', account_start_date, 'payout_mode', v_mode
  ));
  perform public.accounts_sync_finance_disbursement(new_account_id);
  return new_account_id;
end;
$$;
grant execute on function public.create_finance_account(
  text, text, text, public.finance_kind, date, numeric, numeric, numeric, numeric, numeric, numeric, public.payment_mode, numeric, numeric
) to authenticated;

create or replace function public.update_finance_account(
  account_id uuid, customer_full_name text, customer_phone text, customer_address text, account_kind public.finance_kind,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric,
  payout_mode public.payment_mode default 'cash',
  payout_cash_amount numeric default null,
  payout_upi_amount numeric default null
) returns void language plpgsql security definer set search_path = public
as $$
declare
  customer_uuid uuid;
  before_data jsonb;
  previous_kind public.finance_kind;
  previous_rate numeric;
  previous_start date;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
  new_rate numeric;
  v_total numeric;
  v_mode public.payment_mode;
  v_cash numeric;
  v_upi numeric;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can edit accounts'; end if;
  select customer_id, to_jsonb(a), a.kind, a.monthly_interest_rate, a.start_date
    into customer_uuid, before_data, previous_kind, previous_rate, previous_start
    from public.finance_accounts a
    where id = account_id and organization_id = public.current_organization_id();
  if customer_uuid is null then raise exception 'Finance account not found'; end if;

  v_total := case when account_kind = 'daily' then account_disbursed_amount else account_principal end;
  v_mode := coalesce(payout_mode, 'cash');
  if v_mode = 'upi' then
    v_cash := 0;
    v_upi := round(case when coalesce(payout_upi_amount, 0) > 0 then payout_upi_amount else v_total end, 2);
  elsif v_mode = 'cash_upi' then
    v_cash := round(coalesce(payout_cash_amount, 0), 2);
    v_upi := round(coalesce(payout_upi_amount, 0), 2);
  elsif v_mode = 'bank' then
    v_cash := 0;
    v_upi := 0;
  else
    v_mode := 'cash';
    v_cash := round(case when coalesce(payout_cash_amount, 0) > 0 then payout_cash_amount else v_total end, 2);
    v_upi := 0;
  end if;
  if v_mode = 'cash_upi' and (v_cash <= 0 or v_upi <= 0 or round(v_cash + v_upi, 2) <> round(v_total, 2)) then
    raise exception 'Cash and UPI payout amounts must both be positive and equal the amount paid to the customer';
  end if;
  if v_mode = 'cash' and (round(v_cash, 2) <> round(v_total, 2) or v_upi <> 0) then
    raise exception 'Cash payout must equal the amount paid to the customer';
  end if;
  if v_mode = 'upi' and (round(v_upi, 2) <> round(v_total, 2) or v_cash <> 0) then
    raise exception 'UPI payout must equal the amount paid to the customer';
  end if;
  if v_mode = 'bank' and (v_cash <> 0 or v_upi <> 0 or coalesce(v_total, 0) <= 0) then
    raise exception 'Bank transfer payout must equal the amount paid to the customer';
  end if;

  update public.customers set full_name = trim(customer_full_name), phone = trim(customer_phone),
    address = nullif(trim(customer_address), '') where id = customer_uuid;
  update public.finance_accounts set kind = account_kind, collection_amount = account_collection_amount,
    disbursed_amount = account_disbursed_amount, daily_collection = account_daily_collection,
    principal = account_principal, monthly_interest_rate = account_monthly_interest_rate,
    penalty_rate = coalesce(account_penalty_rate, 0),
    disbursement_mode = v_mode, disbursement_cash_amount = v_cash, disbursement_upi_amount = v_upi
  where id = account_id;

  new_rate := account_monthly_interest_rate;
  if account_kind = 'monthly' and previous_kind = 'monthly'
     and new_rate is not null
     and round(coalesce(previous_rate, 0), 4) is distinct from round(new_rate, 4) then
    if not exists (select 1 from public.rate_changes where finance_account_id = account_id)
       and previous_start is not null and previous_start < today_ist then
      insert into public.rate_changes(finance_account_id, effective_date, monthly_interest_rate)
      values (account_id, previous_start, coalesce(previous_rate, 0));
    end if;
    if exists (
      select 1 from public.rate_changes
      where finance_account_id = account_id and effective_date = today_ist
    ) then
      update public.rate_changes
        set monthly_interest_rate = new_rate
        where finance_account_id = account_id and effective_date = today_ist;
    else
      insert into public.rate_changes(finance_account_id, effective_date, monthly_interest_rate)
      values (account_id, today_ist, new_rate);
    end if;
  end if;

  perform public.write_finance_audit(account_id, 'account_updated', jsonb_build_object('before', before_data, 'payout_mode', v_mode));
  perform public.accounts_sync_finance_disbursement(account_id);
end;
$$;
grant execute on function public.update_finance_account(
  uuid, text, text, text, public.finance_kind, numeric, numeric, numeric, numeric, numeric, numeric, public.payment_mode, numeric, numeric
) to authenticated;
