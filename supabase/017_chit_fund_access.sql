-- Chit Fund access layer. Run only after reviewing 016_chit_fund_schema.sql.
-- Existing Daily/Monthly Finance tables and policies are not changed.

create or replace function public.chit_is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_financier_owner() $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['chit_schemes','chit_members','chit_enrollments','chit_cycles','chit_bids','chit_installments','chit_payouts','chit_security_deposits','chit_audit_log','chit_report_configs'] loop
    execute format('drop policy if exists %I on public.%I', 'chit_owner_manage_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'chit_members_read_' || table_name, table_name);
    execute format('create policy %I on public.%I for all to authenticated using (organization_id = public.current_organization_id() and public.chit_is_owner()) with check (organization_id = public.current_organization_id() and public.chit_is_owner())', 'chit_owner_manage_' || table_name, table_name);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id())', 'chit_members_read_' || table_name, table_name);
  end loop;
end $$;

-- Audit rows are append-only. They are written by trusted security-definer
-- functions, never by browser table writes.
drop policy if exists chit_owner_manage_chit_audit_log on public.chit_audit_log;
drop policy if exists chit_members_read_chit_audit_log on public.chit_audit_log;
create policy chit_owner_read_chit_audit_log on public.chit_audit_log for select to authenticated
using (organization_id = public.current_organization_id() and public.chit_is_owner());

create or replace function public.chit_create_scheme(
  scheme_name text, scheme_chit_value numeric, scheme_duration_months integer,
  scheme_member_count integer, scheme_installment_amount numeric,
  scheme_commission_percent numeric, scheme_start_date date,
  scheme_min_bid_percent numeric default 70, scheme_max_bid_percent numeric default 95,
  scheme_late_penalty_amount numeric default 0, scheme_security_deposit_amount numeric default 0
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; scheme_id uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund schemes'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  if nullif(trim(scheme_name), '') is null then raise exception 'Scheme name is required'; end if;
  if scheme_chit_value <= 0 or scheme_duration_months <= 0 or scheme_member_count <= 0 or scheme_installment_amount <= 0 then raise exception 'Scheme amounts and counts must be positive'; end if;
  if round(scheme_installment_amount * scheme_member_count, 2) <> round(scheme_chit_value, 2) then raise exception 'Installment amount multiplied by member count must equal chit value'; end if;
  if scheme_commission_percent < 0 or scheme_commission_percent > 7 then raise exception 'Commission cannot exceed 7%%'; end if;
  if scheme_min_bid_percent < 0 or scheme_max_bid_percent > 100 or scheme_min_bid_percent > scheme_max_bid_percent then raise exception 'Invalid bid limits'; end if;
  insert into public.chit_schemes(organization_id, name, chit_value, duration_months, member_count, installment_amount, commission_percent, start_date, min_bid_percent, max_bid_percent, late_penalty_amount, security_deposit_amount, created_by)
  values(org_id, trim(scheme_name), round(scheme_chit_value, 2), scheme_duration_months, scheme_member_count, round(scheme_installment_amount, 2), scheme_commission_percent, scheme_start_date, scheme_min_bid_percent, scheme_max_bid_percent, scheme_late_penalty_amount, scheme_security_deposit_amount, auth.uid()) returning id into scheme_id;
  return scheme_id;
end;
$$;
grant execute on function public.chit_create_scheme(text,numeric,integer,integer,numeric,numeric,date,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.chit_create_member(
  member_name text, member_phone text, member_address text default null,
  member_aadhaar_ciphertext text default null, member_pan_ciphertext text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; member_id uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund members'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  if nullif(trim(member_name), '') is null or nullif(trim(member_phone), '') is null then raise exception 'Member name and phone are required'; end if;
  insert into public.chit_members(organization_id, full_name, phone, address, aadhaar_ciphertext, pan_ciphertext)
  values(org_id, trim(member_name), trim(member_phone), nullif(trim(member_address), ''), member_aadhaar_ciphertext, member_pan_ciphertext) returning id into member_id;
  return member_id;
end;
$$;
grant execute on function public.chit_create_member(text,text,text,text,text) to authenticated;

create or replace function public.chit_enroll_member(
  input_scheme_id uuid, input_member_id uuid, input_ticket_number integer,
  input_guarantor_name text, input_guarantor_phone text, input_guarantor_address text default null,
  input_security_deposit numeric default 0
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; enrollment_id uuid; scheme_status text; configured_members integer; enrolled_members integer;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can enroll Chit Fund members'; end if;
  select organization_id, status, member_count into org_id, scheme_status, configured_members from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if org_id is null then raise exception 'Scheme not found'; end if;
  if scheme_status <> 'draft' then raise exception 'Members can only be enrolled while a scheme is in draft'; end if;
  if not exists (select 1 from public.chit_members where id = input_member_id and organization_id = org_id) then raise exception 'Chit Fund member not found'; end if;
  select count(*) into enrolled_members from public.chit_enrollments where scheme_id = input_scheme_id and status = 'active';
  if enrolled_members >= configured_members then raise exception 'The scheme already has its configured member count'; end if;
  if input_ticket_number <= 0 or nullif(trim(input_guarantor_name), '') is null or nullif(trim(input_guarantor_phone), '') is null then raise exception 'Ticket and guarantor details are required'; end if;
  insert into public.chit_enrollments(organization_id, scheme_id, member_id, ticket_number, guarantor_name, guarantor_phone, guarantor_address, security_deposit_amount, created_by)
  values(org_id, input_scheme_id, input_member_id, input_ticket_number, trim(input_guarantor_name), trim(input_guarantor_phone), nullif(trim(input_guarantor_address), ''), input_security_deposit, auth.uid()) returning id into enrollment_id;
  return enrollment_id;
end;
$$;
grant execute on function public.chit_enroll_member(uuid,uuid,integer,text,text,text,numeric) to authenticated;

create or replace function public.chit_activate_scheme(input_scheme_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare configured_members integer; enrolled_members integer; current_status text;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can activate a Chit Fund scheme'; end if;
  select member_count, status into configured_members, current_status from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if configured_members is null then raise exception 'Scheme not found'; end if;
  if current_status <> 'draft' then raise exception 'Only draft schemes can be activated'; end if;
  select count(*) into enrolled_members from public.chit_enrollments where scheme_id = input_scheme_id and status = 'active';
  if enrolled_members <> configured_members then raise exception 'Scheme requires exactly its configured member count before activation'; end if;
  update public.chit_schemes set status = 'active', updated_at = now() where id = input_scheme_id;
end;
$$;
grant execute on function public.chit_activate_scheme(uuid) to authenticated;
