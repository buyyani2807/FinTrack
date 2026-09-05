-- Fix PL/pgSQL variable/column name shadowing in Accounts RPCs.
-- Live errors seen in owner smoke:
--   column reference "gstin" is ambiguous       (acc_save_gst_settings)
--   column reference "company_id" is ambiguous  (acc_post_voucher party/coa checks)
-- Apply after 063_accounts_p2_p3.sql on the linked Supabase project.

-- ---------------------------------------------------------------------------
-- GST settings: rename locals so UPDATE ... SET gstin = ... is unambiguous
-- ---------------------------------------------------------------------------
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
  org_id := public.acc_require_owner();
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

grant execute on function public.acc_save_gst_settings(text, text, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Party update: same company_id shadowing in WHERE clauses
-- ---------------------------------------------------------------------------
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
declare
  org_id uuid;
  active_company_id uuid;
  existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if trim(coalesce(input_name, '')) = '' then raise exception 'Party name is required'; end if;
  if input_party_type not in ('customer', 'supplier', 'employee', 'agent', 'other') then
    raise exception 'Choose a valid party type';
  end if;
  select * into existing
    from public.acc_parties p
    where p.id = input_id and p.organization_id = org_id and p.company_id = active_company_id;
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
    where id = input_id and company_id = active_company_id;
  perform public.acc_write_audit(
    org_id, 'party', input_id, 'update',
    jsonb_build_object('name', existing.name, 'party_type', existing.party_type),
    jsonb_build_object('name', trim(input_name), 'party_type', input_party_type),
    null, active_company_id
  );
end;
$$;

grant execute on function public.acc_update_party(uuid, text, text, text, text, text, text, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Post voucher: party/coa membership checks used company_id = company_id
-- ---------------------------------------------------------------------------
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
begin
  org_id := public.acc_require_owner();
  active_company_id := coalesce(input_company_id, public.acc_request_company_id());
  if active_company_id is null then active_company_id := public.acc_primary_company_id(org_id); end if;
  active_company_id := public.acc_require_company(active_company_id);
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
    source_module, source_type, source_transaction_id, created_by, posted_at, posted_by
  ) values (
    org_id, active_company_id, input_voucher_type, voucher_no, input_date, coalesce(input_narration, ''), 'posted', input_party_id,
    input_source_module, input_source_type, input_source_transaction_id, auth.uid(), now(), auth.uid()
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
  perform public.acc_write_audit(org_id, 'voucher', voucher_id, 'post', null, jsonb_build_object(
    'voucher_number', voucher_no, 'voucher_type', input_voucher_type, 'debit', total_debit, 'credit', total_credit
  ), input_narration, active_company_id);
  return voucher_id;
end;
$$;

grant execute on function public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reopen period: WHERE company_id = company_id was ambiguous
-- ---------------------------------------------------------------------------
create or replace function public.acc_reopen_period(input_lock_id uuid, input_reason text, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid;
begin
  org_id := public.acc_require_owner();
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

grant execute on function public.acc_reopen_period(uuid, text, uuid) to authenticated;
