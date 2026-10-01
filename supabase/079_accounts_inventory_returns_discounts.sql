-- 079 Inventory Phase 1, slice 1: returns move stock and item lines carry a discount.
-- Apply after 078_accounts_crm_pipeline_hardening.sql.
--   * Credit notes (sales returns) with item lines bring stock back in.
--   * Debit notes (purchase returns) with item lines take stock out (stock-checked).
--   * acc_voucher_item_lines.discount_amount: amount stays quantity x rate; taxable_amount is net of discount.
--   * The same item may appear on several lines of one voucher.
-- Double-entry posting is unchanged.

alter table public.acc_voucher_item_lines
  add column if not exists discount_amount numeric(18,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'acc_voucher_item_lines_discount_check'
  ) then
    alter table public.acc_voucher_item_lines
      add constraint acc_voucher_item_lines_discount_check
      check (discount_amount >= 0 and discount_amount <= amount);
  end if;
end $$;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.acc_stock_movements'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%reason%'
  loop
    execute format('alter table public.acc_stock_movements drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.acc_stock_movements
  add constraint acc_stock_movements_reason_check
  check (reason in ('opening', 'purchase', 'sale', 'sales_return', 'purchase_return', 'adjustment', 'reversal'));

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
      and voucher_id = voucher.id and reason in ('sale', 'purchase', 'sales_return', 'purchase_return')
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
      -mov.quantity_delta, 'reversal', 'Reversal of ' || replace(mov.reason, '_', ' '),
      voucher.id, mov.voucher_item_line_id, voucher.voucher_number, auth.uid()
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
