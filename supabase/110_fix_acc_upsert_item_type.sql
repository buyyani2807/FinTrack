-- Fix ambiguous item_type in acc_upsert_item (067).
-- Symptom when editing an inventory item:
--   ERROR: column reference "item_type" is ambiguous
-- Cause: local variable `item_type` collided with column `acc_items.item_type`
-- in `update … set item_type = item_type`.
-- Apply after 109. Safe to re-run.

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
  v_item_type text;
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
  v_item_type := coalesce(nullif(trim(coalesce(input_item_type, '')), ''), 'product');
  if nm is null then raise exception 'Item name is required'; end if;
  if sku_text is null then raise exception 'Item code / SKU is required'; end if;
  if v_item_type not in ('product', 'service') then raise exception 'Item type must be product or service'; end if;
  if coalesce(input_selling_price, 0) < 0 or coalesce(input_purchase_price, 0) < 0 then
    raise exception 'Prices cannot be negative';
  end if;
  if coalesce(input_gst_rate, 0) < 0 or coalesce(input_gst_rate, 0) > 100 then
    raise exception 'GST rate must be between 0 and 100';
  end if;
  opening := case when v_item_type = 'service' then 0 else coalesce(input_opening_stock, 0) end;
  if opening < 0 then raise exception 'Opening stock cannot be negative'; end if;
  opening_date := case when v_item_type = 'service' then null else input_opening_stock_date end;

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
      org_id, active_company_id, v_item_type, nm, sku_text, input_category_id, unit_text,
      nullif(trim(coalesce(input_description, '')), ''),
      coalesce(input_selling_price, 0), coalesce(input_purchase_price, 0), coalesce(input_gst_rate, 0),
      nullif(trim(coalesce(input_hsn_sac, '')), ''), opening, opening_date,
      coalesce(input_reorder_level, 0), coalesce(input_is_active, true)
    ) returning id into new_id;

    if v_item_type = 'product' and opening <> 0 then
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
    if used and existing.item_type <> v_item_type then
      raise exception 'Item type cannot be changed after transactions exist.';
    end if;
    if used and existing.opening_stock <> opening then
      raise exception 'Opening stock cannot be changed after stock movements exist. Use Stock Adjustment.';
    end if;

    update public.acc_items set
      item_type = v_item_type,
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

    if not used and v_item_type = 'product' then
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
    null, jsonb_build_object('name', nm, 'sku', sku_text, 'item_type', v_item_type), null, active_company_id
  );
  return new_id;
end;
$$;
