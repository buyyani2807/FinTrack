-- Accounts CRM pipeline stages. Isolated from ledger tables.
create table if not exists public.acc_party_pipeline (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  stage text not null default 'Lead' check (stage in ('Lead','Contacted','Quoted','Won','Lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, party_id)
);
alter table public.acc_party_pipeline enable row level security;
drop policy if exists acc_party_pipeline_read on public.acc_party_pipeline;
create policy acc_party_pipeline_read on public.acc_party_pipeline for select to authenticated using (organization_id = public.current_organization_id() and company_id = public.acc_request_company_id() and public.can_accounts_read());
drop policy if exists acc_party_pipeline_write on public.acc_party_pipeline;
create policy acc_party_pipeline_write on public.acc_party_pipeline for all to authenticated using (organization_id = public.current_organization_id() and company_id = public.acc_request_company_id() and public.can_accounts_write()) with check (organization_id = public.current_organization_id() and company_id = public.acc_request_company_id() and public.can_accounts_write());
revoke all on public.acc_party_pipeline from authenticated;
grant select, insert, update on public.acc_party_pipeline to authenticated;

create or replace function public.acc_list_party_pipeline(input_company_id uuid default null)
returns table(party_id uuid, stage text) language plpgsql security definer set search_path = public as $$
begin
  if not public.can_accounts_read() then raise exception 'Accounts read access is required'; end if;
  return query select p.party_id, p.stage from public.acc_party_pipeline p where p.organization_id = public.current_organization_id() and p.company_id = coalesce(input_company_id, public.acc_request_company_id());
end; $$;

create or replace function public.acc_set_party_pipeline(input_company_id uuid, input_party_id uuid, input_stage text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  if input_stage not in ('Lead','Contacted','Quoted','Won','Lost') then raise exception 'Invalid pipeline stage'; end if;
  insert into public.acc_party_pipeline(organization_id, company_id, party_id, stage) values (public.current_organization_id(), input_company_id, input_party_id, input_stage)
  on conflict (company_id, party_id) do update set stage = excluded.stage, updated_at = now();
  return input_stage;
end; $$;
grant execute on function public.acc_list_party_pipeline(uuid) to authenticated;
grant execute on function public.acc_set_party_pipeline(uuid, uuid, text) to authenticated;
