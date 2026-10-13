-- FinTrack AI Review: audit trail for advisory insights and human review decisions.
--
-- These tables only record that an advisory insight was generated and what a person decided about it.
-- Nothing here posts vouchers, records payments, changes chit auctions/dividends, moves stock, or
-- edits credit scores. Rows are written only through the SECURITY DEFINER functions below, which
-- enforce organisation, company, role, AI entitlement, and accounting period locks on the server.
-- Run once in the Supabase SQL editor after 098. Safe to re-run.

create table if not exists public.ai_insight_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.acc_companies(id) on delete cascade,
  module text not null check (module in ('accounts', 'finance', 'chit')),
  feature text not null check (feature in (
    'expenses', 'cashflow', 'receivables', 'chit_health', 'anomalies', 'gst', 'month_end', 'bank_reconciliation', 'inventory'
  )),
  run_date date not null default current_date,
  insight_count integer not null default 0 check (insight_count >= 0),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 4096),
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now()
);

create unique index if not exists ai_insight_runs_daily_idx
  on public.ai_insight_runs (
    organization_id,
    (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    module,
    feature,
    run_date
  );

create table if not exists public.ai_review_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.acc_companies(id) on delete cascade,
  module text not null check (module in ('accounts', 'finance', 'chit')),
  feature text not null check (feature in (
    'expenses', 'cashflow', 'receivables', 'chit_health', 'anomalies', 'gst', 'month_end', 'bank_reconciliation', 'inventory'
  )),
  insight_key text not null check (char_length(insight_key) between 1 and 200),
  source_type text check (source_type is null or char_length(source_type) <= 60),
  source_id text check (source_id is null or char_length(source_id) <= 100),
  record_date date,
  action text not null check (action in ('approved', 'rejected', 'reviewed', 'dismissed', 'edited')),
  suggestion jsonb not null default '{}'::jsonb check (jsonb_typeof(suggestion) = 'object' and pg_column_size(suggestion) <= 4096),
  note text check (note is null or char_length(note) <= 500),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_review_actions_lookup_idx
  on public.ai_review_actions (organization_id, company_id, feature, created_at desc);

-- One final decision (approve or reject) per insight; reviews and edits stay as a history.
create unique index if not exists ai_review_actions_one_decision_idx
  on public.ai_review_actions (
    organization_id,
    (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    feature,
    insight_key
  )
  where action in ('approved', 'rejected');

alter table public.ai_insight_runs enable row level security;
alter table public.ai_review_actions enable row level security;

create or replace function public.ai_module_enabled(input_org_id uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(o.module_overrides ->> 'ai', 'true') <> 'false'
    from public.organizations o
    where o.id = coalesce(input_org_id, public.current_organization_id())
  ), false);
$$;

create or replace function public.ai_can_read_module(input_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select case input_module
    when 'accounts' then public.can_accounts_read()
    when 'chit' then public.chit_is_owner()
    when 'finance' then public.is_financier_owner()
    else false
  end;
$$;

drop policy if exists ai_insight_runs_read on public.ai_insight_runs;
create policy ai_insight_runs_read on public.ai_insight_runs
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.ai_can_read_module(module));

drop policy if exists ai_review_actions_read on public.ai_review_actions;
create policy ai_review_actions_read on public.ai_review_actions
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (public.ai_can_read_module(module) or actor_id = auth.uid())
  );

revoke insert, update, delete on public.ai_insight_runs from anon, authenticated;
revoke insert, update, delete on public.ai_review_actions from anon, authenticated;
grant select on public.ai_insight_runs to authenticated;
grant select on public.ai_review_actions to authenticated;

-- Resolves the company for an Accounts request and proves it belongs to the caller's organisation.
create or replace function public.ai_resolve_company(input_org_id uuid, input_module text, input_company_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare company uuid;
begin
  if input_module <> 'accounts' then
    return null;
  end if;
  company := coalesce(input_company_id, public.acc_request_company_id());
  if company is null then
    select c.id into company from public.acc_companies c
     where c.organization_id = input_org_id and c.is_primary
     limit 1;
  end if;
  if company is null or not exists (
    select 1 from public.acc_companies c where c.id = company and c.organization_id = input_org_id
  ) then
    raise exception 'Company not found in this workspace';
  end if;
  return company;
end;
$$;

create or replace function public.ai_record_insight_run(
  input_module text,
  input_feature text,
  input_insight_count integer default 0,
  input_summary jsonb default '{}'::jsonb,
  input_company_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid := public.current_organization_id();
  company uuid;
  run_id uuid;
begin
  if auth.uid() is null or org_id is null then
    raise exception 'Sign in again to use AI Review';
  end if;
  if not public.ai_module_enabled(org_id) then
    raise exception 'AI features are not enabled for this workspace';
  end if;
  if not public.ai_can_read_module(input_module) then
    raise exception 'Your role cannot use AI Review for this module';
  end if;
  company := public.ai_resolve_company(org_id, input_module, input_company_id);
  insert into public.ai_insight_runs (organization_id, company_id, module, feature, insight_count, summary, generated_by)
  values (
    org_id, company, input_module, input_feature,
    greatest(0, coalesce(input_insight_count, 0)),
    coalesce(input_summary, '{}'::jsonb),
    auth.uid()
  )
  on conflict (organization_id, (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), module, feature, run_date)
  do update set
    insight_count = excluded.insight_count,
    summary = excluded.summary,
    generated_by = excluded.generated_by,
    generated_at = now()
  returning id into run_id;
  return jsonb_build_object('id', run_id);
end;
$$;

create or replace function public.ai_record_review_action(
  input_module text,
  input_feature text,
  input_insight_key text,
  input_action text,
  input_source_type text default null,
  input_source_id text default null,
  input_record_date date default null,
  input_suggestion jsonb default '{}'::jsonb,
  input_note text default null,
  input_company_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid := public.current_organization_id();
  company uuid;
  existing uuid;
  action_id uuid;
begin
  if auth.uid() is null or org_id is null then
    raise exception 'Sign in again to use AI Review';
  end if;
  if not public.ai_module_enabled(org_id) then
    raise exception 'AI features are not enabled for this workspace';
  end if;
  if input_action not in ('approved', 'rejected', 'reviewed', 'dismissed', 'edited') then
    raise exception 'Unknown review action';
  end if;
  if input_module = 'accounts' then
    if coalesce(public.accounts_access_role(), '') not in ('owner', 'accountant') then
      raise exception 'Your Accounts role is view-only';
    end if;
  elsif input_module = 'chit' then
    if not public.chit_is_owner() then
      raise exception 'Only the owner can review Chit Fund insights';
    end if;
  elsif input_module = 'finance' then
    if not public.is_financier_owner() and not exists (
      select 1 from public.finance_accounts f
       where f.organization_id = org_id
         and f.id::text = input_source_id
         and f.collection_agent_id = auth.uid()
    ) then
      raise exception 'This customer is not assigned to you';
    end if;
  else
    raise exception 'Unknown module';
  end if;
  company := public.ai_resolve_company(org_id, input_module, input_company_id);
  if input_module = 'accounts' and input_action in ('approved', 'edited') and input_record_date is not null then
    perform public.acc_assert_period_open(org_id, input_record_date, company);
  end if;

  if input_action in ('approved', 'rejected') then
    select a.id into existing from public.ai_review_actions a
     where a.organization_id = org_id
       and coalesce(a.company_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(company, '00000000-0000-0000-0000-000000000000'::uuid)
       and a.feature = input_feature
       and a.insight_key = input_insight_key
       and a.action in ('approved', 'rejected')
     limit 1;
    if existing is not null then
      return jsonb_build_object('id', existing, 'duplicate', true);
    end if;
  end if;

  begin
    insert into public.ai_review_actions (
      organization_id, company_id, module, feature, insight_key, source_type, source_id,
      record_date, action, suggestion, note, actor_id
    ) values (
      org_id, company, input_module, input_feature, left(input_insight_key, 200),
      nullif(left(coalesce(input_source_type, ''), 60), ''),
      nullif(left(coalesce(input_source_id, ''), 100), ''),
      input_record_date, input_action, coalesce(input_suggestion, '{}'::jsonb),
      nullif(left(trim(coalesce(input_note, '')), 500), ''),
      auth.uid()
    ) returning id into action_id;
  exception when unique_violation then
    return jsonb_build_object('id', null, 'duplicate', true);
  end;
  return jsonb_build_object('id', action_id, 'duplicate', false);
end;
$$;

revoke all on function public.ai_module_enabled(uuid) from public, anon;
revoke all on function public.ai_can_read_module(text) from public, anon;
revoke all on function public.ai_resolve_company(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.ai_record_insight_run(text, text, integer, jsonb, uuid) from public, anon;
revoke all on function public.ai_record_review_action(text, text, text, text, text, text, date, jsonb, text, uuid) from public, anon;
grant execute on function public.ai_module_enabled(uuid) to authenticated;
grant execute on function public.ai_can_read_module(text) to authenticated;
grant execute on function public.ai_record_insight_run(text, text, integer, jsonb, uuid) to authenticated;
grant execute on function public.ai_record_review_action(text, text, text, text, text, text, date, jsonb, text, uuid) to authenticated;

notify pgrst, 'reload schema';
