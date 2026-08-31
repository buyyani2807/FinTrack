-- FT-022 and FT-023. Run after 046. Safe to run again if 047 was already applied.
-- Does not change Daily/Monthly/Chit payment or prize calculations.

-- ---------------------------------------------------------------------------
-- FT-022 — Receipt numbers only for the caller's organisation
-- ---------------------------------------------------------------------------
create or replace function public.fintrack_next_receipt_number(input_org_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  yr integer := extract(year from timezone('Asia/Kolkata', now()))::integer;
  seq integer;
begin
  org_id := public.current_organization_id();
  if org_id is null or not public.is_active_finance_member() then
    raise exception 'Not authorized';
  end if;
  if input_org_id is distinct from org_id then
    raise exception 'Not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtext('receipt_seq:' || org_id::text || ':' || yr::text));
  insert into public.receipt_sequences(organization_id, receipt_year, next_number)
  values (org_id, yr, 2)
  on conflict (organization_id, receipt_year) do update
    set next_number = public.receipt_sequences.next_number + 1
  returning next_number - 1 into seq;
  return 'FT-' || yr::text || '-' || lpad(seq::text, 6, '0');
end;
$$;

revoke all on function public.fintrack_next_receipt_number(uuid) from public, anon;
grant execute on function public.fintrack_next_receipt_number(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- FT-023 — Re-sync cashbook when disbursed amount / principal is edited
-- ---------------------------------------------------------------------------
create or replace function public.accounts_sync_finance_disbursement(input_account_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_account_id uuid;
  v_org_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_start_date date;
  v_kind public.finance_kind;
  cash_ledger uuid;
  paid numeric;
begin
  perform public.accounts_remove_source_entries('finance_disbursement', input_account_id);

  select fa.id, fa.organization_id, fa.customer_id, c.full_name, fa.start_date, fa.kind,
    case when fa.kind = 'daily' then fa.disbursed_amount else fa.principal end
    into v_account_id, v_org_id, v_customer_id, v_customer_name, v_start_date, v_kind, paid
  from public.finance_accounts fa
  join public.customers c on c.id = fa.customer_id
  where fa.id = input_account_id and fa.kind in ('daily', 'monthly');

  if not found or coalesce(paid, 0) <= 0 then return; end if;

  perform public.accounts_ensure_default_ledgers(v_org_id);
  cash_ledger := public.accounts_ledger_for_mode(v_org_id, 'cash');
  perform public.accounts_upsert_entry(
    v_org_id, cash_ledger, v_start_date, 'money_out', 'Disbursement',
    coalesce(v_customer_name, 'Customer') || case when v_kind = 'daily' then ' · Paid to customer' else ' · Principal financed' end,
    0, paid, 'finance_disbursement', v_account_id, 'main', v_customer_id, v_account_id,
    null, null, 'cash', null, null, false
  );
end;
$$;

create or replace function public.update_finance_account(
  account_id uuid, customer_full_name text, customer_phone text, customer_address text, account_kind public.finance_kind,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare customer_uuid uuid; before_data jsonb;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can edit accounts'; end if;
  select customer_id, to_jsonb(a) into customer_uuid, before_data from public.finance_accounts a
    where id = account_id and organization_id = public.current_organization_id();
  if customer_uuid is null then raise exception 'Finance account not found'; end if;
  update public.customers set full_name = trim(customer_full_name), phone = trim(customer_phone),
    address = nullif(trim(customer_address), '') where id = customer_uuid;
  update public.finance_accounts set kind = account_kind, collection_amount = account_collection_amount,
    disbursed_amount = account_disbursed_amount, daily_collection = account_daily_collection,
    principal = account_principal, monthly_interest_rate = account_monthly_interest_rate,
    penalty_rate = coalesce(account_penalty_rate, 0)
  where id = account_id;
  perform public.write_finance_audit(account_id, 'account_updated', jsonb_build_object('before', before_data));
  perform public.accounts_sync_finance_disbursement(account_id);
end;
$$;

grant execute on function public.update_finance_account(
  uuid, text, text, text, public.finance_kind, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;
