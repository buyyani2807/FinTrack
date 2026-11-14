-- 146: Reject a chit scheme payout band that no live bid could ever satisfy.
-- Safe to re-run. Apply any time after 051_ft035_ft037_live_bid_and_chit_payout_mode.sql.
--
-- P3-6: chit_create_scheme/chit_update_scheme only checked min<=max and 0<=max<=100.
-- A scheme could be saved with min/max both well below 70% (e.g. 5%-30%), but
-- chit_validate_live_bid_amount() (051) caps every live bid at 30% of the chit
-- value, so the payout (chit_value - bid) is always >= 70%. Such a scheme can
-- never clear a live auction bid; every bid fails with "payout outside the
-- scheme payout limits". This adds the same overlap check used by the live-bid
-- validator to both the create and the (draft-only) edit RPC, so the mistake
-- is caught at setup instead of at every subsequent bid.
--
-- Achievable payout band for a live bid is [70, 100 - commission_percent)%
-- (bid must land in (commission_percent, 30] of the chit value). The scheme's
-- configured [min_bid_percent, max_bid_percent] must overlap that band.

create or replace function public.chit_create_scheme(
  scheme_name text, scheme_chit_value numeric, scheme_duration_months integer,
  scheme_member_count integer, scheme_installment_amount numeric,
  scheme_commission_percent numeric, scheme_start_date date,
  scheme_min_bid_percent numeric default 70, scheme_max_bid_percent numeric default 95,
  scheme_late_penalty_amount numeric default 0, scheme_security_deposit_amount numeric default 0
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; scheme_id uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund schemes'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  if nullif(trim(scheme_name), '') is null then raise exception 'Scheme name is required'; end if;
  if scheme_chit_value <= 0 or scheme_duration_months <= 0 or scheme_member_count <= 0 or scheme_installment_amount <= 0 then raise exception 'Scheme amounts and counts must be positive'; end if;
  if round(scheme_installment_amount * scheme_member_count, 2) <> round(scheme_chit_value, 2) then raise exception 'Installment amount multiplied by member count must equal chit value'; end if;
  if scheme_commission_percent < 0 or scheme_commission_percent > 7 then raise exception 'Commission cannot exceed 7%%'; end if;
  if scheme_min_bid_percent < 0 or scheme_max_bid_percent > 100 or scheme_min_bid_percent > scheme_max_bid_percent then raise exception 'Invalid bid limits'; end if;
  if scheme_max_bid_percent < 70 or scheme_min_bid_percent > (100 - scheme_commission_percent) then
    raise exception 'Payout limits % to % leave no bid a live auction could ever place: a live bid always pays out between 70 and % percent of the chit value', scheme_min_bid_percent, scheme_max_bid_percent, round(100 - scheme_commission_percent, 2);
  end if;
  insert into public.chit_schemes(organization_id, name, chit_value, duration_months, member_count, installment_amount, commission_percent, start_date, min_bid_percent, max_bid_percent, late_penalty_amount, security_deposit_amount, created_by)
  values(org_id, trim(scheme_name), round(scheme_chit_value, 2), scheme_duration_months, scheme_member_count, round(scheme_installment_amount, 2), scheme_commission_percent, scheme_start_date, scheme_min_bid_percent, scheme_max_bid_percent, scheme_late_penalty_amount, scheme_security_deposit_amount, auth.uid()) returning id into scheme_id;
  return scheme_id;
end;
$$;
grant execute on function public.chit_create_scheme(text,numeric,integer,integer,numeric,numeric,date,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.chit_update_scheme(
  input_scheme_id uuid, scheme_name text, scheme_chit_value numeric,
  scheme_duration_months integer, scheme_member_count integer,
  scheme_installment_amount numeric, scheme_start_date date,
  scheme_commission_percent numeric, scheme_min_bid_percent numeric,
  scheme_max_bid_percent numeric, scheme_late_penalty_amount numeric,
  scheme_security_deposit_amount numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare current_status text; enrolled_count integer;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can edit Chit Fund schemes'; end if;
  select status into current_status from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if current_status is null then raise exception 'Scheme not found'; end if;
  if current_status <> 'draft' then raise exception 'Only draft schemes can be edited'; end if;
  select count(*) into enrolled_count from public.chit_enrollments where scheme_id = input_scheme_id and status = 'active';
  if scheme_member_count < enrolled_count then raise exception 'Member count cannot be lower than current enrolled members'; end if;
  if nullif(trim(scheme_name), '') is null or scheme_chit_value <= 0 or scheme_duration_months <= 0 or scheme_member_count <= 0 or scheme_installment_amount <= 0 then raise exception 'Invalid scheme details'; end if;
  if round(scheme_installment_amount * scheme_member_count, 2) <> round(scheme_chit_value, 2) then raise exception 'Installment amount multiplied by member count must equal chit value'; end if;
  if scheme_commission_percent < 0 or scheme_commission_percent > 7 then raise exception 'Commission cannot exceed 7%%'; end if;
  if scheme_min_bid_percent < 0 or scheme_max_bid_percent > 100 or scheme_min_bid_percent > scheme_max_bid_percent then raise exception 'Invalid bid limits'; end if;
  if scheme_max_bid_percent < 70 or scheme_min_bid_percent > (100 - scheme_commission_percent) then
    raise exception 'Payout limits % to % leave no bid a live auction could ever place: a live bid always pays out between 70 and % percent of the chit value', scheme_min_bid_percent, scheme_max_bid_percent, round(100 - scheme_commission_percent, 2);
  end if;
  if scheme_late_penalty_amount < 0 or scheme_security_deposit_amount < 0 then raise exception 'Amounts cannot be negative'; end if;
  update public.chit_schemes set name = trim(scheme_name), chit_value = round(scheme_chit_value, 2), duration_months = scheme_duration_months,
    member_count = scheme_member_count, installment_amount = round(scheme_installment_amount, 2), start_date = scheme_start_date,
    commission_percent = scheme_commission_percent, min_bid_percent = scheme_min_bid_percent, max_bid_percent = scheme_max_bid_percent,
    late_penalty_amount = scheme_late_penalty_amount, security_deposit_amount = scheme_security_deposit_amount, updated_at = now()
  where id = input_scheme_id;
end;
$$;
grant execute on function public.chit_update_scheme(uuid,text,numeric,integer,integer,numeric,date,numeric,numeric,numeric,numeric,numeric) to authenticated;
