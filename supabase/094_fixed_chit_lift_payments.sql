-- Finalizing a Fixed Chit lift must not insert a second payment row for a member and month.
-- Activation already builds one row per member per month. Rebuild that schedule instead.
-- Paste in the Supabase SQL editor after 093.

create or replace function public.chit_finalize_fixed_lift(
  input_scheme_id uuid, input_month_number integer,
  input_enrollment_id uuid, input_lift_date date,
  payout_mode public.payment_mode default 'cash',
  payout_cash_amount numeric default null,
  payout_upi_amount numeric default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; lift public.fixed_chit_lifts%rowtype;
  remaining integer;
  v_mode public.payment_mode; v_cash numeric; v_upi numeric; paid numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can finalize a Fixed Chit lift'; end if;
  perform pg_advisory_xact_lock(hashtext('fixed-chit-lift:' || input_scheme_id::text));
  select * into s from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if s.id is null then raise exception 'Scheme not found'; end if;
  if s.chit_type <> 'fixed' then raise exception 'This action is only for Fixed Chits'; end if;
  if s.status <> 'active' then raise exception 'Only active Fixed Chits can record lifts'; end if;
  if input_month_number < 1 or input_month_number > s.duration_months then raise exception 'Invalid lift month'; end if;
  if not exists (
    select 1 from public.chit_enrollments
    where id = input_enrollment_id and scheme_id = s.id and status = 'active'
  ) then raise exception 'Member is not active in this scheme'; end if;
  select * into lift from public.fixed_chit_lifts
    where scheme_id = s.id and month_number = input_month_number for update;
  if lift.id is null then raise exception 'Fixed Chit schedule month not found'; end if;
  if lift.status = 'completed' then raise exception 'This lift month is already finalized'; end if;
  if exists (
    select 1 from public.fixed_chit_lifts
    where scheme_id = s.id and enrollment_id = input_enrollment_id and status = 'completed'
  ) then raise exception 'This member has already lifted this Fixed Chit'; end if;
  paid := round(lift.lift_amount, 2);
  v_mode := coalesce(payout_mode, 'cash');
  if v_mode = 'bank' then v_mode := 'cash'; end if;
  if v_mode = 'upi' then
    v_cash := 0; v_upi := paid;
  elsif v_mode = 'cash_upi' then
    v_cash := round(coalesce(payout_cash_amount, 0), 2);
    v_upi := round(coalesce(payout_upi_amount, 0), 2);
    if v_cash <= 0 or v_upi <= 0 or round(v_cash + v_upi, 2) <> paid then
      raise exception 'Cash and UPI payout amounts must both be positive and equal the lift amount';
    end if;
  else
    v_mode := 'cash'; v_cash := paid; v_upi := 0;
  end if;
  remaining := s.duration_months - input_month_number;
  update public.fixed_chit_lifts set
    enrollment_id = input_enrollment_id, amount_paid_to_member = paid,
    remaining_months = remaining,
    total_remaining_payment = round(lift.monthly_payment * remaining, 2),
    lift_date = input_lift_date, status = 'completed',
    payout_mode = v_mode, payout_cash_amount = v_cash, payout_upi_amount = v_upi,
    finalized_at = now(), finalized_by = auth.uid(), updated_at = now()
  where id = lift.id;
  -- Updates later unpaid months to the post-lift amount. Paid rows and the member id stay.
  perform public.chit_build_member_payment_schedules(s.id);
  if not exists (select 1 from public.fixed_chit_lifts where scheme_id = s.id and status = 'pending' and id <> lift.id) then
    update public.chit_schemes set status = 'closed', updated_at = now() where id = s.id;
  end if;
  insert into public.chit_audit_log(organization_id, scheme_id, enrollment_id, action, after_data, actor_id)
  values(s.organization_id, s.id, input_enrollment_id, 'fixed_chit_lift_finalized',
    jsonb_build_object('month', input_month_number, 'lift_amount', paid, 'remaining_months', remaining, 'payout_mode', v_mode), auth.uid());
  return lift.id;
end;
$$;
grant execute on function public.chit_finalize_fixed_lift(uuid,integer,uuid,date,public.payment_mode,numeric,numeric) to authenticated;

create or replace function public.chit_finalize_predefined_month(
  input_schedule_id uuid, input_enrollment_id uuid, input_assigned_date date,
  payout_mode public.payment_mode default 'cash',
  payout_cash_amount numeric default null,
  payout_upi_amount numeric default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare item public.predefined_chit_schedule%rowtype; s public.chit_schemes%rowtype;
  v_mode public.payment_mode; v_cash numeric; v_upi numeric; paid numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can finalize a predefined Chit month'; end if;
  select * into item from public.predefined_chit_schedule where id = input_schedule_id for update;
  if item.id is null then raise exception 'Schedule month not found'; end if;
  perform pg_advisory_xact_lock(hashtext('predefined-chit:' || item.scheme_id::text));
  select * into s from public.chit_schemes where id = item.scheme_id and organization_id = public.current_organization_id();
  if s.id is null or s.chit_type <> 'fixed_predefined_bid' then raise exception 'Predefined Bid Chit not found'; end if;
  if s.status <> 'active' then raise exception 'Only active schemes can finalize a month'; end if;
  if item.status <> 'pending' then raise exception 'This month is already finalized'; end if;
  if not exists (select 1 from public.chit_enrollments where id = input_enrollment_id and scheme_id = s.id and status = 'active') then
    raise exception 'Member is not active in this scheme';
  end if;
  if exists (select 1 from public.predefined_chit_schedule where scheme_id = s.id and enrollment_id = input_enrollment_id and status = 'completed') then
    raise exception 'This member is already assigned to another month';
  end if;
  paid := round(item.net_receivable, 2);
  v_mode := coalesce(payout_mode, 'cash');
  if v_mode = 'bank' then v_mode := 'cash'; end if;
  if v_mode = 'upi' then
    v_cash := 0; v_upi := paid;
  elsif v_mode = 'cash_upi' then
    v_cash := round(coalesce(payout_cash_amount, 0), 2);
    v_upi := round(coalesce(payout_upi_amount, 0), 2);
    if v_cash <= 0 or v_upi <= 0 or round(v_cash + v_upi, 2) <> paid then
      raise exception 'Cash and UPI payout amounts must both be positive and equal the net receivable';
    end if;
  else
    v_mode := 'cash'; v_cash := paid; v_upi := 0;
  end if;
  update public.predefined_chit_schedule set enrollment_id = input_enrollment_id,
    assigned_date = input_assigned_date, status = 'completed',
    payout_mode = v_mode, payout_cash_amount = v_cash, payout_upi_amount = v_upi,
    finalized_at = now(), finalized_by = auth.uid(), updated_at = now()
  where id = item.id;
  perform public.chit_build_member_payment_schedules(s.id);
  if not exists (select 1 from public.predefined_chit_schedule where scheme_id = s.id and status = 'pending' and id <> item.id) then
    update public.chit_schemes set status = 'closed', updated_at = now() where id = s.id;
  end if;
  insert into public.chit_audit_log(organization_id, scheme_id, enrollment_id, action, after_data, actor_id)
  values(s.organization_id, s.id, input_enrollment_id, 'predefined_chit_month_finalized',
    jsonb_build_object('month', item.month_number, 'bid_amount', item.bid_amount,
      'manager_commission', item.manager_commission, 'net_receivable', item.net_receivable, 'payout_mode', v_mode), auth.uid());
  return item.id;
end;
$$;
grant execute on function public.chit_finalize_predefined_month(uuid,uuid,date,public.payment_mode,numeric,numeric) to authenticated;
