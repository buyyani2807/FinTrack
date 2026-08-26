-- Add Fixed Chits as an isolated business model. Existing rows remain Auction Chits.
alter table public.chit_schemes add column if not exists chit_type text not null default 'auction';
alter table public.chit_schemes add column if not exists fixed_commission_amount numeric(14,2);
alter table public.chit_schemes add column if not exists fixed_initial_lift_amount numeric(14,2);
alter table public.chit_schemes add column if not exists fixed_monthly_increment numeric(14,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chit_schemes_type_valid') then
    alter table public.chit_schemes add constraint chit_schemes_type_valid check (chit_type in ('auction', 'fixed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chit_schemes_fixed_values_valid') then
    alter table public.chit_schemes add constraint chit_schemes_fixed_values_valid check (
      chit_type = 'auction' or (
        fixed_commission_amount >= 0
        and fixed_initial_lift_amount >= 0
        and fixed_monthly_increment >= 0
      )
    );
  end if;
end $$;

create table if not exists public.fixed_chit_lifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid not null references public.chit_schemes(id) on delete restrict,
  month_number integer not null check (month_number > 0),
  lift_amount numeric(14,2) not null check (lift_amount >= 0),
  manager_commission numeric(14,2) not null check (manager_commission >= 0),
  monthly_payment numeric(14,2) not null check (monthly_payment > 0),
  enrollment_id uuid references public.chit_enrollments(id) on delete restrict,
  amount_paid_to_member numeric(14,2),
  remaining_months integer,
  total_remaining_payment numeric(14,2),
  lift_date date,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scheme_id, month_number),
  unique(scheme_id, enrollment_id)
);

create index if not exists fixed_chit_lifts_scheme_month_idx
  on public.fixed_chit_lifts(scheme_id, month_number);

create table if not exists public.fixed_chit_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid not null references public.chit_schemes(id) on delete restrict,
  lift_id uuid not null references public.fixed_chit_lifts(id) on delete restrict,
  enrollment_id uuid not null references public.chit_enrollments(id) on delete restrict,
  payment_month integer not null check (payment_month > 0),
  amount_due numeric(14,2) not null check (amount_due > 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  due_date date not null,
  paid_date date,
  payment_mode public.payment_mode,
  payment_reference text,
  notes text,
  status text not null default 'due' check (status in ('due', 'partially_paid', 'paid', 'overdue')),
  collected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lift_id, payment_month)
);

create index if not exists fixed_chit_payments_enrollment_due_idx
  on public.fixed_chit_payments(enrollment_id, due_date, status);

alter table public.fixed_chit_lifts enable row level security;
alter table public.fixed_chit_payments enable row level security;
revoke insert, update, delete on public.fixed_chit_lifts from authenticated;
revoke insert, update, delete on public.fixed_chit_payments from authenticated;
grant select on public.fixed_chit_lifts, public.fixed_chit_payments to authenticated;

drop policy if exists fixed_chit_lifts_owner_read on public.fixed_chit_lifts;
create policy fixed_chit_lifts_owner_read on public.fixed_chit_lifts for select to authenticated
using (organization_id = public.current_organization_id() and public.chit_is_owner());
drop policy if exists fixed_chit_payments_owner_read on public.fixed_chit_payments;
create policy fixed_chit_payments_owner_read on public.fixed_chit_payments for select to authenticated
using (organization_id = public.current_organization_id() and public.chit_is_owner());

create or replace function public.chit_create_fixed_scheme(
  scheme_name text, scheme_chit_value numeric, scheme_duration_months integer,
  scheme_member_count integer, scheme_installment_amount numeric,
  scheme_commission_amount numeric, scheme_initial_lift_amount numeric,
  scheme_monthly_increment numeric, scheme_start_date date,
  scheme_late_penalty_amount numeric default 0,
  scheme_security_deposit_amount numeric default 0
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; scheme_id uuid; month_no integer; monthly_payment numeric;
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
  if scheme_commission_amount < 0 or scheme_initial_lift_amount < 0 or scheme_monthly_increment < 0 then
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
    0, round(scheme_commission_amount, 2), round(scheme_initial_lift_amount, 2),
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
      round(scheme_commission_amount, 2), monthly_payment
    );
  end loop;
  return scheme_id;
end;
$$;
grant execute on function public.chit_create_fixed_scheme(text,numeric,integer,integer,numeric,numeric,numeric,numeric,date,numeric,numeric) to authenticated;

create or replace function public.chit_update_fixed_scheme(
  input_scheme_id uuid, scheme_name text, scheme_chit_value numeric,
  scheme_duration_months integer, scheme_member_count integer,
  scheme_installment_amount numeric, scheme_commission_amount numeric,
  scheme_initial_lift_amount numeric, scheme_monthly_increment numeric,
  scheme_start_date date, scheme_late_penalty_amount numeric,
  scheme_security_deposit_amount numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; enrolled_count integer; month_no integer; monthly_payment numeric;
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
  if scheme_commission_amount < 0 or scheme_initial_lift_amount < 0 or scheme_monthly_increment < 0
    or scheme_late_penalty_amount < 0 or scheme_security_deposit_amount < 0 then raise exception 'Amounts cannot be negative'; end if;
  update public.chit_schemes set
    name = trim(scheme_name), chit_value = round(scheme_chit_value, 2),
    duration_months = scheme_duration_months, member_count = scheme_member_count,
    installment_amount = round(scheme_installment_amount, 2),
    fixed_commission_amount = round(scheme_commission_amount, 2),
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
      round(scheme_commission_amount, 2), monthly_payment
    );
  end loop;
end;
$$;
grant execute on function public.chit_update_fixed_scheme(uuid,text,numeric,integer,integer,numeric,numeric,numeric,numeric,date,numeric,numeric) to authenticated;

create or replace function public.chit_finalize_fixed_lift(
  input_scheme_id uuid, input_month_number integer,
  input_enrollment_id uuid, input_lift_date date
) returns uuid language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; lift public.fixed_chit_lifts%rowtype;
  remaining integer; payment_month integer;
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
  remaining := s.duration_months - input_month_number;
  update public.fixed_chit_lifts set
    enrollment_id = input_enrollment_id, amount_paid_to_member = lift.lift_amount,
    remaining_months = remaining,
    total_remaining_payment = round(lift.monthly_payment * remaining, 2),
    lift_date = input_lift_date, status = 'completed',
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
    jsonb_build_object('month', input_month_number, 'lift_amount', lift.lift_amount, 'remaining_months', remaining), auth.uid());
  return lift.id;
end;
$$;
grant execute on function public.chit_finalize_fixed_lift(uuid,integer,uuid,date) to authenticated;

create or replace function public.chit_update_fixed_payment(
  input_payment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text default null,
  input_notes text default null
) returns void language plpgsql security definer set search_path = public
as $$
declare payment public.fixed_chit_payments%rowtype;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record Fixed Chit payments'; end if;
  select * into payment from public.fixed_chit_payments
    where id = input_payment_id and organization_id = public.current_organization_id() for update;
  if payment.id is null then raise exception 'Payment schedule item not found'; end if;
  if input_amount_paid <= 0 or input_amount_paid > payment.amount_due then raise exception 'Invalid payment amount'; end if;
  update public.fixed_chit_payments set
    amount_paid = round(input_amount_paid, 2), paid_date = input_paid_date,
    payment_mode = input_payment_mode,
    payment_reference = nullif(trim(input_payment_reference), ''),
    notes = nullif(trim(input_notes), ''), collected_by = auth.uid(),
    status = case when round(input_amount_paid, 2) = amount_due then 'paid' else 'partially_paid' end,
    updated_at = now()
  where id = payment.id;
end;
$$;
grant execute on function public.chit_update_fixed_payment(uuid,numeric,date,public.payment_mode,text,text) to authenticated;

create or replace function public.chit_delete_fixed_payment(input_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Fixed Chit payments'; end if;
  update public.fixed_chit_payments set amount_paid = 0, paid_date = null,
    payment_mode = null, payment_reference = null, notes = null,
    collected_by = null, status = 'due', updated_at = now()
  where id = input_payment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Payment schedule item not found'; end if;
end;
$$;
grant execute on function public.chit_delete_fixed_payment(uuid) to authenticated;

create or replace function public.chit_require_auction_scheme()
returns trigger language plpgsql set search_path = public
as $$
begin
  if exists (select 1 from public.chit_schemes where id = new.scheme_id and chit_type <> 'auction') then
    raise exception 'Auction and live bidding actions are not available for Fixed Chits';
  end if;
  return new;
end;
$$;

drop trigger if exists chit_live_auction_scheme_type_guard on public.chit_live_auctions;
create trigger chit_live_auction_scheme_type_guard before insert on public.chit_live_auctions
for each row execute function public.chit_require_auction_scheme();
drop trigger if exists chit_cycle_scheme_type_guard on public.chit_cycles;
create trigger chit_cycle_scheme_type_guard before insert on public.chit_cycles
for each row execute function public.chit_require_auction_scheme();

create or replace function public.chit_customer_dashboard(input_enrollment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype; member public.chit_members%rowtype;
  credential public.chit_member_portal_credentials%rowtype; s public.chit_schemes%rowtype;
  payload jsonb; is_eligible boolean;
begin
  select * into enrollment from public.chit_enrollments where id = input_enrollment_id;
  if enrollment.id is null then raise exception 'Member not found'; end if;
  select * into member from public.chit_members where id = enrollment.member_id;
  select * into credential from public.chit_member_portal_credentials where enrollment_id = enrollment.id;
  select * into s from public.chit_schemes where id = enrollment.scheme_id;
  if s.chit_type = 'fixed' then
    return jsonb_build_object(
      'portalId', credential.portal_id, 'enrollmentId', enrollment.id,
      'ticketNumber', enrollment.ticket_number, 'memberName', member.full_name,
      'phone', member.phone, 'address', member.address, 'scheme', to_jsonb(s),
      'fixedLift', coalesce((
        select to_jsonb(l) from public.fixed_chit_lifts l
        where l.enrollment_id = enrollment.id and l.status = 'completed'
      ), 'null'::jsonb),
      'fixedPayments', coalesce((
        select jsonb_agg(to_jsonb(p) order by p.payment_month)
        from public.fixed_chit_payments p where p.enrollment_id = enrollment.id
      ), '[]'::jsonb),
      'auction', null, 'bids', '[]'::jsonb, 'wins', '[]'::jsonb,
      'eligible', false, 'bidModel', null
    );
  end if;
  payload := public.chit_live_auction_payload(enrollment.scheme_id);
  select coalesce((m->>'eligible')::boolean, false) into is_eligible
    from jsonb_array_elements(payload->'members') m
    where m->>'enrollment_id' = enrollment.id::text limit 1;
  return jsonb_build_object(
    'portalId', credential.portal_id, 'enrollmentId', enrollment.id,
    'ticketNumber', enrollment.ticket_number, 'memberName', member.full_name,
    'phone', member.phone, 'address', member.address, 'scheme', payload->'scheme',
    'auction', payload->'auction', 'leadingBid', payload->'leading_bid',
    'latestBid', payload->'latest_bid', 'bids', payload->'bids',
    'bidModel', payload->'bid_model', 'eligible', coalesce(is_eligible, false),
    'wins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', c.cycle_number, 'bidAmount', b.bid_amount,
        'bidDate', c.cycle_date, 'status', 'Winner'
      ) order by c.cycle_number)
      from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id
      where c.scheme_id = enrollment.scheme_id
        and b.enrollment_id = enrollment.id and b.status = 'winner'
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.chit_customer_dashboard(uuid) from public, anon, authenticated;
