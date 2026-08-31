-- FT-001 through FT-006. Run after 043_accounts_delete_manual_entry.sql.
-- Does not change Daily/Monthly/Chit payment calculations.

-- ---------------------------------------------------------------------------
-- FT-001 — Fixed / Predefined Cash+UPI must post to cashbook
-- ---------------------------------------------------------------------------
alter table public.fixed_chit_payments add column if not exists cash_amount numeric(14,2) not null default 0;
alter table public.fixed_chit_payments add column if not exists upi_amount numeric(14,2) not null default 0;
alter table public.fixed_chit_payments drop constraint if exists fixed_chit_payments_cash_nonnegative;
alter table public.fixed_chit_payments drop constraint if exists fixed_chit_payments_upi_nonnegative;
alter table public.fixed_chit_payments add constraint fixed_chit_payments_cash_nonnegative check (cash_amount >= 0);
alter table public.fixed_chit_payments add constraint fixed_chit_payments_upi_nonnegative check (upi_amount >= 0);

alter table public.predefined_chit_payments add column if not exists cash_amount numeric(14,2) not null default 0;
alter table public.predefined_chit_payments add column if not exists upi_amount numeric(14,2) not null default 0;
alter table public.predefined_chit_payments drop constraint if exists predefined_chit_payments_cash_nonnegative;
alter table public.predefined_chit_payments drop constraint if exists predefined_chit_payments_upi_nonnegative;
alter table public.predefined_chit_payments add constraint predefined_chit_payments_cash_nonnegative check (cash_amount >= 0);
alter table public.predefined_chit_payments add constraint predefined_chit_payments_upi_nonnegative check (upi_amount >= 0);

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

drop function if exists public.chit_update_fixed_payment(uuid,numeric,date,public.payment_mode,text,text);
create or replace function public.chit_update_fixed_payment(
  input_payment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text default null,
  input_notes text default null, input_cash_amount numeric default 0, input_upi_amount numeric default 0
) returns void language plpgsql security definer set search_path = public
as $$
declare payment public.fixed_chit_payments%rowtype; receipt_no text; split numeric[];
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record Fixed Chit payments'; end if;
  select * into payment from public.fixed_chit_payments
    where id = input_payment_id and organization_id = public.current_organization_id() for update;
  if payment.id is null then raise exception 'Payment schedule item not found'; end if;
  if input_amount_paid <= 0 or input_amount_paid > payment.amount_due then raise exception 'Invalid payment amount'; end if;
  split := public.chit_apply_cash_upi_split(input_payment_mode, input_amount_paid, input_cash_amount, input_upi_amount);
  if payment.amount_paid <= 0 or payment.receipt_number is null then
    receipt_no := public.fintrack_next_receipt_number(payment.organization_id);
  end if;
  update public.fixed_chit_payments set
    amount_paid = round(input_amount_paid, 2), paid_date = input_paid_date,
    payment_mode = input_payment_mode,
    payment_reference = nullif(trim(input_payment_reference), ''),
    notes = nullif(trim(input_notes), ''), collected_by = auth.uid(),
    cash_amount = split[1], upi_amount = split[2],
    receipt_number = coalesce(receipt_number, receipt_no),
    status = case when round(input_amount_paid, 2) = amount_due then 'paid' else 'partially_paid' end,
    updated_at = now()
  where id = payment.id;
  if receipt_no is not null then
    perform public.log_receipt_activity('chit_fixed', payment.id, 'generated');
  end if;
end;
$$;
grant execute on function public.chit_update_fixed_payment(uuid,numeric,date,public.payment_mode,text,text,numeric,numeric) to authenticated;

drop function if exists public.chit_update_predefined_payment(uuid,numeric,date,public.payment_mode,text,text);
create or replace function public.chit_update_predefined_payment(
  input_payment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text default null,
  input_notes text default null, input_cash_amount numeric default 0, input_upi_amount numeric default 0
) returns void language plpgsql security definer set search_path = public
as $$
declare payment public.predefined_chit_payments%rowtype; receipt_no text; split numeric[];
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record predefined chit payments'; end if;
  select * into payment from public.predefined_chit_payments
    where id = input_payment_id and organization_id = public.current_organization_id() for update;
  if payment.id is null then raise exception 'Payment schedule item not found'; end if;
  if input_amount_paid <= 0 or input_amount_paid > payment.amount_due then raise exception 'Invalid payment amount'; end if;
  split := public.chit_apply_cash_upi_split(input_payment_mode, input_amount_paid, input_cash_amount, input_upi_amount);
  if payment.amount_paid <= 0 or payment.receipt_number is null then
    receipt_no := public.fintrack_next_receipt_number(payment.organization_id);
  end if;
  update public.predefined_chit_payments set
    amount_paid = round(input_amount_paid, 2), paid_date = input_paid_date,
    payment_mode = input_payment_mode,
    payment_reference = nullif(trim(input_payment_reference), ''),
    notes = nullif(trim(input_notes), ''), collected_by = auth.uid(),
    cash_amount = split[1], upi_amount = split[2],
    receipt_number = coalesce(receipt_number, receipt_no),
    status = case when round(input_amount_paid, 2) = amount_due then 'paid' else 'partially_paid' end,
    updated_at = now()
  where id = payment.id;
  if receipt_no is not null then
    perform public.log_receipt_activity('chit_predefined', payment.id, 'generated');
  end if;
end;
$$;
grant execute on function public.chit_update_predefined_payment(uuid,numeric,date,public.payment_mode,text,text,numeric,numeric) to authenticated;

create or replace function public.chit_delete_fixed_payment(input_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Fixed Chit payments'; end if;
  update public.fixed_chit_payments set amount_paid = 0, paid_date = null,
    payment_mode = null, payment_reference = null, notes = null,
    cash_amount = 0, upi_amount = 0,
    collected_by = null, receipt_number = null, status = 'due', updated_at = now()
  where id = input_payment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Payment schedule item not found'; end if;
end;
$$;

create or replace function public.chit_delete_predefined_payment(input_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete predefined Chit payments'; end if;
  update public.predefined_chit_payments set amount_paid = 0, paid_date = null,
    payment_mode = null, payment_reference = null, notes = null,
    cash_amount = 0, upi_amount = 0,
    collected_by = null, receipt_number = null, status = 'due', updated_at = now()
  where id = input_payment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Payment schedule item not found'; end if;
end;
$$;

create or replace function public.accounts_trg_fixed_chit_payment_sync()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text;
begin
  select cm.full_name into member_name
  from public.chit_enrollments ce
  join public.chit_members cm on cm.id = ce.member_id
  where ce.id = new.enrollment_id;
  perform public.accounts_sync_chit_payment(
    'chit_fixed', new.id, new.amount_paid, new.paid_date, new.payment_mode,
    new.cash_amount, new.upi_amount, new.receipt_number, new.payment_reference, member_name
  );
  return new;
end;
$$;

drop trigger if exists accounts_fixed_chit_payment_sync on public.fixed_chit_payments;
create trigger accounts_fixed_chit_payment_sync
  after insert or update of amount_paid, paid_date, payment_mode, cash_amount, upi_amount, receipt_number on public.fixed_chit_payments
  for each row execute function public.accounts_trg_fixed_chit_payment_sync();

create or replace function public.accounts_trg_predefined_chit_payment_sync()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text;
begin
  select cm.full_name into member_name
  from public.chit_enrollments ce
  join public.chit_members cm on cm.id = ce.member_id
  where ce.id = new.enrollment_id;
  perform public.accounts_sync_chit_payment(
    'chit_predefined', new.id, new.amount_paid, new.paid_date, new.payment_mode,
    new.cash_amount, new.upi_amount, new.receipt_number, new.payment_reference, member_name
  );
  return new;
end;
$$;

drop trigger if exists accounts_predefined_chit_payment_sync on public.predefined_chit_payments;
create trigger accounts_predefined_chit_payment_sync
  after insert or update of amount_paid, paid_date, payment_mode, cash_amount, upi_amount, receipt_number on public.predefined_chit_payments
  for each row execute function public.accounts_trg_predefined_chit_payment_sync();

-- ---------------------------------------------------------------------------
-- FT-002 — Collection agents must not SELECT organisation Chit tables
-- ---------------------------------------------------------------------------
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'chit_schemes','chit_members','chit_enrollments','chit_cycles','chit_bids',
    'chit_installments','chit_payouts','chit_security_deposits','chit_audit_log','chit_report_configs'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'chit_members_read_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'chit_owner_read_' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id() and public.chit_is_owner())',
      'chit_owner_read_' || table_name, table_name
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- FT-004 — Deleting a finance account must reverse its cashbook source rows
-- ---------------------------------------------------------------------------
create or replace function public.delete_finance_account(account_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare account_snapshot jsonb; payment_count integer; payment_row record;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can delete accounts'; end if;

  select to_jsonb(a) into account_snapshot from public.finance_accounts a
  where a.id = account_id and a.organization_id = public.current_organization_id();
  if account_snapshot is null then raise exception 'Finance account not found'; end if;

  select count(*) into payment_count from public.payments
  where finance_account_id = account_id and organization_id = public.current_organization_id();
  perform public.write_finance_audit(account_id, 'account_deleted',
    jsonb_build_object('account', account_snapshot, 'deleted_payment_count', payment_count));

  perform public.accounts_remove_source_entries('finance_disbursement', account_id);
  for payment_row in
    select id from public.payments
    where finance_account_id = account_id and organization_id = public.current_organization_id()
  loop
    perform public.accounts_remove_source_entries('finance_payment', payment_row.id);
  end loop;

  delete from public.payments
  where finance_account_id = account_id and organization_id = public.current_organization_id();
  delete from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id();
end;
$$;
grant execute on function public.delete_finance_account(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- FT-005 — Monthly principal posts as cashbook disbursement
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
  select fa.id, fa.organization_id, fa.customer_id, c.full_name, fa.start_date, fa.kind,
    case when fa.kind = 'daily' then fa.disbursed_amount else fa.principal end
    into v_account_id, v_org_id, v_customer_id, v_customer_name, v_start_date, v_kind, paid
  from public.finance_accounts fa
  join public.customers c on c.id = fa.customer_id
  where fa.id = input_account_id and fa.kind in ('daily', 'monthly');

  if not found or coalesce(paid, 0) <= 0 then return; end if;

  perform public.accounts_remove_source_entries('finance_disbursement', input_account_id);
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
