-- Persist one independent monthly winning bid and its calculation snapshot.
alter table public.chit_cycles add column if not exists notes text;

create or replace function public.chit_record_monthly_bid(
  input_scheme_id uuid, input_cycle_number integer, input_cycle_date date,
  input_winning_enrollment_id uuid, input_winning_bid_amount numeric, input_notes text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; cycle_id uuid; enrolled_count integer; bid_percent numeric;
  discount numeric; commission numeric; distributable numeric; dividend numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record Chit Fund bids'; end if;
  select * into s from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if s.id is null or s.status <> 'active' then raise exception 'Only active schemes can receive monthly bids'; end if;
  if input_cycle_number <= 0 or input_winning_bid_amount <= 0 or input_winning_bid_amount > s.chit_value then raise exception 'Invalid monthly bid'; end if;
  select count(*) into enrolled_count from public.chit_enrollments where scheme_id = s.id and status = 'active';
  if enrolled_count <> s.member_count then raise exception 'Scheme must have exactly its configured members'; end if;
  if not exists (select 1 from public.chit_enrollments where id = input_winning_enrollment_id and scheme_id = s.id and status = 'active') then raise exception 'Winning member is not enrolled in this scheme'; end if;
  if exists (select 1 from public.chit_cycles where scheme_id = s.id and cycle_number = input_cycle_number) then raise exception 'This month already has a bid'; end if;
  if exists (select 1 from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id where c.scheme_id = s.id and b.enrollment_id = input_winning_enrollment_id and b.status in ('winner','valid')) then raise exception 'A member may win only once per scheme'; end if;
  bid_percent := round(input_winning_bid_amount * 100 / s.chit_value, 4);
  if bid_percent < s.min_bid_percent or bid_percent > s.max_bid_percent then raise exception 'Winning bid is outside configured payout limits'; end if;
  discount := round(s.chit_value - input_winning_bid_amount, 2);
  commission := round(s.chit_value * s.commission_percent / 100, 2);
  distributable := round(discount - commission, 2);
  if distributable < 0 then raise exception 'Commission cannot exceed the discount'; end if;
  dividend := round(distributable / s.member_count, 2);
  insert into public.chit_cycles(organization_id, scheme_id, cycle_number, cycle_date, status, winning_enrollment_id, winning_bid_amount, discount_amount, commission_amount, distributable_amount, dividend_per_member, closed_at, closed_by, tie_break_method, notes)
    values(s.organization_id, s.id, input_cycle_number, input_cycle_date, 'settled', input_winning_enrollment_id, round(input_winning_bid_amount,2), discount, commission, distributable, dividend, now(), auth.uid(), 'single_recorded_winner', nullif(trim(input_notes), '')) returning id into cycle_id;
  insert into public.chit_bids(organization_id, cycle_id, enrollment_id, bid_amount, bid_percent, status, created_by)
    values(s.organization_id, cycle_id, input_winning_enrollment_id, round(input_winning_bid_amount,2), bid_percent, 'winner', auth.uid());
  insert into public.chit_installments(organization_id, cycle_id, enrollment_id, amount_due, dividend_credit, net_amount_due, due_date)
    select s.organization_id, cycle_id, e.id, s.installment_amount, dividend, greatest(0, round(s.installment_amount - dividend, 2)), input_cycle_date
    from public.chit_enrollments e where e.scheme_id = s.id and e.status = 'active';
  return cycle_id;
end;
$$;
grant execute on function public.chit_record_monthly_bid(uuid,integer,date,uuid,numeric,text) to authenticated;
