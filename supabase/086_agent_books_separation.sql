-- 086: an Accounts-company agent collects that company's route customers.
-- A finance and chit agent collects finance accounts, not Accounts routes.
-- Apply after 085_agent_company.sql.

-- Drop finance assignments from agents who collect for an Accounts company,
-- and drop Accounts routes from agents who collect finance and chit customers.
update public.finance_accounts a
set collection_agent_id = null
from public.profiles p
where a.collection_agent_id = p.id
  and p.collection_scope = 'accounts';

update public.acc_collection_routes r
set agent_id = null,
    updated_at = now()
from public.profiles p
where r.agent_id = p.id
  and (
    p.collection_scope = 'finance'
    or (p.collection_scope = 'accounts' and r.company_id is distinct from p.accounts_company_id)
  );

create or replace function public.sync_collection_agent_scope()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'staff' and new.collection_scope = 'accounts' then
    update public.finance_accounts
      set collection_agent_id = null
      where collection_agent_id = new.id
        and organization_id = new.organization_id;
    update public.acc_collection_routes
      set agent_id = null, updated_at = now()
      where agent_id = new.id
        and organization_id = new.organization_id
        and company_id is distinct from new.accounts_company_id;
  elsif new.role = 'staff' and new.collection_scope = 'finance' then
    update public.acc_collection_routes
      set agent_id = null, updated_at = now()
      where agent_id = new.id
        and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_collection_scope on public.profiles;
create trigger profiles_sync_collection_scope
  after insert or update of collection_scope, accounts_company_id, role
  on public.profiles
  for each row execute function public.sync_collection_agent_scope();

create or replace function public.assign_collection_agent(account_id uuid, agent_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can assign collection agents'; end if;
  if agent_id is not null and not exists (
    select 1 from public.profiles
    where id = agent_id and organization_id = public.current_organization_id() and role = 'staff'
      and collection_scope is distinct from 'accounts'
  ) then
    raise exception 'Assign finance customers only to a finance and chit agent. Accounts agents collect customers on their company routes.';
  end if;
  update public.finance_accounts set collection_agent_id = agent_id
    where id = account_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Account not found'; end if;
  perform public.write_finance_audit(account_id, 'collection_agent_assigned', jsonb_build_object('agent_id', agent_id));
end;
$$;

create or replace function public.assign_collection_agents_batch(input_assignments jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare item jsonb; account uuid; agent uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can assign collection agents'; end if;
  if input_assignments is null or jsonb_typeof(input_assignments) <> 'array' then
    raise exception 'Assignment list is required';
  end if;
  for item in select value from jsonb_array_elements(input_assignments)
  loop
    account := nullif(item->>'account_id', '')::uuid;
    agent := nullif(item->>'agent_id', '')::uuid;
    if account is null then raise exception 'Account is required'; end if;
    if agent is not null and not exists (
      select 1 from public.profiles
      where id = agent and organization_id = public.current_organization_id() and role = 'staff'
        and collection_scope is distinct from 'accounts'
    ) then
      raise exception 'Assign finance customers only to a finance and chit agent. Accounts agents collect customers on their company routes.';
    end if;
    update public.finance_accounts
      set collection_agent_id = agent
      where id = account and organization_id = public.current_organization_id();
    if not found then raise exception 'Account not found'; end if;
    perform public.write_finance_audit(account, 'collection_agent_assigned', jsonb_build_object('agent_id', agent));
  end loop;
end;
$$;

notify pgrst, 'reload schema';
