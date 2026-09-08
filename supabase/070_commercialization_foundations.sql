-- FinTrack commercialization foundations (staging).
-- Bank recon: reference + ignored status.
-- Accounts roles: owner / accountant / viewer (server-enforced).
-- Feature packs + product analytics + e-invoice credential stub.
-- Run after 069_finance_disbursement_bank_mode.sql.

-- ---------------------------------------------------------------------------
-- Bank statement lines: reference + ignore
-- ---------------------------------------------------------------------------
alter table public.acc_bank_statement_lines
  add column if not exists reference text not null default '';

alter table public.acc_bank_statement_lines
  drop constraint if exists acc_bank_statement_lines_match_status_check;

alter table public.acc_bank_statement_lines
  add constraint acc_bank_statement_lines_match_status_check
  check (match_status in ('unmatched', 'matched', 'suggested', 'ignored'));

-- ---------------------------------------------------------------------------
-- Accounts roles (org-scoped; company visibility still via x-acc-company-id)
-- ---------------------------------------------------------------------------
create table if not exists public.acc_user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('accountant', 'viewer')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, user_id)
);

alter table public.acc_user_roles enable row level security;
drop policy if exists acc_user_roles_owner on public.acc_user_roles;
create policy acc_user_roles_owner on public.acc_user_roles
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());

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

create or replace function public.can_accounts_read()
returns boolean language sql stable security definer set search_path = public as $$
  select public.accounts_access_role() in ('owner', 'accountant', 'viewer');
$$;

create or replace function public.can_accounts_write()
returns boolean language sql stable security definer set search_path = public as $$
  select public.accounts_access_role() in ('owner', 'accountant');
$$;

create or replace function public.can_accounts_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.accounts_access_role() = 'owner';
$$;

create or replace function public.acc_require_owner()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare org_id uuid;
begin
  -- Writers (owner + accountant) may call posting RPCs that historically used acc_require_owner.
  if not public.can_accounts_write() then
    raise exception 'Accounting is available only to the business owner or accountant';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  return org_id;
end;
$$;

create or replace function public.acc_require_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare org_id uuid;
begin
  if not public.can_accounts_admin() then
    raise exception 'Only the business owner can perform this Accounts admin action';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  return org_id;
end;
$$;

create or replace function public.acc_set_user_role(input_user_id uuid, input_role text)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid := public.acc_require_admin();
begin
  if input_role is null or input_role = '' then
    delete from public.acc_user_roles where organization_id = org_id and user_id = input_user_id;
    perform public.acc_write_audit(org_id, 'acc_user_role', input_user_id, 'role_cleared', null, null, null);
    return;
  end if;
  if input_role not in ('accountant', 'viewer') then
    raise exception 'Role must be accountant or viewer';
  end if;
  insert into public.acc_user_roles(organization_id, user_id, role, created_by)
  values (org_id, input_user_id, input_role, auth.uid())
  on conflict (organization_id, user_id) do update
    set role = excluded.role;
  perform public.acc_write_audit(org_id, 'acc_user_role', input_user_id, 'role_set', null, jsonb_build_object('role', input_role), null);
end;
$$;
grant execute on function public.acc_set_user_role(uuid, text) to authenticated;

-- Broaden Accounts table RLS: readers can select; writers can mutate.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'acc_settings', 'acc_coa', 'acc_parties', 'acc_sequences', 'acc_vouchers', 'acc_voucher_lines',
    'acc_audit_log', 'acc_period_locks', 'acc_bank_statements', 'acc_bank_statement_lines'
  ] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_owner', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_read', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_write', tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id() and public.can_accounts_read())',
      tbl || '_read', tbl
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (organization_id = public.current_organization_id() and public.can_accounts_write()) with check (organization_id = public.current_organization_id() and public.can_accounts_write())',
      tbl || '_write', tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Org commercial settings + analytics + e-invoice stub
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists feature_packs jsonb not null default '["full"]'::jsonb;
alter table public.organizations
  add column if not exists module_overrides jsonb not null default '{}'::jsonb;
alter table public.organizations
  add column if not exists einvoice_settings jsonb not null default '{}'::jsonb;

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.product_events enable row level security;
drop policy if exists product_events_owner on public.product_events;
drop policy if exists product_events_owner_read on public.product_events;
create policy product_events_owner on public.product_events
  for insert to authenticated
  with check (organization_id = public.current_organization_id());
create policy product_events_owner_read on public.product_events
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_financier_owner());

create or replace function public.track_product_event(input_event_name text, input_properties jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.product_events(organization_id, actor_id, event_name, properties)
  values (
    public.current_organization_id(),
    auth.uid(),
    left(coalesce(input_event_name, 'event'), 80),
    coalesce(input_properties, '{}'::jsonb)
  );
end;
$$;
grant execute on function public.track_product_event(text, jsonb) to authenticated;

create or replace function public.acc_ignore_bank_line(input_line_id uuid, input_note text default null, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid := public.acc_require_owner();
begin
  update public.acc_bank_statement_lines
    set match_status = 'ignored',
        matched_voucher_line_id = null,
        match_note = nullif(trim(coalesce(input_note, '')), '')
  where id = input_line_id and organization_id = org_id;
  perform public.acc_write_audit(org_id, 'acc_bank_statement_line', input_line_id, 'ignored', null, jsonb_build_object('note', input_note), input_note);
end;
$$;
grant execute on function public.acc_ignore_bank_line(uuid, text, uuid) to authenticated;

create or replace function public.acc_add_bank_statement(
  input_coa_id uuid, input_statement_date date, input_opening numeric, input_closing numeric, input_lines jsonb,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; statement_id uuid; line jsonb;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if not exists (
    select 1 from public.acc_coa c where c.id = input_coa_id and c.company_id = active_company_id
  ) then
    raise exception 'Bank account does not belong to this company';
  end if;
  insert into public.acc_bank_statements(organization_id, company_id, coa_id, statement_date, opening_balance, closing_balance, created_by)
  values (org_id, active_company_id, input_coa_id, input_statement_date, coalesce(input_opening, 0), coalesce(input_closing, 0), auth.uid())
  returning id into statement_id;
  for line in select * from jsonb_array_elements(coalesce(input_lines, '[]'::jsonb))
  loop
    insert into public.acc_bank_statement_lines(organization_id, company_id, statement_id, line_date, description, amount, direction, reference)
    values (
      org_id, active_company_id, statement_id, coalesce((line->>'line_date')::date, input_statement_date),
      coalesce(line->>'description', ''), (line->>'amount')::numeric, coalesce(line->>'direction', 'in'),
      coalesce(line->>'reference', '')
    );
  end loop;
  return statement_id;
end;
$$;
grant execute on function public.acc_add_bank_statement(uuid, date, numeric, numeric, jsonb, uuid) to authenticated;
