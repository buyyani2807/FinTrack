-- Customer-placed Chit Fund live bids and a Chit customer portal (CF- IDs).
-- Isolated from Daily/Monthly finance portal tables and RPCs.
-- Run after 025_chit_live_auction.sql.
-- Highest valid bid wins. Dividend formulas in chit_record_monthly_bid are unchanged.

do $$ begin
  if to_regclass('public.chit_live_auctions') is null then
    raise exception 'Run 025_chit_live_auction.sql before this script';
  end if;
end $$;

alter table public.chit_live_auction_bids alter column created_by drop not null;

drop index if exists public.chit_live_auction_bids_auction_idx;
create index if not exists chit_live_auction_bids_auction_idx
  on public.chit_live_auction_bids(auction_id, bid_amount desc, submitted_at asc);

create table if not exists public.chit_member_portal_credentials (
  enrollment_id uuid primary key references public.chit_enrollments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal_id text unique not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.chit_member_portal_credentials enable row level security;
drop policy if exists chit_owner_read_chit_member_portal_credentials on public.chit_member_portal_credentials;
create policy chit_owner_read_chit_member_portal_credentials on public.chit_member_portal_credentials
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.chit_is_owner());
grant select on public.chit_member_portal_credentials to authenticated;

create table if not exists public.chit_member_portal_sessions (
  token_hash text primary key,
  enrollment_id uuid not null references public.chit_enrollments(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists chit_member_portal_sessions_enrollment_idx
  on public.chit_member_portal_sessions(enrollment_id);
alter table public.chit_member_portal_sessions enable row level security;
revoke all on public.chit_member_portal_sessions from anon, authenticated;

create or replace function public.chit_live_leading_bid(input_auction_id uuid)
returns public.chit_live_auction_bids language sql stable set search_path = public
as $$
  select * from public.chit_live_auction_bids
  where auction_id = input_auction_id
  order by bid_amount desc, submitted_at asc
  limit 1
$$;

create or replace function public.chit_live_auction_payload(input_scheme_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; auction public.chit_live_auctions%rowtype; leader public.chit_live_auction_bids%rowtype;
  latest public.chit_live_auction_bids%rowtype; max_cycle integer; winner_ids uuid[];
begin
  select * into s from public.chit_schemes where id = input_scheme_id;
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
    'bid_model', 'highest_bid_wins',
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

create or replace function public.chit_live_auction_snapshot(input_scheme_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund live bidding'; end if;
  if not exists (select 1 from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id()) then
    raise exception 'Scheme not found';
  end if;
  return public.chit_live_auction_payload(input_scheme_id);
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
  if leader.id is not null and round(input_bid_amount, 2) <= round(leader.bid_amount, 2) then
    raise exception 'A new bid must be higher than the current leading bid';
  end if;
  insert into public.chit_live_auction_bids(organization_id, auction_id, enrollment_id, bid_amount, bid_percent, client_nonce, created_by)
  values(s.organization_id, auction.id, input_enrollment_id, round(input_bid_amount, 2), bid_percent, trim(input_client_nonce), auth.uid());
  update public.chit_live_auctions set updated_at = now() where id = auction.id;
  return public.chit_live_auction_snapshot(s.id);
end;
$$;

create or replace function public.enable_chit_member_portal(input_enrollment_id uuid, new_pin text)
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare public_id text; org_id uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage the Chit customer portal'; end if;
  if not new_pin ~ '^[0-9]{6,}$' then raise exception 'PIN must be at least 6 digits'; end if;
  select organization_id into org_id from public.chit_enrollments
    where id = input_enrollment_id and organization_id = public.current_organization_id();
  if org_id is null then raise exception 'Member not found'; end if;
  public_id := 'CF-' || upper(substr(replace(input_enrollment_id::text, '-', ''), 1, 8));
  insert into public.chit_member_portal_credentials(enrollment_id, organization_id, portal_id, pin_hash, failed_attempts, locked_until, updated_at)
  values(input_enrollment_id, org_id, public_id, crypt(new_pin, gen_salt('bf')), 0, null, now())
  on conflict (enrollment_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  return public_id;
end;
$$;

create or replace function public.reset_chit_member_portal_pin(input_enrollment_id uuid, new_pin text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage the Chit customer portal'; end if;
  if not new_pin ~ '^[0-9]{6,}$' then raise exception 'PIN must be at least 6 digits'; end if;
  if not exists (
    select 1 from public.chit_enrollments
    where id = input_enrollment_id and organization_id = public.current_organization_id()
  ) then raise exception 'Member not found'; end if;
  update public.chit_member_portal_credentials
    set pin_hash = crypt(new_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null, updated_at = now()
    where enrollment_id = input_enrollment_id;
  if not found then raise exception 'Chit customer portal is not enabled for this member'; end if;
end;
$$;

create or replace function public.chit_customer_dashboard(input_enrollment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype; member public.chit_members%rowtype;
  credential public.chit_member_portal_credentials%rowtype; payload jsonb; is_eligible boolean;
begin
  select * into enrollment from public.chit_enrollments where id = input_enrollment_id;
  if enrollment.id is null then raise exception 'Member not found'; end if;
  select * into member from public.chit_members where id = enrollment.member_id;
  select * into credential from public.chit_member_portal_credentials where enrollment_id = enrollment.id;
  payload := public.chit_live_auction_payload(enrollment.scheme_id);
  select coalesce((m->>'eligible')::boolean, false) into is_eligible
    from jsonb_array_elements(payload->'members') m
    where m->>'enrollment_id' = enrollment.id::text
    limit 1;
  return jsonb_build_object(
    'portalId', credential.portal_id,
    'enrollmentId', enrollment.id,
    'ticketNumber', enrollment.ticket_number,
    'memberName', member.full_name,
    'phone', member.phone,
    'address', member.address,
    'scheme', payload->'scheme',
    'auction', payload->'auction',
    'leadingBid', payload->'leading_bid',
    'latestBid', payload->'latest_bid',
    'bids', payload->'bids',
    'bidModel', payload->'bid_model',
    'eligible', coalesce(is_eligible, false),
    'wins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', c.cycle_number, 'bidAmount', b.bid_amount, 'bidDate', c.cycle_date, 'status', 'Winner'
      ) order by c.cycle_number)
      from public.chit_bids b
      join public.chit_cycles c on c.id = b.cycle_id
      where c.scheme_id = enrollment.scheme_id and b.enrollment_id = enrollment.id and b.status = 'winner'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.chit_customer_portal_login(input_portal_id text, input_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare credential public.chit_member_portal_credentials%rowtype; session_token text;
begin
  select * into credential from public.chit_member_portal_credentials where portal_id = upper(trim(input_portal_id));
  if not found then raise exception 'Invalid portal ID or PIN'; end if;
  if credential.locked_until is not null and credential.locked_until > now() then raise exception 'Too many attempts. Try again in 15 minutes'; end if;
  if credential.pin_hash <> crypt(input_pin, credential.pin_hash) then
    update public.chit_member_portal_credentials set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
      where enrollment_id = credential.enrollment_id;
    raise exception 'Invalid portal ID or PIN';
  end if;
  update public.chit_member_portal_credentials set failed_attempts = 0, locked_until = null where enrollment_id = credential.enrollment_id;
  session_token := encode(gen_random_bytes(24), 'hex');
  insert into public.chit_member_portal_sessions(token_hash, enrollment_id, expires_at)
  values(encode(digest(session_token, 'sha256'), 'hex'), credential.enrollment_id, now() + interval '12 hours');
  return public.chit_customer_dashboard(credential.enrollment_id) || jsonb_build_object('sessionToken', session_token);
end;
$$;

create or replace function public.chit_customer_live_state(input_session_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare session_row public.chit_member_portal_sessions%rowtype;
begin
  select * into session_row from public.chit_member_portal_sessions
    where token_hash = encode(digest(trim(input_session_token), 'sha256'), 'hex') and expires_at > now();
  if session_row.enrollment_id is null then raise exception 'Your Chit session has expired. Sign in again.'; end if;
  return public.chit_customer_dashboard(session_row.enrollment_id);
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
  if input_bid_amount <= 0 or input_bid_amount > s.chit_value then raise exception 'Invalid bid amount'; end if;
  bid_percent := round(input_bid_amount * 100 / s.chit_value, 4);
  if bid_percent < s.min_bid_percent or bid_percent > s.max_bid_percent then
    raise exception 'Bid is outside configured payout limits';
  end if;
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

grant execute on function public.chit_live_auction_snapshot(uuid) to authenticated;
grant execute on function public.chit_place_live_bid(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.enable_chit_member_portal(uuid, text) to authenticated;
grant execute on function public.reset_chit_member_portal_pin(uuid, text) to authenticated;
grant execute on function public.chit_customer_portal_login(text, text) to anon, authenticated;
grant execute on function public.chit_customer_live_state(text) to anon, authenticated;
grant execute on function public.chit_customer_place_live_bid(text, numeric, text) to anon, authenticated;
revoke execute on function public.chit_live_auction_payload(uuid) from public, anon, authenticated;
revoke execute on function public.chit_customer_dashboard(uuid) from public, anon, authenticated;
revoke execute on function public.chit_live_leading_bid(uuid) from public, anon, authenticated;
