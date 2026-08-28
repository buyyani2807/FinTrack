-- Fix Fixed Chit manager commission when a percentage (e.g. 5) was stored as rupees (5 instead of 5000).
-- Run after 028_fixed_chit.sql.

create or replace function public.chit_normalize_fixed_commission(
  scheme_chit_value numeric,
  stored_amount numeric,
  scheme_commission_percent numeric default null
) returns numeric language plpgsql immutable set search_path = public
as $$
declare commission_amount numeric;
begin
  if scheme_commission_percent is not null and scheme_commission_percent >= 0 then
    if scheme_commission_percent > 100 then
      raise exception 'Manager commission percentage is invalid';
    end if;
    return round(scheme_chit_value * scheme_commission_percent / 100, 2);
  end if;
  commission_amount := round(coalesce(stored_amount, 0), 2);
  if commission_amount > 0
    and commission_amount <= 100
    and commission_amount < (scheme_chit_value / 1000)
    and round(scheme_chit_value * commission_amount / 100, 2) >= 100 then
    return round(scheme_chit_value * commission_amount / 100, 2);
  end if;
  return commission_amount;
end;
$$;

with repaired as (
  update public.chit_schemes s
  set fixed_commission_amount = public.chit_normalize_fixed_commission(s.chit_value, s.fixed_commission_amount),
      updated_at = now()
  where s.chit_type = 'fixed'
    and s.fixed_commission_amount is not null
    and s.fixed_commission_amount <> public.chit_normalize_fixed_commission(s.chit_value, s.fixed_commission_amount)
  returning s.id, s.fixed_commission_amount
)
update public.fixed_chit_lifts l
set manager_commission = r.fixed_commission_amount,
    updated_at = now()
from repaired r
where l.scheme_id = r.id
  and l.manager_commission <> r.fixed_commission_amount;

create or replace function public.chit_create_fixed_scheme(
  scheme_name text, scheme_chit_value numeric, scheme_duration_months integer,
  scheme_member_count integer, scheme_installment_amount numeric,
  scheme_commission_amount numeric, scheme_initial_lift_amount numeric,
  scheme_monthly_increment numeric, scheme_start_date date,
  scheme_late_penalty_amount numeric default 0,
  scheme_security_deposit_amount numeric default 0,
  scheme_commission_percent numeric default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; scheme_id uuid; month_no integer; monthly_payment numeric; commission_amount numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund schemes'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  if nullif(trim(scheme_name), '') is null then raise exception 'Scheme name is required'; end if;
  if scheme_chit_value <= 0 or scheme_duration_months <= 0 or scheme_member_count <= 0 or scheme_installment_amount <= 0 then
    raise exception 'Scheme amounts and counts must be positive';
  end if;
  if scheme_duration_months > scheme_member_count then raise exception 'Fixed Chit duration cannot exceed member count'; end if;
  if round(scheme_installment_amount * scheme_member_count, 2) <> round(scheme_chit_value, 2) then
    raise exception 'Monthly contribution multiplied by member count must equal chit value';
  end if;
  commission_amount := public.chit_normalize_fixed_commission(
    scheme_chit_value, scheme_commission_amount, scheme_commission_percent
  );
  if commission_amount < 0 or scheme_initial_lift_amount < 0 or scheme_monthly_increment < 0 then
    raise exception 'Fixed Chit amounts cannot be negative';
  end if;
  if scheme_late_penalty_amount < 0 or scheme_security_deposit_amount < 0 then raise exception 'Amounts cannot be negative'; end if;
  monthly_payment := round(scheme_installment_amount + scheme_monthly_increment, 2);
  insert into public.chit_schemes(
    organization_id, name, chit_type, chit_value, duration_months, member_count,
    installment_amount, commission_percent, fixed_commission_amount,
    fixed_initial_lift_amount, fixed_monthly_increment, start_date,
    min_bid_percent, max_bid_percent, late_penalty_amount,
    security_deposit_amount, created_by
  ) values (
    org_id, trim(scheme_name), 'fixed', round(scheme_chit_value, 2),
    scheme_duration_months, scheme_member_count, round(scheme_installment_amount, 2),
    coalesce(scheme_commission_percent, 0), commission_amount, round(scheme_initial_lift_amount, 2),
    round(scheme_monthly_increment, 2), scheme_start_date, 0, 100,
    scheme_late_penalty_amount, scheme_security_deposit_amount, auth.uid()
  ) returning id into scheme_id;
  for month_no in 1..scheme_duration_months loop
    insert into public.fixed_chit_lifts(
      organization_id, scheme_id, month_number, lift_amount,
      manager_commission, monthly_payment
    ) values (
      org_id, scheme_id, month_no,
      round(scheme_initial_lift_amount + ((month_no - 1) * scheme_monthly_increment), 2),
      commission_amount, monthly_payment
    );
  end loop;
  return scheme_id;
end;
$$;
grant execute on function public.chit_create_fixed_scheme(text,numeric,integer,integer,numeric,numeric,numeric,numeric,date,numeric,numeric,numeric) to authenticated;

create or replace function public.chit_update_fixed_scheme(
  input_scheme_id uuid, scheme_name text, scheme_chit_value numeric,
  scheme_duration_months integer, scheme_member_count integer,
  scheme_installment_amount numeric, scheme_commission_amount numeric,
  scheme_initial_lift_amount numeric, scheme_monthly_increment numeric,
  scheme_start_date date, scheme_late_penalty_amount numeric,
  scheme_security_deposit_amount numeric,
  scheme_commission_percent numeric default null
) returns void language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; enrolled_count integer; month_no integer; monthly_payment numeric; commission_amount numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can edit Chit Fund schemes'; end if;
  select * into s from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if s.id is null then raise exception 'Scheme not found'; end if;
  if s.chit_type <> 'fixed' then raise exception 'This is not a Fixed Chit'; end if;
  if s.status <> 'draft' then raise exception 'Only draft schemes can be edited'; end if;
  if exists (select 1 from public.fixed_chit_lifts where scheme_id = s.id and status = 'completed') then
    raise exception 'A Fixed Chit with completed lifts cannot be edited';
  end if;
  select count(*) into enrolled_count from public.chit_enrollments where scheme_id = s.id and status = 'active';
  if scheme_member_count < enrolled_count then raise exception 'Member count cannot be lower than current enrolled members'; end if;
  if scheme_duration_months > scheme_member_count then raise exception 'Fixed Chit duration cannot exceed member count'; end if;
  if nullif(trim(scheme_name), '') is null or scheme_chit_value <= 0 or scheme_duration_months <= 0 or scheme_member_count <= 0 or scheme_installment_amount <= 0 then
    raise exception 'Invalid scheme details';
  end if;
  if round(scheme_installment_amount * scheme_member_count, 2) <> round(scheme_chit_value, 2) then
    raise exception 'Monthly contribution multiplied by member count must equal chit value';
  end if;
  commission_amount := public.chit_normalize_fixed_commission(
    scheme_chit_value, scheme_commission_amount, scheme_commission_percent
  );
  if commission_amount < 0 or scheme_initial_lift_amount < 0 or scheme_monthly_increment < 0
    or scheme_late_penalty_amount < 0 or scheme_security_deposit_amount < 0 then raise exception 'Amounts cannot be negative'; end if;
  update public.chit_schemes set
    name = trim(scheme_name), chit_value = round(scheme_chit_value, 2),
    duration_months = scheme_duration_months, member_count = scheme_member_count,
    installment_amount = round(scheme_installment_amount, 2),
    commission_percent = coalesce(scheme_commission_percent, 0),
    fixed_commission_amount = commission_amount,
    fixed_initial_lift_amount = round(scheme_initial_lift_amount, 2),
    fixed_monthly_increment = round(scheme_monthly_increment, 2),
    start_date = scheme_start_date, late_penalty_amount = scheme_late_penalty_amount,
    security_deposit_amount = scheme_security_deposit_amount, updated_at = now()
  where id = s.id;
  delete from public.fixed_chit_lifts where scheme_id = s.id;
  monthly_payment := round(scheme_installment_amount + scheme_monthly_increment, 2);
  for month_no in 1..scheme_duration_months loop
    insert into public.fixed_chit_lifts(
      organization_id, scheme_id, month_number, lift_amount,
      manager_commission, monthly_payment
    ) values (
      s.organization_id, s.id, month_no,
      round(scheme_initial_lift_amount + ((month_no - 1) * scheme_monthly_increment), 2),
      commission_amount, monthly_payment
    );
  end loop;
end;
$$;
grant execute on function public.chit_update_fixed_scheme(uuid,text,numeric,integer,integer,numeric,numeric,numeric,numeric,date,numeric,numeric,numeric) to authenticated;
