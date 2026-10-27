-- Price lists: named selling or purchase rates per item, optional on a party.
-- Apply in the Supabase SQL editor after 106. Existing item selling/purchase prices stay as the fallback.
-- Three-way PO / receipt / bill match uses existing trade documents and voucher lines; no tables here.

alter table public.acc_parties
  add column if not exists price_list_id uuid;

create table if not exists public.acc_price_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('selling', 'purchase')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, kind, name)
);

create index if not exists acc_price_lists_company_idx
  on public.acc_price_lists (organization_id, company_id, kind, is_active);

create table if not exists public.acc_price_list_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  price_list_id uuid not null references public.acc_price_lists(id) on delete cascade,
  item_id uuid not null references public.acc_items(id) on delete cascade,
  rate numeric(18,2) not null check (rate >= 0),
  updated_at timestamptz not null default now(),
  unique (price_list_id, item_id)
);

create index if not exists acc_price_list_rates_list_idx on public.acc_price_list_rates (price_list_id);
create index if not exists acc_price_list_rates_item_idx on public.acc_price_list_rates (item_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'acc_parties_price_list_id_fkey') then
    alter table public.acc_parties
      add constraint acc_parties_price_list_id_fkey
      foreign key (price_list_id) references public.acc_price_lists(id) on delete set null;
  end if;
end $$;

alter table public.acc_price_lists enable row level security;
alter table public.acc_price_list_rates enable row level security;

drop policy if exists acc_price_lists_select on public.acc_price_lists;
create policy acc_price_lists_select on public.acc_price_lists for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

drop policy if exists acc_price_list_rates_select on public.acc_price_list_rates;
create policy acc_price_list_rates_select on public.acc_price_list_rates for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

revoke all on table public.acc_price_lists from authenticated;
revoke all on table public.acc_price_list_rates from authenticated;
grant select on table public.acc_price_lists to authenticated;
grant select on table public.acc_price_list_rates to authenticated;

create or replace function public.acc_upsert_price_list(
  input_id uuid default null,
  input_name text default null,
  input_kind text default 'selling',
  input_is_default boolean default false,
  input_is_active boolean default true,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  nm text;
  kind text;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  nm := nullif(trim(coalesce(input_name, '')), '');
  kind := lower(trim(coalesce(input_kind, 'selling')));
  if nm is null then raise exception 'Price list name is required'; end if;
  if length(nm) > 80 then raise exception 'Price list name is too long'; end if;
  if kind not in ('selling', 'purchase') then raise exception 'Choose selling or purchase'; end if;

  if coalesce(input_is_default, false) then
    update public.acc_price_lists
      set is_default = false, updated_at = now()
    where organization_id = org_id and company_id = active_company_id and kind = kind and is_default;
  end if;

  if input_id is null then
    insert into public.acc_price_lists (organization_id, company_id, name, kind, is_default, is_active)
    values (org_id, active_company_id, nm, kind, coalesce(input_is_default, false), coalesce(input_is_active, true))
    returning id into new_id;
  else
    update public.acc_price_lists
      set name = nm,
          kind = kind,
          is_default = coalesce(input_is_default, is_default),
          is_active = coalesce(input_is_active, is_active),
          updated_at = now()
    where id = input_id and organization_id = org_id and company_id = active_company_id
    returning id into new_id;
    if new_id is null then raise exception 'Price list not found'; end if;
  end if;
  return new_id;
end;
$$;

create or replace function public.acc_delete_price_list(
  input_id uuid,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  update public.acc_parties
    set price_list_id = null, updated_at = now()
  where organization_id = org_id and company_id = active_company_id and price_list_id = input_id;
  delete from public.acc_price_lists
  where id = input_id and organization_id = org_id and company_id = active_company_id;
  if not found then raise exception 'Price list not found'; end if;
end;
$$;

create or replace function public.acc_save_price_list_rates(
  input_price_list_id uuid,
  input_rates jsonb default '[]'::jsonb,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  list public.acc_price_lists%rowtype;
  row jsonb;
  item_uuid uuid;
  rate_value numeric(18,2);
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into list from public.acc_price_lists
  where id = input_price_list_id and organization_id = org_id and company_id = active_company_id;
  if list.id is null then raise exception 'Price list not found'; end if;

  delete from public.acc_price_list_rates
  where price_list_id = list.id and organization_id = org_id and company_id = active_company_id;

  if input_rates is null or jsonb_typeof(input_rates) <> 'array' then
    return;
  end if;

  for row in select * from jsonb_array_elements(input_rates)
  loop
    item_uuid := nullif(row->>'itemId', '')::uuid;
    if item_uuid is null then continue; end if;
    rate_value := round(coalesce((row->>'rate')::numeric, 0), 2);
    if rate_value < 0 then raise exception 'Rate cannot be negative'; end if;
    if not exists (
      select 1 from public.acc_items
      where id = item_uuid and organization_id = org_id and company_id = active_company_id
    ) then
      raise exception 'Item not found on this company';
    end if;
    insert into public.acc_price_list_rates (organization_id, company_id, price_list_id, item_id, rate)
    values (org_id, active_company_id, list.id, item_uuid, rate_value);
  end loop;
end;
$$;

create or replace function public.acc_set_party_price_list(
  input_party_id uuid,
  input_price_list_id uuid default null,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  party public.acc_parties%rowtype;
  list public.acc_price_lists%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into party from public.acc_parties
  where id = input_party_id and organization_id = org_id and company_id = active_company_id;
  if party.id is null then raise exception 'Party not found'; end if;

  if input_price_list_id is not null then
    select * into list from public.acc_price_lists
    where id = input_price_list_id and organization_id = org_id and company_id = active_company_id and is_active;
    if list.id is null then raise exception 'Price list not found'; end if;
    if party.party_type = 'customer' and list.kind <> 'selling' then
      raise exception 'Customers use a selling price list';
    end if;
    if party.party_type = 'supplier' and list.kind <> 'purchase' then
      raise exception 'Suppliers use a purchase price list';
    end if;
  end if;

  if party.price_list_id is not distinct from input_price_list_id then
    return;
  end if;

  update public.acc_parties
    set price_list_id = input_price_list_id, updated_at = now()
  where id = party.id;
end;
$$;

grant execute on function public.acc_upsert_price_list(uuid, text, text, boolean, boolean, uuid) to authenticated;
grant execute on function public.acc_delete_price_list(uuid, uuid) to authenticated;
grant execute on function public.acc_save_price_list_rates(uuid, jsonb, uuid) to authenticated;
grant execute on function public.acc_set_party_price_list(uuid, uuid, uuid) to authenticated;
