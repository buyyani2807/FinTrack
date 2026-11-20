-- Admin-only signup/platform stats for a single hardcoded operator account.
-- Run once in the Supabase SQL editor after 152. Safe to re-run.
--
-- This is deliberately NOT a role flag stored in a user-editable table (profiles.role,
-- acc_*_role, etc). Any business owner can set themselves as "Owner" inside their own
-- workspace — that must never grant access to platform-wide numbers across every
-- customer's organization. Access here is checked purely against the signed-in
-- Supabase auth user's email, matched below, every call.
--
-- To change who can see this: edit the email literal in is_platform_admin() below and
-- re-run the whole file in the SQL editor (CREATE OR REPLACE FUNCTION picks it up).

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select true from auth.users u where u.id = auth.uid() and u.email = 'sudheer.buyyani@outlook.com'),
    false
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Aggregate counts only — no customer names, phone numbers, or any row-level PII leaves
-- this function. Raises if called by anyone other than the one admin account.
create or replace function public.admin_signup_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'total_organizations', (select count(*) from public.organizations),
    'confirmed_users', (
      select count(*) from public.profiles p
      join auth.users u on u.id = p.id
      where u.email_confirmed_at is not null
    ),
    'unconfirmed_users', (
      select count(*) from public.profiles p
      join auth.users u on u.id = p.id
      where u.email_confirmed_at is null
    ),
    'by_subscription_status', (
      select coalesce(jsonb_object_agg(coalesce(subscription_status, 'full_workspace'), status_count), '{}'::jsonb)
      from (
        select subscription_status, count(*) as status_count
        from public.organizations
        group by subscription_status
      ) s
    ),
    'organizations_with_accounts_setup', (
      select count(distinct organization_id) from public.acc_companies
    ),
    'signups_last_30_days', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', day_count) order by day), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day, count(*) as day_count
        from public.organizations
        where created_at >= now() - interval '30 days'
        group by 1
      ) d
    ),
    'generated_at', now()
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_signup_stats() from public, anon;
grant execute on function public.admin_signup_stats() to authenticated;

notify pgrst, 'reload schema';
