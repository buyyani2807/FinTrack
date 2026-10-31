-- Restrict Accounts-team (CA) users to assigned companies within the org.
-- Owners still see every company. Apply after 109/110. Safe to re-run.

create table if not exists public.acc_user_company_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, user_id, company_id)
);

create index if not exists acc_user_company_access_user_idx
  on public.acc_user_company_access (organization_id, user_id);

alter table public.acc_user_company_access enable row level security;

drop policy if exists acc_user_company_access_select on public.acc_user_company_access;
create policy acc_user_company_access_select on public.acc_user_company_access
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_financier_owner()
      or user_id = auth.uid()
    )
  );

revoke all on table public.acc_user_company_access from authenticated;
grant select on table public.acc_user_company_access to authenticated;

-- Owners: all companies. Accounts-team: only assigned rows. Others: none.
create or replace function public.acc_can_access_company(input_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when input_company_id is null then false
    when public.is_financier_owner() then exists (
      select 1 from public.acc_companies c
      where c.id = input_company_id
        and c.organization_id = public.current_organization_id()
    )
    when public.is_accounts_team_user() then exists (
      select 1 from public.acc_user_company_access a
      where a.user_id = auth.uid()
        and a.organization_id = public.current_organization_id()
        and a.company_id = input_company_id
    )
    else false
  end;
$$;

grant execute on function public.acc_can_access_company(uuid) to authenticated;

-- Header company is ignored when the CA is not assigned to it (blocks forged x-acc-company-id).
create or replace function public.acc_request_company_id()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  raw text;
  headers jsonb;
  company_id uuid;
begin
  begin
    raw := nullif(trim(current_setting('request.header.x-acc-company-id', true)), '');
  exception when others then
    raw := null;
  end;
  if raw is null then
    begin
      headers := current_setting('request.headers', true)::jsonb;
      raw := nullif(trim(coalesce(headers->>'x-acc-company-id', headers->>'X-Acc-Company-Id', '')), '');
    exception when others then
      raw := null;
    end;
  end if;
  if raw is null or raw = '' then return null; end if;
  begin
    company_id := raw::uuid;
  exception when others then
    return null;
  end;
  if not public.acc_can_access_company(company_id) then
    return null;
  end if;
  return company_id;
end;
$$;

grant execute on function public.acc_request_company_id() to authenticated;

create or replace function public.acc_require_company(input_company_id uuid default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := coalesce(input_company_id, public.acc_request_company_id());
  if active_company_id is null then raise exception 'Choose an Accounts company'; end if;
  if not exists (
    select 1 from public.acc_companies c
    where c.id = active_company_id and c.organization_id = org_id and c.status = 'active'
  ) then
    raise exception 'Accounts company not found';
  end if;
  if not public.acc_can_access_company(active_company_id) then
    raise exception 'You do not have access to this Accounts company';
  end if;
  return active_company_id;
end;
$$;

grant execute on function public.acc_require_company(uuid) to authenticated;

-- List only companies the caller may open (owners: all in org).
create or replace function public.acc_list_companies()
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  if not public.can_accounts_read() then
    raise exception 'Accounts access is required to list companies';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'fyStartMonth', c.fy_start_month,
      'booksStartedOn', c.books_started_on,
      'status', c.status,
      'isPrimary', c.is_primary,
      'createdAt', c.created_at,
      'updatedAt', c.updated_at,
      'gstRegistration', c.gst_registration,
      'gstin', c.gstin,
      'legalName', c.legal_name,
      'stateCode', c.state_code,
      'stateName', c.state_name
    ) order by c.is_primary desc, lower(c.name))
    from public.acc_companies c
    where c.organization_id = org_id
      and public.acc_can_access_company(c.id)
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.acc_list_companies() to authenticated;

drop policy if exists acc_companies_select on public.acc_companies;
create policy acc_companies_select on public.acc_companies for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and public.acc_can_access_company(id)
  );
