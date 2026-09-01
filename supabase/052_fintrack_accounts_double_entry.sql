-- FinTrack Accounts — standalone double-entry accounting.
-- Run AFTER 051_ft035_ft037_live_bid_and_chit_payout_mode.sql.
-- Additive: does not alter Daily Finance, Monthly Finance, Chit Fund, or Cashbook behaviour.
-- Accounting integration is OFF by default.

-- ---------------------------------------------------------------------------
-- Settings (one row per organisation)
-- ---------------------------------------------------------------------------
create table if not exists public.acc_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text,
  fy_start_month integer not null default 4 check (fy_start_month between 1 and 12),
  books_started_on date,
  integration_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------
create table if not exists public.acc_coa (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  group_type text not null check (group_type in ('asset', 'liability', 'equity', 'income', 'expense')),
  account_type text not null check (account_type in (
    'cash', 'upi', 'bank', 'receivable', 'payable', 'capital', 'drawing', 'retained', 'income', 'expense', 'other'
  )),
  is_system boolean not null default false,
  is_active boolean not null default true,
  opening_balance numeric(14,2) not null default 0,
  opening_side text not null default 'debit' check (opening_side in ('debit', 'credit')),
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists acc_coa_org_idx on public.acc_coa(organization_id, group_type, code);

-- ---------------------------------------------------------------------------
-- Parties (independent of finance customers)
-- ---------------------------------------------------------------------------
create table if not exists public.acc_parties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_type text not null check (party_type in ('customer', 'supplier', 'employee', 'agent', 'other')),
  name text not null,
  phone text,
  email text,
  address text,
  gstin text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acc_parties_org_idx on public.acc_parties(organization_id, party_type, name);

-- ---------------------------------------------------------------------------
-- Voucher numbering
-- ---------------------------------------------------------------------------
create table if not exists public.acc_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  voucher_type text not null,
  last_number integer not null default 0,
  primary key (organization_id, voucher_type)
);

-- ---------------------------------------------------------------------------
-- Vouchers + lines
-- ---------------------------------------------------------------------------
create table if not exists public.acc_vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  voucher_type text not null check (voucher_type in (
    'receipt', 'payment', 'contra', 'journal', 'sales', 'purchase', 'credit_note', 'debit_note'
  )),
  voucher_number text not null,
  voucher_date date not null,
  narration text not null default '',
  status text not null default 'posted' check (status in ('draft', 'posted', 'cancelled', 'reversed')),
  party_id uuid references public.acc_parties(id) on delete set null,
  source_module text,
  source_type text,
  source_transaction_id uuid,
  reversed_voucher_id uuid references public.acc_vouchers(id) on delete set null,
  original_voucher_id uuid references public.acc_vouchers(id) on delete set null,
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, voucher_number)
);

create unique index if not exists acc_vouchers_source_unique_idx
  on public.acc_vouchers(organization_id, source_module, source_type, source_transaction_id)
  where source_transaction_id is not null and status = 'posted';

create index if not exists acc_vouchers_org_date_idx
  on public.acc_vouchers(organization_id, voucher_date desc, voucher_number desc);

create table if not exists public.acc_voucher_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  voucher_id uuid not null references public.acc_vouchers(id) on delete cascade,
  line_no integer not null,
  coa_id uuid not null references public.acc_coa(id) on delete restrict,
  party_id uuid references public.acc_parties(id) on delete set null,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  description text,
  check (debit = 0 or credit = 0),
  check (debit > 0 or credit > 0),
  unique (voucher_id, line_no)
);

create index if not exists acc_voucher_lines_coa_idx on public.acc_voucher_lines(coa_id, voucher_id);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.acc_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists acc_audit_log_org_idx on public.acc_audit_log(organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Period locks
-- ---------------------------------------------------------------------------
create table if not exists public.acc_period_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_from date not null,
  period_to date not null,
  is_locked boolean not null default true,
  locked_at timestamptz not null default now(),
  locked_by uuid references auth.users(id) on delete set null,
  reopen_reason text,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  check (period_to >= period_from)
);

-- ---------------------------------------------------------------------------
-- Bank reconciliation (does not rewrite posted vouchers)
-- ---------------------------------------------------------------------------
create table if not exists public.acc_bank_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coa_id uuid not null references public.acc_coa(id) on delete restrict,
  statement_date date not null,
  opening_balance numeric(14,2) not null default 0,
  closing_balance numeric(14,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.acc_bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  statement_id uuid not null references public.acc_bank_statements(id) on delete cascade,
  line_date date not null,
  description text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  direction text not null check (direction in ('in', 'out')),
  matched_voucher_line_id uuid references public.acc_voucher_lines(id) on delete set null,
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'matched', 'suggested')),
  match_note text
);

-- ---------------------------------------------------------------------------
-- RLS — financier owner only. Collection agents have no accounting access.
-- ---------------------------------------------------------------------------
alter table public.acc_settings enable row level security;
alter table public.acc_coa enable row level security;
alter table public.acc_parties enable row level security;
alter table public.acc_sequences enable row level security;
alter table public.acc_vouchers enable row level security;
alter table public.acc_voucher_lines enable row level security;
alter table public.acc_audit_log enable row level security;
alter table public.acc_period_locks enable row level security;
alter table public.acc_bank_statements enable row level security;
alter table public.acc_bank_statement_lines enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'acc_settings', 'acc_coa', 'acc_parties', 'acc_sequences', 'acc_vouchers', 'acc_voucher_lines',
    'acc_audit_log', 'acc_period_locks', 'acc_bank_statements', 'acc_bank_statement_lines'
  ] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_owner', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using (organization_id = public.current_organization_id() and public.is_financier_owner()) with check (organization_id = public.current_organization_id() and public.is_financier_owner())',
      tbl || '_owner', tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.acc_require_owner()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare org_id uuid;
begin
  if not public.is_financier_owner() then
    raise exception 'Accounting is available only to the business owner';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  return org_id;
end;
$$;

create or replace function public.acc_write_audit(
  input_org_id uuid, input_entity_type text, input_entity_id uuid, input_action text,
  input_old jsonb default null, input_new jsonb default null, input_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.acc_audit_log(organization_id, entity_type, entity_id, action, actor_id, old_value, new_value, reason)
  values (input_org_id, input_entity_type, input_entity_id, input_action, auth.uid(), input_old, input_new, input_reason);
end;
$$;

create or replace function public.acc_assert_period_open(input_org_id uuid, input_date date)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.acc_period_locks
    where organization_id = input_org_id and is_locked and input_date between period_from and period_to
  ) then
    raise exception 'This accounting period is locked';
  end if;
end;
$$;

create or replace function public.acc_next_number(input_org_id uuid, input_type text)
returns text language plpgsql security definer set search_path = public as $$
declare seq integer;
declare prefix text;
begin
  prefix := case input_type
    when 'receipt' then 'RCPT'
    when 'payment' then 'PAY'
    when 'contra' then 'CON'
    when 'journal' then 'JNL'
    when 'sales' then 'SALE'
    when 'purchase' then 'PUR'
    when 'credit_note' then 'CN'
    when 'debit_note' then 'DN'
    else 'VCH'
  end;
  insert into public.acc_sequences(organization_id, voucher_type, last_number)
  values (input_org_id, input_type, 1)
  on conflict (organization_id, voucher_type)
  do update set last_number = public.acc_sequences.last_number + 1
  returning last_number into seq;
  return prefix || '-' || lpad(seq::text, 6, '0');
end;
$$;

create or replace function public.acc_seed_coa(input_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.acc_coa(organization_id, code, name, group_type, account_type, is_system)
  values
    (input_org_id, '1000', 'Cash in Hand', 'asset', 'cash', true),
    (input_org_id, '1010', 'UPI', 'asset', 'upi', true),
    (input_org_id, '1020', 'Bank', 'asset', 'bank', true),
    (input_org_id, '1100', 'Accounts Receivable', 'asset', 'receivable', true),
    (input_org_id, '1110', 'Daily Finance Receivable', 'asset', 'receivable', true),
    (input_org_id, '1120', 'Monthly Finance Receivable', 'asset', 'receivable', true),
    (input_org_id, '1130', 'Chit Fund Receivable', 'asset', 'receivable', true),
    (input_org_id, '1200', 'Loans & Advances', 'asset', 'other', false),
    (input_org_id, '2000', 'Accounts Payable', 'liability', 'payable', true),
    (input_org_id, '2100', 'Loans Payable', 'liability', 'payable', false),
    (input_org_id, '3000', 'Capital', 'equity', 'capital', true),
    (input_org_id, '3100', 'Drawings', 'equity', 'drawing', true),
    (input_org_id, '3200', 'Retained Earnings', 'equity', 'retained', true),
    (input_org_id, '4000', 'Interest Income', 'income', 'income', true),
    (input_org_id, '4100', 'Other Income', 'income', 'income', true),
    (input_org_id, '4200', 'Chit Commission', 'income', 'income', true),
    (input_org_id, '4300', 'Sales', 'income', 'income', true),
    (input_org_id, '5000', 'Rent', 'expense', 'expense', false),
    (input_org_id, '5010', 'Salary', 'expense', 'expense', false),
    (input_org_id, '5020', 'Agent Commission', 'expense', 'expense', false),
    (input_org_id, '5030', 'Fuel', 'expense', 'expense', false),
    (input_org_id, '5040', 'Electricity', 'expense', 'expense', false),
    (input_org_id, '5050', 'Internet', 'expense', 'expense', false),
    (input_org_id, '5060', 'Office Supplies', 'expense', 'expense', false),
    (input_org_id, '5070', 'Maintenance', 'expense', 'expense', false),
    (input_org_id, '5080', 'Marketing', 'expense', 'expense', false),
    (input_org_id, '5090', 'Travel', 'expense', 'expense', false),
    (input_org_id, '5100', 'Bank Charges', 'expense', 'expense', false),
    (input_org_id, '5110', 'Purchase', 'expense', 'expense', true),
    (input_org_id, '5990', 'Other Expenses', 'expense', 'expense', true)
  on conflict (organization_id, code) do nothing;
end;
$$;

create or replace function public.acc_initialize(input_company_name text default null, input_books_started_on date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.acc_require_owner();
  insert into public.acc_settings(organization_id, company_name, books_started_on)
  values (org_id, nullif(trim(input_company_name), ''), coalesce(input_books_started_on, current_date))
  on conflict (organization_id) do update set
    company_name = coalesce(excluded.company_name, public.acc_settings.company_name),
    books_started_on = coalesce(public.acc_settings.books_started_on, excluded.books_started_on),
    updated_at = now(),
    updated_by = auth.uid();
  perform public.acc_seed_coa(org_id);
  perform public.acc_write_audit(org_id, 'settings', org_id, 'initialize', null, jsonb_build_object('company_name', input_company_name), 'Books opened');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.acc_save_settings(
  input_company_name text,
  input_fy_start_month integer,
  input_books_started_on date
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.acc_require_owner();
  insert into public.acc_settings(organization_id, company_name, fy_start_month, books_started_on, updated_by)
  values (org_id, nullif(trim(input_company_name), ''), coalesce(input_fy_start_month, 4), input_books_started_on, auth.uid())
  on conflict (organization_id) do update set
    company_name = excluded.company_name,
    fy_start_month = excluded.fy_start_month,
    books_started_on = excluded.books_started_on,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

create or replace function public.acc_set_integration(input_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid;
declare previous boolean;
begin
  org_id := public.acc_require_owner();
  perform public.acc_initialize(null, current_date);
  select integration_enabled into previous from public.acc_settings where organization_id = org_id;
  update public.acc_settings
    set integration_enabled = coalesce(input_enabled, false), updated_at = now(), updated_by = auth.uid()
    where organization_id = org_id;
  perform public.acc_write_audit(
    org_id, 'settings', org_id, 'integration',
    jsonb_build_object('integration_enabled', previous),
    jsonb_build_object('integration_enabled', coalesce(input_enabled, false)),
    case when input_enabled then 'Accounting integration enabled' else 'Accounting integration disabled' end
  );
end;
$$;

create or replace function public.acc_create_coa(
  input_code text, input_name text, input_group_type text, input_account_type text
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; new_id uuid;
begin
  org_id := public.acc_require_owner();
  perform public.acc_initialize(null, current_date);
  insert into public.acc_coa(organization_id, code, name, group_type, account_type)
  values (org_id, trim(input_code), trim(input_name), input_group_type, coalesce(nullif(input_account_type, ''), 'other'))
  returning id into new_id;
  perform public.acc_write_audit(org_id, 'coa', new_id, 'create', null, jsonb_build_object('code', input_code, 'name', input_name), null);
  return new_id;
end;
$$;

create or replace function public.acc_create_party(
  input_party_type text, input_name text, input_phone text default null, input_email text default null,
  input_address text default null, input_gstin text default null, input_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; new_id uuid;
begin
  org_id := public.acc_require_owner();
  if trim(coalesce(input_name, '')) = '' then raise exception 'Party name is required'; end if;
  insert into public.acc_parties(organization_id, party_type, name, phone, email, address, gstin, notes)
  values (org_id, input_party_type, trim(input_name), nullif(trim(input_phone), ''), nullif(trim(input_email), ''),
          nullif(trim(input_address), ''), nullif(trim(input_gstin), ''), nullif(trim(input_notes), ''))
  returning id into new_id;
  perform public.acc_write_audit(org_id, 'party', new_id, 'create', null, jsonb_build_object('name', input_name, 'party_type', input_party_type), null);
  return new_id;
end;
$$;

create or replace function public.acc_post_voucher(
  input_voucher_type text,
  input_date date,
  input_narration text,
  input_lines jsonb,
  input_party_id uuid default null,
  input_source_module text default null,
  input_source_type text default null,
  input_source_transaction_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  voucher_id uuid;
  voucher_no text;
  line jsonb;
  line_no integer := 0;
  total_debit numeric := 0;
  total_credit numeric := 0;
  debit_amt numeric;
  credit_amt numeric;
begin
  org_id := public.acc_require_owner();
  perform public.acc_initialize(null, current_date);
  perform public.acc_assert_period_open(org_id, input_date);
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) < 2 then
    raise exception 'A voucher needs at least two lines';
  end if;
  for line in select * from jsonb_array_elements(input_lines)
  loop
    debit_amt := round(coalesce((line->>'debit')::numeric, 0), 2);
    credit_amt := round(coalesce((line->>'credit')::numeric, 0), 2);
    total_debit := total_debit + debit_amt;
    total_credit := total_credit + credit_amt;
  end loop;
  if total_debit <= 0 or total_debit <> total_credit then
    raise exception 'Unbalanced voucher cannot be posted. Debits % · Credits %', total_debit, total_credit;
  end if;
  voucher_no := public.acc_next_number(org_id, input_voucher_type);
  insert into public.acc_vouchers(
    organization_id, voucher_type, voucher_number, voucher_date, narration, status, party_id,
    source_module, source_type, source_transaction_id, created_by, posted_at, posted_by
  ) values (
    org_id, input_voucher_type, voucher_no, input_date, coalesce(input_narration, ''), 'posted', input_party_id,
    input_source_module, input_source_type, input_source_transaction_id, auth.uid(), now(), auth.uid()
  ) returning id into voucher_id;
  for line in select * from jsonb_array_elements(input_lines)
  loop
    line_no := line_no + 1;
    insert into public.acc_voucher_lines(organization_id, voucher_id, line_no, coa_id, party_id, debit, credit, description)
    values (
      org_id, voucher_id, line_no,
      (line->>'coa_id')::uuid,
      coalesce(nullif(line->>'party_id', '')::uuid, input_party_id),
      round(coalesce((line->>'debit')::numeric, 0), 2),
      round(coalesce((line->>'credit')::numeric, 0), 2),
      coalesce(line->>'description', input_narration)
    );
  end loop;
  perform public.acc_write_audit(org_id, 'voucher', voucher_id, 'post', null, jsonb_build_object(
    'voucher_number', voucher_no, 'voucher_type', input_voucher_type, 'debit', total_debit, 'credit', total_credit
  ), input_narration);
  return voucher_id;
end;
$$;

create or replace function public.acc_cancel_voucher(input_voucher_id uuid, input_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; voucher public.acc_vouchers;
begin
  org_id := public.acc_require_owner();
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status = 'cancelled' then raise exception 'Voucher is already cancelled'; end if;
  perform public.acc_assert_period_open(org_id, voucher.voucher_date);
  update public.acc_vouchers
    set status = 'cancelled', cancel_reason = coalesce(nullif(trim(input_reason), ''), 'Cancelled'),
        cancelled_at = now(), cancelled_by = auth.uid()
    where id = voucher.id;
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'cancel',
    jsonb_build_object('status', voucher.status, 'voucher_number', voucher.voucher_number),
    jsonb_build_object('status', 'cancelled'), input_reason);
end;
$$;

create or replace function public.acc_reverse_voucher(input_voucher_id uuid, input_date date, input_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  voucher public.acc_vouchers;
  lines jsonb;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be reversed'; end if;
  select jsonb_agg(jsonb_build_object(
    'coa_id', coa_id, 'party_id', party_id, 'debit', credit, 'credit', debit, 'description', coalesce(input_reason, 'Reversal')
  ) order by line_no) into lines
  from public.acc_voucher_lines where voucher_id = voucher.id;
  new_id := public.acc_post_voucher(
    voucher.voucher_type, coalesce(input_date, current_date),
    coalesce(nullif(trim(input_reason), ''), 'Reversal of ' || voucher.voucher_number),
    lines, voucher.party_id, 'accounts', 'reversal', voucher.id
  );
  update public.acc_vouchers set reversed_voucher_id = new_id, status = 'reversed' where id = voucher.id;
  update public.acc_vouchers set original_voucher_id = voucher.id where id = new_id;
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'reverse', jsonb_build_object('voucher_number', voucher.voucher_number), jsonb_build_object('reversal_id', new_id), input_reason);
  return new_id;
end;
$$;

create or replace function public.acc_lock_period(input_from date, input_to date)
returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; lock_id uuid;
begin
  org_id := public.acc_require_owner();
  if input_to < input_from then raise exception 'Invalid period'; end if;
  insert into public.acc_period_locks(organization_id, period_from, period_to, locked_by)
  values (org_id, input_from, input_to, auth.uid())
  returning id into lock_id;
  perform public.acc_write_audit(org_id, 'period_lock', lock_id, 'lock', null, jsonb_build_object('from', input_from, 'to', input_to), 'Period locked');
  return lock_id;
end;
$$;

create or replace function public.acc_reopen_period(input_lock_id uuid, input_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.acc_require_owner();
  if trim(coalesce(input_reason, '')) = '' then raise exception 'A reason is required to reopen a locked period'; end if;
  update public.acc_period_locks
    set is_locked = false, reopen_reason = trim(input_reason), reopened_at = now(), reopened_by = auth.uid()
    where id = input_lock_id and organization_id = org_id;
  if not found then raise exception 'Period lock not found'; end if;
  perform public.acc_write_audit(org_id, 'period_lock', input_lock_id, 'reopen', null, jsonb_build_object('reason', input_reason), input_reason);
end;
$$;

create or replace function public.acc_coa_id(input_org_id uuid, input_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.acc_coa where organization_id = input_org_id and code = input_code limit 1;
$$;

create or replace function public.acc_money_coa(input_org_id uuid, input_mode text)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if input_mode = 'upi' then return public.acc_coa_id(input_org_id, '1010'); end if;
  if input_mode = 'bank' then return public.acc_coa_id(input_org_id, '1020'); end if;
  return public.acc_coa_id(input_org_id, '1000');
end;
$$;

create or replace function public.acc_sync_operations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  enabled boolean;
  grouped record;
  lines jsonb;
  cash_amt numeric;
  upi_amt numeric;
  bank_amt numeric;
  total_in numeric;
  total_out numeric;
  recv uuid;
  created integer := 0;
begin
  org_id := public.acc_require_owner();
  perform public.acc_initialize(null, current_date);
  select integration_enabled into enabled from public.acc_settings where organization_id = org_id;
  if not coalesce(enabled, false) then
    return jsonb_build_object('created', 0, 'integration', false);
  end if;

  for grouped in
    select source_type, source_id, min(entry_date) as entry_date, min(description) as description,
           coalesce(sum(money_in) filter (where la.account_type = 'cash'), 0) as cash_in,
           coalesce(sum(money_out) filter (where la.account_type = 'cash'), 0) as cash_out,
           coalesce(sum(money_in) filter (where la.account_type = 'upi'), 0) as upi_in,
           coalesce(sum(money_out) filter (where la.account_type = 'upi'), 0) as upi_out,
           coalesce(sum(money_in) filter (where la.account_type = 'bank'), 0) as bank_in,
           coalesce(sum(money_out) filter (where la.account_type = 'bank'), 0) as bank_out,
           coalesce(sum(money_in), 0) as money_in,
           coalesce(sum(money_out), 0) as money_out,
           min(fa.kind) as finance_kind
    from public.cashbook_entries e
    join public.ledger_accounts la on la.id = e.ledger_account_id
    left join public.finance_accounts fa on fa.id = e.finance_account_id
    where e.organization_id = org_id and e.source_type is not null and e.source_id is not null
    group by source_type, source_id
  loop
    if exists (
      select 1 from public.acc_vouchers v
      where v.organization_id = org_id and v.source_type = grouped.source_type
        and v.source_transaction_id = grouped.source_id and v.status = 'posted'
    ) then
      continue;
    end if;
    cash_amt := grouped.cash_in + grouped.cash_out;
    upi_amt := grouped.upi_in + grouped.upi_out;
    bank_amt := grouped.bank_in + grouped.bank_out;
    total_in := grouped.money_in;
    total_out := grouped.money_out;
    recv := case
      when grouped.source_type like 'chit_%' then public.acc_coa_id(org_id, '1130')
      when grouped.finance_kind = 'monthly' then public.acc_coa_id(org_id, '1120')
      when grouped.finance_kind = 'daily' then public.acc_coa_id(org_id, '1110')
      else public.acc_coa_id(org_id, '1100')
    end;
    lines := '[]'::jsonb;
    if grouped.source_type = 'finance_payment' or (grouped.source_type like 'chit_%' and grouped.source_type not like '%payout%' and grouped.source_type not like '%lift%' and total_in > 0) then
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000'), 'debit', cash_amt, 'credit', 0)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010'), 'debit', upi_amt, 'credit', 0)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020'), 'debit', bank_amt, 'credit', 0)); end if;
      lines := lines || jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', 0, 'credit', total_in));
      begin
        perform public.acc_post_voucher('receipt', grouped.entry_date, grouped.description, lines, null, case when grouped.source_type like 'chit_%' then 'chit' else 'finance' end, grouped.source_type, grouped.source_id);
        created := created + 1;
      exception when others then null;
      end;
    elsif grouped.source_type = 'finance_disbursement' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', total_out, 'credit', 0));
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000'), 'debit', 0, 'credit', cash_amt)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010'), 'debit', 0, 'credit', upi_amt)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020'), 'debit', 0, 'credit', bank_amt)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'finance', grouped.source_type, grouped.source_id);
        created := created + 1;
      exception when others then null;
      end;
    elsif grouped.source_type in ('chit_fixed_lift', 'chit_predefined_payout', 'chit_auction_payout') then
      lines := jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', total_out, 'credit', 0));
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000'), 'debit', 0, 'credit', cash_amt)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010'), 'debit', 0, 'credit', upi_amt)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020'), 'debit', 0, 'credit', bank_amt)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'chit', grouped.source_type, grouped.source_id);
        created := created + 1;
      exception when others then null;
      end;
    elsif grouped.source_type = 'expense' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '5990'), 'debit', total_out, 'credit', 0));
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000'), 'debit', 0, 'credit', cash_amt)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010'), 'debit', 0, 'credit', upi_amt)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020'), 'debit', 0, 'credit', bank_amt)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id);
        created := created + 1;
      exception when others then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'integration', true);
end;
$$;

create or replace function public.acc_add_bank_statement(
  input_coa_id uuid, input_statement_date date, input_opening numeric, input_closing numeric, input_lines jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; statement_id uuid; line jsonb;
begin
  org_id := public.acc_require_owner();
  insert into public.acc_bank_statements(organization_id, coa_id, statement_date, opening_balance, closing_balance, created_by)
  values (org_id, input_coa_id, input_statement_date, coalesce(input_opening, 0), coalesce(input_closing, 0), auth.uid())
  returning id into statement_id;
  for line in select * from jsonb_array_elements(coalesce(input_lines, '[]'::jsonb))
  loop
    insert into public.acc_bank_statement_lines(organization_id, statement_id, line_date, description, amount, direction)
    values (
      org_id, statement_id, coalesce((line->>'line_date')::date, input_statement_date),
      coalesce(line->>'description', ''), (line->>'amount')::numeric, coalesce(line->>'direction', 'in')
    );
  end loop;
  return statement_id;
end;
$$;

create or replace function public.acc_match_bank_line(input_line_id uuid, input_voucher_line_id uuid, input_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.acc_require_owner();
  update public.acc_bank_statement_lines
    set matched_voucher_line_id = input_voucher_line_id,
        match_status = case when input_voucher_line_id is null then 'unmatched' else 'matched' end,
        match_note = input_note
    where id = input_line_id and organization_id = org_id;
  if not found then raise exception 'Bank statement line not found'; end if;
end;
$$;

grant execute on function public.acc_initialize(text, date) to authenticated;
grant execute on function public.acc_save_settings(text, integer, date) to authenticated;
grant execute on function public.acc_set_integration(boolean) to authenticated;
grant execute on function public.acc_create_coa(text, text, text, text) to authenticated;
grant execute on function public.acc_create_party(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid) to authenticated;
grant execute on function public.acc_cancel_voucher(uuid, text) to authenticated;
grant execute on function public.acc_reverse_voucher(uuid, date, text) to authenticated;
grant execute on function public.acc_lock_period(date, date) to authenticated;
grant execute on function public.acc_reopen_period(uuid, text) to authenticated;
grant execute on function public.acc_sync_operations() to authenticated;
grant execute on function public.acc_add_bank_statement(uuid, date, numeric, numeric, jsonb) to authenticated;
grant execute on function public.acc_match_bank_line(uuid, uuid, text) to authenticated;
