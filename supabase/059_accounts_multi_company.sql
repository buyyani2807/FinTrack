-- FinTrack Accounts: multiple independent companies inside one Finance workspace.
-- Run AFTER 058_accounts_party_update_delete.sql.
-- Additive to Daily Finance, Monthly Finance, Chit Fund, and Finance Cashbook (those tables are not altered).
-- Existing SriHitha Infra / current books become Accounts company #1. Vouchers, numbers, and balances are not rewritten.
-- Safe to re-run from the top if a previous attempt failed (for example on acc_next_number).

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
create table if not exists public.acc_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  fy_start_month integer not null default 4 check (fy_start_month between 1 and 12),
  books_started_on date,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index if not exists acc_companies_one_primary_idx
  on public.acc_companies(organization_id)
  where is_primary;

create index if not exists acc_companies_org_idx on public.acc_companies(organization_id, status, name);

alter table public.acc_companies enable row level security;
drop policy if exists acc_companies_owner on public.acc_companies;
create policy acc_companies_owner on public.acc_companies for all to authenticated
using (organization_id = public.current_organization_id() and public.is_financier_owner())
with check (organization_id = public.current_organization_id() and public.is_financier_owner());

insert into public.acc_companies(organization_id, name, fy_start_month, books_started_on, is_primary, status, created_by)
select s.organization_id,
       coalesce(nullif(trim(s.company_name), ''), 'Company 1'),
       coalesce(s.fy_start_month, 4),
       s.books_started_on,
       true,
       'active',
       s.updated_by
from public.acc_settings s
where not exists (select 1 from public.acc_companies c where c.organization_id = s.organization_id);

insert into public.acc_companies(organization_id, name, fy_start_month, books_started_on, is_primary, status)
select distinct c.organization_id, 'Company 1', 4, current_date, true, 'active'
from public.acc_coa c
where not exists (select 1 from public.acc_companies x where x.organization_id = c.organization_id);

-- ---------------------------------------------------------------------------
-- Stamp company_id on existing Accounts rows (no amount changes)
-- ---------------------------------------------------------------------------
alter table public.acc_coa add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;
alter table public.acc_parties add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;
alter table public.acc_sequences add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;
alter table public.acc_vouchers add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;
alter table public.acc_voucher_lines add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;
alter table public.acc_audit_log add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;
alter table public.acc_period_locks add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;
alter table public.acc_bank_statements add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;
alter table public.acc_bank_statement_lines add column if not exists company_id uuid references public.acc_companies(id) on delete cascade;

update public.acc_coa t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;
update public.acc_parties t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;
update public.acc_sequences t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;
update public.acc_vouchers t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;
update public.acc_voucher_lines t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;
update public.acc_audit_log t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;
update public.acc_period_locks t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;
update public.acc_bank_statements t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;
update public.acc_bank_statement_lines t set company_id = c.id from public.acc_companies c where t.company_id is null and c.organization_id = t.organization_id and c.is_primary;

alter table public.acc_coa alter column company_id set not null;
alter table public.acc_parties alter column company_id set not null;
alter table public.acc_sequences alter column company_id set not null;
alter table public.acc_vouchers alter column company_id set not null;
alter table public.acc_voucher_lines alter column company_id set not null;
alter table public.acc_period_locks alter column company_id set not null;
alter table public.acc_bank_statements alter column company_id set not null;
alter table public.acc_bank_statement_lines alter column company_id set not null;

alter table public.acc_coa drop constraint if exists acc_coa_organization_id_code_key;
drop index if exists acc_coa_organization_id_code_key;
create unique index if not exists acc_coa_company_code_uidx on public.acc_coa(company_id, code);

alter table public.acc_vouchers drop constraint if exists acc_vouchers_organization_id_voucher_number_key;
drop index if exists acc_vouchers_organization_id_voucher_number_key;
create unique index if not exists acc_vouchers_company_number_uidx on public.acc_vouchers(company_id, voucher_number);

drop index if exists acc_vouchers_source_unique_idx;
create unique index if not exists acc_vouchers_source_unique_idx
  on public.acc_vouchers(company_id, source_module, source_type, source_transaction_id)
  where source_transaction_id is not null and status = 'posted';

alter table public.acc_sequences drop constraint if exists acc_sequences_pkey;
alter table public.acc_sequences add primary key (company_id, voucher_type);

create index if not exists acc_coa_company_idx on public.acc_coa(company_id, group_type, code);
create index if not exists acc_parties_company_idx on public.acc_parties(company_id, party_type, name);
create index if not exists acc_vouchers_company_date_idx on public.acc_vouchers(company_id, voucher_date desc, voucher_number desc);
create index if not exists acc_audit_log_company_idx on public.acc_audit_log(company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Request company (header) + RLS
-- ---------------------------------------------------------------------------
create or replace function public.acc_request_company_id()
returns uuid language plpgsql stable as $$
declare raw text; headers jsonb;
begin
  begin
    raw := nullif(trim(current_setting('request.header.x-acc-company-id', true)), '');
  exception when others then
    raw := null;
  end;
  if raw is null then
    begin
      headers := current_setting('request.headers', true)::jsonb;
      raw := nullif(trim(coalesce(headers->>'x-acc-company-id', headers->>'X-Acc-Company-Id', '')), '');
    exception when others then
      raw := null;
    end;
  end if;
  if raw is null or raw = '' then return null; end if;
  return raw::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.acc_require_company(input_company_id uuid default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare org_id uuid; company_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := coalesce(input_company_id, public.acc_request_company_id());
  if company_id is null then raise exception 'Choose an Accounts company'; end if;
  if not exists (
    select 1 from public.acc_companies
    where id = company_id and organization_id = org_id and status = 'active'
  ) then
    raise exception 'Accounts company not found';
  end if;
  return company_id;
end;
$$;

create or replace function public.acc_primary_company_id(input_org_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.acc_companies
  where organization_id = input_org_id and is_primary
  order by created_at
  limit 1
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'acc_coa', 'acc_parties', 'acc_sequences', 'acc_vouchers', 'acc_voucher_lines',
    'acc_audit_log', 'acc_period_locks', 'acc_bank_statements', 'acc_bank_statement_lines'
  ] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_owner', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_owner_select', tbl);
    execute format(
      $p$create policy %I on public.%I for select to authenticated
        using (
          organization_id = public.current_organization_id()
          and public.is_financier_owner()
          and company_id = public.acc_request_company_id()
        )$p$,
      tbl || '_owner_select', tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers rewritten for company grain
-- ---------------------------------------------------------------------------
drop function if exists public.acc_write_audit(uuid, text, uuid, text, jsonb, jsonb, text);
drop function if exists public.acc_assert_period_open(uuid, date);
drop function if exists public.acc_coa_id(uuid, text);
drop function if exists public.acc_save_settings(text, integer, date);
drop function if exists public.acc_next_number(uuid, text);

create or replace function public.acc_write_audit(
  input_org_id uuid, input_entity_type text, input_entity_id uuid, input_action text,
  input_old jsonb default null, input_new jsonb default null, input_reason text default null,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.acc_audit_log(organization_id, company_id, entity_type, entity_id, action, actor_id, old_value, new_value, reason)
  values (
    input_org_id,
    coalesce(input_company_id, public.acc_request_company_id()),
    input_entity_type, input_entity_id, input_action, auth.uid(), input_old, input_new, input_reason
  );
end;
$$;

create or replace function public.acc_assert_period_open(input_org_id uuid, input_date date, input_company_id uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
declare company_id uuid;
begin
  company_id := coalesce(input_company_id, public.acc_request_company_id());
  if exists (
    select 1 from public.acc_period_locks
    where organization_id = input_org_id
      and company_id = company_id
      and is_locked
      and input_date between period_from and period_to
  ) then
    raise exception 'This accounting period is locked';
  end if;
end;
$$;

create or replace function public.acc_next_number(input_company_id uuid, input_type text)
returns text language plpgsql security definer set search_path = public as $$
declare seq integer;
declare prefix text;
declare org_id uuid;
begin
  select organization_id into org_id from public.acc_companies where id = input_company_id;
  if org_id is null then raise exception 'Accounts company not found'; end if;
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
  insert into public.acc_sequences(organization_id, company_id, voucher_type, last_number)
  values (org_id, input_company_id, input_type, 1)
  on conflict (company_id, voucher_type)
  do update set last_number = public.acc_sequences.last_number + 1
  returning last_number into seq;
  return prefix || '-' || lpad(seq::text, 6, '0');
end;
$$;

create or replace function public.acc_seed_coa_for_company(input_org_id uuid, input_company_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.acc_coa(organization_id, company_id, code, name, group_type, account_type, is_system)
  values
    (input_org_id, input_company_id, '1000', 'Cash in Hand', 'asset', 'cash', true),
    (input_org_id, input_company_id, '1010', 'UPI', 'asset', 'upi', true),
    (input_org_id, input_company_id, '1020', 'Bank', 'asset', 'bank', true),
    (input_org_id, input_company_id, '1100', 'Accounts Receivable', 'asset', 'receivable', true),
    (input_org_id, input_company_id, '1110', 'Daily Finance Receivable', 'asset', 'receivable', true),
    (input_org_id, input_company_id, '1120', 'Monthly Finance Receivable', 'asset', 'receivable', true),
    (input_org_id, input_company_id, '1130', 'Chit Fund Receivable', 'asset', 'receivable', true),
    (input_org_id, input_company_id, '1200', 'Loans & Advances', 'asset', 'other', false),
    (input_org_id, input_company_id, '1300', 'Fixed Assets', 'asset', 'other', false),
    (input_org_id, input_company_id, '2000', 'Accounts Payable', 'liability', 'payable', true),
    (input_org_id, input_company_id, '2100', 'Loans Payable', 'liability', 'payable', false),
    (input_org_id, input_company_id, '3000', 'Capital', 'equity', 'capital', true),
    (input_org_id, input_company_id, '3100', 'Drawings', 'equity', 'drawing', true),
    (input_org_id, input_company_id, '3200', 'Retained Earnings', 'equity', 'retained', true),
    (input_org_id, input_company_id, '4000', 'Interest Income', 'income', 'income', true),
    (input_org_id, input_company_id, '4100', 'Other Income', 'income', 'income', true),
    (input_org_id, input_company_id, '4200', 'Chit Commission', 'income', 'income', true),
    (input_org_id, input_company_id, '4300', 'Sales', 'income', 'income', true),
    (input_org_id, input_company_id, '4310', 'Service Income', 'income', 'income', false),
    (input_org_id, input_company_id, '5000', 'Rent', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5010', 'Salary', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5020', 'Agent Commission', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5030', 'Fuel', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5040', 'Electricity', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5050', 'Internet', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5060', 'Office Supplies', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5065', 'Office Expenses', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5070', 'Maintenance', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5080', 'Marketing', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5090', 'Travel', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5100', 'Bank Charges', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5110', 'Purchase', 'expense', 'expense', true),
    (input_org_id, input_company_id, '5120', 'Professional Fees', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5990', 'Other Expenses', 'expense', 'expense', true)
  on conflict (company_id, code) do nothing;
end;
$$;

create or replace function public.acc_seed_coa(input_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare company_id uuid;
begin
  company_id := public.acc_primary_company_id(input_org_id);
  if company_id is null then return; end if;
  perform public.acc_seed_coa_for_company(input_org_id, company_id);
end;
$$;

create or replace function public.acc_list_companies()
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.acc_require_owner();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'fyStartMonth', c.fy_start_month,
      'booksStartedOn', c.books_started_on,
      'status', c.status,
      'isPrimary', c.is_primary,
      'createdAt', c.created_at,
      'updatedAt', c.updated_at
    ) order by c.is_primary desc, c.created_at)
    from public.acc_companies c
    where c.organization_id = org_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.acc_create_company(
  input_name text,
  input_books_started_on date default null,
  input_fy_start_month integer default 4
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; nm text;
begin
  org_id := public.acc_require_owner();
  nm := nullif(trim(input_name), '');
  if nm is null then raise exception 'Company name is required'; end if;
  if exists (
    select 1 from public.acc_companies
    where organization_id = org_id and lower(name) = lower(nm) and status = 'active'
  ) then
    raise exception 'A company with this name already exists';
  end if;
  insert into public.acc_companies(organization_id, name, fy_start_month, books_started_on, is_primary, status, created_by)
  values (org_id, nm, coalesce(input_fy_start_month, 4), coalesce(input_books_started_on, current_date), false, 'active', auth.uid())
  returning id into company_id;
  perform public.acc_seed_coa_for_company(org_id, company_id);
  perform public.acc_write_audit(org_id, 'company', company_id, 'create', null, jsonb_build_object('name', nm), 'Company created', company_id);
  return company_id;
end;
$$;

create or replace function public.acc_initialize(input_company_name text default null, input_books_started_on date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid;
begin
  org_id := public.acc_require_owner();
  insert into public.acc_settings(organization_id, company_name, books_started_on)
  values (org_id, nullif(trim(input_company_name), ''), coalesce(input_books_started_on, current_date))
  on conflict (organization_id) do update set
    company_name = coalesce(excluded.company_name, public.acc_settings.company_name),
    books_started_on = coalesce(public.acc_settings.books_started_on, excluded.books_started_on),
    updated_at = now(),
    updated_by = auth.uid();
  company_id := public.acc_primary_company_id(org_id);
  if company_id is null then
    insert into public.acc_companies(organization_id, name, fy_start_month, books_started_on, is_primary, status, created_by)
    values (org_id, coalesce(nullif(trim(input_company_name), ''), 'Company 1'), 4, coalesce(input_books_started_on, current_date), true, 'active', auth.uid())
    returning id into company_id;
  elsif nullif(trim(input_company_name), '') is not null then
    update public.acc_companies
      set name = trim(input_company_name),
          books_started_on = coalesce(books_started_on, input_books_started_on),
          updated_at = now()
      where id = company_id;
  end if;
  perform public.acc_seed_coa_for_company(org_id, company_id);
  perform public.acc_write_audit(org_id, 'settings', org_id, 'initialize', null, jsonb_build_object('company_name', input_company_name), 'Books opened', company_id);
  return jsonb_build_object('ok', true, 'company_id', company_id);
end;
$$;

create or replace function public.acc_save_settings(
  input_company_name text,
  input_fy_start_month integer,
  input_books_started_on date,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  update public.acc_companies
    set name = coalesce(nullif(trim(input_company_name), ''), name),
        fy_start_month = coalesce(input_fy_start_month, fy_start_month),
        books_started_on = coalesce(input_books_started_on, books_started_on),
        updated_at = now()
    where id = company_id and organization_id = org_id;
  if (select is_primary from public.acc_companies where id = company_id) then
    insert into public.acc_settings(organization_id, company_name, fy_start_month, books_started_on, updated_by)
    values (org_id, nullif(trim(input_company_name), ''), coalesce(input_fy_start_month, 4), input_books_started_on, auth.uid())
    on conflict (organization_id) do update set
      company_name = excluded.company_name,
      fy_start_month = excluded.fy_start_month,
      books_started_on = excluded.books_started_on,
      updated_at = now(),
      updated_by = auth.uid();
  end if;
end;
$$;

create or replace function public.acc_coa_id(input_org_id uuid, input_code text, input_company_id uuid default null)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.acc_coa
  where organization_id = input_org_id
    and code = input_code
    and company_id = coalesce(input_company_id, public.acc_primary_company_id(input_org_id))
  limit 1
$$;

drop function if exists public.acc_create_coa(text, text, text, text);
drop function if exists public.acc_create_coa(text, text, text, text, numeric, text);
drop function if exists public.acc_update_coa(uuid, text, text, numeric, text, boolean);
drop function if exists public.acc_delete_coa(uuid);
drop function if exists public.acc_set_coa_parent(uuid, uuid);
drop function if exists public.acc_create_party(text, text, text, text, text, text, text);
drop function if exists public.acc_update_party(uuid, text, text, text, text, text, text, text);
drop function if exists public.acc_delete_party(uuid);
drop function if exists public.acc_set_party_active(uuid, boolean);
drop function if exists public.acc_cancel_voucher(uuid, text);
drop function if exists public.acc_reverse_voucher(uuid, date, text);
drop function if exists public.acc_set_voucher_due(uuid, date);
drop function if exists public.acc_lock_period(date, date);
drop function if exists public.acc_reopen_period(uuid, text);
drop function if exists public.acc_add_bank_statement(uuid, date, numeric, numeric, jsonb);
drop function if exists public.acc_match_bank_line(uuid, uuid, text);

create or replace function public.acc_create_coa(
  input_code text,
  input_name text,
  input_group_type text,
  input_account_type text,
  input_opening numeric default 0,
  input_opening_side text default 'debit',
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; new_id uuid; opening_amt numeric; opening_side text;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  if trim(coalesce(input_code, '')) = '' or trim(coalesce(input_name, '')) = '' then
    raise exception 'Account code and name are required';
  end if;
  opening_amt := round(coalesce(input_opening, 0), 2);
  if opening_amt < 0 then raise exception 'Opening balance cannot be negative'; end if;
  opening_side := case when input_opening_side in ('debit', 'credit') then input_opening_side else 'debit' end;
  insert into public.acc_coa(
    organization_id, company_id, code, name, group_type, account_type, opening_balance, opening_side
  ) values (
    org_id, company_id, trim(input_code), trim(input_name), input_group_type,
    coalesce(nullif(input_account_type, ''), 'other'), opening_amt, opening_side
  )
  returning id into new_id;
  perform public.acc_write_audit(org_id, 'coa', new_id, 'create', null, jsonb_build_object(
    'code', input_code, 'name', input_name, 'opening_balance', opening_amt
  ), null, company_id);
  return new_id;
end;
$$;

create or replace function public.acc_update_coa(
  input_id uuid,
  input_code text,
  input_name text,
  input_opening numeric default 0,
  input_opening_side text default 'debit',
  input_is_active boolean default true,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; account public.acc_coa; opening_amt numeric; opening_side text;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into account from public.acc_coa where id = input_id and organization_id = org_id and company_id = company_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if trim(coalesce(input_code, '')) = '' or trim(coalesce(input_name, '')) = '' then
    raise exception 'Account code and name are required';
  end if;
  if account.is_system and trim(input_code) <> account.code then
    raise exception 'System account codes cannot be changed';
  end if;
  opening_amt := round(coalesce(input_opening, 0), 2);
  if opening_amt < 0 then raise exception 'Opening balance cannot be negative'; end if;
  opening_side := case when input_opening_side in ('debit', 'credit') then input_opening_side else account.opening_side end;
  update public.acc_coa
    set code = trim(input_code),
        name = trim(input_name),
        opening_balance = opening_amt,
        opening_side = opening_side,
        is_active = coalesce(input_is_active, true)
    where id = account.id;
  perform public.acc_write_audit(org_id, 'coa', account.id, 'update',
    jsonb_build_object('code', account.code, 'name', account.name),
    jsonb_build_object('code', trim(input_code), 'name', trim(input_name)),
    null, company_id);
end;
$$;

create or replace function public.acc_delete_coa(input_id uuid, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; account public.acc_coa;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into account from public.acc_coa where id = input_id and organization_id = org_id and company_id = company_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if account.is_system then raise exception 'System accounts cannot be deleted'; end if;
  if exists (select 1 from public.acc_voucher_lines where company_id = company_id and coa_id = account.id) then
    raise exception 'Cannot delete an account that has transactions';
  end if;
  if exists (select 1 from public.acc_bank_statements where company_id = company_id and coa_id = account.id) then
    raise exception 'Cannot delete an account that has bank statements';
  end if;
  delete from public.acc_coa where id = account.id;
  perform public.acc_write_audit(org_id, 'coa', account.id, 'delete',
    jsonb_build_object('code', account.code, 'name', account.name), null, 'Ledger deleted', company_id);
end;
$$;

create or replace function public.acc_set_coa_parent(input_id uuid, input_parent_id uuid, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; account public.acc_coa; parent public.acc_coa;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into account from public.acc_coa where id = input_id and organization_id = org_id and company_id = company_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if input_parent_id is null then
    update public.acc_coa set parent_id = null where id = account.id;
    return;
  end if;
  if input_parent_id = account.id then raise exception 'An account cannot be its own parent'; end if;
  select * into parent from public.acc_coa where id = input_parent_id and organization_id = org_id and company_id = company_id;
  if parent.id is null then raise exception 'Parent account not found'; end if;
  if parent.group_type <> account.group_type then raise exception 'Parent must be in the same group'; end if;
  if parent.parent_id = account.id then raise exception 'Circular parent is not allowed'; end if;
  update public.acc_coa set parent_id = parent.id where id = account.id;
end;
$$;

create or replace function public.acc_create_party(
  input_party_type text, input_name text, input_phone text default null, input_email text default null,
  input_address text default null, input_gstin text default null, input_notes text default null,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; new_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  if trim(coalesce(input_name, '')) = '' then raise exception 'Party name is required'; end if;
  insert into public.acc_parties(organization_id, company_id, party_type, name, phone, email, address, gstin, notes)
  values (org_id, company_id, input_party_type, trim(input_name), nullif(trim(input_phone), ''), nullif(trim(input_email), ''),
          nullif(trim(input_address), ''), nullif(trim(input_gstin), ''), nullif(trim(input_notes), ''))
  returning id into new_id;
  perform public.acc_write_audit(org_id, 'party', new_id, 'create', null, jsonb_build_object('name', input_name, 'party_type', input_party_type), null, company_id);
  return new_id;
end;
$$;

create or replace function public.acc_party_is_used(input_org_id uuid, input_party_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.acc_vouchers where organization_id = input_org_id and party_id = input_party_id
  ) or exists (
    select 1 from public.acc_voucher_lines where organization_id = input_org_id and party_id = input_party_id
  );
$$;

create or replace function public.acc_update_party(
  input_id uuid,
  input_party_type text,
  input_name text,
  input_phone text default null,
  input_email text default null,
  input_address text default null,
  input_gstin text default null,
  input_notes text default null,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  if trim(coalesce(input_name, '')) = '' then raise exception 'Party name is required'; end if;
  if input_party_type not in ('customer', 'supplier', 'employee', 'agent', 'other') then
    raise exception 'Choose a valid party type';
  end if;
  select * into existing from public.acc_parties where id = input_id and organization_id = org_id and company_id = company_id;
  if not found then raise exception 'Party not found'; end if;
  if existing.party_type <> input_party_type and public.acc_party_is_used(org_id, input_id) then
    raise exception 'Party type cannot be changed because accounting transactions already exist for this party.';
  end if;
  update public.acc_parties
    set party_type = input_party_type,
        name = trim(input_name),
        phone = nullif(trim(coalesce(input_phone, '')), ''),
        email = nullif(trim(coalesce(input_email, '')), ''),
        address = nullif(trim(coalesce(input_address, '')), ''),
        gstin = nullif(trim(coalesce(input_gstin, '')), ''),
        notes = nullif(trim(coalesce(input_notes, '')), ''),
        updated_at = now()
    where id = input_id and company_id = company_id;
  perform public.acc_write_audit(org_id, 'party', input_id, 'update',
    jsonb_build_object('name', existing.name, 'party_type', existing.party_type),
    jsonb_build_object('name', trim(input_name), 'party_type', input_party_type),
    null, company_id);
end;
$$;

create or replace function public.acc_delete_party(input_id uuid, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into existing from public.acc_parties where id = input_id and organization_id = org_id and company_id = company_id;
  if not found then raise exception 'Party not found'; end if;
  if public.acc_party_is_used(org_id, input_id) then
    raise exception 'This party cannot be deleted because accounting transactions already exist for this party.';
  end if;
  delete from public.acc_parties where id = input_id and company_id = company_id;
  perform public.acc_write_audit(org_id, 'party', input_id, 'delete',
    jsonb_build_object('name', existing.name, 'party_type', existing.party_type), null, null, company_id);
end;
$$;

create or replace function public.acc_set_party_active(input_id uuid, input_active boolean, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into existing from public.acc_parties where id = input_id and organization_id = org_id and company_id = company_id;
  if not found then raise exception 'Party not found'; end if;
  update public.acc_parties set is_active = coalesce(input_active, true), updated_at = now()
    where id = input_id and company_id = company_id;
  perform public.acc_write_audit(org_id, 'party', input_id,
    case when coalesce(input_active, true) then 'activate' else 'deactivate' end,
    jsonb_build_object('is_active', existing.is_active),
    jsonb_build_object('is_active', coalesce(input_active, true)),
    null, company_id);
end;
$$;

drop function if exists public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid);

create or replace function public.acc_post_voucher(
  input_voucher_type text,
  input_date date,
  input_narration text,
  input_lines jsonb,
  input_party_id uuid default null,
  input_source_module text default null,
  input_source_type text default null,
  input_source_transaction_id uuid default null,
  input_company_id uuid default null,
  input_gst_lines jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company_id uuid;
  voucher_id uuid;
  voucher_no text;
  line jsonb;
  line_no integer := 0;
  total_debit numeric := 0;
  total_credit numeric := 0;
  debit_amt numeric;
  credit_amt numeric;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
  coa uuid;
  party uuid;
begin
  org_id := public.acc_require_owner();
  company_id := coalesce(input_company_id, public.acc_request_company_id());
  if company_id is null then company_id := public.acc_primary_company_id(org_id); end if;
  company_id := public.acc_require_company(company_id);
  if input_date > today_ist then raise exception 'Voucher date cannot be in the future'; end if;
  perform public.acc_assert_period_open(org_id, input_date, company_id);
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) < 2 then
    raise exception 'A voucher needs at least two lines';
  end if;
  if input_party_id is not null and not exists (
    select 1 from public.acc_parties where id = input_party_id and company_id = company_id
  ) then
    raise exception 'Party does not belong to this company';
  end if;
  for line in select * from jsonb_array_elements(input_lines)
  loop
    debit_amt := round(coalesce((line->>'debit')::numeric, 0), 2);
    credit_amt := round(coalesce((line->>'credit')::numeric, 0), 2);
    if debit_amt < 0 or credit_amt < 0 then raise exception 'Voucher lines cannot be negative'; end if;
    if debit_amt > 0 and credit_amt > 0 then raise exception 'A voucher line cannot be both debit and credit'; end if;
    if debit_amt = 0 and credit_amt = 0 then raise exception 'Every voucher line needs a debit or a credit'; end if;
    if coalesce(nullif(line->>'coa_id', ''), '') = '' then raise exception 'Every voucher line needs an account'; end if;
    coa := (line->>'coa_id')::uuid;
    if not exists (select 1 from public.acc_coa where id = coa and company_id = company_id) then
      raise exception 'Account does not belong to this company';
    end if;
    party := nullif(line->>'party_id', '')::uuid;
    if party is not null and not exists (select 1 from public.acc_parties where id = party and company_id = company_id) then
      raise exception 'Party does not belong to this company';
    end if;
    total_debit := total_debit + debit_amt;
    total_credit := total_credit + credit_amt;
  end loop;
  if total_debit <= 0 or total_debit <> total_credit then
    raise exception 'Unbalanced voucher cannot be posted. Debits % · Credits %', total_debit, total_credit;
  end if;
  voucher_no := public.acc_next_number(company_id, input_voucher_type);
  insert into public.acc_vouchers(
    organization_id, company_id, voucher_type, voucher_number, voucher_date, narration, status, party_id,
    source_module, source_type, source_transaction_id, created_by, posted_at, posted_by
  ) values (
    org_id, company_id, input_voucher_type, voucher_no, input_date, coalesce(input_narration, ''), 'posted', input_party_id,
    input_source_module, input_source_type, input_source_transaction_id, auth.uid(), now(), auth.uid()
  ) returning id into voucher_id;
  for line in select * from jsonb_array_elements(input_lines)
  loop
    line_no := line_no + 1;
    insert into public.acc_voucher_lines(organization_id, company_id, voucher_id, line_no, coa_id, party_id, debit, credit, description)
    values (
      org_id, company_id, voucher_id, line_no,
      (line->>'coa_id')::uuid,
      coalesce(nullif(line->>'party_id', '')::uuid, input_party_id),
      round(coalesce((line->>'debit')::numeric, 0), 2),
      round(coalesce((line->>'credit')::numeric, 0), 2),
      coalesce(line->>'description', input_narration)
    );
  end loop;
  perform public.acc_write_audit(org_id, 'voucher', voucher_id, 'post', null, jsonb_build_object(
    'voucher_number', voucher_no, 'voucher_type', input_voucher_type, 'debit', total_debit, 'credit', total_credit
  ), input_narration, company_id);
  return voucher_id;
end;
$$;

create or replace function public.acc_cancel_voucher(input_voucher_id uuid, input_reason text, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; voucher public.acc_vouchers;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id and company_id = company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status = 'cancelled' then raise exception 'Voucher is already cancelled'; end if;
  if voucher.status = 'reversed' then raise exception 'Reversed vouchers cannot be cancelled. Cancel the reversal instead.'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be cancelled'; end if;
  perform public.acc_assert_period_open(org_id, voucher.voucher_date, company_id);
  update public.acc_vouchers
    set status = 'cancelled', cancel_reason = coalesce(nullif(trim(input_reason), ''), 'Cancelled'),
        cancelled_at = now(), cancelled_by = auth.uid()
    where id = voucher.id;
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'cancel',
    jsonb_build_object('status', voucher.status, 'voucher_number', voucher.voucher_number),
    jsonb_build_object('status', 'cancelled'), input_reason, company_id);
end;
$$;

create or replace function public.acc_reverse_voucher(input_voucher_id uuid, input_date date, input_reason text, input_company_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; voucher public.acc_vouchers; lines jsonb; new_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id and company_id = company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be reversed'; end if;
  if voucher.reversed_voucher_id is not null then raise exception 'Voucher is already reversed'; end if;
  select jsonb_agg(jsonb_build_object(
    'coa_id', coa_id, 'party_id', party_id, 'debit', credit, 'credit', debit, 'description', coalesce(input_reason, 'Reversal')
  ) order by line_no) into lines
  from public.acc_voucher_lines where voucher_id = voucher.id;
  new_id := public.acc_post_voucher(
    voucher.voucher_type, coalesce(input_date, current_date),
    coalesce(nullif(trim(input_reason), ''), 'Reversal of ' || voucher.voucher_number),
    lines, voucher.party_id, 'accounts', 'reversal', voucher.id, voucher.company_id, null
  );
  update public.acc_vouchers set reversed_voucher_id = new_id, status = 'reversed' where id = voucher.id;
  update public.acc_vouchers set original_voucher_id = voucher.id where id = new_id;
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'reverse',
    jsonb_build_object('voucher_number', voucher.voucher_number),
    jsonb_build_object('reversal_id', new_id), input_reason, company_id);
  return new_id;
end;
$$;

create or replace function public.acc_set_voucher_due(input_voucher_id uuid, input_due date, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; voucher public.acc_vouchers;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id and company_id = company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  update public.acc_vouchers set due_date = input_due where id = voucher.id;
end;
$$;

create or replace function public.acc_lock_period(input_from date, input_to date, input_company_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; lock_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  if input_to < input_from then raise exception 'Invalid period'; end if;
  insert into public.acc_period_locks(organization_id, company_id, period_from, period_to, locked_by)
  values (org_id, company_id, input_from, input_to, auth.uid())
  returning id into lock_id;
  perform public.acc_write_audit(org_id, 'period_lock', lock_id, 'lock', null, jsonb_build_object('from', input_from, 'to', input_to), 'Period locked', company_id);
  return lock_id;
end;
$$;

create or replace function public.acc_reopen_period(input_lock_id uuid, input_reason text, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  if trim(coalesce(input_reason, '')) = '' then raise exception 'A reason is required to reopen a locked period'; end if;
  update public.acc_period_locks
    set is_locked = false, reopen_reason = trim(input_reason), reopened_at = now(), reopened_by = auth.uid()
    where id = input_lock_id and organization_id = org_id and company_id = company_id;
  if not found then raise exception 'Period lock not found'; end if;
  perform public.acc_write_audit(org_id, 'period_lock', input_lock_id, 'reopen', null, jsonb_build_object('reason', input_reason), input_reason, company_id);
end;
$$;

create or replace function public.acc_add_bank_statement(
  input_coa_id uuid, input_statement_date date, input_opening numeric, input_closing numeric, input_lines jsonb,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; statement_id uuid; line jsonb;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  if not exists (select 1 from public.acc_coa where id = input_coa_id and company_id = company_id) then
    raise exception 'Bank account does not belong to this company';
  end if;
  insert into public.acc_bank_statements(organization_id, company_id, coa_id, statement_date, opening_balance, closing_balance, created_by)
  values (org_id, company_id, input_coa_id, input_statement_date, coalesce(input_opening, 0), coalesce(input_closing, 0), auth.uid())
  returning id into statement_id;
  for line in select * from jsonb_array_elements(coalesce(input_lines, '[]'::jsonb))
  loop
    insert into public.acc_bank_statement_lines(organization_id, company_id, statement_id, line_date, description, amount, direction)
    values (
      org_id, company_id, statement_id, coalesce((line->>'line_date')::date, input_statement_date),
      coalesce(line->>'description', ''), (line->>'amount')::numeric, coalesce(line->>'direction', 'in')
    );
  end loop;
  return statement_id;
end;
$$;

create or replace function public.acc_match_bank_line(input_line_id uuid, input_voucher_line_id uuid, input_note text default null, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  if input_voucher_line_id is not null and not exists (
    select 1 from public.acc_voucher_lines where id = input_voucher_line_id and company_id = company_id
  ) then
    raise exception 'Books line does not belong to this company';
  end if;
  update public.acc_bank_statement_lines
    set matched_voucher_line_id = input_voucher_line_id,
        match_status = case when input_voucher_line_id is null then 'unmatched' else 'matched' end,
        match_note = input_note
    where id = input_line_id and organization_id = org_id and company_id = company_id;
  if not found then raise exception 'Bank statement line not found'; end if;
end;
$$;

-- Finance sync posts only into the primary Accounts company.
create or replace function public.acc_sync_operations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company_id uuid;
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
  company_id := public.acc_primary_company_id(org_id);
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
      where v.company_id = company_id and v.source_type = grouped.source_type
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
      when grouped.source_type like 'chit_%' then public.acc_coa_id(org_id, '1130', company_id)
      when grouped.finance_kind = 'monthly' then public.acc_coa_id(org_id, '1120', company_id)
      when grouped.finance_kind = 'daily' then public.acc_coa_id(org_id, '1110', company_id)
      else public.acc_coa_id(org_id, '1100', company_id)
    end;
    lines := '[]'::jsonb;
    if grouped.source_type = 'finance_payment' or (grouped.source_type like 'chit_%' and grouped.source_type not like '%payout%' and grouped.source_type not like '%lift%' and total_in > 0) then
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', company_id), 'debit', cash_amt, 'credit', 0)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', company_id), 'debit', upi_amt, 'credit', 0)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', company_id), 'debit', bank_amt, 'credit', 0)); end if;
      lines := lines || jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', 0, 'credit', total_in));
      begin
        perform public.acc_post_voucher('receipt', grouped.entry_date, grouped.description, lines, null, case when grouped.source_type like 'chit_%' then 'chit' else 'finance' end, grouped.source_type, grouped.source_id, company_id, null);
        created := created + 1;
      exception when others then null;
      end;
    elsif grouped.source_type = 'finance_disbursement' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', total_out, 'credit', 0));
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', company_id), 'debit', 0, 'credit', cash_amt)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', company_id), 'debit', 0, 'credit', upi_amt)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', company_id), 'debit', 0, 'credit', bank_amt)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'finance', grouped.source_type, grouped.source_id, company_id, null);
        created := created + 1;
      exception when others then null;
      end;
    elsif grouped.source_type = 'expense' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '5990', company_id), 'debit', total_out, 'credit', 0));
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', company_id), 'debit', 0, 'credit', cash_amt)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', company_id), 'debit', 0, 'credit', upi_amt)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', company_id), 'debit', 0, 'credit', bank_amt)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, company_id, null);
        created := created + 1;
      exception when others then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'integration', true);
end;
$$;

grant execute on function public.acc_request_company_id() to authenticated;
grant execute on function public.acc_require_company(uuid) to authenticated;
grant execute on function public.acc_primary_company_id(uuid) to authenticated;
grant execute on function public.acc_list_companies() to authenticated;
grant execute on function public.acc_create_company(text, date, integer) to authenticated;
grant execute on function public.acc_seed_coa_for_company(uuid, uuid) to authenticated;
grant execute on function public.acc_next_number(uuid, text) to authenticated;
grant execute on function public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.acc_cancel_voucher(uuid, text, uuid) to authenticated;
grant execute on function public.acc_reverse_voucher(uuid, date, text, uuid) to authenticated;
grant execute on function public.acc_lock_period(date, date, uuid) to authenticated;
grant execute on function public.acc_reopen_period(uuid, text, uuid) to authenticated;
grant execute on function public.acc_add_bank_statement(uuid, date, numeric, numeric, jsonb, uuid) to authenticated;
grant execute on function public.acc_match_bank_line(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.acc_create_coa(text, text, text, text, numeric, text, uuid) to authenticated;
grant execute on function public.acc_update_coa(uuid, text, text, numeric, text, boolean, uuid) to authenticated;
grant execute on function public.acc_delete_coa(uuid, uuid) to authenticated;
grant execute on function public.acc_set_coa_parent(uuid, uuid, uuid) to authenticated;
grant execute on function public.acc_set_voucher_due(uuid, date, uuid) to authenticated;
grant execute on function public.acc_create_party(text, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.acc_update_party(uuid, text, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.acc_delete_party(uuid, uuid) to authenticated;
grant execute on function public.acc_set_party_active(uuid, boolean, uuid) to authenticated;
grant execute on function public.acc_save_settings(text, integer, date, uuid) to authenticated;
grant select on public.acc_companies to authenticated;
