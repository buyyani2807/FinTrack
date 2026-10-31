-- Company-shared bulk-import party name → party_id mappings.
-- Apply in the Supabase SQL editor after 111. Safe to re-run.
-- Owners and accountants on the company share the same recall across devices.

create table if not exists public.acc_bulk_party_maps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_type text not null check (party_type in ('customer', 'supplier')),
  name_key text not null,
  party_name text not null,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, party_type, name_key)
);

create index if not exists acc_bulk_party_maps_company_idx
  on public.acc_bulk_party_maps (organization_id, company_id, party_type);

create index if not exists acc_bulk_party_maps_party_idx
  on public.acc_bulk_party_maps (party_id);

alter table public.acc_bulk_party_maps enable row level security;

drop policy if exists acc_bulk_party_maps_select on public.acc_bulk_party_maps;
create policy acc_bulk_party_maps_select on public.acc_bulk_party_maps
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

revoke all on table public.acc_bulk_party_maps from authenticated;
grant select on table public.acc_bulk_party_maps to authenticated;

create or replace function public.acc_normalize_party_name_key(input_name text)
returns text language sql immutable as $$
  select nullif(trim(regexp_replace(lower(coalesce(input_name, '')), '\s+', ' ', 'g')), '');
$$;

create or replace function public.acc_upsert_bulk_party_map(
  input_party_name text,
  input_party_id uuid,
  input_party_type text default 'customer',
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company_uuid uuid;
  key_text text;
  display_name text;
  ptype text;
  row_id uuid;
  party_ok boolean;
begin
  if not public.can_accounts_write() then
    raise exception 'Accounts write access is required';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  company_uuid := public.acc_require_company(input_company_id);
  display_name := nullif(trim(coalesce(input_party_name, '')), '');
  key_text := public.acc_normalize_party_name_key(display_name);
  ptype := lower(trim(coalesce(input_party_type, 'customer')));
  if key_text is null then raise exception 'Party name is required'; end if;
  if length(display_name) > 120 then raise exception 'Party name is too long'; end if;
  if ptype not in ('customer', 'supplier') then raise exception 'Party type must be customer or supplier'; end if;
  if input_party_id is null then raise exception 'Party is required'; end if;

  select exists (
    select 1 from public.acc_parties p
    where p.id = input_party_id
      and p.organization_id = org_id
      and p.company_id = company_uuid
      and p.party_type = ptype
  ) into party_ok;
  if not party_ok then raise exception 'Party not found in this company'; end if;

  insert into public.acc_bulk_party_maps (
    organization_id, company_id, party_type, name_key, party_name, party_id, updated_by
  ) values (
    org_id, company_uuid, ptype, key_text, left(display_name, 120), input_party_id, auth.uid()
  )
  on conflict (company_id, party_type, name_key) do update
    set party_id = excluded.party_id,
        party_name = excluded.party_name,
        updated_at = now(),
        updated_by = auth.uid()
  returning id into row_id;

  return row_id;
end;
$$;

revoke all on function public.acc_normalize_party_name_key(text) from public, anon, authenticated;
grant execute on function public.acc_normalize_party_name_key(text) to authenticated;

revoke all on function public.acc_upsert_bulk_party_map(text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.acc_upsert_bulk_party_map(text, uuid, text, uuid) to authenticated;
