-- Upcoming chit payment reminders across Auction, Fixed, and Fixed Predefined Bid schemes.
-- Run after 038_digital_receipts_and_reminders.sql.

create or replace function public.load_upcoming_chit_payments()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  result jsonb;
begin
  if not public.chit_is_owner() then
    raise exception 'Only a financier can view upcoming chit payments';
  end if;

  org_id := public.current_organization_id();

  select coalesce(jsonb_agg(payment_row order by payment_row ->> 'due_date'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', i.id,
      'enrollment_id', i.enrollment_id,
      'due_date', i.due_date,
      'net_amount_due', i.net_amount_due,
      'amount_due', i.amount_due,
      'amount_paid', i.amount_paid,
      'status', i.status,
      'payment_mode', i.payment_mode,
      'payment_kind', 'auction',
      'payment_month', c.cycle_number,
      'member_name', m.full_name,
      'member_phone', m.phone,
      'scheme_name', s.name,
      'scheme_duration', s.duration_months,
      'chit_type', coalesce(s.chit_type, 'auction')
    ) as payment_row
    from public.chit_installments i
    join public.chit_enrollments e on e.id = i.enrollment_id
    join public.chit_members m on m.id = e.member_id
    join public.chit_schemes s on s.id = e.scheme_id
    join public.chit_cycles c on c.id = i.cycle_id
    where i.organization_id = org_id
      and s.status = 'active'
      and e.status = 'active'
      and i.status not in ('paid', 'waived')
      and i.amount_paid + 0.001 < coalesce(i.net_amount_due, i.amount_due)

    union all

    select jsonb_build_object(
      'id', fp.id,
      'enrollment_id', fp.enrollment_id,
      'due_date', fp.due_date,
      'amount_due', fp.amount_due,
      'amount_paid', fp.amount_paid,
      'status', fp.status,
      'payment_mode', fp.payment_mode,
      'payment_kind', 'fixed',
      'payment_month', fp.payment_month,
      'member_name', m.full_name,
      'member_phone', m.phone,
      'scheme_name', s.name,
      'scheme_duration', s.duration_months,
      'chit_type', s.chit_type
    ) as payment_row
    from public.fixed_chit_payments fp
    join public.chit_enrollments e on e.id = fp.enrollment_id
    join public.chit_members m on m.id = e.member_id
    join public.chit_schemes s on s.id = fp.scheme_id
    where fp.organization_id = org_id
      and s.status = 'active'
      and s.chit_type = 'fixed'
      and e.status = 'active'
      and fp.status <> 'paid'
      and fp.amount_paid + 0.001 < fp.amount_due

    union all

    select jsonb_build_object(
      'id', pp.id,
      'enrollment_id', pp.enrollment_id,
      'due_date', pp.due_date,
      'amount_due', pp.amount_due,
      'amount_paid', pp.amount_paid,
      'status', pp.status,
      'payment_mode', pp.payment_mode,
      'payment_kind', 'fixed_predefined_bid',
      'payment_month', pp.payment_month,
      'member_name', m.full_name,
      'member_phone', m.phone,
      'scheme_name', s.name,
      'scheme_duration', s.duration_months,
      'chit_type', s.chit_type
    ) as payment_row
    from public.predefined_chit_payments pp
    join public.chit_enrollments e on e.id = pp.enrollment_id
    join public.chit_members m on m.id = e.member_id
    join public.chit_schemes s on s.id = pp.scheme_id
    where pp.organization_id = org_id
      and s.status = 'active'
      and s.chit_type = 'fixed_predefined_bid'
      and e.status = 'active'
      and pp.status <> 'paid'
      and pp.amount_paid + 0.001 < pp.amount_due
  ) payments;

  return coalesce(result, '[]'::jsonb);
end;
$$;

grant execute on function public.load_upcoming_chit_payments() to authenticated;
