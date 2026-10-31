-- Accounts team login (CA / accountant / viewer) under the owner's organization.
-- Profile role `accounts` = Financier sign-in with Accounts access only (not a new business).
-- Apply after 108. Safe to re-run.

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%';
  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'staff', 'accounts'));

create or replace function public.is_accounts_team_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'accounts' and is_active is not false
  );
$$;

-- Owners keep full Accounts access; accounts-team users use acc_user_roles.
create or replace function public.accounts_access_role()
returns text language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  if public.is_financier_owner() then return 'owner'; end if;
  select role into r from public.acc_user_roles
   where organization_id = public.current_organization_id() and user_id = auth.uid();
  return r;
end;
$$;

grant execute on function public.is_accounts_team_user() to authenticated;
grant execute on function public.accounts_access_role() to authenticated;

-- Service-role helper for the Add CA API (not granted to authenticated clients).
create or replace function public.acc_admin_find_auth_user_id(input_email text)
returns uuid language sql security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(trim(coalesce(input_email, ''))) limit 1;
$$;

revoke all on function public.acc_admin_find_auth_user_id(text) from public, anon, authenticated;
-- Callable only with the service role (Add CA API). Supabase service_role bypasses RLS; grant keeps the RPC resolvable.
grant execute on function public.acc_admin_find_auth_user_id(text) to service_role;
