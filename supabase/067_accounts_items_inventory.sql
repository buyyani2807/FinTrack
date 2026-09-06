-- FinTrack Accounts: Items / Products + basic inventory (company-scoped).
-- Apply AFTER 066_accounts_voucher_attachments.sql.
-- Does NOT change double-entry posting math. Item lines are satellite detail on vouchers.
-- Stock = opening + movements (purchase +, sale -, adjustment ±). Services never move stock.

create table if not exists public.acc_item_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.acc_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  item_type text not null default 'product' check (item_type in ('product', 'service')),
  name text not null,
  sku text not null,
  category_id uuid references public.acc_item_categories(id) on delete set null,
  unit text not null default 'Nos',
  description text,
  selling_price numeric(18,2) not null default 0 check (selling_price >= 0),
  purchase_price numeric(18,2) not null default 0 check (purchase_price >= 0),
  gst_rate numeric(7,3) not null default 0 check (gst_rate >= 0 and gst_rate <= 100),
  hsn_sac text,
  opening_stock numeric(18,3) not null default 0,
  opening_stock_date date,
  reorder_level numeric(18,3) not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);

create index if not exists acc_items_company_name_idx
  on public.acc_items (organization_id, company_id, lower(name));
create index if not exists acc_items_company_active_idx
  on public.acc_items (organization_id, company_id, is_active);

create table if not exists public.acc_voucher_item_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  voucher_id uuid not null references public.acc_vouchers(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  item_id uuid references public.acc_items(id) on delete set null,
  item_name text not null,
  item_sku text,
  item_type text not null default 'product' check (item_type in ('product', 'service')),
  unit text not null default 'Nos',
  quantity numeric(18,3) not null check (quantity > 0),
  rate numeric(18,2) not null check (rate >= 0),
  amount numeric(18,2) not null check (amount >= 0),
  gst_rate numeric(7,3) not null default 0,
  hsn_sac text,
  taxable_amount numeric(18,2) not null default 0,
  cgst_amount numeric(18,2) not null default 0,
  sgst_amount numeric(18,2) not null default 0,
  igst_amount numeric(18,2) not null default 0,
  unique (voucher_id, line_no)
);

create index if not exists acc_voucher_item_lines_voucher_idx
  on public.acc_voucher_item_lines (organization_id, company_id, voucher_id);
create index if not exists acc_voucher_item_lines_item_idx
  on public.acc_voucher_item_lines (organization_id, company_id, item_id);

create table if not exists public.acc_stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  item_id uuid not null references public.acc_items(id) on delete restrict,
  movement_date date not null,
  quantity_delta numeric(18,3) not null,
  reason text not null check (reason in ('opening', 'purchase', 'sale', 'adjustment', 'reversal')),
  note text,
  voucher_id uuid references public.acc_vouchers(id) on delete set null,
  voucher_item_line_id uuid references public.acc_voucher_item_lines(id) on delete set null,
  voucher_number text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists acc_stock_movements_item_date_idx
  on public.acc_stock_movements (organization_id, company_id, item_id, movement_date, created_at);

alter table public.acc_item_categories enable row level security;
alter table public.acc_items enable row level security;
alter table public.acc_voucher_item_lines enable row level security;
alter table public.acc_stock_movements enable row level security;

drop policy if exists acc_item_categories_owner_select on public.acc_item_categories;
create policy acc_item_categories_owner_select on public.acc_item_categories
for select to authenticated
using (
  organization_id = public.current_organization_id()
  and public.is_financier_owner()
  and company_id = public.acc_request_company_id()
);

drop policy if exists acc_items_owner_select on public.acc_items;
create policy acc_items_owner_select on public.acc_items
for select to authenticated
using (
  organization_id = public.current_organization_id()
  and public.is_financier_owner()
  and company_id = public.acc_request_company_id()
);

drop policy if exists acc_voucher_item_lines_owner_select on public.acc_voucher_item_lines;
create policy acc_voucher_item_lines_owner_select on public.acc_voucher_item_lines
for select to authenticated
using (
  organization_id = public.current_organization_id()
  and public.is_financier_owner()
  and company_id = public.acc_request_company_id()
);

drop policy if exists acc_stock_movements_owner_select on public.acc_stock_movements;
create policy acc_stock_movements_owner_select on public.acc_stock_movements
for select to authenticated
using (
  organization_id = public.current_organization_id()
  and public.is_financier_owner()
  and company_id = public.acc_request_company_id()
);

revoke all on table public.acc_item_categories from authenticated;
revoke all on table public.acc_items from authenticated;
revoke all on table public.acc_voucher_item_lines from authenticated;
revoke all on table public.acc_stock_movements from authenticated;
grant select on table public.acc_item_categories to authenticated;
grant select on table public.acc_items to authenticated;
grant select on table public.acc_voucher_item_lines to authenticated;
grant select on table public.acc_stock_movements to authenticated;

create or replace function public.acc_item_is_used(input_org_id uuid, input_company_id uuid, input_item_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.acc_voucher_item_lines
    where organization_id = input_org_id and company_id = input_company_id and item_id = input_item_id
  ) or exists (
    select 1 from public.acc_stock_movements
    where organization_id = input_org_id and company_id = input_company_id and item_id = input_item_id
      and reason <> 'opening'
  );
$$;

create or replace function public.acc_upsert_item_category(
  input_id uuid default null,
  input_name text default null,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  nm text;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  nm := nullif(trim(coalesce(input_name, '')), '');
  if nm is null then raise exception 'Category name is required'; end if;
  if input_id is null then
    insert into public.acc_item_categories (organization_id, company_id, name)
    values (org_id, active_company_id, nm)
    returning id into new_id;
  else
    update public.acc_item_categories
      set name = nm, updated_at = now()
    where id = input_id and organization_id = org_id and company_id = active_company_id
    returning id into new_id;
    if new_id is null then raise exception 'Category not found'; end if;
  end if;
  return new_id;
end;
$$;

create or replace function public.acc_delete_item_category(
  input_id uuid,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if exists (
    select 1 from public.acc_items
    where organization_id = org_id and company_id = active_company_id and category_id = input_id
  ) then
    raise exception 'Category is used by items and cannot be deleted.';
  end if;
  delete from public.acc_item_categories
  where id = input_id and organization_id = org_id and company_id = active_company_id;
  if not found then raise exception 'Category not found'; end if;
end;
$$;

create or replace function public.acc_upsert_item(
  input_id uuid default null,
  input_item_type text default 'product',
  input_name text default null,
  input_sku text default null,
  input_category_id uuid default null,
  input_unit text default 'Nos',
  input_description text default null,
  input_selling_price numeric default 0,
  input_purchase_price numeric default 0,
  input_gst_rate numeric default 0,
  input_hsn_sac text default null,
  input_opening_stock numeric default 0,
  input_opening_stock_date date default null,
  input_reorder_level numeric default 0,
  input_is_active boolean default true,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  nm text;
  sku_text text;
  unit_text text;
  item_type text;
  opening numeric(18,3);
  opening_date date;
  existing public.acc_items%rowtype;
  new_id uuid;
  used boolean;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  nm := nullif(trim(coalesce(input_name, '')), '');
  sku_text := upper(nullif(trim(coalesce(input_sku, '')), ''));
  unit_text := coalesce(nullif(trim(coalesce(input_unit, '')), ''), 'Nos');
  item_type := coalesce(nullif(trim(coalesce(input_item_type, '')), ''), 'product');
  if nm is null then raise exception 'Item name is required'; end if;
  if sku_text is null then raise exception 'Item code / SKU is required'; end if;
  if item_type not in ('product', 'service') then raise exception 'Item type must be product or service'; end if;
  if coalesce(input_selling_price, 0) < 0 or coalesce(input_purchase_price, 0) < 0 then
    raise exception 'Prices cannot be negative';
  end if;
  if coalesce(input_gst_rate, 0) < 0 or coalesce(input_gst_rate, 0) > 100 then
    raise exception 'GST rate must be between 0 and 100';
  end if;
  opening := case when item_type = 'service' then 0 else coalesce(input_opening_stock, 0) end;
  if opening < 0 then raise exception 'Opening stock cannot be negative'; end if;
  opening_date := case when item_type = 'service' then null else input_opening_stock_date end;

  if input_category_id is not null and not exists (
    select 1 from public.acc_item_categories c
    where c.id = input_category_id and c.organization_id = org_id and c.company_id = active_company_id
  ) then
    raise exception 'Category not found';
  end if;

  if input_id is null then
    insert into public.acc_items (
      organization_id, company_id, item_type, name, sku, category_id, unit, description,
      selling_price, purchase_price, gst_rate, hsn_sac, opening_stock, opening_stock_date,
      reorder_level, is_active
    ) values (
      org_id, active_company_id, item_type, nm, sku_text, input_category_id, unit_text,
      nullif(trim(coalesce(input_description, '')), ''),
      coalesce(input_selling_price, 0), coalesce(input_purchase_price, 0), coalesce(input_gst_rate, 0),
      nullif(trim(coalesce(input_hsn_sac, '')), ''), opening, opening_date,
      coalesce(input_reorder_level, 0), coalesce(input_is_active, true)
    ) returning id into new_id;

    if item_type = 'product' and opening <> 0 then
      insert into public.acc_stock_movements (
        organization_id, company_id, item_id, movement_date, quantity_delta, reason, note, created_by
      ) values (
        org_id, active_company_id, new_id, coalesce(opening_date, current_date), opening, 'opening',
        'Opening stock', auth.uid()
      );
    end if;
  else
    select * into existing from public.acc_items
    where id = input_id and organization_id = org_id and company_id = active_company_id;
    if existing.id is null then raise exception 'Item not found'; end if;
    used := public.acc_item_is_used(org_id, active_company_id, existing.id);
    if used and existing.item_type <> item_type then
      raise exception 'Item type cannot be changed after transactions exist.';
    end if;
    if used and existing.opening_stock <> opening then
      raise exception 'Opening stock cannot be changed after stock movements exist. Use Stock Adjustment.';
    end if;

    update public.acc_items set
      item_type = item_type,
      name = nm,
      sku = sku_text,
      category_id = input_category_id,
      unit = unit_text,
      description = nullif(trim(coalesce(input_description, '')), ''),
      selling_price = coalesce(input_selling_price, 0),
      purchase_price = coalesce(input_purchase_price, 0),
      gst_rate = coalesce(input_gst_rate, 0),
      hsn_sac = nullif(trim(coalesce(input_hsn_sac, '')), ''),
      opening_stock = opening,
      opening_stock_date = opening_date,
      reorder_level = coalesce(input_reorder_level, 0),
      is_active = coalesce(input_is_active, true),
      updated_at = now()
    where id = existing.id
    returning id into new_id;

    if not used and item_type = 'product' then
      delete from public.acc_stock_movements
      where organization_id = org_id and company_id = active_company_id
        and item_id = existing.id and reason = 'opening';
      if opening <> 0 then
        insert into public.acc_stock_movements (
          organization_id, company_id, item_id, movement_date, quantity_delta, reason, note, created_by
        ) values (
          org_id, active_company_id, existing.id, coalesce(opening_date, current_date), opening, 'opening',
          'Opening stock', auth.uid()
        );
      end if;
    end if;
  end if;

  perform public.acc_write_audit(
    org_id, 'item', new_id, case when input_id is null then 'create' else 'update' end,
    null, jsonb_build_object('name', nm, 'sku', sku_text, 'item_type', item_type), null, active_company_id
  );
  return new_id;
end;
$$;

create or replace function public.acc_set_item_active(
  input_id uuid,
  input_active boolean default true,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  update public.acc_items
    set is_active = coalesce(input_active, true), updated_at = now()
  where id = input_id and organization_id = org_id and company_id = active_company_id;
  if not found then raise exception 'Item not found'; end if;
end;
$$;

create or replace function public.acc_delete_item(
  input_id uuid,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  existing public.acc_items%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into existing from public.acc_items
  where id = input_id and organization_id = org_id and company_id = active_company_id;
  if existing.id is null then raise exception 'Item not found'; end if;
  if public.acc_item_is_used(org_id, active_company_id, existing.id) then
    raise exception 'This item cannot be deleted because transactions already exist. Deactivate it instead.';
  end if;
  delete from public.acc_stock_movements
  where organization_id = org_id and company_id = active_company_id and item_id = existing.id;
  delete from public.acc_items where id = existing.id;
  perform public.acc_write_audit(
    org_id, 'item', existing.id, 'delete',
    jsonb_build_object('name', existing.name, 'sku', existing.sku), null, null, active_company_id
  );
end;
$$;

create or replace function public.acc_adjust_stock(
  input_item_id uuid,
  input_date date,
  input_quantity_delta numeric,
  input_reason_note text default null,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  item public.acc_items%rowtype;
  new_id uuid;
  note_text text;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_date is null then raise exception 'Adjustment date is required'; end if;
  if coalesce(input_quantity_delta, 0) = 0 then raise exception 'Adjustment quantity cannot be zero'; end if;
  note_text := nullif(trim(coalesce(input_reason_note, '')), '');
  if note_text is null then raise exception 'Adjustment reason is required'; end if;

  select * into item from public.acc_items
  where id = input_item_id and organization_id = org_id and company_id = active_company_id;
  if item.id is null then raise exception 'Item not found'; end if;
  if item.item_type <> 'product' then raise exception 'Stock adjustments are only allowed for products'; end if;

  insert into public.acc_stock_movements (
    organization_id, company_id, item_id, movement_date, quantity_delta, reason, note, created_by
  ) values (
    org_id, active_company_id, item.id, input_date, input_quantity_delta, 'adjustment', note_text, auth.uid()
  ) returning id into new_id;

  perform public.acc_write_audit(
    org_id, 'stock_adjustment', new_id, 'create',
    null, jsonb_build_object('item_id', item.id, 'delta', input_quantity_delta, 'note', note_text),
    null, active_company_id
  );
  return new_id;
end;
$$;

create or replace function public.acc_save_voucher_item_lines(
  input_voucher_id uuid,
  input_lines jsonb,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  voucher public.acc_vouchers%rowtype;
  line jsonb;
  idx integer := 0;
  item public.acc_items%rowtype;
  qty numeric(18,3);
  rate numeric(18,2);
  amount numeric(18,2);
  line_id uuid;
  delta numeric(18,3);
  reason_text text;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);

  select * into voucher from public.acc_vouchers
  where id = input_voucher_id and organization_id = org_id and company_id = active_company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status <> 'posted' then raise exception 'Item lines can only be saved on posted vouchers'; end if;
  if voucher.voucher_type not in ('sales', 'purchase') then
    raise exception 'Item lines are only supported on sales and purchase vouchers';
  end if;
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) = 0 then
    raise exception 'At least one item line is required';
  end if;
  if exists (
    select 1 from public.acc_voucher_item_lines
    where voucher_id = voucher.id and organization_id = org_id and company_id = active_company_id
  ) then
    raise exception 'Item lines already exist for this voucher';
  end if;

  reason_text := case when voucher.voucher_type = 'sales' then 'sale' else 'purchase' end;

  for line in select value from jsonb_array_elements(input_lines)
  loop
    idx := idx + 1;
    qty := coalesce((line->>'quantity')::numeric, 0);
    rate := coalesce((line->>'rate')::numeric, 0);
    amount := coalesce((line->>'amount')::numeric, round(qty * rate, 2));
    if qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if rate < 0 or amount < 0 then raise exception 'Item rate/amount cannot be negative'; end if;
    if nullif(trim(coalesce(line->>'item_name', '')), '') is null then
      raise exception 'Item name is required on line %', idx;
    end if;

    item := null;
    if nullif(line->>'item_id', '') is not null then
      select * into item from public.acc_items
      where id = (line->>'item_id')::uuid
        and organization_id = org_id and company_id = active_company_id;
      if item.id is null then raise exception 'Item not found on line %', idx; end if;
      if item.is_active is false then raise exception 'Inactive item cannot be used on new vouchers'; end if;
    end if;

    insert into public.acc_voucher_item_lines (
      organization_id, company_id, voucher_id, line_no, item_id, item_name, item_sku, item_type, unit,
      quantity, rate, amount, gst_rate, hsn_sac, taxable_amount, cgst_amount, sgst_amount, igst_amount
    ) values (
      org_id, active_company_id, voucher.id, idx,
      item.id,
      coalesce(item.name, trim(line->>'item_name')),
      coalesce(item.sku, nullif(trim(coalesce(line->>'item_sku', '')), '')),
      coalesce(item.item_type, coalesce(nullif(trim(coalesce(line->>'item_type', '')), ''), 'product')),
      coalesce(nullif(trim(coalesce(line->>'unit', '')), ''), item.unit, 'Nos'),
      qty, rate, amount,
      coalesce((line->>'gst_rate')::numeric, item.gst_rate, 0),
      coalesce(nullif(trim(coalesce(line->>'hsn_sac', '')), ''), item.hsn_sac),
      coalesce((line->>'taxable_amount')::numeric, amount),
      coalesce((line->>'cgst_amount')::numeric, 0),
      coalesce((line->>'sgst_amount')::numeric, 0),
      coalesce((line->>'igst_amount')::numeric, 0)
    ) returning id into line_id;

    if coalesce(item.item_type, coalesce(nullif(trim(coalesce(line->>'item_type', '')), ''), 'product')) = 'product'
       and item.id is not null then
      delta := case when voucher.voucher_type = 'sales' then -qty else qty end;
      insert into public.acc_stock_movements (
        organization_id, company_id, item_id, movement_date, quantity_delta, reason, note,
        voucher_id, voucher_item_line_id, voucher_number, created_by
      ) values (
        org_id, active_company_id, item.id, voucher.voucher_date, delta, reason_text, null,
        voucher.id, line_id, voucher.voucher_number, auth.uid()
      );
    end if;
  end loop;
end;
$$;

create or replace function public.acc_reverse_voucher_stock(
  input_voucher_id uuid,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  voucher public.acc_vouchers%rowtype;
  mov public.acc_stock_movements%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers
  where id = input_voucher_id and organization_id = org_id and company_id = active_company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;

  for mov in
    select * from public.acc_stock_movements
    where organization_id = org_id and company_id = active_company_id
      and voucher_id = voucher.id and reason in ('sale', 'purchase')
  loop
    if exists (
      select 1 from public.acc_stock_movements r
      where r.organization_id = org_id and r.company_id = active_company_id
        and r.voucher_id = voucher.id and r.reason = 'reversal'
        and r.item_id = mov.item_id and r.voucher_item_line_id is not distinct from mov.voucher_item_line_id
        and r.quantity_delta = -mov.quantity_delta
    ) then
      continue;
    end if;
    insert into public.acc_stock_movements (
      organization_id, company_id, item_id, movement_date, quantity_delta, reason, note,
      voucher_id, voucher_item_line_id, voucher_number, created_by
    ) values (
      org_id, active_company_id, mov.item_id, coalesce(voucher.voucher_date, current_date),
      -mov.quantity_delta, 'reversal', 'Reversal of ' || mov.reason,
      voucher.id, mov.voucher_item_line_id, voucher.voucher_number, auth.uid()
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
