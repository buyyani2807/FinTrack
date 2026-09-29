-- Harden Accounts CRM pipeline RPCs (077): both run as SECURITY DEFINER, so they
-- must verify the company belongs to the caller's organisation and the party
-- belongs to that company before reading or writing.

create or replace function public.acc_list_party_pipeline(input_company_id uuid default null)
returns table(party_id uuid, stage text) language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid;
begin
  if not public.can_accounts_read() then raise exception 'Accounts read access is required'; end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  active_company_id := coalesce(input_company_id, public.acc_request_company_id());
  if active_company_id is null then raise exception 'Choose an Accounts company'; end if;
  if not exists (
    select 1 from public.acc_companies c
    where c.id = active_company_id and c.organization_id = org_id and c.status = 'active'
  ) then
    raise exception 'Accounts company not found';
  end if;
  return query
    select p.party_id, p.stage
    from public.acc_party_pipeline p
    where p.organization_id = org_id and p.company_id = active_company_id;
end; $$;

create or replace function public.acc_set_party_pipeline(input_company_id uuid, input_party_id uuid, input_stage text)
returns text language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_stage not in ('Lead','Contacted','Quoted','Won','Lost') then raise exception 'Invalid pipeline stage'; end if;
  if not exists (
    select 1 from public.acc_parties p
    where p.id = input_party_id and p.organization_id = org_id and p.company_id = active_company_id
  ) then
    raise exception 'Party does not belong to this company';
  end if;
  insert into public.acc_party_pipeline(organization_id, company_id, party_id, stage)
  values (org_id, active_company_id, input_party_id, input_stage)
  on conflict (company_id, party_id) do update
    set stage = excluded.stage, updated_at = now()
    where public.acc_party_pipeline.organization_id = org_id;
  return input_stage;
end; $$;

grant execute on function public.acc_list_party_pipeline(uuid) to authenticated;
grant execute on function public.acc_set_party_pipeline(uuid, uuid, text) to authenticated;
