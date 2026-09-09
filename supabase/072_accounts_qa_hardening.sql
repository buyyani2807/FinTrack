-- FinTrack Accounts QA hardening (P0–P3 from production-readiness audit).
-- Run AFTER 071_accounts_access_role_client.sql.
-- Goals:
--   P0  Company-scoped RLS + revoke direct DML on books tables (RPC-only writes)
--   P1  Manual post idempotency, role/read fixes, neg-stock, atomic item lines + stock on cancel/reverse
--   P2  Fail closed when company missing (no silent primary fallback on post)

-- ---------------------------------------------------------------------------
-- P0: Company-scoped SELECT; RPC-only mutations
-- ---------------------------------------------------------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'acc_coa', 'acc_parties', 'acc_sequences', 'acc_vouchers', 'acc_voucher_lines',
    'acc_audit_log', 'acc_period_locks', 'acc_bank_statements', 'acc_bank_statement_lines'
  ] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_owner', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_owner_select', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_read', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_write', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_select', tbl);
    execute format(
      $p$create policy %I on public.%I for select to authenticated
         using (
           organization_id = public.current_organization_id()
           and public.can_accounts_read()
           and (
             company_id is null
             or company_id = public.acc_request_company_id()
           )
         )$p$,
      tbl || '_select', tbl
    );
    execute format('revoke all on table public.%I from authenticated', tbl);
    execute format('grant select on table public.%I to authenticated', tbl);
  end loop;
end $$;

-- acc_settings is org-scoped (no company_id)
drop policy if exists acc_settings_owner on public.acc_settings;
drop policy if exists acc_settings_owner_select on public.acc_settings;
drop policy if exists acc_settings_read on public.acc_settings;
drop policy if exists acc_settings_write on public.acc_settings;
drop policy if exists acc_settings_select on public.acc_settings;
create policy acc_settings_select on public.acc_settings for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_read());
revoke all on table public.acc_settings from authenticated;
grant select on table public.acc_settings to authenticated;

drop policy if exists acc_companies_owner on public.acc_companies;
drop policy if exists acc_companies_select on public.acc_companies;
create policy acc_companies_select on public.acc_companies for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_read());
revoke all on table public.acc_companies from authenticated;
grant select on table public.acc_companies to authenticated;

-- GST lines + inventory: readers with company header (not owner-only)
drop policy if exists acc_gst_lines_owner_select on public.acc_gst_lines;
drop policy if exists acc_gst_lines_select on public.acc_gst_lines;
create policy acc_gst_lines_select on public.acc_gst_lines for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );
revoke all on table public.acc_gst_lines from authenticated;
grant select on table public.acc_gst_lines to authenticated;

drop policy if exists acc_item_categories_owner_select on public.acc_item_categories;
drop policy if exists acc_item_categories_select on public.acc_item_categories;
create policy acc_item_categories_select on public.acc_item_categories for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

drop policy if exists acc_items_owner_select on public.acc_items;
drop policy if exists acc_items_select on public.acc_items;
create policy acc_items_select on public.acc_items for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

drop policy if exists acc_voucher_item_lines_owner_select on public.acc_voucher_item_lines;
drop policy if exists acc_voucher_item_lines_select on public.acc_voucher_item_lines;
create policy acc_voucher_item_lines_select on public.acc_voucher_item_lines for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

drop policy if exists acc_stock_movements_owner_select on public.acc_stock_movements;
drop policy if exists acc_stock_movements_select on public.acc_stock_movements;
create policy acc_stock_movements_select on public.acc_stock_movements for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

revoke all on table public.acc_item_categories from authenticated;
revoke all on table public.acc_items from authenticated;
revoke all on table public.acc_voucher_item_lines from authenticated;
revoke all on table public.acc_stock_movements from authenticated;
grant select on table public.acc_item_categories to authenticated;
grant select on table public.acc_items to authenticated;
grant select on table public.acc_voucher_item_lines to authenticated;
grant select on table public.acc_stock_movements to authenticated;

-- Roles table readable by owner/admin path (org members with accounts read)
alter table public.acc_user_roles enable row level security;
drop policy if exists acc_user_roles_select on public.acc_user_roles;
create policy acc_user_roles_select on public.acc_user_roles for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_admin());
revoke all on table public.acc_user_roles from authenticated;
grant select on table public.acc_user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- P1: Idempotency column for manual posts
-- ---------------------------------------------------------------------------
alter table public.acc_vouchers
  add column if not exists client_request_id uuid;

create unique index if not exists acc_vouchers_company_client_request_uidx
  on public.acc_vouchers (company_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- Stock quantity helper + negative stock guard
-- ---------------------------------------------------------------------------
create or replace function public.acc_item_on_hand(
  input_org_id uuid,
  input_company_id uuid,
  input_item_id uuid
) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((
    select sum(m.quantity_delta)
    from public.acc_stock_movements m
    where m.organization_id = input_org_id
      and m.company_id = input_company_id
      and m.item_id = input_item_id
  ), (
    select i.opening_stock from public.acc_items i where i.id = input_item_id
  ), 0);
$$;

create or replace function public.acc_assert_stock_available(
  input_org_id uuid,
  input_company_id uuid,
  input_item_id uuid,
  input_delta numeric
) returns void language plpgsql security definer set search_path = public as $$
declare on_hand numeric;
begin
  if coalesce(input_delta, 0) >= 0 then return; end if;
  on_hand := public.acc_item_on_hand(input_org_id, input_company_id, input_item_id);
  if round(on_hand + input_delta, 3) < 0 then
    raise exception 'Insufficient stock. On hand % · required %', on_hand, abs(input_delta);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apply item lines (shared by save RPC and post-with-items)
-- ---------------------------------------------------------------------------
create or replace function public.acc_apply_voucher_item_lines(
  input_org_id uuid,
  input_company_id uuid,
  input_voucher public.acc_vouchers,
  input_lines jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  line jsonb;
  idx integer := 0;
  item public.acc_items%rowtype;
  qty numeric(18,3);
  rate numeric(18,2);
  amount numeric(18,2);
  line_id uuid;
  delta numeric(18,3);
  reason_text text;
  item_type text;
begin
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) = 0 then
    raise exception 'At least one item line is required';
  end if;
  if input_voucher.voucher_type not in ('sales', 'purchase') then
    raise exception 'Item lines are only supported on sales and purchase vouchers';
  end if;
  if exists (
    select 1 from public.acc_voucher_item_lines
    where voucher_id = input_voucher.id and organization_id = input_org_id and company_id = input_company_id
  ) then
    raise exception 'Item lines already exist for this voucher';
  end if;

  reason_text := case when input_voucher.voucher_type = 'sales' then 'sale' else 'purchase' end;

  for line in select value from jsonb_array_elements(input_lines)
  loop
    idx := idx + 1;
    qty := coalesce((line->>'quantity')::numeric, 0);
    rate := coalesce((line->>'rate')::numeric, 0);
    amount := coalesce((line->>'amount')::numeric, round(qty * rate, 2));
    if qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if rate < 0 or amount < 0 then raise exception 'Item rate/amount cannot be negative'; end if;
    if nullif(trim(coalesce(line->>'item_name', '')), '') is null then
      raise exception 'Item name is required on line %', idx;
    end if;

    item := null;
    if nullif(line->>'item_id', '') is not null then
      select * into item from public.acc_items
      where id = (line->>'item_id')::uuid
        and organization_id = input_org_id and company_id = input_company_id;
      if item.id is null then raise exception 'Item not found on line %', idx; end if;
      if item.is_active is false then raise exception 'Inactive item cannot be used on new vouchers'; end if;
    end if;

    item_type := coalesce(item.item_type, coalesce(nullif(trim(coalesce(line->>'item_type', '')), ''), 'product'));

    insert into public.acc_voucher_item_lines (
      organization_id, company_id, voucher_id, line_no, item_id, item_name, item_sku, item_type, unit,
      quantity, rate, amount, gst_rate, hsn_sac, taxable_amount, cgst_amount, sgst_amount, igst_amount
    ) values (
      input_org_id, input_company_id, input_voucher.id, idx,
      item.id,
      coalesce(item.name, trim(line->>'item_name')),
      coalesce(item.sku, nullif(trim(coalesce(line->>'item_sku', '')), '')),
      item_type,
      coalesce(nullif(trim(coalesce(line->>'unit', '')), ''), item.unit, 'Nos'),
      qty, rate, amount,
      coalesce((line->>'gst_rate')::numeric, item.gst_rate, 0),
      coalesce(nullif(trim(coalesce(line->>'hsn_sac', '')), ''), item.hsn_sac),
      coalesce((line->>'taxable_amount')::numeric, amount),
      coalesce((line->>'cgst_amount')::numeric, 0),
      coalesce((line->>'sgst_amount')::numeric, 0),
      coalesce((line->>'igst_amount')::numeric, 0)
    ) returning id into line_id;

    if item_type = 'product' and item.id is not null then
      delta := case when input_voucher.voucher_type = 'sales' then -qty else qty end;
      perform public.acc_assert_stock_available(input_org_id, input_company_id, item.id, delta);
      insert into public.acc_stock_movements (
        organization_id, company_id, item_id, movement_date, quantity_delta, reason, note,
        voucher_id, voucher_item_line_id, voucher_number, created_by
      ) values (
        input_org_id, input_company_id, item.id, input_voucher.voucher_date, delta, reason_text, null,
        input_voucher.id, line_id, input_voucher.voucher_number, auth.uid()
      );
    end if;
  end loop;
end;
$$;

create or replace function public.acc_save_voucher_item_lines(
  input_voucher_id uuid,
  input_lines jsonb,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  voucher public.acc_vouchers%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers
  where id = input_voucher_id and organization_id = org_id and company_id = active_company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status <> 'posted' then raise exception 'Item lines can only be saved on posted vouchers'; end if;
  perform public.acc_apply_voucher_item_lines(org_id, active_company_id, voucher, input_lines);
end;
$$;

create or replace function public.acc_adjust_stock(
  input_item_id uuid,
  input_date date,
  input_quantity_delta numeric,
  input_reason_note text default null,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  item public.acc_items%rowtype;
  new_id uuid;
  note_text text;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_date is null then raise exception 'Adjustment date is required'; end if;
  if coalesce(input_quantity_delta, 0) = 0 then raise exception 'Adjustment quantity cannot be zero'; end if;
  note_text := nullif(trim(coalesce(input_reason_note, '')), '');
  if note_text is null then raise exception 'Adjustment reason is required'; end if;

  select * into item from public.acc_items
  where id = input_item_id and organization_id = org_id and company_id = active_company_id;
  if item.id is null then raise exception 'Item not found'; end if;
  if item.item_type <> 'product' then raise exception 'Stock adjustments are only allowed for products'; end if;

  perform public.acc_assert_stock_available(org_id, active_company_id, item.id, input_quantity_delta);

  insert into public.acc_stock_movements (
    organization_id, company_id, item_id, movement_date, quantity_delta, reason, note, created_by
  ) values (
    org_id, active_company_id, item.id, input_date, input_quantity_delta, 'adjustment', note_text, auth.uid()
  ) returning id into new_id;

  perform public.acc_write_audit(
    org_id, 'stock_adjustment', new_id, 'create',
    null, jsonb_build_object('item_id', item.id, 'delta', input_quantity_delta, 'note', note_text),
    null, active_company_id
  );
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- P2: Require explicit company (header or arg) — no silent primary fallback
-- ---------------------------------------------------------------------------
create or replace function public.acc_require_company(input_company_id uuid default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := coalesce(input_company_id, public.acc_request_company_id());
  if active_company_id is null then raise exception 'Choose an Accounts company'; end if;
  if not exists (
    select 1 from public.acc_companies c
    where c.id = active_company_id and c.organization_id = org_id and c.status = 'active'
  ) then
    raise exception 'Accounts company not found';
  end if;
  return active_company_id;
end;
$$;

-- Viewers can list companies
create or replace function public.acc_list_companies()
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  if not public.can_accounts_read() then
    raise exception 'Accounts access is required to list companies';
  end if;
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

-- Admin-only company / period / GST settings
create or replace function public.acc_create_company(
  input_name text,
  input_books_started_on date default null,
  input_fy_start_month integer default 4
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; nm text;
begin
  org_id := public.acc_require_admin();
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

create or replace function public.acc_archive_company(input_company_id uuid, input_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company public.acc_companies%rowtype;
begin
  org_id := public.acc_require_admin();
  select * into company from public.acc_companies where id = input_company_id and organization_id = org_id;
  if company.id is null then raise exception 'Company not found'; end if;
  if company.is_primary then raise exception 'The primary company cannot be archived'; end if;
  if company.status = 'archived' then return; end if;
  update public.acc_companies
    set status = 'archived', updated_at = now()
    where id = company.id;
  perform public.acc_write_audit(
    org_id, 'company', company.id, 'archive',
    jsonb_build_object('status', 'active', 'name', company.name),
    jsonb_build_object('status', 'archived'),
    coalesce(nullif(trim(input_reason), ''), 'Company archived'),
    company.id
  );
end;
$$;

create or replace function public.acc_save_gst_settings(
  input_gst_registration text,
  input_gstin text default null,
  input_legal_name text default null,
  input_state_code text default null,
  input_state_name text default null,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  reg text;
  normalized_gstin text;
begin
  org_id := public.acc_require_admin();
  active_company_id := public.acc_require_company(input_company_id);
  reg := coalesce(nullif(trim(input_gst_registration), ''), 'unregistered');
  if reg not in ('unregistered', 'regular', 'composition') then
    raise exception 'Choose a valid GST registration type';
  end if;
  normalized_gstin := case when reg = 'unregistered' then null else public.acc_assert_gstin(input_gstin) end;
  if reg <> 'unregistered' and normalized_gstin is null then
    raise exception 'GSTIN is required for a registered company';
  end if;
  if reg <> 'unregistered' and coalesce(nullif(trim(input_state_code), ''), '') is null then
    raise exception 'State is required for GST';
  end if;
  update public.acc_companies
    set gst_registration = reg,
        gstin = normalized_gstin,
        legal_name = nullif(trim(input_legal_name), ''),
        state_code = case when reg = 'unregistered' then null else nullif(trim(input_state_code), '') end,
        state_name = case when reg = 'unregistered' then null else nullif(trim(input_state_name), '') end,
        updated_at = now()
    where id = active_company_id and organization_id = org_id;
  perform public.acc_seed_gst_coa(org_id, active_company_id);
  perform public.acc_write_audit(
    org_id, 'company', active_company_id, 'gst', null,
    jsonb_build_object('gst_registration', reg, 'gstin', normalized_gstin),
    'GST settings saved', active_company_id
  );
end;
$$;

create or replace function public.acc_lock_period(input_from date, input_to date, input_company_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; lock_id uuid;
begin
  org_id := public.acc_require_admin();
  active_company_id := public.acc_require_company(input_company_id);
  if input_to < input_from then raise exception 'Invalid period'; end if;
  insert into public.acc_period_locks(organization_id, company_id, period_from, period_to, locked_by)
  values (org_id, active_company_id, input_from, input_to, auth.uid())
  returning id into lock_id;
  perform public.acc_write_audit(org_id, 'period_lock', lock_id, 'lock', null,
    jsonb_build_object('from', input_from, 'to', input_to), 'Period locked', active_company_id);
  return lock_id;
end;
$$;

create or replace function public.acc_reopen_period(input_lock_id uuid, input_reason text, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid;
begin
  org_id := public.acc_require_admin();
  active_company_id := public.acc_require_company(input_company_id);
  if trim(coalesce(input_reason, '')) = '' then raise exception 'A reason is required to reopen a locked period'; end if;
  update public.acc_period_locks
    set is_locked = false, reopen_reason = trim(input_reason), reopened_at = now(), reopened_by = auth.uid()
    where id = input_lock_id and organization_id = org_id and company_id = active_company_id;
  if not found then raise exception 'Period lock not found'; end if;
  perform public.acc_write_audit(
    org_id, 'period_lock', input_lock_id, 'reopen', null,
    jsonb_build_object('reason', input_reason), input_reason, active_company_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Post voucher: idempotency + optional item lines in one transaction
-- ---------------------------------------------------------------------------
drop function if exists public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb);
drop function if exists public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb, uuid);
drop function if exists public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb, uuid, jsonb);

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
  input_gst_lines jsonb default null,
  input_client_request_id uuid default null,
  input_item_lines jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
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
  voucher_row public.acc_vouchers%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);

  if input_client_request_id is not null then
    select v.id into voucher_id
    from public.acc_vouchers v
    where v.company_id = active_company_id
      and v.client_request_id = input_client_request_id
    limit 1;
    if voucher_id is not null then
      return voucher_id;
    end if;
  end if;

  if input_date > today_ist then raise exception 'Voucher date cannot be in the future'; end if;
  perform public.acc_assert_period_open(org_id, input_date, active_company_id);
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) < 2 then
    raise exception 'A voucher needs at least two lines';
  end if;
  if input_party_id is not null and not exists (
    select 1 from public.acc_parties p where p.id = input_party_id and p.company_id = active_company_id
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
    if not exists (select 1 from public.acc_coa c where c.id = coa and c.company_id = active_company_id) then
      raise exception 'Account does not belong to this company';
    end if;
    party := nullif(line->>'party_id', '')::uuid;
    if party is not null and not exists (
      select 1 from public.acc_parties p where p.id = party and p.company_id = active_company_id
    ) then
      raise exception 'Party does not belong to this company';
    end if;
    total_debit := total_debit + debit_amt;
    total_credit := total_credit + credit_amt;
  end loop;
  if total_debit <= 0 or total_debit <> total_credit then
    raise exception 'Unbalanced voucher cannot be posted. Debits % · Credits %', total_debit, total_credit;
  end if;
  if jsonb_typeof(input_gst_lines) = 'array' and jsonb_array_length(input_gst_lines) > 0 then
    declare
      gst_cgst numeric := 0;
      gst_sgst numeric := 0;
      gst_igst numeric := 0;
      led_cgst numeric := 0;
      led_sgst numeric := 0;
      led_igst numeric := 0;
    begin
      select
        coalesce(sum(round(coalesce((g->>'cgst_amount')::numeric, 0), 2)), 0),
        coalesce(sum(round(coalesce((g->>'sgst_amount')::numeric, 0), 2)), 0),
        coalesce(sum(round(coalesce((g->>'igst_amount')::numeric, 0), 2)), 0)
      into gst_cgst, gst_sgst, gst_igst
      from jsonb_array_elements(input_gst_lines) g;
      select
        coalesce(sum(case when c.code in ('1140', '2210') then round(coalesce((l->>'debit')::numeric, 0) + coalesce((l->>'credit')::numeric, 0), 2) else 0 end), 0),
        coalesce(sum(case when c.code in ('1141', '2211') then round(coalesce((l->>'debit')::numeric, 0) + coalesce((l->>'credit')::numeric, 0), 2) else 0 end), 0),
        coalesce(sum(case when c.code in ('1142', '2212') then round(coalesce((l->>'debit')::numeric, 0) + coalesce((l->>'credit')::numeric, 0), 2) else 0 end), 0)
      into led_cgst, led_sgst, led_igst
      from jsonb_array_elements(input_lines) l
      join public.acc_coa c on c.id = (l->>'coa_id')::uuid and c.company_id = active_company_id;
      if gst_cgst <> led_cgst or gst_sgst <> led_sgst or gst_igst <> led_igst then
        raise exception 'GST document does not match tax ledgers. CGST % / % · SGST % / % · IGST % / %',
          gst_cgst, led_cgst, gst_sgst, led_sgst, gst_igst, led_igst;
      end if;
    end;
  end if;
  voucher_no := public.acc_next_number(active_company_id, input_voucher_type);
  insert into public.acc_vouchers(
    organization_id, company_id, voucher_type, voucher_number, voucher_date, narration, status, party_id,
    source_module, source_type, source_transaction_id, client_request_id, created_by, posted_at, posted_by
  ) values (
    org_id, active_company_id, input_voucher_type, voucher_no, input_date, coalesce(input_narration, ''), 'posted', input_party_id,
    input_source_module, input_source_type, input_source_transaction_id, input_client_request_id, auth.uid(), now(), auth.uid()
  ) returning id into voucher_id;
  for line in select * from jsonb_array_elements(input_lines)
  loop
    line_no := line_no + 1;
    insert into public.acc_voucher_lines(organization_id, company_id, voucher_id, line_no, coa_id, party_id, debit, credit, description)
    values (
      org_id, active_company_id, voucher_id, line_no,
      (line->>'coa_id')::uuid,
      coalesce(nullif(line->>'party_id', '')::uuid, input_party_id),
      round(coalesce((line->>'debit')::numeric, 0), 2),
      round(coalesce((line->>'credit')::numeric, 0), 2),
      coalesce(line->>'description', input_narration)
    );
  end loop;
  if jsonb_typeof(input_gst_lines) = 'array' then
    insert into public.acc_gst_lines(
      organization_id, company_id, voucher_id, line_no, hsn_sac, description, taxable_amount, rate,
      cgst_amount, sgst_amount, igst_amount, supply_type, itc_eligible
    )
    select org_id, active_company_id, voucher_id,
           coalesce((g->>'line_no')::integer, ordinality::integer),
           nullif(trim(g->>'hsn_sac'), ''),
           coalesce(g->>'description', input_narration),
           round(coalesce((g->>'taxable_amount')::numeric, 0), 2),
           round(coalesce((g->>'rate')::numeric, 0), 2),
           round(coalesce((g->>'cgst_amount')::numeric, 0), 2),
           round(coalesce((g->>'sgst_amount')::numeric, 0), 2),
           round(coalesce((g->>'igst_amount')::numeric, 0), 2),
           coalesce(nullif(g->>'supply_type', ''), 'none'),
           coalesce((g->>'itc_eligible')::boolean, true)
    from jsonb_array_elements(input_gst_lines) with ordinality as t(g, ordinality);
  end if;

  if jsonb_typeof(input_item_lines) = 'array' and jsonb_array_length(input_item_lines) > 0 then
    select * into voucher_row from public.acc_vouchers where id = voucher_id;
    perform public.acc_apply_voucher_item_lines(org_id, active_company_id, voucher_row, input_item_lines);
  end if;

  perform public.acc_write_audit(org_id, 'voucher', voucher_id, 'post', null, jsonb_build_object(
    'voucher_number', voucher_no, 'voucher_type', input_voucher_type, 'debit', total_debit, 'credit', total_credit
  ), input_narration, active_company_id);
  return voucher_id;
exception
  when unique_violation then
    if input_client_request_id is not null then
      select v.id into voucher_id
      from public.acc_vouchers v
      where v.company_id = active_company_id and v.client_request_id = input_client_request_id
      limit 1;
      if voucher_id is not null then return voucher_id; end if;
    end if;
    raise;
end;
$$;

grant execute on function public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb, uuid, jsonb) to authenticated;

-- Cancel / reverse: reverse stock in the same transaction
create or replace function public.acc_cancel_voucher(input_voucher_id uuid, input_reason text, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; voucher public.acc_vouchers;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into voucher
    from public.acc_vouchers v
    where v.id = input_voucher_id and v.organization_id = org_id and v.company_id = active_company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status = 'cancelled' then raise exception 'Voucher is already cancelled'; end if;
  if voucher.status = 'reversed' then raise exception 'Reversed vouchers cannot be cancelled. Cancel the reversal instead.'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be cancelled'; end if;
  perform public.acc_assert_period_open(org_id, voucher.voucher_date, active_company_id);
  update public.acc_vouchers
    set status = 'cancelled', cancel_reason = coalesce(nullif(trim(input_reason), ''), 'Cancelled'),
        cancelled_at = now(), cancelled_by = auth.uid()
    where id = voucher.id;
  perform public.acc_reverse_voucher_stock(voucher.id, active_company_id);
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'cancel',
    jsonb_build_object('status', voucher.status, 'voucher_number', voucher.voucher_number),
    jsonb_build_object('status', 'cancelled'), input_reason, active_company_id);
end;
$$;

create or replace function public.acc_reverse_voucher(input_voucher_id uuid, input_date date, input_reason text, input_company_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  voucher public.acc_vouchers;
  lines jsonb;
  gst jsonb;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers v
    where v.id = input_voucher_id and v.organization_id = org_id and v.company_id = active_company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be reversed'; end if;
  if voucher.reversed_voucher_id is not null then raise exception 'Voucher is already reversed'; end if;
  select jsonb_agg(jsonb_build_object(
    'coa_id', coa_id, 'party_id', party_id, 'debit', credit, 'credit', debit, 'description', coalesce(input_reason, 'Reversal')
  ) order by line_no) into lines
  from public.acc_voucher_lines where voucher_id = voucher.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'line_no', line_no,
    'hsn_sac', hsn_sac,
    'description', description,
    'taxable_amount', taxable_amount,
    'rate', rate,
    'cgst_amount', cgst_amount,
    'sgst_amount', sgst_amount,
    'igst_amount', igst_amount,
    'supply_type', supply_type,
    'itc_eligible', itc_eligible
  ) order by line_no), '[]'::jsonb)
  into gst
  from public.acc_gst_lines
  where voucher_id = voucher.id;
  new_id := public.acc_post_voucher(
    voucher.voucher_type, coalesce(input_date, current_date),
    coalesce(nullif(trim(input_reason), ''), 'Reversal of ' || voucher.voucher_number),
    lines, voucher.party_id, 'accounts', 'reversal', voucher.id, voucher.company_id,
    case when gst = '[]'::jsonb then null else gst end,
    null,
    null
  );
  update public.acc_vouchers set reversed_voucher_id = new_id, status = 'reversed' where id = voucher.id;
  update public.acc_vouchers set original_voucher_id = voucher.id where id = new_id;
  perform public.acc_reverse_voucher_stock(voucher.id, active_company_id);
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'reverse',
    jsonb_build_object('voucher_number', voucher.voucher_number),
    jsonb_build_object('reversal_id', new_id), input_reason, active_company_id);
  return new_id;
end;
$$;

grant execute on function public.acc_save_gst_settings(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.acc_create_company(text, date, integer) to authenticated;
grant execute on function public.acc_archive_company(uuid, text) to authenticated;
grant execute on function public.acc_lock_period(date, date, uuid) to authenticated;
grant execute on function public.acc_reopen_period(uuid, text, uuid) to authenticated;
grant execute on function public.acc_list_companies() to authenticated;
grant execute on function public.acc_cancel_voucher(uuid, text, uuid) to authenticated;
grant execute on function public.acc_reverse_voucher(uuid, date, text, uuid) to authenticated;
grant execute on function public.acc_save_voucher_item_lines(uuid, jsonb, uuid) to authenticated;
grant execute on function public.acc_adjust_stock(uuid, date, numeric, text, uuid) to authenticated;

notify pgrst, 'reload schema';
