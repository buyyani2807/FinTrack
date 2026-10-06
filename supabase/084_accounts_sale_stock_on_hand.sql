-- 084: sell when the stock shown on the sale form covers the quantity.
-- Apply after 083_accounts_cashbook_sync_match.sql.
-- The date check from 080 counted only movements on or before the invoice date.
-- Opening stock saved with a blank opening date is stored as current_date, so a
-- sale dated earlier (for example 30 Sep) was rejected while the item still
-- showed that stock. Availability is now the same total the sale screen shows.

create or replace function public.acc_assert_stock_available_on(
  input_org_id uuid,
  input_company_id uuid,
  input_item_id uuid,
  input_delta numeric,
  input_on_date date
) returns void language plpgsql security definer set search_path = public as $$
declare
  allow_negative boolean;
  on_hand numeric;
begin
  if coalesce(input_delta, 0) >= 0 then return; end if;

  select s.allow_negative_stock into allow_negative from public.acc_inventory_settings s
  where s.company_id = input_company_id and s.organization_id = input_org_id;
  if coalesce(allow_negative, false) then return; end if;

  on_hand := public.acc_item_on_hand(input_org_id, input_company_id, input_item_id);
  if round(on_hand + input_delta, 3) < 0 then
    raise exception 'Insufficient stock. On hand % · required %', on_hand, abs(input_delta);
  end if;
end;
$$;

notify pgrst, 'reload schema';
