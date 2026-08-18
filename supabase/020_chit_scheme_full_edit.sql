-- Extend draft scheme editing to include core scheme values.
-- Run after 019_chit_installment_corrections.sql.
-- Remove the earlier overload so PostgREST has one unambiguous RPC signature.
drop function if exists public.chit_update_scheme(uuid,text,date,numeric,numeric,numeric,numeric,numeric);

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
  if scheme_late_penalty_amount < 0 or scheme_security_deposit_amount < 0 then raise exception 'Amounts cannot be negative'; end if;
  update public.chit_schemes set name = trim(scheme_name), chit_value = round(scheme_chit_value, 2), duration_months = scheme_duration_months,
    member_count = scheme_member_count, installment_amount = round(scheme_installment_amount, 2), start_date = scheme_start_date,
    commission_percent = scheme_commission_percent, min_bid_percent = scheme_min_bid_percent, max_bid_percent = scheme_max_bid_percent,
    late_penalty_amount = scheme_late_penalty_amount, security_deposit_amount = scheme_security_deposit_amount, updated_at = now()
  where id = input_scheme_id;
end;
$$;
grant execute on function public.chit_update_scheme(uuid,text,numeric,integer,integer,numeric,date,numeric,numeric,numeric,numeric,numeric) to authenticated;
