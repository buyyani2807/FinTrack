-- FinTrack production foundation (Supabase/Postgres)
-- Run this in the Supabase SQL editor before connecting the app.

create extension if not exists pgcrypto;

create type public.finance_kind as enum ('daily', 'monthly');
create type public.payment_mode as enum ('cash', 'upi', 'bank');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  phone text not null,
  address text,
  -- Encrypt Aadhaar/PAN in a server-side service before inserting. Never expose in customer views.
  aadhaar_ciphertext text,
  pan_ciphertext text,
  created_at timestamptz not null default now()
);

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  kind public.finance_kind not null,
  start_date date not null,
  collection_amount numeric(12,2),
  disbursed_amount numeric(12,2),
  daily_collection numeric(12,2),
  principal numeric(12,2),
  monthly_interest_rate numeric(7,4),
  penalty_rate numeric(7,4) default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'closed')),
  created_at timestamptz not null default now(),
  check ((kind = 'daily' and collection_amount is not null and disbursed_amount is not null and daily_collection is not null)
      or (kind = 'monthly' and principal is not null and monthly_interest_rate is not null))
);

create table public.rate_changes (
  id uuid primary key default gen_random_uuid(),
  finance_account_id uuid not null references public.finance_accounts(id) on delete cascade,
  effective_date date not null,
  monthly_interest_rate numeric(7,4) not null check (monthly_interest_rate >= 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finance_account_id uuid not null references public.finance_accounts(id) on delete restrict,
  paid_on date not null,
  mode public.payment_mode not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  interest_amount numeric(12,2) not null default 0,
  principal_amount numeric(12,2) not null default 0,
  penalty_amount numeric(12,2) not null default 0,
  payment_reference text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index payments_account_date_idx on public.payments(finance_account_id, paid_on desc);
create index accounts_org_idx on public.finance_accounts(organization_id);
create index customers_org_idx on public.customers(organization_id);

-- Users can only see or change data belonging to their own financier organization.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.finance_accounts enable row level security;
alter table public.rate_changes enable row level security;
alter table public.payments enable row level security;

create function public.current_organization_id() returns uuid
language sql stable security definer set search_path = public
as $$ select organization_id from public.profiles where id = auth.uid() $$;

create policy "members read their organization" on public.organizations for select
using (id = public.current_organization_id());
create policy "members read profiles" on public.profiles for select
using (organization_id = public.current_organization_id());
create policy "members manage customers" on public.customers for all
using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy "members manage accounts" on public.finance_accounts for all
using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy "members manage rate changes" on public.rate_changes for all
using (exists (select 1 from public.finance_accounts a where a.id = finance_account_id and a.organization_id = public.current_organization_id()))
with check (exists (select 1 from public.finance_accounts a where a.id = finance_account_id and a.organization_id = public.current_organization_id()));
create policy "members manage payments" on public.payments for all
using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());

-- Called once immediately after a new financier confirms their email address.
-- It creates their isolated workspace and makes them its owner.
-- Full definition also lives in 036_prelaunch_hardening.sql (invite-code aware).

create or replace function public.provision_financier(
  workspace_name text,
  display_name text,
  invite_code text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare org_id uuid; user_id uuid; required_invite text;
begin
  user_id := auth.uid();
  if user_id is null then raise exception 'Authentication required'; end if;
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
  insert into public.organizations(name) values (trim(workspace_name)) returning id into org_id;
  insert into public.profiles(id, organization_id, full_name, role)
  values (user_id, org_id, trim(display_name), 'owner');
  return org_id;
end;
$$;
grant execute on function public.provision_financier(text, text, text) to authenticated;

