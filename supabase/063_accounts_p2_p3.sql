-- P2/P3 Accounts integrity: GSTIN checksum, due-date period lock,
-- acc_settings SELECT-only RLS, company archive, and full COA parent-cycle walk.
-- Apply after 062_accounts_gst_integrity.sql.

-- ---------------------------------------------------------------------------
-- GSTIN format + checksum (same algorithm as src/features/accounts/accountingGst.js)
-- ---------------------------------------------------------------------------
create or replace function public.acc_gstin_checksum(input_body text)
returns text language plpgsql immutable as $$
declare
  chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  factor integer := 1;
  total integer := 0;
  i integer;
  code_point integer;
  product integer;
begin
  if length(coalesce(input_body, '')) <> 14 then
    raise exception 'GSTIN body must be 14 characters';
  end if;
  for i in 1..14 loop
    code_point := strpos(chars, substr(input_body, i, 1)) - 1;
    if code_point < 0 then
      raise exception 'Invalid GSTIN character';
    end if;
    product := factor * code_point;
    factor := case when factor = 2 then 1 else 2 end;
    total := total + (product / 36) + (product % 36);
  end loop;
  return substr(chars, ((36 - (total % 36)) % 36) + 1, 1);
end;
$$;

create or replace function public.acc_assert_gstin(input_gstin text)
returns text language plpgsql immutable as $$
declare g text;
begin
  g := nullif(upper(trim(coalesce(input_gstin, ''))), '');
  if g is null then
    return null;
  end if;
  if g !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'Enter a valid 15-character GSTIN';
  end if;
  if right(g, 1) <> public.acc_gstin_checksum(left(g, 14)) then
    raise exception 'GSTIN checksum is not valid';
  end if;
  return g;
end;
$$;

create or replace function public.acc_normalize_gstin_row()
returns trigger language plpgsql as $$
begin
  new.gstin := public.acc_assert_gstin(new.gstin);
  return new;
end;
$$;

drop trigger if exists acc_parties_gstin_trg on public.acc_parties;
create trigger acc_parties_gstin_trg
  before insert or update of gstin on public.acc_parties
  for each row execute function public.acc_normalize_gstin_row();

drop trigger if exists acc_companies_gstin_trg on public.acc_companies;
create trigger acc_companies_gstin_trg
  before insert or update of gstin on public.acc_companies
  for each row execute function public.acc_normalize_gstin_row();

create or replace function public.acc_save_gst_settings(
  input_gst_registration text,
  input_gstin text default null,
  input_legal_name text default null,
  input_state_code text default null,
  input_state_name text default null,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; reg text; gstin text;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  reg := coalesce(nullif(trim(input_gst_registration), ''), 'unregistered');
  if reg not in ('unregistered', 'regular', 'composition') then
    raise exception 'Choose a valid GST registration type';
  end if;
  gstin := case when reg = 'unregistered' then null else public.acc_assert_gstin(input_gstin) end;
  if reg <> 'unregistered' and gstin is null then
    raise exception 'GSTIN is required for a registered company';
  end if;
  if reg <> 'unregistered' and coalesce(nullif(trim(input_state_code), ''), '') is null then
    raise exception 'State is required for GST';
  end if;
  update public.acc_companies
    set gst_registration = reg,
        gstin = gstin,
        legal_name = nullif(trim(input_legal_name), ''),
        state_code = case when reg = 'unregistered' then null else nullif(trim(input_state_code), '') end,
        state_name = case when reg = 'unregistered' then null else nullif(trim(input_state_name), '') end,
        updated_at = now()
    where id = company_id and organization_id = org_id;
  perform public.acc_seed_gst_coa(org_id, company_id);
  perform public.acc_write_audit(org_id, 'company', company_id, 'gst', null, jsonb_build_object('gst_registration', reg, 'gstin', gstin), 'GST settings saved', company_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Due dates cannot be changed while the voucher date is in a locked period
-- ---------------------------------------------------------------------------
create or replace function public.acc_set_voucher_due(input_voucher_id uuid, input_due date, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid; voucher public.acc_vouchers;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id and company_id = company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  perform public.acc_assert_period_open(org_id, voucher.voucher_date, company_id);
  update public.acc_vouchers set due_date = input_due where id = voucher.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- acc_settings writes stay on RPCs; owners may only SELECT the row
-- ---------------------------------------------------------------------------
drop policy if exists acc_settings_owner on public.acc_settings;
drop policy if exists acc_settings_owner_select on public.acc_settings;
create policy acc_settings_owner_select on public.acc_settings
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_financier_owner());

-- ---------------------------------------------------------------------------
-- Full parent-chain cycle check
-- ---------------------------------------------------------------------------
create or replace function public.acc_set_coa_parent(input_id uuid, input_parent_id uuid, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company_id uuid;
  account public.acc_coa;
  parent public.acc_coa;
  walk_id uuid;
  hops integer := 0;
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
  walk_id := parent.parent_id;
  while walk_id is not null loop
    if walk_id = account.id then raise exception 'Circular parent is not allowed'; end if;
    hops := hops + 1;
    if hops > 50 then raise exception 'Parent chain is too deep'; end if;
    select parent_id into walk_id
    from public.acc_coa
    where id = walk_id and organization_id = org_id and company_id = company_id;
  end loop;
  update public.acc_coa set parent_id = parent.id where id = account.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Archive a non-primary company (acc_require_company already requires active)
-- ---------------------------------------------------------------------------
create or replace function public.acc_archive_company(input_company_id uuid, input_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company public.acc_companies;
begin
  org_id := public.acc_require_owner();
  select * into company from public.acc_companies where id = input_company_id and organization_id = org_id;
  if company.id is null then raise exception 'Accounts company not found'; end if;
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

grant execute on function public.acc_gstin_checksum(text) to authenticated;
grant execute on function public.acc_assert_gstin(text) to authenticated;
grant execute on function public.acc_save_gst_settings(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.acc_set_voucher_due(uuid, date, uuid) to authenticated;
grant execute on function public.acc_set_coa_parent(uuid, uuid, uuid) to authenticated;
grant execute on function public.acc_archive_company(uuid, text) to authenticated;
