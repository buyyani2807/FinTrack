-- Cashbook ships with Daily+Monthly Finance and with Chit Fund (not only Accounts).
-- Paste in the Supabase SQL editor after 123. Safe to re-run.
-- App unlock lists live in src/features/commercial/moduleProducts.js; this keeps
-- module_products catalog copy aligned for ops/admin.

update public.module_products
set
  name = 'Daily + Monthly Finance',
  description = 'Daily collection finance, monthly interest finance, and cashbook for cash in and out.',
  is_bundle = true,
  updated_at = now()
where product_key = 'finance_daily_monthly';

update public.module_products
set
  name = 'Chit Fund',
  description = 'Chit schemes, members, auctions, payments, dividends, and cashbook for cash in and out.',
  is_bundle = true,
  updated_at = now()
where product_key = 'chit_fund';

update public.module_products
set
  description = 'Accounting, cashbook, GST, inventory, and parties (no POS). Cashbook is also included with Finance or Chit Fund.',
  updated_at = now()
where product_key = 'accounts';

-- Soft check: treat app-module key "cashbook" as entitled when any product that
-- includes cashbook is active (Finance, Chit, Accounts, Accounts+POS).
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
  want text;
begin
  org_id := public.current_organization_id();
  if org_id is null then
    return false;
  end if;

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

  want := lower(trim(required_key));
  if want = 'cashbook' then
    if exists (
      select 1 from public.organization_module_entitlements e
      where e.organization_id = org_id
        and e.status = 'active'
        and e.module_key in ('finance_daily_monthly', 'chit_fund', 'accounts', 'accounts_pos')
        and (e.ends_at is null or e.ends_at > now())
    ) then
      return true;
    end if;
  elsif exists (
    select 1 from public.organization_module_entitlements e
    where e.organization_id = org_id
      and e.status = 'active'
      and (
        e.module_key = want
        or (want = 'accounts' and e.module_key = 'accounts_pos')
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
