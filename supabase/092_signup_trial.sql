-- 14-day signup trial. Paste in the Supabase SQL editor after 091.
-- Existing organizations keep a null subscription_status. Null means the current
-- full workspace, not a new trial and not an expired trial.
-- Trial dates are set only inside provision_financier, from Postgres now().
-- Clients cannot pass or edit those dates.
--
-- Paid access is not granted from the app. A future payment provider must verify
-- the event on the server, then call public.activate_paid_subscription as the
-- service role. Do not put the service-role key or a provider secret in the frontend.
-- No trial email is sent from this migration.

alter table public.organizations
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists subscription_status text,
  add column if not exists subscription_plan text,
  add column if not exists subscription_provider text,
  add column if not exists subscription_customer_id text,
  add column if not exists subscription_updated_at timestamptz;

alter table public.organizations drop constraint if exists organizations_subscription_status_check;
alter table public.organizations add constraint organizations_subscription_status_check
  check (subscription_status is null or subscription_status in (
    'trialing', 'active', 'past_due', 'expired', 'cancelled', 'incomplete'
  ));

alter table public.organizations drop constraint if exists organizations_trial_window_check;
alter table public.organizations add constraint organizations_trial_window_check
  check (
    trial_started_at is null
    or trial_ends_at is null
    or trial_ends_at > trial_started_at
  );

alter table public.organizations drop constraint if exists organizations_trialing_has_dates_check;
alter table public.organizations add constraint organizations_trialing_has_dates_check
  check (
    subscription_status is distinct from 'trialing'
    or (trial_started_at is not null and trial_ends_at is not null)
  );

create index if not exists organizations_subscription_status_idx
  on public.organizations (subscription_status);
create index if not exists organizations_trial_ends_at_idx
  on public.organizations (trial_ends_at)
  where subscription_status = 'trialing';
create index if not exists organizations_subscription_customer_id_idx
  on public.organizations (subscription_customer_id)
  where subscription_customer_id is not null;

create table if not exists public.organization_subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  event text not null check (event in ('trial_started', 'trial_expired', 'subscription_activated')),
  previous_status text,
  next_status text,
  plan text,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists organization_subscription_events_org_idx
  on public.organization_subscription_events (organization_id, created_at desc);

alter table public.organization_subscription_events enable row level security;

drop policy if exists "owners read subscription events" on public.organization_subscription_events;
create policy "owners read subscription events" on public.organization_subscription_events
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_financier_owner()
  );

revoke all on table public.organization_subscription_events from public, anon, authenticated;
grant select on table public.organization_subscription_events to authenticated;

-- Null status and an active plan stay entitled. A trial is entitled only until trial_ends_at.
create or replace function public.workspace_entitled(target_org_id uuid default null)
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
  org_id := coalesce(target_org_id, public.current_organization_id());
  if org_id is null then
    return false;
  end if;
  select o.subscription_status, o.trial_ends_at
    into status, ends_at
  from public.organizations o
  where o.id = org_id;
  if not found then
    return false;
  end if;
  if status is null or status = 'active' then
    return true;
  end if;
  if status = 'trialing' and ends_at is not null and now() < ends_at then
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.workspace_entitled(uuid) from public, anon, authenticated;

create or replace function public.reject_write_when_unentitled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if current_setting('fintrack.allow_settings_write', true) = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if public.workspace_entitled() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Your 14-day trial has ended. Choose a plan to continue.';
end;
$$;

revoke all on function public.reject_write_when_unentitled() from public, anon, authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'customers', 'finance_accounts', 'rate_changes', 'payments',
    'ledger_accounts', 'cashbook_entries', 'account_transfers', 'day_closings',
    'chit_schemes', 'chit_members', 'chit_enrollments', 'chit_cycles', 'chit_bids',
    'chit_installments', 'chit_payouts', 'chit_security_deposits', 'chit_report_configs',
    'chit_live_auctions', 'chit_live_auction_bids', 'fixed_chit_lifts', 'fixed_chit_payments',
    'predefined_chit_schedule', 'predefined_chit_payments',
    'acc_companies', 'acc_settings', 'acc_coa', 'acc_parties', 'acc_sequences',
    'acc_vouchers', 'acc_voucher_lines', 'acc_period_locks', 'acc_bank_statements',
    'acc_bank_statement_lines', 'acc_gst_lines', 'acc_voucher_attachments',
    'acc_item_categories', 'acc_items', 'acc_voucher_item_lines', 'acc_stock_movements',
    'acc_user_roles', 'acc_einvoice_payloads', 'acc_team_invites', 'acc_recurring_templates',
    'acc_party_pipeline', 'acc_inventory_settings', 'acc_trade_documents',
    'acc_trade_document_lines', 'acc_document_settings', 'acc_collection_routes',
    'acc_collection_route_stops', 'acc_compliance_filings',
    'receipt_sequences', 'payment_reminder_log', 'transaction_confirmation_log'
  ]
  loop
    if to_regclass('public.' || tbl) is null then
      continue;
    end if;
    execute format('drop trigger if exists zz_trial_write_guard on public.%I', tbl);
    execute format(
      'create trigger zz_trial_write_guard before insert or update or delete on public.%I for each row execute function public.reject_write_when_unentitled()',
      tbl
    );
  end loop;
end $$;

create or replace function public.protect_subscription_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('fintrack.subscription_write', true) = '1' then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.trial_started_at is distinct from old.trial_started_at
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.subscription_status is distinct from old.subscription_status
     or new.subscription_plan is distinct from old.subscription_plan
     or new.subscription_provider is distinct from old.subscription_provider
     or new.subscription_customer_id is distinct from old.subscription_customer_id
     or new.subscription_updated_at is distinct from old.subscription_updated_at
  then
    raise exception 'Subscription fields can only be changed by FinTrack';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_subscription on public.organizations;
create trigger organizations_protect_subscription
  before update on public.organizations
  for each row execute function public.protect_subscription_columns();

revoke all on function public.protect_subscription_columns() from public, anon, authenticated;

create or replace function public.current_workspace_subscription()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  rec public.organizations%rowtype;
  flipped integer := 0;
  entitled boolean;
  days_left integer;
begin
  org_id := public.current_organization_id();
  if org_id is null then
    raise exception 'No organisation in session';
  end if;

  select * into rec from public.organizations where id = org_id;
  if not found then
    raise exception 'No organisation in session';
  end if;

  if rec.subscription_status = 'trialing'
     and rec.trial_ends_at is not null
     and now() >= rec.trial_ends_at
  then
    perform set_config('fintrack.subscription_write', '1', true);
    update public.organizations
      set subscription_status = 'expired',
          subscription_updated_at = now()
      where id = org_id
        and subscription_status = 'trialing'
        and trial_ends_at <= now();
    get diagnostics flipped = row_count;
    if flipped > 0 then
      insert into public.organization_subscription_events (
        organization_id, event, previous_status, next_status, plan, actor_id, note
      ) values (
        org_id, 'trial_expired', 'trialing', 'expired', rec.subscription_plan, auth.uid(),
        'Trial ended at the server timestamp'
      );
      select * into rec from public.organizations where id = org_id;
    end if;
  end if;

  entitled := public.workspace_entitled(org_id);
  if rec.subscription_status is null then
    return jsonb_build_object(
      'status', 'active',
      'plan', 'legacy',
      'provider', null,
      'customerId', null,
      'startedAt', null,
      'endsAt', null,
      'serverNow', now(),
      'daysRemaining', null,
      'grandfathered', true,
      'entitled', true,
      'updatedAt', null
    );
  end if;

  if rec.trial_ends_at is not null then
    days_left := (rec.trial_ends_at at time zone 'Asia/Kolkata')::date
      - (now() at time zone 'Asia/Kolkata')::date;
  end if;

  return jsonb_build_object(
    'status', rec.subscription_status,
    'plan', rec.subscription_plan,
    'provider', rec.subscription_provider,
    'customerId', rec.subscription_customer_id,
    'startedAt', rec.trial_started_at,
    'endsAt', rec.trial_ends_at,
    'serverNow', now(),
    'daysRemaining', days_left,
    'grandfathered', false,
    'entitled', entitled,
    'updatedAt', rec.subscription_updated_at
  );
end;
$$;

grant execute on function public.current_workspace_subscription() to authenticated;

create or replace function public.activate_paid_subscription(
  target_org_id uuid,
  plan text,
  provider text,
  customer_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous text;
  next_plan text;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'A verified payment-provider event is required';
  end if;
  if target_org_id is null then
    raise exception 'Organization is required';
  end if;
  next_plan := lower(trim(plan));
  if next_plan not in ('monthly', 'annual') then
    raise exception 'Plan must be monthly or annual';
  end if;
  if nullif(trim(provider), '') is null or nullif(trim(customer_id), '') is null then
    raise exception 'Provider and customer id are required';
  end if;

  select subscription_status into previous
  from public.organizations
  where id = target_org_id;
  if not found then
    raise exception 'Organization not found';
  end if;

  perform set_config('fintrack.subscription_write', '1', true);
  update public.organizations
    set subscription_status = 'active',
        subscription_plan = next_plan,
        subscription_provider = trim(provider),
        subscription_customer_id = trim(customer_id),
        subscription_updated_at = now()
    where id = target_org_id;

  insert into public.organization_subscription_events (
    organization_id, event, previous_status, next_status, plan, actor_id, note
  ) values (
    target_org_id, 'subscription_activated', previous, 'active', next_plan, auth.uid(),
    'Verified payment-provider event'
  );
end;
$$;

revoke all on function public.activate_paid_subscription(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.activate_paid_subscription(uuid, text, text, text) to service_role;

create or replace function public.can_accounts_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.accounts_access_role() in ('owner', 'accountant')
    and public.workspace_entitled();
$$;

create or replace function public.acc_require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  if not public.workspace_entitled() then
    raise exception 'Your 14-day trial has ended. Choose a plan to continue.';
  end if;
  if not public.can_accounts_write() then
    raise exception 'Accounting is available only to the business owner or accountant';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then
    raise exception 'No organisation in session';
  end if;
  return org_id;
end;
$$;

create or replace function public.acc_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  if not public.workspace_entitled() then
    raise exception 'Your 14-day trial has ended. Choose a plan to continue.';
  end if;
  if not public.can_accounts_admin() then
    raise exception 'Only the business owner can perform this Accounts admin action';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then
    raise exception 'No organisation in session';
  end if;
  return org_id;
end;
$$;

-- Company settings stay available after the trial. This flag is local to the
-- function transaction, so it does not open the rest of the books.
create or replace function public.update_organization_receipt_settings(
  input_company_name text default null,
  input_company_address text default null,
  input_company_phone text default null,
  input_company_email text default null,
  input_company_logo_url text default null,
  input_receipt_footer text default null,
  input_receipt_terms text default null,
  input_whatsapp_templates jsonb default null,
  input_reminder_settings jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  finance_name text;
begin
  if not public.is_financier_owner() then
    raise exception 'Only a financier can update organization settings';
  end if;
  perform set_config('fintrack.allow_settings_write', '1', true);
  org_id := public.current_organization_id();
  finance_name := nullif(trim(input_company_name), '');
  update public.organizations set
    name = coalesce(finance_name, name),
    company_address = coalesce(input_company_address, company_address),
    company_phone = coalesce(input_company_phone, company_phone),
    company_email = coalesce(input_company_email, company_email),
    company_logo_url = coalesce(input_company_logo_url, company_logo_url),
    receipt_footer = coalesce(input_receipt_footer, receipt_footer),
    receipt_terms = coalesce(input_receipt_terms, receipt_terms),
    whatsapp_templates = coalesce(input_whatsapp_templates, whatsapp_templates),
    reminder_settings = coalesce(input_reminder_settings, reminder_settings)
  where id = org_id;
  if finance_name is not null then
    update public.acc_companies
      set name = finance_name, updated_at = now()
      where organization_id = org_id
        and status = 'active'
        and is_finance_books
        and lower(trim(name)) is distinct from lower(finance_name)
        and not exists (
          select 1 from public.acc_companies other
          where other.organization_id = org_id
            and other.status = 'active'
            and other.is_finance_books = false
            and lower(trim(other.name)) = lower(finance_name)
        );
  end if;
end;
$$;

grant execute on function public.update_organization_receipt_settings(text, text, text, text, text, text, text, jsonb, jsonb) to authenticated;

create or replace function public.provision_financier(
  workspace_name text,
  display_name text,
  invite_code text default null
) returns uuid
language plpgsql
security definer
set search_path = public
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

  perform set_config('fintrack.subscription_write', '1', true);
  insert into public.organizations (
    name,
    feature_packs,
    subscription_status,
    subscription_plan,
    trial_started_at,
    trial_ends_at,
    subscription_updated_at
  ) values (
    trim(workspace_name),
    '["full"]'::jsonb,
    'trialing',
    'trial',
    now(),
    now() + interval '14 days',
    now()
  )
  returning id into org_id;

  insert into public.organization_subscription_events (
    organization_id, event, previous_status, next_status, plan, actor_id, note
  ) values (
    org_id, 'trial_started', null, 'trialing', 'trial', user_id,
    'Trial started when the workspace was created'
  );

  insert into public.profiles (id, organization_id, full_name, role, is_active)
  values (user_id, org_id, trim(display_name), 'owner', true);

  perform public.acc_open_finance_company(org_id, trim(workspace_name));
  return org_id;
end;
$$;

grant execute on function public.provision_financier(text, text, text) to authenticated;
