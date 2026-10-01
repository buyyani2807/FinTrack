-- 080 Inventory Phase 1, slice 2: valuation inputs and date-aware stock rules.
-- Apply after 079_accounts_inventory_returns_discounts.sql.
--   * acc_items.opening_rate: cost per unit of opening stock (weighted-average valuation seed).
--   * acc_inventory_settings: per-company "allow negative stock" switch.
--   * Stock checks use the entry date: a back-dated sale cannot take stock that only arrived later,
--     and an entry cannot push any later day's running balance below zero.
-- Valuation itself (weighted average, closing stock in P&L / Balance Sheet) is computed in the app.

alter table public.acc_items
  add column if not exists opening_rate numeric(18,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'acc_items_opening_rate_check') then
    alter table public.acc_items
      add constraint acc_items_opening_rate_check check (opening_rate is null or opening_rate >= 0);
  end if;
end $$;

create table if not exists public.acc_inventory_settings (
  company_id uuid primary key references public.acc_companies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  allow_negative_stock boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.acc_inventory_settings enable row level security;

drop policy if exists acc_inventory_settings_select on public.acc_inventory_settings;
create policy acc_inventory_settings_select on public.acc_inventory_settings for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

revoke all on table public.acc_inventory_settings from authenticated;
grant select on table public.acc_inventory_settings to authenticated;

create or replace function public.acc_save_inventory_settings(
  input_allow_negative_stock boolean,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  previous boolean;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select allow_negative_stock into previous from public.acc_inventory_settings
  where company_id = active_company_id and organization_id = org_id;

  insert into public.acc_inventory_settings (company_id, organization_id, allow_negative_stock, updated_at, updated_by)
  values (active_company_id, org_id, coalesce(input_allow_negative_stock, false), now(), auth.uid())
  on conflict (company_id) do update
    set allow_negative_stock = excluded.allow_negative_stock,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  perform public.acc_write_audit(
    org_id, 'inventory_settings', active_company_id, 'update',
    jsonb_build_object('allow_negative_stock', coalesce(previous, false)),
    jsonb_build_object('allow_negative_stock', coalesce(input_allow_negative_stock, false)),
    null, active_company_id
  );
end;
$$;

create or replace function public.acc_set_item_opening_rate(
  input_item_id uuid,
  input_opening_rate numeric,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  item public.acc_items%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_opening_rate is not null and input_opening_rate < 0 then
    raise exception 'Opening rate cannot be negative';
  end if;
  select * into item from public.acc_items
  where id = input_item_id and organization_id = org_id and company_id = active_company_id;
  if item.id is null then raise exception 'Item not found'; end if;
  if item.item_type <> 'product' then raise exception 'Opening rate applies to products only'; end if;
  if item.opening_rate is not distinct from round(input_opening_rate, 2) then return; end if;

  update public.acc_items set opening_rate = round(input_opening_rate, 2), updated_at = now()
  where id = item.id;

  perform public.acc_write_audit(
    org_id, 'item', item.id, 'update',
    jsonb_build_object('opening_rate', item.opening_rate),
    jsonb_build_object('opening_rate', round(input_opening_rate, 2)),
    null, active_company_id
  );
end;
$$;

-- Lowest running balance from input_on_date onwards must stay >= 0 after applying input_delta.
create or replace function public.acc_assert_stock_available_on(
  input_org_id uuid,
  input_company_id uuid,
  input_item_id uuid,
  input_delta numeric,
  input_on_date date
) returns void language plpgsql security definer set search_path = public as $$
declare
  allow_negative boolean;
  has_movements boolean;
  on_date_balance numeric;
  later_low numeric;
  later_low_date date;
begin
  if coalesce(input_delta, 0) >= 0 then return; end if;

  select s.allow_negative_stock into allow_negative from public.acc_inventory_settings s
  where s.company_id = input_company_id and s.organization_id = input_org_id;
  if coalesce(allow_negative, false) then return; end if;

  select exists (
    select 1 from public.acc_stock_movements m
    where m.organization_id = input_org_id and m.company_id = input_company_id and m.item_id = input_item_id
  ) into has_movements;

  if not has_movements or input_on_date is null then
    on_date_balance := public.acc_item_on_hand(input_org_id, input_company_id, input_item_id);
    if round(on_date_balance + input_delta, 3) < 0 then
      raise exception 'Insufficient stock. On hand % · required %', on_date_balance, abs(input_delta);
    end if;
    return;
  end if;

  select coalesce(sum(m.quantity_delta), 0) into on_date_balance
  from public.acc_stock_movements m
  where m.organization_id = input_org_id and m.company_id = input_company_id
    and m.item_id = input_item_id and m.movement_date <= input_on_date;

  if round(on_date_balance + input_delta, 3) < 0 then
    raise exception 'Insufficient stock on %. On hand % · required %',
      to_char(input_on_date, 'DD Mon YYYY'), on_date_balance, abs(input_delta);
  end if;

  select r.movement_date, r.balance into later_low_date, later_low
  from (
    select d.movement_date, on_date_balance + sum(d.qty) over (order by d.movement_date) as balance
    from (
      select m.movement_date, sum(m.quantity_delta) as qty
      from public.acc_stock_movements m
      where m.organization_id = input_org_id and m.company_id = input_company_id
        and m.item_id = input_item_id and m.movement_date > input_on_date
      group by m.movement_date
    ) d
  ) r
  order by r.balance asc, r.movement_date asc
  limit 1;

  if later_low is not null and round(later_low + input_delta, 3) < 0 then
    raise exception 'Insufficient stock: this entry would make stock negative on % (balance % · required %)',
      to_char(later_low_date, 'DD Mon YYYY'), later_low, abs(input_delta);
  end if;
end;
$$;

-- Callers without a date keep the old total-on-hand check (and honour allow-negative).
create or replace function public.acc_assert_stock_available(
  input_org_id uuid,
  input_company_id uuid,
  input_item_id uuid,
  input_delta numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.acc_assert_stock_available_on(input_org_id, input_company_id, input_item_id, input_delta, null);
end;
$$;

create or replace function public.acc_apply_voucher_item_lines(
  input_org_id uuid,
  input_company_id uuid,
  input_voucher public.acc_vouchers,
  input_lines jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  line jsonb;
  idx integer := 0;
  item public.acc_items%rowtype;
  qty numeric(18,3);
  rate numeric(18,2);
  amount numeric(18,2);
  discount numeric(18,2);
  line_id uuid;
  delta numeric(18,3);
  reason_text text;
  stock_sign integer;
  v_item_type text;
  v_item_name text;
  v_item_sku text;
  v_unit text;
begin
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) = 0 then
    raise exception 'At least one item line is required';
  end if;
  if input_voucher.voucher_type not in ('sales', 'purchase', 'credit_note', 'debit_note') then
    raise exception 'Item lines are only supported on sales, purchase, credit note and debit note vouchers';
  end if;
  if exists (
    select 1 from public.acc_voucher_item_lines
    where voucher_id = input_voucher.id and organization_id = input_org_id and company_id = input_company_id
  ) then
    raise exception 'Item lines already exist for this voucher';
  end if;

  reason_text := case input_voucher.voucher_type
    when 'sales' then 'sale'
    when 'purchase' then 'purchase'
    when 'credit_note' then 'sales_return'
    else 'purchase_return'
  end;
  stock_sign := case when input_voucher.voucher_type in ('purchase', 'credit_note') then 1 else -1 end;

  for line in select value from jsonb_array_elements(input_lines)
  loop
    idx := idx + 1;
    qty := coalesce((line->>'quantity')::numeric, 0);
    rate := coalesce((line->>'rate')::numeric, 0);
    amount := coalesce((line->>'amount')::numeric, round(qty * rate, 2));
    discount := coalesce((line->>'discount_amount')::numeric, 0);
    if qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if rate < 0 or amount < 0 then raise exception 'Item rate/amount cannot be negative'; end if;
    if discount < 0 then raise exception 'Discount cannot be negative on line %', idx; end if;
    if discount > amount then raise exception 'Discount cannot exceed the line amount on line %', idx; end if;

    item := null;
    if nullif(line->>'item_id', '') is not null then
      select * into item from public.acc_items
      where id = (line->>'item_id')::uuid
        and organization_id = input_org_id and company_id = input_company_id;
      if item.id is null then raise exception 'Item not found on line %', idx; end if;
      if item.is_active is false then raise exception 'Inactive item cannot be used on new vouchers'; end if;
    end if;

    v_item_name := coalesce(nullif(trim(coalesce(item.name, '')), ''), nullif(trim(coalesce(line->>'item_name', '')), ''));
    if v_item_name is null then
      raise exception 'Item name is required on line %', idx;
    end if;
    v_item_sku := coalesce(nullif(trim(coalesce(item.sku, '')), ''), nullif(trim(coalesce(line->>'item_sku', '')), ''));
    v_item_type := coalesce(
      nullif(trim(coalesce(item.item_type, '')), ''),
      nullif(trim(coalesce(line->>'item_type', '')), ''),
      'product'
    );
    v_unit := coalesce(
      nullif(trim(coalesce(line->>'unit', '')), ''),
      nullif(trim(coalesce(item.unit, '')), ''),
      'Nos'
    );

    insert into public.acc_voucher_item_lines (
      organization_id, company_id, voucher_id, line_no, item_id, item_name, item_sku, item_type, unit,
      quantity, rate, amount, discount_amount, gst_rate, hsn_sac, taxable_amount, cgst_amount, sgst_amount, igst_amount
    ) values (
      input_org_id, input_company_id, input_voucher.id, idx,
      item.id,
      v_item_name,
      v_item_sku,
      v_item_type,
      v_unit,
      qty, rate, amount, discount,
      coalesce((line->>'gst_rate')::numeric, item.gst_rate, 0),
      coalesce(nullif(trim(coalesce(line->>'hsn_sac', '')), ''), item.hsn_sac),
      coalesce((line->>'taxable_amount')::numeric, amount - discount),
      coalesce((line->>'cgst_amount')::numeric, 0),
      coalesce((line->>'sgst_amount')::numeric, 0),
      coalesce((line->>'igst_amount')::numeric, 0)
    ) returning id into line_id;

    if v_item_type = 'product' and item.id is not null then
      delta := stock_sign * qty;
      perform public.acc_assert_stock_available_on(input_org_id, input_company_id, item.id, delta, input_voucher.voucher_date);
      insert into public.acc_stock_movements (
        organization_id, company_id, item_id, movement_date, quantity_delta, reason, note,
        voucher_id, voucher_item_line_id, voucher_number, created_by
      ) values (
        input_org_id, input_company_id, item.id, input_voucher.voucher_date, delta, reason_text, null,
        input_voucher.id, line_id, input_voucher.voucher_number, auth.uid()
      );
    end if;
  end loop;
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

  perform public.acc_assert_stock_available_on(org_id, active_company_id, item.id, input_quantity_delta, input_date);

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

revoke all on function public.acc_assert_stock_available_on(uuid, uuid, uuid, numeric, date) from public, anon, authenticated;
grant execute on function public.acc_save_inventory_settings(boolean, uuid) to authenticated;
grant execute on function public.acc_set_item_opening_rate(uuid, numeric, uuid) to authenticated;
grant execute on function public.acc_adjust_stock(uuid, date, numeric, text, uuid) to authenticated;

notify pgrst, 'reload schema';
