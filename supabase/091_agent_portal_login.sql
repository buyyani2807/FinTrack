-- Run AFTER 090_finance_company_on_signup.sql.
-- Collection agents sign in with an agent ID (AG-) and a 6-digit PIN.
-- The Auth user stays in place so existing row-level rules keep working.
-- Only the service role can issue or check a PIN. The PIN hash is not readable from the browser.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.agent_portal_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  portal_id text not null unique,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.agent_portal_credentials enable row level security;
revoke all on table public.agent_portal_credentials from public, anon, authenticated;

create or replace function public.fintrack_random_portal_id(prefix text)
returns text
language plpgsql volatile set search_path = public, extensions
as $$
declare
  candidate text;
  attempt integer := 0;
begin
  if prefix not in ('FT', 'CF', 'AG') then
    raise exception 'Invalid portal prefix';
  end if;
  loop
    attempt := attempt + 1;
    if attempt > 30 then
      raise exception 'Could not generate a unique portal ID';
    end if;
    candidate := prefix || '-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
    if prefix = 'FT' then
      exit when not exists (
        select 1 from public.customer_portal_credentials where portal_id = candidate
      );
    elsif prefix = 'CF' then
      exit when not exists (
        select 1 from public.chit_member_portal_credentials where portal_id = candidate
      );
    else
      exit when not exists (
        select 1 from public.agent_portal_credentials where portal_id = candidate
      );
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.issue_agent_portal_credential(input_profile_id uuid, input_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  public_id text;
begin
  if input_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be 6 digits';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = input_profile_id and role = 'staff'
  ) then
    raise exception 'Collection agent not found';
  end if;
  select portal_id into public_id
  from public.agent_portal_credentials
  where profile_id = input_profile_id;
  if public_id is null then
    public_id := public.fintrack_random_portal_id('AG');
    insert into public.agent_portal_credentials (profile_id, portal_id, pin_hash)
    values (input_profile_id, public_id, extensions.crypt(input_pin, extensions.gen_salt('bf')));
  else
    update public.agent_portal_credentials
    set pin_hash = extensions.crypt(input_pin, extensions.gen_salt('bf')),
        failed_attempts = 0,
        locked_until = null,
        updated_at = now()
    where profile_id = input_profile_id;
  end if;
  return public_id;
end;
$$;

create or replace function public.agent_portal_login(input_portal_id text, input_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  credential public.agent_portal_credentials%rowtype;
  staff_role text;
  staff_active boolean;
begin
  select * into credential
  from public.agent_portal_credentials
  where portal_id = upper(trim(input_portal_id));
  if not found then
    raise exception 'Invalid agent ID or PIN';
  end if;
  if credential.locked_until is not null and credential.locked_until > now() then
    raise exception 'Too many attempts. Try again in 15 minutes';
  end if;
  if credential.pin_hash <> extensions.crypt(input_pin, credential.pin_hash) then
    update public.agent_portal_credentials
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end,
        updated_at = now()
    where profile_id = credential.profile_id;
    raise exception 'Invalid agent ID or PIN';
  end if;
  select role, is_active into staff_role, staff_active
  from public.profiles
  where id = credential.profile_id;
  if staff_role is distinct from 'staff' then
    raise exception 'Invalid agent ID or PIN';
  end if;
  if staff_active is not true then
    raise exception 'This account has been disabled. Contact your financier.';
  end if;
  update public.agent_portal_credentials
  set failed_attempts = 0, locked_until = null, updated_at = now()
  where profile_id = credential.profile_id;
  return credential.profile_id;
end;
$$;

revoke all on function public.issue_agent_portal_credential(uuid, text) from public, anon, authenticated;
revoke all on function public.agent_portal_login(text, text) from public, anon, authenticated;
grant execute on function public.issue_agent_portal_credential(uuid, text) to service_role;
grant execute on function public.agent_portal_login(text, text) to service_role;
