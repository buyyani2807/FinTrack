-- Run after 005_customer_portal.sql.
-- Aadhaar and PAN are encrypted in the database and are never included in customer login responses.
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fintrack_kyc_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fintrack_kyc_key', 'FinTrack KYC encryption key');
  end if;
end;
$$;

create or replace function public.save_customer_kyc(account_id uuid, aadhaar text, pan text)
returns void language plpgsql security definer set search_path = public, vault, extensions
as $$
declare encryption_key text;
begin
  if not exists (select 1 from public.finance_accounts where id = account_id and organization_id = public.current_organization_id()) then
    raise exception 'Account not found';
  end if;
  if nullif(trim(aadhaar), '') is not null and trim(aadhaar) !~ '^[0-9]{12}$' then
    raise exception 'Aadhaar must contain exactly 12 digits';
  end if;
  if nullif(trim(pan), '') is not null and upper(trim(pan)) !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'PAN format is invalid';
  end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name = 'fintrack_kyc_key' limit 1;
  if encryption_key is null then raise exception 'KYC encryption key is unavailable'; end if;
  update public.customers c set
    aadhaar_ciphertext = case when nullif(trim(aadhaar), '') is null then null else encode(pgp_sym_encrypt(trim(aadhaar), encryption_key, 'cipher-algo=aes256, compress-algo=1'), 'base64') end,
    pan_ciphertext = case when nullif(trim(pan), '') is null then null else encode(pgp_sym_encrypt(upper(trim(pan)), encryption_key, 'cipher-algo=aes256, compress-algo=1'), 'base64') end
  from public.finance_accounts a
  where a.id = account_id and c.id = a.customer_id;
end;
$$;

create or replace function public.get_customer_kyc(account_id uuid)
returns jsonb language plpgsql security definer set search_path = public, vault, extensions
as $$
declare encryption_key text;
begin
  if not exists (select 1 from public.finance_accounts where id = account_id and organization_id = public.current_organization_id()) then
    raise exception 'Account not found';
  end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name = 'fintrack_kyc_key' limit 1;
  return (select jsonb_build_object(
    'aadhaar', case when c.aadhaar_ciphertext is null then '' else convert_from(pgp_sym_decrypt(decode(c.aadhaar_ciphertext, 'base64'), encryption_key), 'utf8') end,
    'pan', case when c.pan_ciphertext is null then '' else convert_from(pgp_sym_decrypt(decode(c.pan_ciphertext, 'base64'), encryption_key), 'utf8') end
  ) from public.finance_accounts a join public.customers c on c.id = a.customer_id where a.id = account_id);
end;
$$;

grant execute on function public.save_customer_kyc(uuid,text,text) to authenticated;
grant execute on function public.get_customer_kyc(uuid) to authenticated;
