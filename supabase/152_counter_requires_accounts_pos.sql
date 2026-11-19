-- 152: The Counter (POS) needs the Accounts + POS product.
-- Safe to re-run. Apply after 151. Deploy the client together with it (the client hides
-- the Counter for Accounts-only workspaces; this migration refuses it on the server).
--
-- Before this, a workspace that paid only for Accounts (₹498) could still bill at the
-- Counter, which is sold as Accounts + POS (₹598): the Counter was switched on by the
-- company's industry (retail, kirana, ...) and nothing checked the plan.
--
-- Rule (same as organization_has_module_product and the client's moduleAccess.js):
--   the Counter is allowed when the workspace is grandfathered (no subscription status),
--   is in its free trial, has an active accounts_pos entitlement, or has no module
--   entitlement rows at all (legacy feature packs). A workspace that has bought modules
--   but not accounts_pos is refused.
--
-- What is refused for such a workspace:
--   - inserting a voucher with source_type 'pos_counter' (Counter sales and returns);
--   - recording a Counter cash in / out (acc_counter_cash_movements).
-- What is not refused:
--   - existing Counter bills: they stay readable, and owners can still void or correct them
--     after a downgrade (UPDATE is not checked);
--   - backup restore (myfin.backup_org is set), and the service role (no auth.uid()),
--     so restoring a backup that holds old Counter bills still works.

create or replace function public.acc_org_has_pos(target_org_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  status text;
  ends_at timestamptz;
begin
  if target_org_id is null then
    return false;
  end if;

  select o.subscription_status, o.trial_ends_at
    into status, ends_at
  from public.organizations o
  where o.id = target_org_id;

  if not found then
    return false;
  end if;
  if status is null then
    return true; -- grandfathered / legacy
  end if;
  if status = 'trialing' and (ends_at is null or now() < ends_at) then
    return true;
  end if;

  if exists (
    select 1 from public.organization_module_entitlements e
    where e.organization_id = target_org_id
      and e.status = 'active'
      and e.module_key = 'accounts_pos'
      and (e.ends_at is null or e.ends_at > now())
  ) then
    return true;
  end if;

  -- No commerce rows yet → legacy feature packs (default full).
  if not exists (
    select 1 from public.organization_module_entitlements e
    where e.organization_id = target_org_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.acc_org_has_pos(uuid) from public, anon;
grant execute on function public.acc_org_has_pos(uuid) to authenticated;

create or replace function public.acc_pos_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role, migrations and scheduled jobs.
  if auth.uid() is null then
    return new;
  end if;
  -- Backup restore puts back what the workspace already had.
  if coalesce(current_setting('myfin.backup_org', true), '') <> '' then
    return new;
  end if;
  if tg_table_name = 'acc_vouchers' and new.source_type is distinct from 'pos_counter' then
    return new;
  end if;
  if not public.acc_org_has_pos(new.organization_id) then
    raise exception 'The Counter (POS) is part of Accounts + POS. Upgrade this workspace to use the Counter.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.acc_pos_plan_guard() from public, anon, authenticated;

drop trigger if exists acc_pos_plan_guard on public.acc_vouchers;
create trigger acc_pos_plan_guard
  before insert on public.acc_vouchers
  for each row execute function public.acc_pos_plan_guard();

drop trigger if exists acc_pos_plan_guard on public.acc_counter_cash_movements;
create trigger acc_pos_plan_guard
  before insert on public.acc_counter_cash_movements
  for each row execute function public.acc_pos_plan_guard();
