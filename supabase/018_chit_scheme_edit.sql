-- Safe Chit Fund scheme editing. Run after 017_chit_fund_access.sql.
create or replace function public.chit_update_scheme(
  input_scheme_id uuid, scheme_name text, scheme_start_date date,
  scheme_commission_percent numeric, scheme_min_bid_percent numeric,
  scheme_max_bid_percent numeric, scheme_late_penalty_amount numeric,
  scheme_security_deposit_amount numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare current_status text;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can edit Chit Fund schemes'; end if;
  select status into current_status from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if current_status is null then raise exception 'Scheme not found'; end if;
  if current_status <> 'draft' then raise exception 'Only draft schemes can be edited'; end if;
  if nullif(trim(scheme_name), '') is null or scheme_commission_percent < 0 or scheme_commission_percent > 7 then raise exception 'Invalid scheme details'; end if;
  if scheme_min_bid_percent < 0 or scheme_max_bid_percent > 100 or scheme_min_bid_percent > scheme_max_bid_percent then raise exception 'Invalid bid limits'; end if;
  if scheme_late_penalty_amount < 0 or scheme_security_deposit_amount < 0 then raise exception 'Amounts cannot be negative'; end if;
  update public.chit_schemes set name = trim(scheme_name), start_date = scheme_start_date, commission_percent = scheme_commission_percent,
    min_bid_percent = scheme_min_bid_percent, max_bid_percent = scheme_max_bid_percent,
    late_penalty_amount = scheme_late_penalty_amount, security_deposit_amount = scheme_security_deposit_amount, updated_at = now()
  where id = input_scheme_id;
end;
$$;
grant execute on function public.chit_update_scheme(uuid,text,date,numeric,numeric,numeric,numeric,numeric) to authenticated;
