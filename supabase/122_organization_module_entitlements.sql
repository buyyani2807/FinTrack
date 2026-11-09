-- Module commerce: organization-scoped paid modules.
-- Paste after 121 in the Supabase SQL editor.
--
-- Defaults (configurable via module_products + grant args):
--   Monthly ₹498 + GST 18% per module/bundle
--   Annual ₹5,976 + GST 18% per module/bundle
--   No lifetime membership
-- Free 14-day trial and grandfathered orgs keep full access in the app layer;
-- this table only stores verified purchases for module-billing workspaces.
--
-- Product keys: finance_daily_monthly | chit_fund | accounts | accounts_pos
-- amount_paise / annual_amount_paise store BASE prices before GST.

create table if not exists public.module_products (
  product_key text primary key
    check (product_key in ('finance_daily_monthly', 'chit_fund', 'accounts', 'accounts_pos')),
  name text not null,
  description text not null default '',
  amount_paise integer not null check (amount_paise >= 0),
  annual_amount_paise integer not null default 597600 check (annual_amount_paise >= 0),
  gst_rate numeric(5,4) not null default 0.1800,
  currency text not null default 'INR',
  billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'annual')),
  is_bundle boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.module_products
  add column if not exists annual_amount_paise integer not null default 597600;
alter table public.module_products
  add column if not exists gst_rate numeric(5,4) not null default 0.1800;

insert into public.module_products (
  product_key, name, description, amount_paise, annual_amount_paise, gst_rate, billing_period, is_bundle
)
values
  ('finance_daily_monthly', 'Daily + Monthly Finance',
   'Daily collection finance and monthly interest finance.', 49800, 597600, 0.1800, 'monthly', false),
  ('chit_fund', 'Chit Fund',
   'Chit schemes, members, bids, payments, and dividends.', 49800, 597600, 0.1800, 'monthly', false),
  ('accounts', 'Accounts',
   'Accounting, cashbook, GST, inventory, and parties (no POS).', 49800, 597600, 0.1800, 'monthly', false),
  ('accounts_pos', 'Accounts + POS',
   'Accounts plus Counter POS checkout and POS reports.', 49800, 597600, 0.1800, 'monthly', true)
on conflict (product_key) do update set
  name = excluded.name,
  description = excluded.description,
  amount_paise = excluded.amount_paise,
  annual_amount_paise = excluded.annual_amount_paise,
  gst_rate = excluded.gst_rate,
  billing_period = excluded.billing_period,
  is_bundle = excluded.is_bundle,
  updated_at = now();

alter table public.module_products enable row level security;

drop policy if exists "authenticated read module products" on public.module_products;
create policy "authenticated read module products" on public.module_products
  for select to authenticated using (active = true);

revoke all on table public.module_products from public, anon;
grant select on table public.module_products to authenticated;

create table if not exists public.organization_module_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  module_key text not null
    check (module_key in ('finance_daily_monthly', 'chit_fund', 'accounts', 'accounts_pos')),
  product_key text not null references public.module_products (product_key),
  price_paise integer not null check (price_paise >= 0),
  currency text not null default 'INR',
  billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'annual')),
  status text not null default 'active'
    check (status in ('active', 'expired', 'refunded', 'cancelled')),
  purchased_at timestamptz not null default now(),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  payment_ref text,
  provider text,
  provider_payment_id text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, module_key)
);

create index if not exists organization_module_entitlements_org_idx
  on public.organization_module_entitlements (organization_id, status);

create unique index if not exists organization_module_entitlements_payment_ref_uidx
  on public.organization_module_entitlements (organization_id, payment_ref)
  where payment_ref is not null;

alter table public.organization_module_entitlements enable row level security;

drop policy if exists "members read org module entitlements" on public.organization_module_entitlements;
create policy "members read org module entitlements" on public.organization_module_entitlements
  for select to authenticated
  using (organization_id = public.current_organization_id());

revoke all on table public.organization_module_entitlements from public, anon;
grant select on table public.organization_module_entitlements to authenticated;

create table if not exists public.organization_module_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_keys text[] not null,
  amount_paise integer not null check (amount_paise >= 0),
  currency text not null default 'INR',
  billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'annual')),
  status text not null default 'created'
    check (status in ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  provider_signature text,
  idempotency_key text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (organization_id, idempotency_key)
);

create index if not exists organization_module_payments_org_idx
  on public.organization_module_payments (organization_id, created_at desc);

create unique index if not exists organization_module_payments_provider_order_uidx
  on public.organization_module_payments (provider, provider_order_id)
  where provider_order_id is not null;

alter table public.organization_module_payments enable row level security;

drop policy if exists "members read org module payments" on public.organization_module_payments;
create policy "members read org module payments" on public.organization_module_payments
  for select to authenticated
  using (organization_id = public.current_organization_id());

revoke all on table public.organization_module_payments from public, anon;
grant select on table public.organization_module_payments to authenticated;

create or replace function public.list_module_products()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'productKey', product_key,
    'name', name,
    'description', description,
    'amountPaise', amount_paise,
    'currency', currency,
    'billingPeriod', billing_period,
    'isBundle', is_bundle
  ) order by product_key), '[]'::jsonb)
  from public.module_products
  where active = true;
$$;

grant execute on function public.list_module_products() to authenticated;

create or replace function public.list_organization_module_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  org_id := public.current_organization_id();
  if org_id is null then
    raise exception 'No organisation in session';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'organizationId', e.organization_id,
      'moduleKey', e.module_key,
      'productKey', e.product_key,
      'pricePaise', e.price_paise,
      'currency', e.currency,
      'period', e.billing_period,
      'status', e.status,
      'purchasedAt', e.purchased_at,
      'startsAt', e.starts_at,
      'endsAt', e.ends_at,
      'paymentRef', e.payment_ref,
      'provider', e.provider
    ) order by e.purchased_at desc)
    from public.organization_module_entitlements e
    where e.organization_id = org_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_organization_module_entitlements() to authenticated;

create or replace function public.organization_has_module_product(required_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_id uuid;
  status text;
  ends_at timestamptz;
begin
  org_id := public.current_organization_id();
  if org_id is null then
    return false;
  end if;

  -- Trial / grandfathered: treat as full access at DB helper level for soft checks.
  select o.subscription_status, o.trial_ends_at
    into status, ends_at
  from public.organizations o
  where o.id = org_id;

  if status is null then
    return true; -- grandfathered / legacy
  end if;
  if status = 'trialing' and (ends_at is null or now() < ends_at) then
    return true;
  end if;

  if exists (
    select 1 from public.organization_module_entitlements e
    where e.organization_id = org_id
      and e.status = 'active'
      and (
        e.module_key = required_key
        or (required_key = 'accounts' and e.module_key = 'accounts_pos')
      )
      and (e.ends_at is null or e.ends_at > now())
  ) then
    return true;
  end if;

  -- No commerce rows yet → legacy feature packs (default full).
  if not exists (
    select 1 from public.organization_module_entitlements e
    where e.organization_id = org_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.organization_has_module_product(text) to authenticated;

-- Service-role only: grant after verified payment (idempotent on payment_ref).
create or replace function public.grant_organization_module_entitlement(
  target_org_id uuid,
  input_module_key text,
  input_product_key text,
  input_price_paise integer,
  input_currency text default 'INR',
  input_billing_period text default 'monthly',
  input_payment_ref text default null,
  input_provider text default 'razorpay',
  input_provider_payment_id text default null,
  input_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  entitlement_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'A verified payment-provider event is required';
  end if;
  if target_org_id is null then
    raise exception 'Organization is required';
  end if;
  if input_module_key not in ('finance_daily_monthly', 'chit_fund', 'accounts', 'accounts_pos') then
    raise exception 'Invalid module key';
  end if;
  if input_product_key not in ('finance_daily_monthly', 'chit_fund', 'accounts', 'accounts_pos') then
    raise exception 'Invalid product key';
  end if;

  if input_payment_ref is not null then
    select id into entitlement_id
    from public.organization_module_entitlements
    where organization_id = target_org_id
      and payment_ref = input_payment_ref
    limit 1;
    if entitlement_id is not null then
      return entitlement_id;
    end if;
  end if;

  insert into public.organization_module_entitlements (
    organization_id, module_key, product_key, price_paise, currency, billing_period,
    status, payment_ref, provider, provider_payment_id, created_by, updated_at
  ) values (
    target_org_id, input_module_key, input_product_key, coalesce(input_price_paise, 0),
    coalesce(nullif(trim(input_currency), ''), 'INR'),
    coalesce(nullif(trim(input_billing_period), ''), 'monthly'),
    'active', nullif(trim(input_payment_ref), ''), nullif(trim(input_provider), ''),
    nullif(trim(input_provider_payment_id), ''), input_created_by, now()
  )
  on conflict (organization_id, module_key) do update set
    product_key = excluded.product_key,
    price_paise = excluded.price_paise,
    currency = excluded.currency,
    billing_period = excluded.billing_period,
    status = 'active',
    payment_ref = coalesce(excluded.payment_ref, public.organization_module_entitlements.payment_ref),
    provider = coalesce(excluded.provider, public.organization_module_entitlements.provider),
    provider_payment_id = coalesce(excluded.provider_payment_id, public.organization_module_entitlements.provider_payment_id),
    updated_at = now(),
    ends_at = null
  returning id into entitlement_id;

  return entitlement_id;
end;
$$;

revoke all on function public.grant_organization_module_entitlement(
  uuid, text, text, integer, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.grant_organization_module_entitlement(
  uuid, text, text, integer, text, text, text, text, text, uuid
) to service_role;
