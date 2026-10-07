-- Auction month numbers must stay inside the scheme length.
-- A cycle stored as the bid amount (for example 75000 on a 10-month chit)
-- was making the next live auction month max(cycle_number)+1.
-- Existing out-of-range rows are left in place. New months cannot be saved outside 1..duration.
-- Run after 086_agent_books_separation.sql.

create or replace function public.chit_next_open_cycle(input_scheme_id uuid, input_duration integer)
returns integer
language sql
stable
set search_path = public
as $$
  select n
  from generate_series(1, greatest(coalesce(input_duration, 0), 0)) as n
  where not exists (
    select 1
    from public.chit_cycles c
    where c.scheme_id = input_scheme_id
      and c.cycle_number = n
  )
  order by n
  limit 1;
$$;

revoke execute on function public.chit_next_open_cycle(uuid, integer) from public, anon, authenticated;

create or replace function public.chit_cycles_reject_month_outside_duration()
returns trigger
language plpgsql
set search_path = public
as $$
declare duration integer;
begin
  select duration_months into duration from public.chit_schemes where id = new.scheme_id;
  if duration is not null and duration > 0 and (new.cycle_number < 1 or new.cycle_number > duration) then
    raise exception 'Month must be between 1 and %', duration;
  end if;
  return new;
end;
$$;

drop trigger if exists chit_cycles_month_in_range on public.chit_cycles;
create trigger chit_cycles_month_in_range
  before insert or update of cycle_number on public.chit_cycles
  for each row execute function public.chit_cycles_reject_month_outside_duration();

create or replace function public.chit_live_auction_payload(input_scheme_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; auction public.chit_live_auctions%rowtype; leader public.chit_live_auction_bids%rowtype;
  latest public.chit_live_auction_bids%rowtype; next_cycle integer; winner_ids uuid[];
  commission numeric; max_bid numeric;
begin
  select * into s from public.chit_schemes where id = input_scheme_id;
  if s.id is null then raise exception 'Scheme not found'; end if;
  commission := round(s.chit_value * s.commission_percent / 100, 2);
  max_bid := round(s.chit_value * 30 / 100, 2);
  select * into auction from public.chit_live_auctions
    where scheme_id = s.id and status in ('open', 'paused')
    order by started_at desc limit 1;
  next_cycle := public.chit_next_open_cycle(s.id, s.duration_months);
  select coalesce(array_agg(b.enrollment_id), '{}') into winner_ids
    from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id
    where c.scheme_id = s.id and b.status = 'winner';
  if auction.id is not null then
    select * into leader from public.chit_live_leading_bid(auction.id);
    select * into latest from public.chit_live_auction_bids where auction_id = auction.id order by submitted_at desc limit 1;
  end if;
  return jsonb_build_object(
    'bid_model', 'highest_bid_wins',
    'commission_amount', commission,
    'live_max_discount_percent', 30,
    'live_max_bid_amount', max_bid,
    'scheme', jsonb_build_object(
      'id', s.id, 'name', s.name, 'chit_value', s.chit_value, 'member_count', s.member_count,
      'installment_amount', s.installment_amount, 'commission_percent', s.commission_percent,
      'duration_months', s.duration_months, 'min_bid_percent', s.min_bid_percent,
      'max_bid_percent', s.max_bid_percent, 'status', s.status, 'start_date', s.start_date,
      'commission_amount', commission, 'live_max_discount_percent', 30, 'live_max_bid_amount', max_bid
    ),
    'next_cycle_number', next_cycle,
    'auction', case when auction.id is null then null else to_jsonb(auction) end,
    'leading_bid', case when leader.id is null then null else to_jsonb(leader) end,
    'latest_bid', case when latest.id is null then null else to_jsonb(latest) end,
    'bids', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'enrollment_id', b.enrollment_id, 'ticket_number', e.ticket_number,
        'member_name', m.full_name, 'bid_amount', b.bid_amount, 'bid_percent', b.bid_percent,
        'status', b.status, 'submitted_at', b.submitted_at
      ) order by b.submitted_at desc)
      from public.chit_live_auction_bids b
      join public.chit_enrollments e on e.id = b.enrollment_id
      join public.chit_members m on m.id = e.member_id
      where auction.id is not null and b.auction_id = auction.id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollment_id', e.id, 'member_id', e.member_id, 'ticket_number', e.ticket_number,
        'full_name', m.full_name, 'phone', m.phone, 'eligible', (e.status = 'active' and not (e.id = any(winner_ids))),
        'status', case when e.status <> 'active' then 'inactive' when e.id = any(winner_ids) then 'already_won' else 'eligible' end
      ) order by e.ticket_number)
      from public.chit_enrollments e
      join public.chit_members m on m.id = e.member_id
      where e.scheme_id = s.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.chit_live_auction_payload(uuid) from public, anon, authenticated;

create or replace function public.chit_start_live_auction(
  input_scheme_id uuid, input_cycle_number integer default null, input_cycle_date date default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; auction_id uuid; next_cycle integer; enrolled integer;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can start Chit Fund live bidding'; end if;
  perform pg_advisory_xact_lock(hashtext('chit-live:' || input_scheme_id::text));
  select * into s from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if s.id is null or s.status <> 'active' then raise exception 'Only active schemes can start live bidding'; end if;
  select count(*) into enrolled from public.chit_enrollments where scheme_id = s.id and status = 'active';
  if enrolled <> s.member_count then raise exception 'Scheme must have exactly its configured members'; end if;
  select id into auction_id from public.chit_live_auctions where scheme_id = s.id and status = 'paused' limit 1;
  if auction_id is not null then
    update public.chit_live_auctions set status = 'open', updated_at = now() where id = auction_id;
    return public.chit_live_auction_snapshot(s.id);
  end if;
  if exists (select 1 from public.chit_live_auctions where scheme_id = s.id and status = 'open') then
    raise exception 'This scheme already has a live bidding session';
  end if;
  if input_cycle_number is not null and (input_cycle_number < 1 or input_cycle_number > s.duration_months) then
    raise exception 'Month must be between 1 and %', s.duration_months;
  end if;
  next_cycle := coalesce(input_cycle_number, public.chit_next_open_cycle(s.id, s.duration_months));
  if next_cycle is null or next_cycle > s.duration_months then
    raise exception 'All months for this scheme already have bids';
  end if;
  if exists (select 1 from public.chit_cycles where scheme_id = s.id and cycle_number = next_cycle) then
    raise exception 'This month already has a finalized bid';
  end if;
  insert into public.chit_live_auctions(organization_id, scheme_id, cycle_number, cycle_date, started_by)
  values(s.organization_id, s.id, next_cycle, coalesce(input_cycle_date, current_date), auth.uid())
  returning id into auction_id;
  return public.chit_live_auction_snapshot(s.id);
end;
$$;
