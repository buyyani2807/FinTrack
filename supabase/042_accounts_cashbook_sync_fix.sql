-- Fix cashbook sync functions: avoid unassigned record errors on empty SELECT.
-- Run after 041_accounts_cashbook.sql if Save & sync failed with: record "fa" is not assigned yet

create or replace function public.accounts_sync_finance_payment(input_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  p record;
  v_account_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_kind public.finance_kind;
  cash_ledger uuid;
  upi_ledger uuid;
  bank_ledger uuid;
  desc_text text;
begin
  select * into p from public.payments where id = input_payment_id;
  if not found then return; end if;
  perform public.accounts_remove_source_entries('finance_payment', input_payment_id);
  if coalesce(p.total_amount, 0) <= 0 then return; end if;

  select fa.id, fa.kind, fa.customer_id, c.full_name
    into v_account_id, v_kind, v_customer_id, v_customer_name
  from public.finance_accounts fa
  join public.customers c on c.id = fa.customer_id
  where fa.id = p.finance_account_id;

  if not found then
    v_account_id := p.finance_account_id;
    v_customer_id := null;
    v_customer_name := 'Customer';
    v_kind := 'daily';
  end if;

  perform public.accounts_ensure_default_ledgers(p.organization_id);
  cash_ledger := public.accounts_ledger_for_mode(p.organization_id, 'cash');
  upi_ledger := public.accounts_ledger_for_mode(p.organization_id, 'upi');
  bank_ledger := public.accounts_ledger_for_mode(p.organization_id, 'bank');
  desc_text := coalesce(v_customer_name, 'Customer') || ' · ' ||
    case v_kind when 'daily' then 'Daily collection' else 'Monthly collection' end;

  if p.mode = 'cash' then
    perform public.accounts_upsert_entry(
      p.organization_id, cash_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
      p.total_amount, 0, 'finance_payment', p.id, 'cash', v_customer_id, v_account_id,
      p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
    );
  elsif p.mode = 'upi' then
    perform public.accounts_upsert_entry(
      p.organization_id, upi_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
      p.total_amount, 0, 'finance_payment', p.id, 'upi', v_customer_id, v_account_id,
      p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
    );
  elsif p.mode = 'bank' then
    perform public.accounts_upsert_entry(
      p.organization_id, bank_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
      p.total_amount, 0, 'finance_payment', p.id, 'bank', v_customer_id, v_account_id,
      p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
    );
  elsif p.mode = 'cash_upi' then
    if coalesce(p.cash_amount, 0) > 0 then
      perform public.accounts_upsert_entry(
        p.organization_id, cash_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
        p.cash_amount, 0, 'finance_payment', p.id, 'cash', v_customer_id, v_account_id,
        p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
      );
    end if;
    if coalesce(p.upi_amount, 0) > 0 then
      perform public.accounts_upsert_entry(
        p.organization_id, upi_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
        p.upi_amount, 0, 'finance_payment', p.id, 'upi', v_customer_id, v_account_id,
        p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
      );
    end if;
  end if;
end;
$$;

create or replace function public.accounts_sync_finance_disbursement(input_account_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_account_id uuid;
  v_org_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_start_date date;
  cash_ledger uuid;
  paid numeric;
begin
  select fa.id, fa.organization_id, fa.customer_id, c.full_name, fa.start_date, fa.disbursed_amount
    into v_account_id, v_org_id, v_customer_id, v_customer_name, v_start_date, paid
  from public.finance_accounts fa
  join public.customers c on c.id = fa.customer_id
  where fa.id = input_account_id and fa.kind = 'daily';

  if not found or coalesce(paid, 0) <= 0 then return; end if;

  perform public.accounts_remove_source_entries('finance_disbursement', input_account_id);
  perform public.accounts_ensure_default_ledgers(v_org_id);
  cash_ledger := public.accounts_ledger_for_mode(v_org_id, 'cash');
  perform public.accounts_upsert_entry(
    v_org_id, cash_ledger, v_start_date, 'money_out', 'Disbursement',
    coalesce(v_customer_name, 'Customer') || ' · Paid to customer',
    0, paid, 'finance_disbursement', v_account_id, 'main', v_customer_id, v_account_id,
    null, null, 'cash', null, null, false
  );
end;
$$;
