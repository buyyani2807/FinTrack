-- Build Fixed and Fixed Predefined Bid payment schedules for every enrolled member.
-- Previously, finalization created future rows only for the member receiving the chit.

alter table public.fixed_chit_payments
  drop constraint if exists fixed_chit_payments_lift_id_payment_month_key;
alter table public.fixed_chit_payments
  drop constraint if exists fixed_chit_payments_scheme_member_month_key;
alter table public.fixed_chit_payments
  add constraint fixed_chit_payments_scheme_member_month_key
  unique (scheme_id, enrollment_id, payment_month);

alter table public.predefined_chit_payments
  drop constraint if exists predefined_chit_payments_schedule_id_payment_month_key;
alter table public.predefined_chit_payments
  drop constraint if exists predefined_chit_payments_scheme_member_month_key;
alter table public.predefined_chit_payments
  add constraint predefined_chit_payments_scheme_member_month_key
  unique (scheme_id, enrollment_id, payment_month);

create or replace function public.chit_build_member_payment_schedules(input_scheme_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare scheme_type text;
begin
  select chit_type into scheme_type
  from public.chit_schemes
  where id = input_scheme_id;

  if scheme_type = 'fixed' then
    insert into public.fixed_chit_payments(
      organization_id, scheme_id, lift_id, enrollment_id,
      payment_month, amount_due, due_date
    )
    select
      s.organization_id, s.id, month_lift.id, enrollment.id,
      month_lift.month_number,
      case
        when member_lift.id is not null
          and member_lift.month_number < month_lift.month_number
          then member_lift.monthly_payment
        else s.installment_amount
      end,
      (s.start_date + ((month_lift.month_number - 1) || ' months')::interval)::date
    from public.chit_schemes s
    join public.chit_enrollments enrollment
      on enrollment.scheme_id = s.id and enrollment.status = 'active'
    join public.fixed_chit_lifts month_lift
      on month_lift.scheme_id = s.id
    left join public.fixed_chit_lifts member_lift
      on member_lift.scheme_id = s.id
      and member_lift.enrollment_id = enrollment.id
      and member_lift.status = 'completed'
    where s.id = input_scheme_id
      and s.chit_type = 'fixed'
    on conflict (scheme_id, enrollment_id, payment_month) do update
      set lift_id = excluded.lift_id,
          amount_due = case
            when fixed_chit_payments.amount_paid = 0 then excluded.amount_due
            else fixed_chit_payments.amount_due
          end,
          due_date = excluded.due_date,
          updated_at = now();
  elsif scheme_type = 'fixed_predefined_bid' then
    insert into public.predefined_chit_payments(
      organization_id, scheme_id, schedule_id, enrollment_id,
      payment_month, amount_due, due_date
    )
    select
      s.organization_id, s.id, schedule.id, enrollment.id,
      schedule.month_number, schedule.emi,
      (s.start_date + ((schedule.month_number - 1) || ' months')::interval)::date
    from public.chit_schemes s
    join public.chit_enrollments enrollment
      on enrollment.scheme_id = s.id and enrollment.status = 'active'
    join public.predefined_chit_schedule schedule
      on schedule.scheme_id = s.id
    where s.id = input_scheme_id
      and s.chit_type = 'fixed_predefined_bid'
      and schedule.emi > 0
    on conflict (scheme_id, enrollment_id, payment_month) do update
      set schedule_id = excluded.schedule_id,
          amount_due = case
            when predefined_chit_payments.amount_paid = 0 then excluded.amount_due
            else predefined_chit_payments.amount_due
          end,
          due_date = excluded.due_date,
          updated_at = now();
  end if;
end;
$$;
revoke execute on function public.chit_build_member_payment_schedules(uuid)
  from public, anon, authenticated;

create or replace function public.chit_activate_scheme(input_scheme_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare configured_members integer; enrolled_members integer; current_status text;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can activate a Chit Fund scheme'; end if;
  select member_count, status into configured_members, current_status
  from public.chit_schemes
  where id = input_scheme_id and organization_id = public.current_organization_id();
  if configured_members is null then raise exception 'Scheme not found'; end if;
  if current_status <> 'draft' then raise exception 'Only draft schemes can be activated'; end if;
  select count(*) into enrolled_members
  from public.chit_enrollments
  where scheme_id = input_scheme_id and status = 'active';
  if enrolled_members <> configured_members then
    raise exception 'Scheme requires exactly its configured member count before activation';
  end if;
  update public.chit_schemes
  set status = 'active', updated_at = now()
  where id = input_scheme_id;
  perform public.chit_build_member_payment_schedules(input_scheme_id);
end;
$$;
grant execute on function public.chit_activate_scheme(uuid) to authenticated;

create or replace function public.chit_finalize_fixed_lift(
  input_scheme_id uuid, input_month_number integer,
  input_enrollment_id uuid, input_lift_date date
) returns uuid language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; lift public.fixed_chit_lifts%rowtype;
  remaining integer;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can finalize a Fixed Chit lift'; end if;
  perform pg_advisory_xact_lock(hashtext('fixed-chit-lift:' || input_scheme_id::text));
  select * into s from public.chit_schemes
  where id = input_scheme_id and organization_id = public.current_organization_id();
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

  remaining := s.duration_months - input_month_number;
  update public.fixed_chit_lifts set
    enrollment_id = input_enrollment_id, amount_paid_to_member = lift.lift_amount,
    remaining_months = remaining,
    total_remaining_payment = round(lift.monthly_payment * remaining, 2),
    lift_date = input_lift_date, status = 'completed',
    finalized_at = now(), finalized_by = auth.uid(), updated_at = now()
  where id = lift.id;

  perform public.chit_build_member_payment_schedules(s.id);

  if not exists (
    select 1 from public.fixed_chit_lifts
    where scheme_id = s.id and status = 'pending' and id <> lift.id
  ) then
    update public.chit_schemes set status = 'closed', updated_at = now() where id = s.id;
  end if;
  insert into public.chit_audit_log(
    organization_id, scheme_id, enrollment_id, action, after_data, actor_id
  ) values (
    s.organization_id, s.id, input_enrollment_id, 'fixed_chit_lift_finalized',
    jsonb_build_object(
      'month', input_month_number, 'lift_amount', lift.lift_amount,
      'remaining_months', remaining
    ), auth.uid()
  );
  return lift.id;
end;
$$;
grant execute on function public.chit_finalize_fixed_lift(uuid,integer,uuid,date) to authenticated;

create or replace function public.chit_finalize_predefined_month(
  input_schedule_id uuid, input_enrollment_id uuid, input_assigned_date date
) returns uuid language plpgsql security definer set search_path = public
as $$
declare item public.predefined_chit_schedule%rowtype; s public.chit_schemes%rowtype;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can finalize a predefined Chit month'; end if;
  select * into item from public.predefined_chit_schedule
  where id = input_schedule_id for update;
  if item.id is null then raise exception 'Schedule month not found'; end if;
  perform pg_advisory_xact_lock(hashtext('predefined-chit:' || item.scheme_id::text));
  select * into s from public.chit_schemes
  where id = item.scheme_id and organization_id = public.current_organization_id();
  if s.id is null or s.chit_type <> 'fixed_predefined_bid' then
    raise exception 'Predefined Bid Chit not found';
  end if;
  if s.status <> 'active' then raise exception 'Only active schemes can finalize a month'; end if;
  if item.status <> 'pending' then raise exception 'This month is already finalized'; end if;
  if not exists (
    select 1 from public.chit_enrollments
    where id = input_enrollment_id and scheme_id = s.id and status = 'active'
  ) then raise exception 'Member is not active in this scheme'; end if;
  if exists (
    select 1 from public.predefined_chit_schedule
    where scheme_id = s.id and enrollment_id = input_enrollment_id and status = 'completed'
  ) then raise exception 'This member is already assigned to another month'; end if;

  update public.predefined_chit_schedule set
    enrollment_id = input_enrollment_id, assigned_date = input_assigned_date,
    status = 'completed', finalized_at = now(), finalized_by = auth.uid(),
    updated_at = now()
  where id = item.id;

  perform public.chit_build_member_payment_schedules(s.id);

  if not exists (
    select 1 from public.predefined_chit_schedule
    where scheme_id = s.id and status = 'pending' and id <> item.id
  ) then
    update public.chit_schemes set status = 'closed', updated_at = now() where id = s.id;
  end if;
  insert into public.chit_audit_log(
    organization_id, scheme_id, enrollment_id, action, after_data, actor_id
  ) values (
    s.organization_id, s.id, input_enrollment_id, 'predefined_chit_month_finalized',
    jsonb_build_object(
      'month', item.month_number, 'bid_amount', item.bid_amount,
      'manager_commission', item.manager_commission,
      'net_receivable', item.net_receivable
    ), auth.uid()
  );
  return item.id;
end;
$$;
grant execute on function public.chit_finalize_predefined_month(uuid,uuid,date) to authenticated;

-- Existing active and closed schemes receive missing member/month rows without
-- overwriting any payment that has already been recorded.
do $$
declare scheme_row record;
begin
  for scheme_row in
    select id from public.chit_schemes
    where chit_type in ('fixed', 'fixed_predefined_bid')
      and status in ('active', 'closed')
  loop
    perform public.chit_build_member_payment_schedules(scheme_row.id);
  end loop;
end;
$$;
