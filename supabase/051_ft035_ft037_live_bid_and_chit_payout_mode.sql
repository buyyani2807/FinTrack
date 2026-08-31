-- FT-035 / FT-036 support notes / FT-037: live-bid payout limits + mode-aware chit prize cashbook.
-- Run after 050_disbursement_payout_mode.sql.

-- ---------------------------------------------------------------------------
-- FT-035 — Live discount bids must produce a payout inside scheme min/max %
-- ---------------------------------------------------------------------------
create or replace function public.chit_validate_live_bid_amount(
  input_chit_value numeric,
  input_commission_percent numeric,
  input_bid_amount numeric,
  input_min_bid_percent numeric default 70,
  input_max_bid_percent numeric default 95
) returns numeric language plpgsql immutable set search_path = public
as $$
declare
  commission numeric;
  max_bid numeric;
  payout numeric;
  payout_percent numeric;
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
  payout := round(input_chit_value - input_bid_amount, 2);
  if payout <= 0 then raise exception 'Invalid bid amount'; end if;
  payout_percent := round(payout * 100 / input_chit_value, 4);
  if payout_percent < coalesce(input_min_bid_percent, 70)
     or payout_percent > coalesce(input_max_bid_percent, 95) then
    raise exception 'This discount would leave a payout outside the scheme payout limits (%–%)',
      coalesce(input_min_bid_percent, 70), coalesce(input_max_bid_percent, 95);
  end if;
  return round(input_bid_amount * 100 / input_chit_value, 4);
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
  bid_percent := public.chit_validate_live_bid_amount(
    s.chit_value, s.commission_percent, input_bid_amount, s.min_bid_percent, s.max_bid_percent
  );
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
  bid_percent := public.chit_validate_live_bid_amount(
    s.chit_value, s.commission_percent, input_bid_amount, s.min_bid_percent, s.max_bid_percent
  );
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

-- Live finalize already validated the discount; skip payout-% gate when settling from live bidding.
create or replace function public.chit_record_monthly_bid(
  input_scheme_id uuid, input_cycle_number integer, input_cycle_date date,
  input_winning_enrollment_id uuid, input_winning_bid_amount numeric, input_notes text default null,
  input_from_live_auction boolean default false
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
  if not coalesce(input_from_live_auction, false) then
    if bid_percent < s.min_bid_percent or bid_percent > s.max_bid_percent then
      raise exception 'Winning bid is outside configured payout limits';
    end if;
  end if;
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

drop function if exists public.chit_record_monthly_bid(uuid,integer,date,uuid,numeric,text);
grant execute on function public.chit_record_monthly_bid(uuid,integer,date,uuid,numeric,text,boolean) to authenticated;

drop function if exists public.chit_end_live_auction(uuid);
create or replace function public.chit_end_live_auction(
  input_auction_id uuid,
  payout_mode public.payment_mode default 'cash',
  payout_cash_amount numeric default null,
  payout_upi_amount numeric default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare auction public.chit_live_auctions%rowtype; leader public.chit_live_auction_bids%rowtype;
  s public.chit_schemes%rowtype; cycle_id uuid; payout numeric;
  v_mode public.payment_mode; v_cash numeric; v_upi numeric;
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
  -- Re-check live rules (including payout %) before settle.
  perform public.chit_validate_live_bid_amount(
    s.chit_value, s.commission_percent, leader.bid_amount, s.min_bid_percent, s.max_bid_percent
  );
  v_mode := coalesce(payout_mode, 'cash');
  if v_mode = 'bank' then v_mode := 'cash'; end if;
  if v_mode = 'upi' then
    v_cash := 0; v_upi := payout;
  elsif v_mode = 'cash_upi' then
    v_cash := round(coalesce(payout_cash_amount, 0), 2);
    v_upi := round(coalesce(payout_upi_amount, 0), 2);
    if v_cash <= 0 or v_upi <= 0 or round(v_cash + v_upi, 2) <> payout then
      raise exception 'Cash and UPI payout amounts must both be positive and equal the prize payout';
    end if;
  else
    v_mode := 'cash'; v_cash := payout; v_upi := 0;
  end if;
  cycle_id := public.chit_record_monthly_bid(
    auction.scheme_id, auction.cycle_number, auction.cycle_date,
    leader.enrollment_id, payout, 'Finalized from live bidding', true
  );
  update public.chit_cycles set
    payout_mode = v_mode,
    payout_cash_amount = v_cash,
    payout_upi_amount = v_upi,
    updated_at = now()
  where id = cycle_id;
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
grant execute on function public.chit_end_live_auction(uuid, public.payment_mode, numeric, numeric) to authenticated;
grant execute on function public.chit_customer_place_live_bid(text, numeric, text) to anon, authenticated;
revoke execute on function public.chit_validate_live_bid_amount(numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- FT-037 — Mode-aware chit prize / lift cashbook postings
-- ---------------------------------------------------------------------------
alter table public.fixed_chit_lifts
  add column if not exists payout_mode public.payment_mode not null default 'cash';
alter table public.fixed_chit_lifts
  add column if not exists payout_cash_amount numeric(14,2) not null default 0;
alter table public.fixed_chit_lifts
  add column if not exists payout_upi_amount numeric(14,2) not null default 0;

alter table public.predefined_chit_schedule
  add column if not exists payout_mode public.payment_mode not null default 'cash';
alter table public.predefined_chit_schedule
  add column if not exists payout_cash_amount numeric(14,2) not null default 0;
alter table public.predefined_chit_schedule
  add column if not exists payout_upi_amount numeric(14,2) not null default 0;

alter table public.chit_cycles
  add column if not exists payout_mode public.payment_mode not null default 'cash';
alter table public.chit_cycles
  add column if not exists payout_cash_amount numeric(14,2) not null default 0;
alter table public.chit_cycles
  add column if not exists payout_upi_amount numeric(14,2) not null default 0;
alter table public.chit_cycles
  add column if not exists updated_at timestamptz not null default now();

update public.fixed_chit_lifts
set payout_cash_amount = coalesce(nullif(payout_cash_amount, 0), coalesce(amount_paid_to_member, lift_amount, 0)),
    payout_upi_amount = coalesce(payout_upi_amount, 0)
where coalesce(payout_mode, 'cash') = 'cash';

update public.predefined_chit_schedule
set payout_cash_amount = coalesce(nullif(payout_cash_amount, 0), coalesce(net_receivable, 0)),
    payout_upi_amount = coalesce(payout_upi_amount, 0)
where coalesce(payout_mode, 'cash') = 'cash';

update public.chit_cycles
set payout_cash_amount = coalesce(nullif(payout_cash_amount, 0), coalesce(winning_bid_amount, 0)),
    payout_upi_amount = coalesce(payout_upi_amount, 0)
where coalesce(payout_mode, 'cash') = 'cash';

drop function if exists public.accounts_sync_chit_payout(text, uuid, uuid, numeric, date, text, text);
create or replace function public.accounts_sync_chit_payout(
  input_source_type text, input_source_id uuid, input_org_id uuid,
  input_amount numeric, input_paid_date date, input_member_name text, input_label text,
  input_mode public.payment_mode default 'cash',
  input_cash_amount numeric default null,
  input_upi_amount numeric default null
) returns void language plpgsql security definer set search_path = public
as $$
declare
  v_mode public.payment_mode;
  v_cash numeric;
  v_upi numeric;
  paid numeric;
  desc_text text;
begin
  perform public.accounts_remove_source_entries(input_source_type, input_source_id);
  paid := round(coalesce(input_amount, 0), 2);
  if paid <= 0 or input_org_id is null then return; end if;
  perform public.accounts_ensure_default_ledgers(input_org_id);
  v_mode := coalesce(input_mode, 'cash');
  if v_mode = 'bank' then v_mode := 'cash'; end if;
  desc_text := coalesce(input_member_name, 'Member') || ' · ' || coalesce(input_label, 'Lift payout');

  if v_mode = 'cash_upi' then
    v_cash := round(coalesce(input_cash_amount, 0), 2);
    v_upi := round(coalesce(input_upi_amount, 0), 2);
    if v_cash > 0 then
      perform public.accounts_upsert_entry(
        input_org_id, public.accounts_ledger_for_mode(input_org_id, 'cash'), coalesce(input_paid_date, current_date),
        'money_out', 'Chit Payout', desc_text, 0, v_cash, input_source_type, input_source_id, 'cash',
        null, null, null, null, 'cash_upi', null, null, false
      );
    end if;
    if v_upi > 0 then
      perform public.accounts_upsert_entry(
        input_org_id, public.accounts_ledger_for_mode(input_org_id, 'upi'), coalesce(input_paid_date, current_date),
        'money_out', 'Chit Payout', desc_text, 0, v_upi, input_source_type, input_source_id, 'upi',
        null, null, null, null, 'cash_upi', null, null, false
      );
    end if;
  elsif v_mode = 'upi' then
    perform public.accounts_upsert_entry(
      input_org_id, public.accounts_ledger_for_mode(input_org_id, 'upi'), coalesce(input_paid_date, current_date),
      'money_out', 'Chit Payout', desc_text, 0, paid, input_source_type, input_source_id, 'main',
      null, null, null, null, 'upi', null, null, false
    );
  else
    perform public.accounts_upsert_entry(
      input_org_id, public.accounts_ledger_for_mode(input_org_id, 'cash'), coalesce(input_paid_date, current_date),
      'money_out', 'Chit Payout', desc_text, 0, paid, input_source_type, input_source_id, 'main',
      null, null, null, null, 'cash', null, null, false
    );
  end if;
end;
$$;

create or replace function public.accounts_trg_fixed_chit_lift_payout()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text; paid numeric;
begin
  if new.status = 'completed' then
    select cm.full_name into member_name
    from public.chit_enrollments ce
    join public.chit_members cm on cm.id = ce.member_id
    where ce.id = new.enrollment_id;
    paid := coalesce(new.amount_paid_to_member, new.lift_amount);
    perform public.accounts_sync_chit_payout(
      'chit_fixed_lift', new.id, new.organization_id,
      paid, new.lift_date, member_name, 'Fixed Chit lift',
      coalesce(new.payout_mode, 'cash'),
      coalesce(new.payout_cash_amount, paid),
      coalesce(new.payout_upi_amount, 0)
    );
  else
    perform public.accounts_remove_source_entries('chit_fixed_lift', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.accounts_trg_predefined_chit_payout()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text;
begin
  if new.status = 'completed' then
    select cm.full_name into member_name
    from public.chit_enrollments ce
    join public.chit_members cm on cm.id = ce.member_id
    where ce.id = new.enrollment_id;
    perform public.accounts_sync_chit_payout(
      'chit_predefined_payout', new.id, new.organization_id,
      new.net_receivable, new.assigned_date, member_name, 'Predefined Bid payout',
      coalesce(new.payout_mode, 'cash'),
      coalesce(new.payout_cash_amount, new.net_receivable),
      coalesce(new.payout_upi_amount, 0)
    );
  else
    perform public.accounts_remove_source_entries('chit_predefined_payout', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.accounts_trg_auction_cycle_payout()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text;
begin
  if new.status = 'settled' and coalesce(new.winning_bid_amount, 0) > 0 then
    select cm.full_name into member_name
    from public.chit_enrollments ce
    join public.chit_members cm on cm.id = ce.member_id
    where ce.id = new.winning_enrollment_id;
    perform public.accounts_sync_chit_payout(
      'chit_auction_payout', new.id, new.organization_id,
      new.winning_bid_amount, new.cycle_date, member_name, 'Auction payout',
      coalesce(new.payout_mode, 'cash'),
      coalesce(new.payout_cash_amount, new.winning_bid_amount),
      coalesce(new.payout_upi_amount, 0)
    );
  else
    perform public.accounts_remove_source_entries('chit_auction_payout', new.id);
  end if;
  return new;
end;
$$;

drop function if exists public.chit_finalize_fixed_lift(uuid,integer,uuid,date);
create or replace function public.chit_finalize_fixed_lift(
  input_scheme_id uuid, input_month_number integer,
  input_enrollment_id uuid, input_lift_date date,
  payout_mode public.payment_mode default 'cash',
  payout_cash_amount numeric default null,
  payout_upi_amount numeric default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; lift public.fixed_chit_lifts%rowtype;
  remaining integer; payment_month integer;
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
  if remaining > 0 then
    for payment_month in (input_month_number + 1)..s.duration_months loop
      insert into public.fixed_chit_payments(
        organization_id, scheme_id, lift_id, enrollment_id,
        payment_month, amount_due, due_date
      ) values (
        s.organization_id, s.id, lift.id, input_enrollment_id,
        payment_month, lift.monthly_payment,
        (s.start_date + ((payment_month - 1) || ' months')::interval)::date
      );
    end loop;
  end if;
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

drop function if exists public.chit_finalize_predefined_month(uuid,uuid,date);
create or replace function public.chit_finalize_predefined_month(
  input_schedule_id uuid, input_enrollment_id uuid, input_assigned_date date,
  payout_mode public.payment_mode default 'cash',
  payout_cash_amount numeric default null,
  payout_upi_amount numeric default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare item public.predefined_chit_schedule%rowtype; s public.chit_schemes%rowtype; payment_month integer;
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
  if item.month_number < s.duration_months then
    for payment_month in (item.month_number + 1)..s.duration_months loop
      insert into public.predefined_chit_payments(
        organization_id, scheme_id, schedule_id, enrollment_id,
        payment_month, amount_due, due_date
      ) values (
        s.organization_id, s.id, item.id, input_enrollment_id, payment_month, item.emi,
        (s.start_date + ((payment_month - 1) || ' months')::interval)::date
      );
    end loop;
  end if;
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
