-- Accounts / Cashbook module for FinTrack.
-- Run after 040_chit_enroll_active_scheme.sql in Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Ledger accounts (Cash, UPI, Bank)
-- ---------------------------------------------------------------------------
create table if not exists public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_type text not null check (account_type in ('cash', 'upi', 'bank')),
  name text not null,
  bank_account_last4 text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ledger_accounts_org_idx on public.ledger_accounts(organization_id, account_type);

-- ---------------------------------------------------------------------------
-- Cashbook entries (central ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.cashbook_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ledger_account_id uuid not null references public.ledger_accounts(id) on delete restrict,
  entry_date date not null,
  entry_time time not null default (timezone('Asia/Kolkata', now())::time),
  transaction_type text not null check (transaction_type in (
    'opening_balance', 'money_in', 'money_out', 'transfer_in', 'transfer_out', 'adjustment'
  )),
  category text not null,
  description text not null,
  money_in numeric(14,2) not null default 0 check (money_in >= 0),
  money_out numeric(14,2) not null default 0 check (money_out >= 0),
  reference text,
  notes text,
  source_type text check (source_type is null or source_type in (
    'finance_payment', 'finance_disbursement', 'chit_auction', 'chit_fixed', 'chit_predefined',
    'manual', 'expense', 'transfer', 'opening_balance', 'day_closing_adjustment'
  )),
  source_id uuid,
  source_line_key text not null default 'main',
  customer_id uuid references public.customers(id) on delete set null,
  finance_account_id uuid references public.finance_accounts(id) on delete set null,
  collected_by uuid references auth.users(id) on delete set null,
  receipt_number text,
  payment_mode text,
  is_editable boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz,
  edit_reason text,
  original_money_in numeric(14,2),
  original_money_out numeric(14,2),
  check (money_in = 0 or money_out = 0)
);

create unique index if not exists cashbook_entries_source_unique_idx
  on public.cashbook_entries(organization_id, source_type, source_id, source_line_key)
  where source_type is not null and source_id is not null;

create index if not exists cashbook_entries_org_date_idx
  on public.cashbook_entries(organization_id, entry_date desc, entry_time desc, created_at desc);

create index if not exists cashbook_entries_ledger_idx
  on public.cashbook_entries(ledger_account_id, entry_date desc);

-- ---------------------------------------------------------------------------
-- Transfers between ledger accounts
-- ---------------------------------------------------------------------------
create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transfer_date date not null,
  from_ledger_account_id uuid not null references public.ledger_accounts(id) on delete restrict,
  to_ledger_account_id uuid not null references public.ledger_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  description text,
  notes text,
  out_entry_id uuid references public.cashbook_entries(id) on delete set null,
  in_entry_id uuid references public.cashbook_entries(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_ledger_account_id <> to_ledger_account_id)
);

-- ---------------------------------------------------------------------------
-- Day closing / reconciliation
-- ---------------------------------------------------------------------------
create table if not exists public.day_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  closing_date date not null,
  ledger_account_id uuid not null references public.ledger_accounts(id) on delete restrict,
  opening_balance numeric(14,2) not null default 0,
  expected_balance numeric(14,2) not null default 0,
  actual_balance numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  notes text,
  is_reconciled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, closing_date, ledger_account_id)
);

-- ---------------------------------------------------------------------------
-- RLS — owner only
-- ---------------------------------------------------------------------------
alter table public.ledger_accounts enable row level security;
alter table public.cashbook_entries enable row level security;
alter table public.account_transfers enable row level security;
alter table public.day_closings enable row level security;

drop policy if exists ledger_accounts_owner on public.ledger_accounts;
create policy ledger_accounts_owner on public.ledger_accounts
  for all using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());

drop policy if exists cashbook_entries_owner on public.cashbook_entries;
create policy cashbook_entries_owner on public.cashbook_entries
  for all using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());

drop policy if exists account_transfers_owner on public.account_transfers;
create policy account_transfers_owner on public.account_transfers
  for all using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());

drop policy if exists day_closings_owner on public.day_closings;
create policy day_closings_owner on public.day_closings
  for all using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.accounts_ensure_default_ledgers(input_org_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.ledger_accounts where organization_id = input_org_id and account_type = 'cash') then
    insert into public.ledger_accounts(organization_id, account_type, name, is_default)
    values (input_org_id, 'cash', 'Cash', true);
  end if;
  if not exists (select 1 from public.ledger_accounts where organization_id = input_org_id and account_type = 'upi') then
    insert into public.ledger_accounts(organization_id, account_type, name, is_default)
    values (input_org_id, 'upi', 'UPI', true);
  end if;
  if not exists (select 1 from public.ledger_accounts where organization_id = input_org_id and account_type = 'bank') then
    insert into public.ledger_accounts(organization_id, account_type, name, is_default)
    values (input_org_id, 'bank', 'Bank', true);
  end if;
end;
$$;

create or replace function public.accounts_ledger_for_mode(
  input_org_id uuid, input_mode public.payment_mode
) returns uuid language plpgsql security definer set search_path = public
as $$
declare ledger_id uuid;
begin
  perform public.accounts_ensure_default_ledgers(input_org_id);
  if input_mode = 'cash' then
    select id into ledger_id from public.ledger_accounts
    where organization_id = input_org_id and account_type = 'cash' and is_default
    order by created_at asc limit 1;
  elsif input_mode = 'upi' then
    select id into ledger_id from public.ledger_accounts
    where organization_id = input_org_id and account_type = 'upi' and is_default
    order by created_at asc limit 1;
  else
    select id into ledger_id from public.ledger_accounts
    where organization_id = input_org_id and account_type = 'bank' and is_default
    order by created_at asc limit 1;
  end if;
  return ledger_id;
end;
$$;

create or replace function public.accounts_remove_source_entries(
  input_source_type text, input_source_id uuid
) returns void language plpgsql security definer set search_path = public
as $$
begin
  delete from public.cashbook_entries
  where source_type = input_source_type and source_id = input_source_id;
end;
$$;

create or replace function public.accounts_upsert_entry(
  input_org_id uuid, input_ledger_id uuid, input_date date, input_type text, input_category text,
  input_description text, input_money_in numeric, input_money_out numeric, input_source_type text,
  input_source_id uuid, input_source_line_key text, input_customer_id uuid, input_finance_account_id uuid,
  input_collected_by uuid, input_receipt_number text, input_payment_mode text, input_reference text,
  input_notes text, input_editable boolean
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(input_money_in, 0) <= 0 and coalesce(input_money_out, 0) <= 0 then
    perform public.accounts_remove_source_entries(input_source_type, input_source_id);
    return;
  end if;
  insert into public.cashbook_entries(
    organization_id, ledger_account_id, entry_date, transaction_type, category, description,
    money_in, money_out, source_type, source_id, source_line_key, customer_id, finance_account_id,
    collected_by, receipt_number, payment_mode, reference, notes, is_editable, created_by
  ) values (
    input_org_id, input_ledger_id, input_date,
    case when coalesce(input_money_in, 0) > 0 then 'money_in' else 'money_out' end,
    input_category, input_description,
    coalesce(input_money_in, 0), coalesce(input_money_out, 0),
    input_source_type, input_source_id, coalesce(input_source_line_key, 'main'),
    input_customer_id, input_finance_account_id, input_collected_by,
    input_receipt_number, input_payment_mode, input_reference, input_notes,
    coalesce(input_editable, false), auth.uid()
  )
  on conflict (organization_id, source_type, source_id, source_line_key)
  where source_type is not null and source_id is not null
  do update set
    ledger_account_id = excluded.ledger_account_id,
    entry_date = excluded.entry_date,
    transaction_type = excluded.transaction_type,
    category = excluded.category,
    description = excluded.description,
    money_in = excluded.money_in,
    money_out = excluded.money_out,
    customer_id = excluded.customer_id,
    finance_account_id = excluded.finance_account_id,
    collected_by = excluded.collected_by,
    receipt_number = excluded.receipt_number,
    payment_mode = excluded.payment_mode,
    reference = excluded.reference,
    notes = excluded.notes,
    is_editable = excluded.is_editable,
    updated_by = auth.uid(),
    updated_at = now();
end;
$$;

-- Sync finance payment collections into cashbook.
create or replace function public.accounts_sync_finance_payment(input_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  p record;
  fa record;
  cust record;
  cash_ledger uuid;
  upi_ledger uuid;
  bank_ledger uuid;
  desc_text text;
begin
  select * into p from public.payments where id = input_payment_id;
  if p.id is null then return; end if;
  perform public.accounts_remove_source_entries('finance_payment', input_payment_id);
  if coalesce(p.total_amount, 0) <= 0 then return; end if;
  select fa.*, c.full_name as customer_name into fa
  from public.finance_accounts fa
  join public.customers c on c.id = fa.customer_id
  where fa.id = p.finance_account_id;
  cash_ledger := public.accounts_ledger_for_mode(p.organization_id, 'cash');
  upi_ledger := public.accounts_ledger_for_mode(p.organization_id, 'upi');
  bank_ledger := public.accounts_ledger_for_mode(p.organization_id, 'bank');
  desc_text := coalesce(fa.customer_name, 'Customer') || ' · ' ||
    case fa.kind when 'daily' then 'Daily collection' else 'Monthly collection' end;
  if p.mode = 'cash' then
    perform public.accounts_upsert_entry(
      p.organization_id, cash_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
      p.total_amount, 0, 'finance_payment', p.id, 'cash', fa.customer_id, fa.id,
      p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
    );
  elsif p.mode = 'upi' then
    perform public.accounts_upsert_entry(
      p.organization_id, upi_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
      p.total_amount, 0, 'finance_payment', p.id, 'upi', fa.customer_id, fa.id,
      p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
    );
  elsif p.mode = 'bank' then
    perform public.accounts_upsert_entry(
      p.organization_id, bank_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
      p.total_amount, 0, 'finance_payment', p.id, 'bank', fa.customer_id, fa.id,
      p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
    );
  elsif p.mode = 'cash_upi' then
    if coalesce(p.cash_amount, 0) > 0 then
      perform public.accounts_upsert_entry(
        p.organization_id, cash_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
        p.cash_amount, 0, 'finance_payment', p.id, 'cash', fa.customer_id, fa.id,
        p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
      );
    end if;
    if coalesce(p.upi_amount, 0) > 0 then
      perform public.accounts_upsert_entry(
        p.organization_id, upi_ledger, p.paid_on, 'money_in', 'Finance Collection', desc_text,
        p.upi_amount, 0, 'finance_payment', p.id, 'upi', fa.customer_id, fa.id,
        p.collected_by, p.receipt_number, p.mode::text, p.payment_reference, p.notes, false
      );
    end if;
  end if;
end;
$$;

-- Sync finance disbursement (paid to customer) on account creation.
create or replace function public.accounts_sync_finance_disbursement(input_account_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare fa record;
  cash_ledger uuid;
  paid numeric;
begin
  select fa.*, c.full_name as customer_name into fa
  from public.finance_accounts fa
  join public.customers c on c.id = fa.customer_id
  where fa.id = input_account_id;
  if fa.id is null then return; end if;
  perform public.accounts_remove_source_entries('finance_disbursement', input_account_id);
  paid := case when fa.kind = 'daily' then coalesce(fa.disbursed_amount, 0) else coalesce(fa.principal, 0) end;
  if paid <= 0 then return; end if;
  cash_ledger := public.accounts_ledger_for_mode(fa.organization_id, 'cash');
  perform public.accounts_upsert_entry(
    fa.organization_id, cash_ledger, fa.start_date, 'money_out', 'Disbursement',
    coalesce(fa.customer_name, 'Customer') || ' · Paid to customer',
    0, paid, 'finance_disbursement', fa.id, 'main', fa.customer_id, fa.id,
    null, null, 'cash', null, null, false
  );
end;
$$;

-- Generic chit payment sync helper.
create or replace function public.accounts_sync_chit_payment(
  input_source_type text, input_payment_id uuid, input_amount numeric,
  input_paid_date date, input_mode public.payment_mode,
  input_cash_amount numeric, input_upi_amount numeric,
  input_receipt_number text, input_reference text, input_member_name text
) returns void language plpgsql security definer set search_path = public
as $$
declare org_id uuid;
  cash_ledger uuid; upi_ledger uuid; bank_ledger uuid;
  desc_text text;
begin
  org_id := public.current_organization_id();
  perform public.accounts_remove_source_entries(input_source_type, input_payment_id);
  if coalesce(input_amount, 0) <= 0 then return; end if;
  cash_ledger := public.accounts_ledger_for_mode(org_id, 'cash');
  upi_ledger := public.accounts_ledger_for_mode(org_id, 'upi');
  bank_ledger := public.accounts_ledger_for_mode(org_id, 'bank');
  desc_text := coalesce(input_member_name, 'Member') || ' · Chit collection';
  if input_mode = 'cash' then
    perform public.accounts_upsert_entry(org_id, cash_ledger, coalesce(input_paid_date, current_date), 'money_in', 'Chit Collection', desc_text,
      input_amount, 0, input_source_type, input_payment_id, 'cash', null, null, auth.uid(), input_receipt_number, input_mode::text, input_reference, null, false);
  elsif input_mode = 'upi' then
    perform public.accounts_upsert_entry(org_id, upi_ledger, coalesce(input_paid_date, current_date), 'money_in', 'Chit Collection', desc_text,
      input_amount, 0, input_source_type, input_payment_id, 'upi', null, null, auth.uid(), input_receipt_number, input_mode::text, input_reference, null, false);
  elsif input_mode = 'bank' then
    perform public.accounts_upsert_entry(org_id, bank_ledger, coalesce(input_paid_date, current_date), 'money_in', 'Chit Collection', desc_text,
      input_amount, 0, input_source_type, input_payment_id, 'bank', null, null, auth.uid(), input_receipt_number, input_mode::text, input_reference, null, false);
  elsif input_mode = 'cash_upi' then
    if coalesce(input_cash_amount, 0) > 0 then
      perform public.accounts_upsert_entry(org_id, cash_ledger, coalesce(input_paid_date, current_date), 'money_in', 'Chit Collection', desc_text,
        input_cash_amount, 0, input_source_type, input_payment_id, 'cash', null, null, auth.uid(), input_receipt_number, input_mode::text, input_reference, null, false);
    end if;
    if coalesce(input_upi_amount, 0) > 0 then
      perform public.accounts_upsert_entry(org_id, upi_ledger, coalesce(input_paid_date, current_date), 'money_in', 'Chit Collection', desc_text,
        input_upi_amount, 0, input_source_type, input_payment_id, 'upi', null, null, auth.uid(), input_receipt_number, input_mode::text, input_reference, null, false);
    end if;
  end if;
end;
$$;

-- Patch finance payment RPCs to sync cashbook.
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

-- Owner RPCs for Accounts module UI
create or replace function public.accounts_initialize(
  opening_cash numeric default 0, opening_upi numeric default 0, opening_bank numeric default 0
) returns void language plpgsql security definer set search_path = public
as $$
declare org_id uuid;
  cash_id uuid; upi_id uuid; bank_id uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can initialize accounts'; end if;
  org_id := public.current_organization_id();
  perform public.accounts_ensure_default_ledgers(org_id);
  select id into cash_id from public.ledger_accounts where organization_id = org_id and account_type = 'cash' and is_default limit 1;
  select id into upi_id from public.ledger_accounts where organization_id = org_id and account_type = 'upi' and is_default limit 1;
  select id into bank_id from public.ledger_accounts where organization_id = org_id and account_type = 'bank' and is_default limit 1;
  if coalesce(opening_cash, 0) > 0 and not exists (select 1 from public.cashbook_entries where organization_id = org_id and source_type = 'opening_balance' and source_line_key = 'cash') then
    insert into public.cashbook_entries(organization_id, ledger_account_id, entry_date, transaction_type, category, description, money_in, source_type, source_id, source_line_key, is_editable, created_by)
    values (org_id, cash_id, current_date, 'opening_balance', 'Opening Balance', 'Opening Cash Balance', opening_cash, 'opening_balance', cash_id, 'cash', false, auth.uid());
  end if;
  if coalesce(opening_upi, 0) > 0 and not exists (select 1 from public.cashbook_entries where organization_id = org_id and source_type = 'opening_balance' and source_line_key = 'upi') then
    insert into public.cashbook_entries(organization_id, ledger_account_id, entry_date, transaction_type, category, description, money_in, source_type, source_id, source_line_key, is_editable, created_by)
    values (org_id, upi_id, current_date, 'opening_balance', 'Opening Balance', 'Opening UPI Balance', opening_upi, 'opening_balance', upi_id, 'upi', false, auth.uid());
  end if;
  if coalesce(opening_bank, 0) > 0 and not exists (select 1 from public.cashbook_entries where organization_id = org_id and source_type = 'opening_balance' and source_line_key = 'bank') then
    insert into public.cashbook_entries(organization_id, ledger_account_id, entry_date, transaction_type, category, description, money_in, source_type, source_id, source_line_key, is_editable, created_by)
    values (org_id, bank_id, current_date, 'opening_balance', 'Opening Balance', 'Opening Bank Balance', opening_bank, 'opening_balance', bank_id, 'bank', false, auth.uid());
  end if;
end;
$$;

create or replace function public.accounts_record_manual_entry(
  input_ledger_account_id uuid, input_date date, input_direction text, input_category text,
  input_description text, input_amount numeric, input_reference text default null, input_notes text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; entry_id uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can add manual transactions'; end if;
  org_id := public.current_organization_id();
  if input_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  insert into public.cashbook_entries(
    organization_id, ledger_account_id, entry_date, transaction_type, category, description,
    money_in, money_out, source_type, source_id, source_line_key, reference, notes, is_editable, created_by
  ) values (
    org_id, input_ledger_account_id, input_date,
    case when input_direction = 'in' then 'money_in' else 'money_out' end,
    input_category, input_description,
    case when input_direction = 'in' then input_amount else 0 end,
    case when input_direction = 'out' then input_amount else 0 end,
    'manual', gen_random_uuid(), 'main', input_reference, input_notes, true, auth.uid()
  ) returning id into entry_id;
  update public.cashbook_entries set source_id = entry_id where id = entry_id;
  return entry_id;
end;
$$;

create or replace function public.accounts_record_expense(
  input_ledger_account_id uuid, input_date date, input_category text,
  input_amount numeric, input_description text, input_notes text default null, input_reference text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare entry_id uuid;
begin
  entry_id := public.accounts_record_manual_entry(
    input_ledger_account_id, input_date, 'out', input_category, input_description,
    input_amount, input_reference, input_notes
  );
  update public.cashbook_entries set source_type = 'expense', category = input_category where id = entry_id;
  return entry_id;
end;
$$;

create or replace function public.accounts_record_transfer(
  input_from_ledger_id uuid, input_to_ledger_id uuid, input_date date,
  input_amount numeric, input_description text default null, input_notes text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; transfer_id uuid; out_id uuid; in_id uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can transfer funds'; end if;
  org_id := public.current_organization_id();
  if input_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if input_from_ledger_id = input_to_ledger_id then raise exception 'Choose two different accounts'; end if;
  transfer_id := gen_random_uuid();
  insert into public.cashbook_entries(
    organization_id, ledger_account_id, entry_date, transaction_type, category, description,
    money_out, source_type, source_id, source_line_key, notes, is_editable, created_by
  ) values (
    org_id, input_from_ledger_id, input_date, 'transfer_out', 'Transfer',
    coalesce(input_description, 'Transfer out'), input_amount, 'transfer', transfer_id, 'out', input_notes, false, auth.uid()
  ) returning id into out_id;
  insert into public.cashbook_entries(
    organization_id, ledger_account_id, entry_date, transaction_type, category, description,
    money_in, source_type, source_id, source_line_key, notes, is_editable, created_by
  ) values (
    org_id, input_to_ledger_id, input_date, 'transfer_in', 'Transfer',
    coalesce(input_description, 'Transfer in'), input_amount, 'transfer', transfer_id, 'in', input_notes, false, auth.uid()
  ) returning id into in_id;
  insert into public.account_transfers(
    id, organization_id, transfer_date, from_ledger_account_id, to_ledger_account_id,
    amount, description, notes, out_entry_id, in_entry_id, created_by
  ) values (
    transfer_id, org_id, input_date, input_from_ledger_id, input_to_ledger_id,
    input_amount, input_description, input_notes, out_id, in_id, auth.uid()
  );
  return transfer_id;
end;
$$;

create or replace function public.accounts_record_day_closing(
  input_ledger_account_id uuid, input_date date, input_actual_balance numeric, input_notes text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; opening_bal numeric; expected_bal numeric; diff numeric; closing_id uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can close a day'; end if;
  org_id := public.current_organization_id();
  select coalesce(sum(money_in - money_out), 0) into opening_bal
  from public.cashbook_entries
  where organization_id = org_id and ledger_account_id = input_ledger_account_id and entry_date < input_date;
  select coalesce(sum(money_in - money_out), 0) into expected_bal
  from public.cashbook_entries
  where organization_id = org_id and ledger_account_id = input_ledger_account_id and entry_date <= input_date;
  diff := round(input_actual_balance - expected_bal, 2);
  insert into public.day_closings(
    organization_id, closing_date, ledger_account_id, opening_balance, expected_balance,
    actual_balance, difference, notes, is_reconciled, created_by
  ) values (
    org_id, input_date, input_ledger_account_id, opening_bal, expected_bal,
    input_actual_balance, diff, input_notes, diff = 0, auth.uid()
  )
  on conflict (organization_id, closing_date, ledger_account_id) do update set
    opening_balance = excluded.opening_balance,
    expected_balance = excluded.expected_balance,
    actual_balance = excluded.actual_balance,
    difference = excluded.difference,
    notes = excluded.notes,
    is_reconciled = excluded.is_reconciled
  returning id into closing_id;
  return closing_id;
end;
$$;

create or replace function public.accounts_backfill_cashbook()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare p record; cnt integer := 0;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can backfill cashbook'; end if;
  perform public.accounts_ensure_default_ledgers(public.current_organization_id());
  for p in select id from public.payments where organization_id = public.current_organization_id() loop
    perform public.accounts_sync_finance_payment(p.id);
    cnt := cnt + 1;
  end loop;
  for p in select id from public.finance_accounts where organization_id = public.current_organization_id() loop
    perform public.accounts_sync_finance_disbursement(p.id);
    cnt := cnt + 1;
  end loop;
  return jsonb_build_object('synced', cnt);
end;
$$;

grant execute on function public.accounts_initialize(numeric, numeric, numeric) to authenticated;
grant execute on function public.accounts_record_manual_entry(uuid, date, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.accounts_record_expense(uuid, date, text, numeric, text, text, text) to authenticated;
grant execute on function public.accounts_record_transfer(uuid, uuid, date, numeric, text, text) to authenticated;
grant execute on function public.accounts_record_day_closing(uuid, date, numeric, text) to authenticated;
grant execute on function public.accounts_backfill_cashbook() to authenticated;

create or replace function public.accounts_create_bank_account(input_name text, input_last4 text default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; bank_id uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can add bank accounts'; end if;
  org_id := public.current_organization_id();
  perform public.accounts_ensure_default_ledgers(org_id);
  insert into public.ledger_accounts(organization_id, account_type, name, bank_account_last4, is_default)
  values (org_id, 'bank', trim(input_name), nullif(trim(input_last4), ''), false)
  returning id into bank_id;
  return bank_id;
end;
$$;
grant execute on function public.accounts_create_bank_account(text, text) to authenticated;

-- Patch payment correction/deletion to keep cashbook in sync.
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
  update public.payments set paid_on = payment_date, mode = payment_mode, total_amount = amount_total,
    interest_amount = coalesce(amount_interest, 0), principal_amount = coalesce(amount_principal, 0), penalty_amount = coalesce(amount_penalty, 0),
    payment_reference = nullif(trim(payment_ref), ''), notes = nullif(trim(payment_notes), ''), cash_amount = payment_cash_amount, upi_amount = payment_upi_amount,
    updated_by = auth.uid(), updated_at = now() where id = payment_id;
  perform public.write_finance_audit(account_id, 'payment_corrected', jsonb_build_object('before', before_data, 'cash_amount', payment_cash_amount, 'upi_amount', payment_upi_amount), payment_id);
  perform public.accounts_sync_finance_payment(payment_id);
end;
$$;

create or replace function public.delete_finance_payment(payment_id uuid) returns void language plpgsql security definer set search_path = public
as $$
declare account_id uuid; before_data jsonb;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can delete recorded payments'; end if;
  select finance_account_id, to_jsonb(p) into account_id, before_data from public.payments p
    where p.id = payment_id and p.organization_id = public.current_organization_id();
  if account_id is null then raise exception 'Payment not found'; end if;
  perform public.write_finance_audit(account_id, 'payment_deleted', jsonb_build_object('before', before_data), payment_id);
  perform public.accounts_remove_source_entries('finance_payment', payment_id);
  delete from public.payments where id = payment_id;
end;
$$;

-- Sync disbursement when finance accounts are created.
create or replace function public.create_finance_account(
  customer_full_name text, customer_phone text, customer_address text, account_kind public.finance_kind, account_start_date date,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; new_customer_id uuid; new_account_id uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can create accounts'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  insert into public.customers(organization_id, full_name, phone, address) values (org_id, trim(customer_full_name), trim(customer_phone), nullif(trim(customer_address), '')) returning id into new_customer_id;
  insert into public.finance_accounts(organization_id, customer_id, kind, start_date, collection_amount, disbursed_amount, daily_collection, principal, monthly_interest_rate, penalty_rate, collection_order)
  values (org_id, new_customer_id, account_kind, account_start_date, account_collection_amount, account_disbursed_amount, account_daily_collection, account_principal, account_monthly_interest_rate, coalesce(account_penalty_rate, 0),
    (select coalesce(max(collection_order), 0) + 1 from public.finance_accounts where organization_id = org_id)) returning id into new_account_id;
  perform public.write_finance_audit(new_account_id, 'account_created', jsonb_build_object('kind', account_kind, 'start_date', account_start_date));
  perform public.accounts_sync_finance_disbursement(new_account_id);
  return new_account_id;
end;
$$;

-- Chit payment sync triggers (non-invasive; does not change chit calculations).
create or replace function public.accounts_trg_chit_installment_sync()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text;
begin
  select cm.full_name into member_name
  from public.chit_enrollments ce
  join public.chit_members cm on cm.id = ce.member_id
  where ce.id = new.enrollment_id;
  perform public.accounts_sync_chit_payment(
    'chit_auction', new.id, new.amount_paid, new.paid_date, new.payment_mode,
    new.cash_amount, new.upi_amount, new.receipt_number, new.payment_reference, member_name
  );
  return new;
end;
$$;

drop trigger if exists accounts_chit_installment_sync on public.chit_installments;
create trigger accounts_chit_installment_sync
  after insert or update of amount_paid, paid_date, payment_mode, cash_amount, upi_amount on public.chit_installments
  for each row execute function public.accounts_trg_chit_installment_sync();

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
    0, 0, new.receipt_number, new.payment_reference, member_name
  );
  return new;
end;
$$;

drop trigger if exists accounts_fixed_chit_payment_sync on public.fixed_chit_payments;
create trigger accounts_fixed_chit_payment_sync
  after insert or update of amount_paid, paid_date, payment_mode, receipt_number on public.fixed_chit_payments
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
    0, 0, new.receipt_number, new.payment_reference, member_name
  );
  return new;
end;
$$;

drop trigger if exists accounts_predefined_chit_payment_sync on public.predefined_chit_payments;
create trigger accounts_predefined_chit_payment_sync
  after insert or update of amount_paid, paid_date, payment_mode, receipt_number on public.predefined_chit_payments
  for each row execute function public.accounts_trg_predefined_chit_payment_sync();
