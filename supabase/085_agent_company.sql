-- 085: a collection agent belongs to one Accounts company, or to finance and chit customers.
-- Apply after 084_accounts_sale_stock_on_hand.sql.
-- The agent sign-in shows that company, not the financier workspace name.

alter table public.profiles
  add column if not exists collection_scope text,
  add column if not exists accounts_company_id uuid references public.acc_companies(id) on delete set null;

-- Agents already assigned to one Accounts company's routes belong to that company.
update public.profiles p
set collection_scope = 'accounts',
    accounts_company_id = sub.company_id
from (
  select r.agent_id, min(r.company_id::text)::uuid as company_id
  from public.acc_collection_routes r
  where r.agent_id is not null and r.is_active
  group by r.agent_id
  having count(distinct r.company_id) = 1
) sub
where p.id = sub.agent_id
  and p.role = 'staff'
  and p.collection_scope is null;

alter table public.profiles drop constraint if exists profiles_collection_scope_check;
alter table public.profiles
  add constraint profiles_collection_scope_check check (
    collection_scope is null
    or (collection_scope = 'finance' and accounts_company_id is null)
    or (collection_scope = 'accounts' and accounts_company_id is not null)
  );

-- Name the signed-in agent sees. Finance agents get nothing here and keep the workspace name.
create or replace function public.my_agent_company_name()
returns text language sql stable security definer set search_path = public as $$
  select c.name
  from public.profiles p
  join public.acc_companies c on c.id = p.accounts_company_id and c.status = 'active'
  where p.id = auth.uid() and p.collection_scope = 'accounts';
$$;
revoke all on function public.my_agent_company_name() from public, anon;
grant execute on function public.my_agent_company_name() to authenticated;

-- Route assignment lists agents for the open Accounts company, plus staff not tied to a company yet.
create or replace function public.acc_list_collection_agents()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
begin
  if not public.can_accounts_write() then
    raise exception 'Accounting is available only to the business owner or accountant';
  end if;
  org_id := public.current_organization_id();
  active_company_id := public.acc_request_company_id();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'phone', p.phone,
      'role', p.role,
      'is_active', p.is_active,
      'collection_scope', p.collection_scope,
      'accounts_company_id', p.accounts_company_id
    ) order by (p.role = 'staff') desc, p.full_name)
    from public.profiles p
    where p.organization_id = org_id
      and (
        p.role = 'owner'
        or p.collection_scope is null
        or (p.collection_scope = 'accounts' and (active_company_id is null or p.accounts_company_id = active_company_id))
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.acc_save_collection_route(
  input_id uuid,
  input_name text,
  input_agent_id uuid default null,
  input_weekdays integer[] default '{}',
  input_notes text default null,
  input_is_active boolean default true,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  route_id uuid;
  clean_days smallint[];
  clean_name text := trim(coalesce(input_name, ''));
  agent public.profiles%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if clean_name = '' then raise exception 'Route name is required'; end if;
  if length(clean_name) > 80 then raise exception 'Route name is too long'; end if;
  if input_agent_id is not null then
    select * into agent from public.profiles p where p.id = input_agent_id and p.organization_id = org_id;
    if agent.id is null then raise exception 'Collection agent not found in this business'; end if;
    if agent.role = 'staff' and agent.collection_scope = 'finance' then
      raise exception 'This agent collects finance and chit customers, not an Accounts route';
    end if;
    if agent.collection_scope = 'accounts' and agent.accounts_company_id is distinct from active_company_id then
      raise exception 'This agent belongs to a different Accounts company';
    end if;
  end if;
  select coalesce(array_agg(distinct d::smallint order by d::smallint), '{}')
    into clean_days
  from unnest(coalesce(input_weekdays, '{}'::integer[])) as d
  where d between 1 and 7;

  if input_id is null then
    insert into public.acc_collection_routes(organization_id, company_id, name, agent_id, weekdays, notes, is_active, created_by)
    values (org_id, active_company_id, clean_name, input_agent_id, clean_days, nullif(trim(coalesce(input_notes, '')), ''), coalesce(input_is_active, true), auth.uid())
    returning id into route_id;
  else
    update public.acc_collection_routes
      set name = clean_name,
          agent_id = input_agent_id,
          weekdays = clean_days,
          notes = nullif(trim(coalesce(input_notes, '')), ''),
          is_active = coalesce(input_is_active, true),
          updated_at = now()
    where id = input_id and company_id = active_company_id
    returning id into route_id;
    if route_id is null then raise exception 'Route not found'; end if;
  end if;

  perform public.acc_write_audit(org_id, 'collection_route', route_id, case when input_id is null then 'create' else 'update' end, null,
    jsonb_build_object('name', clean_name, 'agent_id', input_agent_id, 'weekdays', clean_days, 'is_active', coalesce(input_is_active, true)),
    null, active_company_id);
  return route_id;
exception
  when unique_violation then
    raise exception 'A route named "%" already exists', clean_name;
end;
$$;

notify pgrst, 'reload schema';
