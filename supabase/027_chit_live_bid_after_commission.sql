-- Live bidding starts after fund-manager commission and is capped at 30% of chit value.
-- Members bid a discount. Highest bid wins. Winner payout = chit value − bid.
-- chit_record_monthly_bid formulas are unchanged; ending an auction passes the payout.
-- Run after 026_chit_customer_live_bidding.sql.

create or replace function public.chit_validate_live_bid_amount(input_chit_value numeric, input_commission_percent numeric, input_bid_amount numeric)
returns numeric language plpgsql immutable set search_path = public
as $$
declare commission numeric; max_bid numeric;
begin
  if input_bid_amount is null or input_bid_amount <= 0 or input_chit_value is null or input_chit_value <= 0 then
    raise exception 'Invalid bid amount';
  end if;
  commission := round(input_chit_value * coalesce(input_commission_percent, 0) / 100, 2);
  max_bid := round(input_chit_value * 30 / 100, 2);
  if round(input_bid_amount, 2) <= commission then
    raise exception 'Bid must start above the fund manager commission';
  end if;
  if round(input_bid_amount, 2) > max_bid then
    raise exception 'Bid cannot exceed 30%% of the chit value';
  end if;
  return round(input_bid_amount * 100 / input_chit_value, 4);
end;
$$;

create or replace function public.chit_live_auction_payload(input_scheme_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; auction public.chit_live_auctions%rowtype; leader public.chit_live_auction_bids%rowtype;
  latest public.chit_live_auction_bids%rowtype; max_cycle integer; winner_ids uuid[];
  commission numeric; max_bid numeric;
begin
  select * into s from public.chit_schemes where id = input_scheme_id;
  if s.id is null then raise exception 'Scheme not found'; end if;
  commission := round(s.chit_value * s.commission_percent / 100, 2);
  max_bid := round(s.chit_value * 30 / 100, 2);
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

create or replace function public.chit_place_live_bid(
  input_auction_id uuid, input_enrollment_id uuid, input_bid_amount numeric, input_client_nonce text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare auction public.chit_live_auctions%rowtype; s public.chit_schemes%rowtype;
  bid_percent numeric; leader public.chit_live_auction_bids%rowtype; existing uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record staff Chit Fund live bids'; end if;
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
  bid_percent := public.chit_validate_live_bid_amount(s.chit_value, s.commission_percent, input_bid_amount);
  if not exists (
    select 1 from public.chit_enrollments
    where id = input_enrollment_id and scheme_id = s.id and status = 'active'
  ) then raise exception 'Member is not eligible to bid in this scheme'; end if;
  if exists (
    select 1 from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id
    where c.scheme_id = s.id and b.enrollment_id = input_enrollment_id and b.status = 'winner'
  ) then raise exception 'This member has already won a month in this scheme'; end if;
  select * into leader from public.chit_live_leading_bid(auction.id);
  if leader.id is not null and round(input_bid_amount, 2) <= round(leader.bid_amount, 2) then
    raise exception 'A new bid must be higher than the current leading bid';
  end if;
  insert into public.chit_live_auction_bids(organization_id, auction_id, enrollment_id, bid_amount, bid_percent, client_nonce, created_by)
  values(s.organization_id, auction.id, input_enrollment_id, round(input_bid_amount, 2), bid_percent, trim(input_client_nonce), auth.uid());
  update public.chit_live_auctions set updated_at = now() where id = auction.id;
  return public.chit_live_auction_snapshot(s.id);
end;
$$;

create or replace function public.chit_customer_place_live_bid(
  input_session_token text, input_bid_amount numeric, input_client_nonce text
) returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare session_row public.chit_member_portal_sessions%rowtype; enrollment public.chit_enrollments%rowtype;
  auction public.chit_live_auctions%rowtype; s public.chit_schemes%rowtype;
  bid_percent numeric; leader public.chit_live_auction_bids%rowtype; existing uuid;
begin
  if nullif(trim(input_client_nonce), '') is null then raise exception 'Bid could not be submitted'; end if;
  select * into session_row from public.chit_member_portal_sessions
    where token_hash = encode(digest(trim(input_session_token), 'sha256'), 'hex') and expires_at > now();
  if session_row.enrollment_id is null then raise exception 'Your Chit session has expired. Sign in again.'; end if;
  select * into enrollment from public.chit_enrollments where id = session_row.enrollment_id;
  select * into auction from public.chit_live_auctions
    where scheme_id = enrollment.scheme_id and status = 'open' order by started_at desc limit 1;
  if auction.id is null then raise exception 'Live bidding is not open yet'; end if;
  perform pg_advisory_xact_lock(hashtext('chit-live-auction:' || auction.id::text));
  select id into existing from public.chit_live_auction_bids
    where auction_id = auction.id and client_nonce = trim(input_client_nonce);
  if existing is not null then return public.chit_customer_dashboard(enrollment.id); end if;
  select * into auction from public.chit_live_auctions where id = auction.id;
  if auction.status <> 'open' then raise exception 'Live bidding is not open'; end if;
  select * into s from public.chit_schemes where id = auction.scheme_id;
  if enrollment.status <> 'active' then raise exception 'You are not eligible to bid in this scheme'; end if;
  if exists (
    select 1 from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id
    where c.scheme_id = s.id and b.enrollment_id = enrollment.id and b.status = 'winner'
  ) then raise exception 'You have already won a month in this scheme'; end if;
  bid_percent := public.chit_validate_live_bid_amount(s.chit_value, s.commission_percent, input_bid_amount);
  select * into leader from public.chit_live_leading_bid(auction.id);
  if leader.id is not null and round(input_bid_amount, 2) <= round(leader.bid_amount, 2) then
    raise exception 'A new bid must be higher than the current leading bid';
  end if;
  insert into public.chit_live_auction_bids(organization_id, auction_id, enrollment_id, bid_amount, bid_percent, client_nonce, created_by)
  values(s.organization_id, auction.id, enrollment.id, round(input_bid_amount, 2), bid_percent, trim(input_client_nonce), null);
  update public.chit_live_auctions set updated_at = now() where id = auction.id;
  return public.chit_customer_dashboard(enrollment.id);
end;
$$;

create or replace function public.chit_end_live_auction(input_auction_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare auction public.chit_live_auctions%rowtype; leader public.chit_live_auction_bids%rowtype;
  s public.chit_schemes%rowtype; cycle_id uuid; payout numeric;
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
  select * into s from public.chit_schemes where id = auction.scheme_id;
  payout := round(s.chit_value - leader.bid_amount, 2);
  cycle_id := public.chit_record_monthly_bid(
    auction.scheme_id, auction.cycle_number, auction.cycle_date,
    leader.enrollment_id, payout, 'Finalized from live bidding'
  );
  update public.chit_live_auction_bids set status = 'not_selected' where auction_id = auction.id;
  update public.chit_live_auction_bids set status = 'winner' where id = leader.id;
  update public.chit_live_auctions
    set status = 'finalized', winning_enrollment_id = leader.enrollment_id, winning_bid_amount = leader.bid_amount,
        finalized_cycle_id = cycle_id, ended_at = now(), ended_by = auth.uid(), updated_at = now()
    where id = auction.id;
  return public.chit_live_auction_snapshot(auction.scheme_id) || jsonb_build_object('finalized_cycle_id', cycle_id, 'payout_amount', payout);
end;
$$;

grant execute on function public.chit_place_live_bid(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.chit_end_live_auction(uuid) to authenticated;
grant execute on function public.chit_customer_place_live_bid(text, numeric, text) to anon, authenticated;
revoke execute on function public.chit_validate_live_bid_amount(numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.chit_live_auction_payload(uuid) from public, anon, authenticated;
