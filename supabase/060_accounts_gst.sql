-- FinTrack Accounts: company-specific GST configuration, ledgers, and invoice tax lines.
-- Run AFTER 059_accounts_multi_company.sql. Required before 061_accounts_query_indexes.sql
-- and 062_accounts_gst_integrity.sql.
-- Does not rewrite existing vouchers or openings. GST ledgers are inserted with zero balance.

alter table public.acc_companies add column if not exists gst_registration text not null default 'unregistered'
  check (gst_registration in ('unregistered', 'regular', 'composition'));
alter table public.acc_companies add column if not exists gstin text;
alter table public.acc_companies add column if not exists legal_name text;
alter table public.acc_companies add column if not exists state_code text;
alter table public.acc_companies add column if not exists state_name text;

alter table public.acc_parties add column if not exists state_code text;
alter table public.acc_parties add column if not exists gst_registration text
  check (gst_registration is null or gst_registration in ('unregistered', 'regular', 'composition'));

create table if not exists public.acc_gst_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  voucher_id uuid not null references public.acc_vouchers(id) on delete cascade,
  line_no integer not null default 1,
  hsn_sac text,
  description text,
  taxable_amount numeric(14,2) not null default 0,
  rate numeric(8,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  supply_type text not null default 'none' check (supply_type in ('intra', 'inter', 'none')),
  itc_eligible boolean not null default true
);

create index if not exists acc_gst_lines_company_idx on public.acc_gst_lines(company_id, voucher_id);
alter table public.acc_gst_lines enable row level security;
drop policy if exists acc_gst_lines_owner_select on public.acc_gst_lines;
create policy acc_gst_lines_owner_select on public.acc_gst_lines for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_financier_owner()
    and company_id = public.acc_request_company_id()
  );

create or replace function public.acc_seed_gst_coa(input_org_id uuid, input_company_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.acc_coa(organization_id, company_id, code, name, group_type, account_type, is_system)
  values
    (input_org_id, input_company_id, '1140', 'Input CGST', 'asset', 'other', true),
    (input_org_id, input_company_id, '1141', 'Input SGST', 'asset', 'other', true),
    (input_org_id, input_company_id, '1142', 'Input IGST', 'asset', 'other', true),
    (input_org_id, input_company_id, '2210', 'Output CGST', 'liability', 'other', true),
    (input_org_id, input_company_id, '2211', 'Output SGST', 'liability', 'other', true),
    (input_org_id, input_company_id, '2212', 'Output IGST', 'liability', 'other', true)
  on conflict (company_id, code) do nothing;
end;
$$;

insert into public.acc_coa(organization_id, company_id, code, name, group_type, account_type, is_system)
select c.organization_id, c.id, v.code, v.name, v.group_type, v.account_type, true
from public.acc_companies c
cross join (values
  ('1140', 'Input CGST', 'asset', 'other'),
  ('1141', 'Input SGST', 'asset', 'other'),
  ('1142', 'Input IGST', 'asset', 'other'),
  ('2210', 'Output CGST', 'liability', 'other'),
  ('2211', 'Output SGST', 'liability', 'other'),
  ('2212', 'Output IGST', 'liability', 'other')
) as v(code, name, group_type, account_type)
on conflict (company_id, code) do nothing;

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
      'updatedAt', c.updated_at,
      'gstRegistration', c.gst_registration,
      'gstin', c.gstin,
      'legalName', c.legal_name,
      'stateCode', c.state_code,
      'stateName', c.state_name
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
  perform public.acc_seed_gst_coa(org_id, company_id);
  perform public.acc_write_audit(org_id, 'company', company_id, 'create', null, jsonb_build_object('name', nm), 'Company created', company_id);
  return company_id;
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
declare org_id uuid; company_id uuid; reg text;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  reg := coalesce(nullif(trim(input_gst_registration), ''), 'unregistered');
  if reg not in ('unregistered', 'regular', 'composition') then
    raise exception 'Choose a valid GST registration type';
  end if;
  if reg <> 'unregistered' and coalesce(nullif(trim(input_gstin), ''), '') is null then
    raise exception 'GSTIN is required for a registered company';
  end if;
  if reg <> 'unregistered' and coalesce(nullif(trim(input_state_code), ''), '') is null then
    raise exception 'State is required for GST';
  end if;
  update public.acc_companies
    set gst_registration = reg,
        gstin = case when reg = 'unregistered' then null else nullif(trim(input_gstin), '') end,
        legal_name = nullif(trim(input_legal_name), ''),
        state_code = case when reg = 'unregistered' then null else nullif(trim(input_state_code), '') end,
        state_name = case when reg = 'unregistered' then null else nullif(trim(input_state_name), '') end,
        updated_at = now()
    where id = company_id and organization_id = org_id;
  perform public.acc_seed_gst_coa(org_id, company_id);
  perform public.acc_write_audit(org_id, 'company', company_id, 'gst', null, jsonb_build_object('gst_registration', reg, 'gstin', input_gstin), 'GST settings saved', company_id);
end;
$$;

drop function if exists public.acc_create_party(text, text, text, text, text, text, text, uuid);
drop function if exists public.acc_update_party(uuid, text, text, text, text, text, text, text, uuid);

create or replace function public.acc_create_party(
  input_party_type text, input_name text, input_phone text default null, input_email text default null,
  input_address text default null, input_gstin text default null, input_notes text default null,
  input_company_id uuid default null,
  input_state_code text default null,
  input_gst_registration text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; new_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  if trim(coalesce(input_name, '')) = '' then raise exception 'Party name is required'; end if;
  insert into public.acc_parties(
    organization_id, company_id, party_type, name, phone, email, address, gstin, notes, state_code, gst_registration
  ) values (
    org_id, company_id, input_party_type, trim(input_name), nullif(trim(input_phone), ''), nullif(trim(input_email), ''),
    nullif(trim(input_address), ''), nullif(trim(input_gstin), ''), nullif(trim(input_notes), ''),
    nullif(trim(input_state_code), ''), nullif(trim(input_gst_registration), '')
  )
  returning id into new_id;
  perform public.acc_write_audit(org_id, 'party', new_id, 'create', null, jsonb_build_object('name', input_name, 'party_type', input_party_type), null, company_id);
  return new_id;
end;
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
  input_company_id uuid default null,
  input_state_code text default null,
  input_gst_registration text default null
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
        state_code = nullif(trim(coalesce(input_state_code, '')), ''),
        gst_registration = nullif(trim(coalesce(input_gst_registration, '')), ''),
        updated_at = now()
    where id = input_id and company_id = company_id;
  perform public.acc_write_audit(org_id, 'party', input_id, 'update',
    jsonb_build_object('name', existing.name, 'party_type', existing.party_type),
    jsonb_build_object('name', trim(input_name), 'party_type', input_party_type),
    null, company_id);
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
      join public.acc_coa c on c.id = (l->>'coa_id')::uuid and c.company_id = company_id;
      if gst_cgst <> led_cgst or gst_sgst <> led_sgst or gst_igst <> led_igst then
        raise exception 'GST document does not match tax ledgers. CGST % / % · SGST % / % · IGST % / %',
          gst_cgst, led_cgst, gst_sgst, led_sgst, gst_igst, led_igst;
      end if;
    end;
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
  if jsonb_typeof(input_gst_lines) = 'array' then
    insert into public.acc_gst_lines(
      organization_id, company_id, voucher_id, line_no, hsn_sac, description, taxable_amount, rate,
      cgst_amount, sgst_amount, igst_amount, supply_type, itc_eligible
    )
    select org_id, company_id, voucher_id,
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
  perform public.acc_write_audit(org_id, 'voucher', voucher_id, 'post', null, jsonb_build_object(
    'voucher_number', voucher_no, 'voucher_type', input_voucher_type, 'debit', total_debit, 'credit', total_credit
  ), input_narration, company_id);
  return voucher_id;
end;
$$;

grant execute on function public.acc_seed_gst_coa(uuid, uuid) to authenticated;
grant execute on function public.acc_save_gst_settings(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.acc_create_party(text, text, text, text, text, text, text, uuid, text, text) to authenticated;
grant execute on function public.acc_update_party(uuid, text, text, text, text, text, text, text, uuid, text, text) to authenticated;
grant execute on function public.acc_list_companies() to authenticated;
grant execute on function public.acc_create_company(text, date, integer) to authenticated;
grant execute on function public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb) to authenticated;
grant select on public.acc_gst_lines to authenticated;
