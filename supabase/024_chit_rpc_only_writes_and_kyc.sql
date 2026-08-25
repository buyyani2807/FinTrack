-- Chit Fund: RPC-only writes, owner-only reads, and vault encryption for member KYC.
-- Run after 023_chit_installment_notes.sql. Does not change Daily/Monthly finance RPCs.

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'chit_schemes','chit_members','chit_enrollments','chit_cycles','chit_bids',
    'chit_installments','chit_payouts','chit_security_deposits','chit_audit_log','chit_report_configs'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'chit_owner_manage_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'chit_members_read_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'chit_owner_read_' || table_name, table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'chit_schemes','chit_members','chit_enrollments','chit_cycles','chit_bids',
    'chit_installments','chit_payouts','chit_security_deposits','chit_report_configs'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id() and public.chit_is_owner())',
      'chit_owner_read_' || table_name, table_name
    );
  end loop;
end $$;

drop policy if exists chit_owner_read_chit_audit_log on public.chit_audit_log;
create policy chit_owner_read_chit_audit_log on public.chit_audit_log for select to authenticated
using (organization_id = public.current_organization_id() and public.chit_is_owner());

create or replace function public.chit_encrypt_kyc_value(input_value text)
returns text language plpgsql security definer set search_path = public, vault, extensions
as $$
declare encryption_key text;
begin
  if nullif(trim(input_value), '') is null then return null; end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name = 'fintrack_kyc_key' limit 1;
  if encryption_key is null then raise exception 'KYC encryption key is unavailable'; end if;
  return encode(pgp_sym_encrypt(trim(input_value), encryption_key, 'cipher-algo=aes256, compress-algo=1'), 'base64');
end;
$$;

create or replace function public.chit_create_member(
  member_name text, member_phone text, member_address text default null,
  member_aadhaar_ciphertext text default null, member_pan_ciphertext text default null
) returns uuid language plpgsql security definer set search_path = public, vault, extensions
as $$
declare org_id uuid; member_id uuid; aadhaar_value text; pan_value text;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund members'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  if nullif(trim(member_name), '') is null or nullif(trim(member_phone), '') is null then raise exception 'Member name and phone are required'; end if;
  aadhaar_value := nullif(trim(member_aadhaar_ciphertext), '');
  pan_value := nullif(upper(trim(member_pan_ciphertext)), '');
  if aadhaar_value is not null and aadhaar_value !~ '^[0-9]{12}$' then raise exception 'Aadhaar must contain exactly 12 digits'; end if;
  if pan_value is not null and pan_value !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then raise exception 'PAN format is invalid'; end if;
  insert into public.chit_members(organization_id, full_name, phone, address, aadhaar_ciphertext, pan_ciphertext)
  values(
    org_id, trim(member_name), trim(member_phone), nullif(trim(member_address), ''),
    public.chit_encrypt_kyc_value(aadhaar_value), public.chit_encrypt_kyc_value(pan_value)
  ) returning id into member_id;
  return member_id;
end;
$$;
grant execute on function public.chit_create_member(text,text,text,text,text) to authenticated;
revoke execute on function public.chit_encrypt_kyc_value(text) from public, anon, authenticated;
