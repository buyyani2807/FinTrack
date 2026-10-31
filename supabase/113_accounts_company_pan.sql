-- Company PAN on Accounts companies. Apply after 112. Safe to re-run.
-- Optional on create; also editable with GST settings. GSTIN characters 3–12 are the PAN when registered.

alter table public.acc_companies
  add column if not exists pan text;

comment on column public.acc_companies.pan is
  'Income-tax PAN for the company. Optional. When GSTIN is set, characters 3–12 are the PAN.';

create or replace function public.acc_assert_pan(input_pan text)
returns text
language plpgsql
immutable
as $$
declare
  p text := nullif(upper(trim(coalesce(input_pan, ''))), '');
begin
  if p is null then
    return null;
  end if;
  if p !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'Enter a valid 10-character PAN (e.g. ABCDE1234F)';
  end if;
  return p;
end;
$$;

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
      'updatedAt', c.updated_at,
      'gstRegistration', c.gst_registration,
      'gstin', c.gstin,
      'pan', c.pan,
      'legalName', c.legal_name,
      'stateCode', c.state_code,
      'stateName', c.state_name
    ) order by c.is_primary desc, lower(c.name))
    from public.acc_companies c
    where c.organization_id = org_id
      and public.acc_can_access_company(c.id)
  ), '[]'::jsonb);
end;
$$;

drop function if exists public.acc_create_company(text, date, integer);

create or replace function public.acc_create_company(
  input_name text,
  input_books_started_on date default null,
  input_fy_start_month integer default 4,
  input_pan text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; nm text; normalized_pan text;
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
  normalized_pan := public.acc_assert_pan(input_pan);
  insert into public.acc_companies(
    organization_id, name, fy_start_month, books_started_on, is_primary, status, pan, created_by
  )
  values (
    org_id, nm, coalesce(input_fy_start_month, 4), coalesce(input_books_started_on, current_date),
    false, 'active', normalized_pan, auth.uid()
  )
  returning id into company_id;
  perform public.acc_seed_coa_for_company(org_id, company_id);
  perform public.acc_write_audit(
    org_id, 'company', company_id, 'create', null,
    jsonb_build_object('name', nm, 'pan', normalized_pan),
    'Company created', company_id
  );
  return company_id;
end;
$$;

drop function if exists public.acc_save_gst_settings(text, text, text, text, text, uuid);

create or replace function public.acc_save_gst_settings(
  input_gst_registration text,
  input_gstin text default null,
  input_legal_name text default null,
  input_state_code text default null,
  input_state_name text default null,
  input_company_id uuid default null,
  input_pan text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  reg text;
  normalized_gstin text;
  normalized_pan text;
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
  normalized_pan := public.acc_assert_pan(input_pan);
  if normalized_pan is null and normalized_gstin is not null then
    normalized_pan := public.acc_assert_pan(substr(normalized_gstin, 3, 10));
  end if;
  update public.acc_companies
    set gst_registration = reg,
        gstin = normalized_gstin,
        legal_name = nullif(trim(input_legal_name), ''),
        state_code = case when reg = 'unregistered' then null else nullif(trim(input_state_code), '') end,
        state_name = case when reg = 'unregistered' then null else nullif(trim(input_state_name), '') end,
        pan = normalized_pan,
        updated_at = now()
    where id = active_company_id and organization_id = org_id;
  perform public.acc_seed_gst_coa(org_id, active_company_id);
  perform public.acc_write_audit(
    org_id, 'company', active_company_id, 'gst', null,
    jsonb_build_object(
      'gst_registration', reg,
      'gstin', normalized_gstin,
      'pan', normalized_pan
    ),
    'GST settings saved', active_company_id
  );
end;
$$;

grant execute on function public.acc_assert_pan(text) to authenticated;
grant execute on function public.acc_list_companies() to authenticated;
grant execute on function public.acc_create_company(text, date, integer, text) to authenticated;
grant execute on function public.acc_save_gst_settings(text, text, text, text, text, uuid, text) to authenticated;
