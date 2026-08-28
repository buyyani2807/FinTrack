-- Pre-launch hardening: financier provisioning, portal ID entropy, credential RLS, active-member checks.
-- Run after 035_fix_fixed_chit_commission.sql.

-- ---------------------------------------------------------------------------
-- 1. Financier workspace provisioning (called once after Supabase Auth signup)
-- ---------------------------------------------------------------------------
create or replace function public.provision_financier(
  workspace_name text,
  display_name text,
  invite_code text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  user_id uuid;
  required_invite text;
begin
  user_id := auth.uid();
  if user_id is null then
    raise exception 'Authentication required';
  end if;
  if exists (select 1 from public.profiles where id = user_id) then
    raise exception 'Workspace already provisioned for this account';
  end if;
  if nullif(trim(workspace_name), '') is null or nullif(trim(display_name), '') is null then
    raise exception 'Business name and display name are required';
  end if;

  required_invite := nullif(trim(current_setting('app.fintrack_signup_invite_code', true)), '');
  if required_invite is not null and coalesce(trim(invite_code), '') <> required_invite then
    raise exception 'Invalid invite code';
  end if;

  insert into public.organizations(name)
  values (trim(workspace_name))
  returning id into org_id;

  insert into public.profiles(id, organization_id, full_name, role, is_active)
  values (user_id, org_id, trim(display_name), 'owner', true);

  return org_id;
end;
$$;
grant execute on function public.provision_financier(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Active-member checks on owner/staff helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_active_finance_member() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_financier_owner() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select role = 'owner' and is_active
    from public.profiles
    where id = auth.uid()
  ), false)
$$;

create or replace function public.chit_is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_financier_owner() $$;

-- ---------------------------------------------------------------------------
-- 3. Random portal IDs (FT-xxxx / CF-xxxx) instead of UUID prefixes
-- ---------------------------------------------------------------------------
create or replace function public.fintrack_random_portal_id(prefix text)
returns text
language plpgsql volatile set search_path = public
as $$
declare
  candidate text;
  attempt integer := 0;
begin
  if prefix not in ('FT', 'CF') then
    raise exception 'Invalid portal prefix';
  end if;
  loop
    attempt := attempt + 1;
    if attempt > 30 then
      raise exception 'Could not generate a unique portal ID';
    end if;
    candidate := prefix || '-' || upper(encode(gen_random_bytes(4), 'hex'));
    if prefix = 'FT' then
      exit when not exists (
        select 1 from public.customer_portal_credentials where portal_id = candidate
      );
    else
      exit when not exists (
        select 1 from public.chit_member_portal_credentials where portal_id = candidate
      );
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.enable_customer_portal(account_id uuid, new_pin text)
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare public_id text;
begin
  if not public.is_financier_owner() then
    raise exception 'Only a financier can manage the customer portal';
  end if;
  if not new_pin ~ '^[0-9]{6,}$' then
    raise exception 'PIN must be at least 6 digits';
  end if;
  if not exists (
    select 1 from public.finance_accounts
    where id = account_id and organization_id = public.current_organization_id()
  ) then
    raise exception 'Account not found';
  end if;
  public_id := public.fintrack_random_portal_id('FT');
  insert into public.customer_portal_credentials (finance_account_id, portal_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (account_id, public_id, crypt(new_pin, gen_salt('bf')), 0, null, now())
  on conflict (finance_account_id) do update set
    pin_hash = excluded.pin_hash,
    failed_attempts = 0,
    locked_until = null,
    updated_at = now();
  return public_id;
end;
$$;

create or replace function public.enable_chit_member_portal(input_enrollment_id uuid, new_pin text)
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare public_id text; org_id uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage the Chit customer portal'; end if;
  if not new_pin ~ '^[0-9]{6,}$' then raise exception 'PIN must be at least 6 digits'; end if;
  select organization_id into org_id from public.chit_enrollments
    where id = input_enrollment_id and organization_id = public.current_organization_id();
  if org_id is null then raise exception 'Member not found'; end if;
  select portal_id into public_id
  from public.chit_member_portal_credentials
  where enrollment_id = input_enrollment_id;
  if public_id is null then
    public_id := public.fintrack_random_portal_id('CF');
  end if;
  insert into public.chit_member_portal_credentials(enrollment_id, organization_id, portal_id, pin_hash, failed_attempts, locked_until, updated_at)
  values(input_enrollment_id, org_id, public_id, crypt(new_pin, gen_salt('bf')), 0, null, now())
  on conflict (enrollment_id) do update set
    pin_hash = excluded.pin_hash,
    failed_attempts = 0,
    locked_until = null,
    updated_at = now();
  return public_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Restrict finance portal credential reads to active owners (hide pin_hash)
-- ---------------------------------------------------------------------------
drop policy if exists "financiers read their portal credentials" on public.customer_portal_credentials;
drop policy if exists "owners read portal credentials" on public.customer_portal_credentials;

revoke all on public.customer_portal_credentials from authenticated;
grant select (finance_account_id, portal_id, failed_attempts, locked_until, updated_at)
  on public.customer_portal_credentials to authenticated;

create policy "owners read portal credential metadata"
on public.customer_portal_credentials for select to authenticated
using (
  public.is_financier_owner()
  and exists (
    select 1 from public.finance_accounts a
    where a.id = finance_account_id
      and a.organization_id = public.current_organization_id()
  )
);

-- pin_hash is never granted to authenticated; portal login uses SECURITY DEFINER RPCs only.
