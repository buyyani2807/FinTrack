-- 076 Fix ambiguous item_type in acc_apply_voucher_item_lines (072).
-- Apply after 075_accounts_wave1_invites_recurring.sql.
-- Symptom when posting sales/purchases with item lines:
--   ERROR: column reference "item_type" is ambiguous

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
  line_id uuid;
  delta numeric(18,3);
  reason_text text;
  v_item_type text;
  v_item_name text;
  v_item_sku text;
  v_unit text;
begin
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) = 0 then
    raise exception 'At least one item line is required';
  end if;
  if input_voucher.voucher_type not in ('sales', 'purchase') then
    raise exception 'Item lines are only supported on sales and purchase vouchers';
  end if;
  if exists (
    select 1 from public.acc_voucher_item_lines
    where voucher_id = input_voucher.id and organization_id = input_org_id and company_id = input_company_id
  ) then
    raise exception 'Item lines already exist for this voucher';
  end if;

  reason_text := case when input_voucher.voucher_type = 'sales' then 'sale' else 'purchase' end;

  for line in select value from jsonb_array_elements(input_lines)
  loop
    idx := idx + 1;
    qty := coalesce((line->>'quantity')::numeric, 0);
    rate := coalesce((line->>'rate')::numeric, 0);
    amount := coalesce((line->>'amount')::numeric, round(qty * rate, 2));
    if qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if rate < 0 or amount < 0 then raise exception 'Item rate/amount cannot be negative'; end if;

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
      quantity, rate, amount, gst_rate, hsn_sac, taxable_amount, cgst_amount, sgst_amount, igst_amount
    ) values (
      input_org_id, input_company_id, input_voucher.id, idx,
      item.id,
      v_item_name,
      v_item_sku,
      v_item_type,
      v_unit,
      qty, rate, amount,
      coalesce((line->>'gst_rate')::numeric, item.gst_rate, 0),
      coalesce(nullif(trim(coalesce(line->>'hsn_sac', '')), ''), item.hsn_sac),
      coalesce((line->>'taxable_amount')::numeric, amount),
      coalesce((line->>'cgst_amount')::numeric, 0),
      coalesce((line->>'sgst_amount')::numeric, 0),
      coalesce((line->>'igst_amount')::numeric, 0)
    ) returning id into line_id;

    if v_item_type = 'product' and item.id is not null then
      delta := case when input_voucher.voucher_type = 'sales' then -qty else qty end;
      perform public.acc_assert_stock_available(input_org_id, input_company_id, item.id, delta);
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
