-- Live Chit Fund auction. Isolated from Daily/Monthly finance.
-- Does not alter chit_record_monthly_bid formulas. Ending an auction calls that RPC.
-- Run after 024_chit_rpc_only_writes_and_kyc.sql.
-- Then run 026_chit_customer_live_bidding.sql so members bid from Chit customer login (highest bid wins).

create table if not exists public.chit_live_auctions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid not null references public.chit_schemes(id) on delete restrict,
  cycle_number integer not null check (cycle_number > 0),
  cycle_date date not null,
  status text not null default 'open' check (status in ('open', 'paused', 'finalized', 'cancelled')),
  winning_enrollment_id uuid references public.chit_enrollments(id) on delete restrict,
  winning_bid_amount numeric(14,2),
  finalized_cycle_id uuid references public.chit_cycles(id) on delete restrict,
  started_at timestamptz not null default now(),
  started_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references auth.users(id)
);

create unique index if not exists chit_live_auctions_one_open_per_scheme
  on public.chit_live_auctions(scheme_id) where status in ('open', 'paused');

create unique index if not exists chit_live_auctions_month_once
  on public.chit_live_auctions(scheme_id, cycle_number) where status <> 'cancelled';

create table if not exists public.chit_live_auction_bids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auction_id uuid not null references public.chit_live_auctions(id) on delete restrict,
  enrollment_id uuid not null references public.chit_enrollments(id) on delete restrict,
  bid_amount numeric(14,2) not null check (bid_amount > 0),
  bid_percent numeric(7,4) not null check (bid_percent >= 0 and bid_percent <= 100),
  status text not null default 'valid' check (status in ('valid', 'winner', 'not_selected')),
  client_nonce text,
  submitted_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create unique index if not exists chit_live_auction_bids_nonce_idx
  on public.chit_live_auction_bids(auction_id, client_nonce) where client_nonce is not null;

create index if not exists chit_live_auction_bids_auction_idx
  on public.chit_live_auction_bids(auction_id, bid_amount asc, submitted_at asc);

alter table public.chit_live_auctions enable row level security;
alter table public.chit_live_auction_bids enable row level security;

drop policy if exists chit_owner_read_chit_live_auctions on public.chit_live_auctions;
drop policy if exists chit_owner_read_chit_live_auction_bids on public.chit_live_auction_bids;
create policy chit_owner_read_chit_live_auctions on public.chit_live_auctions for select to authenticated
using (organization_id = public.current_organization_id() and public.chit_is_owner());
create policy chit_owner_read_chit_live_auction_bids on public.chit_live_auction_bids for select to authenticated
using (organization_id = public.current_organization_id() and public.chit_is_owner());

create or replace function public.chit_live_leading_bid(input_auction_id uuid)
returns public.chit_live_auction_bids language sql stable set search_path = public
as $$
  select * from public.chit_live_auction_bids
  where auction_id = input_auction_id
  order by bid_amount asc, submitted_at asc
  limit 1
$$;

create or replace function public.chit_live_auction_snapshot(input_scheme_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; auction public.chit_live_auctions%rowtype; leader public.chit_live_auction_bids%rowtype;
  latest public.chit_live_auction_bids%rowtype; max_cycle integer; winner_ids uuid[];
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund live bidding'; end if;
  select * into s from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if s.id is null then raise exception 'Scheme not found'; end if;
  select * into auction from public.chit_live_auctions
    where scheme_id = s.id and status in ('open', 'paused')
    order by started_at desc limit 1;
  select coalesce(max(cycle_number), 0) into max_cycle from public.chit_cycles where scheme_id = s.id;
  select coalesce(array_agg(b.enrollment_id), '{}') into winner_ids
    from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id
    where c.scheme_id = s.id and b.status = 'winner';
  if auction.id is not null then
    select * into leader from public.chit_live_leading_bid(auction.id);
    select * into latest from public.chit_live_auction_bids where auction_id = auction.id order by submitted_at desc limit 1;
  end if;
  return jsonb_build_object(
    'bid_model', 'lowest_payout_wins',
    'scheme', jsonb_build_object(
      'id', s.id, 'name', s.name, 'chit_value', s.chit_value, 'member_count', s.member_count,
      'installment_amount', s.installment_amount, 'commission_percent', s.commission_percent,
      'duration_months', s.duration_months, 'min_bid_percent', s.min_bid_percent,
      'max_bid_percent', s.max_bid_percent, 'status', s.status, 'start_date', s.start_date
    ),
    'next_cycle_number', max_cycle + 1,
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
  select coalesce(max(cycle_number), 0) + 1 into next_cycle from public.chit_cycles where scheme_id = s.id;
  next_cycle := coalesce(input_cycle_number, next_cycle);
  if next_cycle > s.duration_months then raise exception 'All months for this scheme already have bids'; end if;
  if exists (select 1 from public.chit_cycles where scheme_id = s.id and cycle_number = next_cycle) then
    raise exception 'This month already has a finalized bid';
  end if;
  insert into public.chit_live_auctions(organization_id, scheme_id, cycle_number, cycle_date, started_by)
  values(s.organization_id, s.id, next_cycle, coalesce(input_cycle_date, current_date), auth.uid())
  returning id into auction_id;
  return public.chit_live_auction_snapshot(s.id);
end;
$$;

create or replace function public.chit_pause_live_auction(input_scheme_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can stop Chit Fund live bidding'; end if;
  update public.chit_live_auctions set status = 'paused', updated_at = now()
    where scheme_id = input_scheme_id and organization_id = public.current_organization_id() and status = 'open';
  if not found then raise exception 'No open live bidding session to stop'; end if;
  return public.chit_live_auction_snapshot(input_scheme_id);
end;
$$;

create or replace function public.chit_place_live_bid(
  input_auction_id uuid, input_enrollment_id uuid, input_bid_amount numeric, input_client_nonce text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare auction public.chit_live_auctions%rowtype; s public.chit_schemes%rowtype;
  bid_percent numeric; leader public.chit_live_auction_bids%rowtype; existing uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record Chit Fund live bids'; end if;
  if nullif(trim(input_client_nonce), '') is null then raise exception 'Bid could not be submitted'; end if;
  perform pg_advisory_xact_lock(hashtext('chit-live-auction:' || input_auction_id::text));
  select id into existing from public.chit_live_auction_bids
    where auction_id = input_auction_id and client_nonce = trim(input_client_nonce);
  if existing is not null then
    select scheme_id into auction.scheme_id from public.chit_live_auctions where id = input_auction_id;
    return public.chit_live_auction_snapshot(auction.scheme_id);
  end if;
  select * into auction from public.chit_live_auctions
    where id = input_auction_id and organization_id = public.current_organization_id();
  if auction.id is null then raise exception 'Live bidding session not found'; end if;
  if auction.status <> 'open' then raise exception 'Live bidding is not open'; end if;
  select * into s from public.chit_schemes where id = auction.scheme_id;
  if input_bid_amount <= 0 or input_bid_amount > s.chit_value then raise exception 'Invalid bid amount'; end if;
  bid_percent := round(input_bid_amount * 100 / s.chit_value, 4);
  if bid_percent < s.min_bid_percent or bid_percent > s.max_bid_percent then
    raise exception 'Bid is outside configured payout limits';
  end if;
  if not exists (
    select 1 from public.chit_enrollments
    where id = input_enrollment_id and scheme_id = s.id and status = 'active'
  ) then raise exception 'Member is not eligible to bid in this scheme'; end if;
  if exists (
    select 1 from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id
    where c.scheme_id = s.id and b.enrollment_id = input_enrollment_id and b.status = 'winner'
  ) then raise exception 'This member has already won a month in this scheme'; end if;
  select * into leader from public.chit_live_leading_bid(auction.id);
  if leader.id is not null and round(input_bid_amount, 2) >= round(leader.bid_amount, 2) then
    raise exception 'A new bid must be lower than the current leading bid';
  end if;
  insert into public.chit_live_auction_bids(organization_id, auction_id, enrollment_id, bid_amount, bid_percent, client_nonce, created_by)
  values(s.organization_id, auction.id, input_enrollment_id, round(input_bid_amount, 2), bid_percent, trim(input_client_nonce), auth.uid());
  update public.chit_live_auctions set updated_at = now() where id = auction.id;
  return public.chit_live_auction_snapshot(s.id);
end;
$$;

create or replace function public.chit_end_live_auction(input_auction_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare auction public.chit_live_auctions%rowtype; leader public.chit_live_auction_bids%rowtype; cycle_id uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can end Chit Fund live bidding'; end if;
  perform pg_advisory_xact_lock(hashtext('chit-live-auction:' || input_auction_id::text));
  select * into auction from public.chit_live_auctions
    where id = input_auction_id and organization_id = public.current_organization_id();
  if auction.id is null then raise exception 'Live bidding session not found'; end if;
  if auction.status = 'finalized' then raise exception 'This month is already finalized'; end if;
  if auction.status = 'cancelled' then raise exception 'This live bidding session was cancelled'; end if;
  if auction.status not in ('open', 'paused') then raise exception 'Live bidding cannot be ended'; end if;
  if exists (select 1 from public.chit_cycles where scheme_id = auction.scheme_id and cycle_number = auction.cycle_number) then
    raise exception 'This month already has a finalized bid';
  end if;
  select * into leader from public.chit_live_leading_bid(auction.id);
  if leader.id is null then raise exception 'At least one valid bid is required before ending'; end if;
  cycle_id := public.chit_record_monthly_bid(
    auction.scheme_id, auction.cycle_number, auction.cycle_date,
    leader.enrollment_id, leader.bid_amount, 'Finalized from live bidding'
  );
  update public.chit_live_auction_bids set status = 'not_selected' where auction_id = auction.id;
  update public.chit_live_auction_bids set status = 'winner' where id = leader.id;
  update public.chit_live_auctions
    set status = 'finalized', winning_enrollment_id = leader.enrollment_id, winning_bid_amount = leader.bid_amount,
        finalized_cycle_id = cycle_id, ended_at = now(), ended_by = auth.uid(), updated_at = now()
    where id = auction.id;
  return public.chit_live_auction_snapshot(auction.scheme_id) || jsonb_build_object('finalized_cycle_id', cycle_id);
end;
$$;

grant execute on function public.chit_live_auction_snapshot(uuid) to authenticated;
grant execute on function public.chit_start_live_auction(uuid, integer, date) to authenticated;
grant execute on function public.chit_pause_live_auction(uuid) to authenticated;
grant execute on function public.chit_place_live_bid(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.chit_end_live_auction(uuid) to authenticated;
revoke execute on function public.chit_live_leading_bid(uuid) from public, anon, authenticated;
