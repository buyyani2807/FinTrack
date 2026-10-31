-- Physical count / stock adjust: keep opening_stock in on-hand when no opening movement exists.
-- Apply after 113. Safe to re-run.
--
-- Bug: acc_item_on_hand fell back to items.opening_stock only when there were zero movements.
-- After the first adjustment, sum(movements) ignored opening_stock, so book qty jumped
-- (e.g. opening 900 + adjust -899 became -899 instead of 1). The physical count screen
-- looked like Post adjustments did nothing or made stock worse.

create or replace function public.acc_item_on_hand(
  input_org_id uuid,
  input_company_id uuid,
  input_item_id uuid
) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((
    select sum(m.quantity_delta)
    from public.acc_stock_movements m
    where m.organization_id = input_org_id
      and m.company_id = input_company_id
      and m.item_id = input_item_id
  ), 0) + case
    when exists (
      select 1 from public.acc_stock_movements m
      where m.organization_id = input_org_id
        and m.company_id = input_company_id
        and m.item_id = input_item_id
        and m.reason = 'opening'
    ) then 0
    else coalesce((
      select i.opening_stock from public.acc_items i
      where i.id = input_item_id
        and i.organization_id = input_org_id
        and i.company_id = input_company_id
    ), 0)
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
  has_opening boolean;
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

  -- Materialize opening_stock as a movement once, so later adjustments keep the same book qty the UI shows.
  select exists (
    select 1 from public.acc_stock_movements m
    where m.organization_id = org_id and m.company_id = active_company_id
      and m.item_id = item.id and m.reason = 'opening'
  ) into has_opening;
  if not has_opening and coalesce(item.opening_stock, 0) <> 0 then
    insert into public.acc_stock_movements (
      organization_id, company_id, item_id, movement_date, quantity_delta, reason, note, created_by
    ) values (
      org_id, active_company_id, item.id,
      coalesce(item.opening_stock_date, input_date, current_date),
      item.opening_stock, 'opening', 'Opening stock', auth.uid()
    );
  end if;

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

grant execute on function public.acc_item_on_hand(uuid, uuid, uuid) to authenticated;
grant execute on function public.acc_adjust_stock(uuid, date, numeric, text, uuid) to authenticated;

notify pgrst, 'reload schema';
