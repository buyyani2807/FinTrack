-- Add Fixed Predefined Bid Chits as a third isolated model.
alter table public.chit_schemes drop constraint if exists chit_schemes_type_valid;
alter table public.chit_schemes add constraint chit_schemes_type_valid
  check (chit_type in ('auction', 'fixed', 'fixed_predefined_bid'));
alter table public.chit_schemes drop constraint if exists chit_schemes_fixed_values_valid;
alter table public.chit_schemes add constraint chit_schemes_fixed_values_valid check (
  chit_type <> 'fixed' or (
    fixed_commission_amount >= 0
    and fixed_initial_lift_amount >= 0
    and fixed_monthly_increment >= 0
  )
);

alter table public.chit_schemes add column if not exists predefined_starting_emi numeric(14,2);
alter table public.chit_schemes add column if not exists predefined_emi_increment numeric(14,2);
alter table public.chit_schemes add column if not exists predefined_starting_comm numeric(14,2);
alter table public.chit_schemes add column if not exists predefined_comm_decrement numeric(14,2);
alter table public.chit_schemes add column if not exists predefined_starting_auction_amount numeric(14,2);
alter table public.chit_schemes add column if not exists predefined_auction_decrement numeric(14,2);
alter table public.chit_schemes add column if not exists predefined_starting_bid_amount numeric(14,2);
alter table public.chit_schemes add column if not exists predefined_bid_increment numeric(14,2);
alter table public.chit_schemes add column if not exists predefined_manager_commission_percent numeric(7,4);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chit_schemes_predefined_values_valid') then
    alter table public.chit_schemes add constraint chit_schemes_predefined_values_valid check (
      chit_type <> 'fixed_predefined_bid' or (
        predefined_starting_emi >= 0 and predefined_emi_increment >= 0
        and predefined_starting_comm >= 0 and predefined_comm_decrement >= 0
        and predefined_starting_auction_amount >= 0 and predefined_auction_decrement >= 0
        and predefined_starting_bid_amount >= 0 and predefined_bid_increment >= 0
        and predefined_manager_commission_percent >= 0
        and predefined_manager_commission_percent <= 100
      )
    );
  end if;
end $$;

create table if not exists public.predefined_chit_schedule (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid not null references public.chit_schemes(id) on delete restrict,
  month_number integer not null check (month_number > 0),
  emi numeric(14,2) not null check (emi >= 0),
  comm_amount numeric(14,2) not null check (comm_amount >= 0),
  auction_amount numeric(14,2) not null check (auction_amount >= 0),
  bid_amount numeric(14,2) not null check (bid_amount >= 0),
  manager_commission_percent numeric(7,4) not null check (manager_commission_percent >= 0 and manager_commission_percent <= 100),
  manager_commission numeric(14,2) not null check (manager_commission >= 0),
  net_receivable numeric(14,2) not null check (net_receivable >= 0),
  enrollment_id uuid references public.chit_enrollments(id) on delete restrict,
  assigned_date date,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scheme_id, month_number),
  unique(scheme_id, enrollment_id)
);

create table if not exists public.predefined_chit_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid not null references public.chit_schemes(id) on delete restrict,
  schedule_id uuid not null references public.predefined_chit_schedule(id) on delete restrict,
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
  unique(schedule_id, payment_month)
);

create index if not exists predefined_chit_schedule_scheme_month_idx
  on public.predefined_chit_schedule(scheme_id, month_number);
create index if not exists predefined_chit_payments_member_due_idx
  on public.predefined_chit_payments(enrollment_id, due_date, status);

alter table public.predefined_chit_schedule enable row level security;
alter table public.predefined_chit_payments enable row level security;
revoke insert, update, delete on public.predefined_chit_schedule from authenticated;
revoke insert, update, delete on public.predefined_chit_payments from authenticated;
grant select on public.predefined_chit_schedule, public.predefined_chit_payments to authenticated;

drop policy if exists predefined_chit_schedule_owner_read on public.predefined_chit_schedule;
create policy predefined_chit_schedule_owner_read on public.predefined_chit_schedule for select to authenticated
using (organization_id = public.current_organization_id() and public.chit_is_owner());
drop policy if exists predefined_chit_payments_owner_read on public.predefined_chit_payments;
create policy predefined_chit_payments_owner_read on public.predefined_chit_payments for select to authenticated
using (organization_id = public.current_organization_id() and public.chit_is_owner());

create or replace function public.chit_create_predefined_bid_scheme(
  scheme_name text, scheme_chit_value numeric, scheme_duration_months integer,
  scheme_member_count integer, scheme_start_date date,
  scheme_starting_emi numeric, scheme_emi_increment numeric,
  scheme_starting_comm numeric, scheme_comm_decrement numeric,
  scheme_starting_auction_amount numeric, scheme_auction_decrement numeric,
  scheme_starting_bid_amount numeric, scheme_bid_increment numeric,
  scheme_manager_commission_percent numeric,
  scheme_late_penalty_amount numeric default 0,
  scheme_security_deposit_amount numeric default 0
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; scheme_id uuid; month_no integer; manager_fee numeric;
  row_emi numeric; row_comm numeric; row_auction numeric; row_bid numeric; row_net numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund schemes'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  if nullif(trim(scheme_name), '') is null then raise exception 'Scheme name is required'; end if;
  if scheme_chit_value <= 0 or scheme_duration_months <= 0 or scheme_member_count <= 0 then raise exception 'Scheme values must be positive'; end if;
  if scheme_duration_months > scheme_member_count then raise exception 'Duration cannot exceed member count'; end if;
  if round(round(scheme_chit_value / scheme_member_count, 2) * scheme_member_count, 2) <> round(scheme_chit_value, 2) then
    raise exception 'Chit value must divide evenly across the configured members';
  end if;
  if least(scheme_starting_emi, scheme_emi_increment, scheme_starting_comm, scheme_comm_decrement,
    scheme_starting_auction_amount, scheme_auction_decrement, scheme_starting_bid_amount,
    scheme_bid_increment, scheme_manager_commission_percent, scheme_late_penalty_amount,
    scheme_security_deposit_amount) < 0 then raise exception 'Schedule values cannot be negative'; end if;
  if scheme_manager_commission_percent > 100 then raise exception 'Manager commission percentage is invalid'; end if;
  manager_fee := round(scheme_chit_value * scheme_manager_commission_percent / 100, 2);
  insert into public.chit_schemes(
    organization_id, name, chit_type, chit_value, duration_months, member_count,
    installment_amount, commission_percent, start_date, min_bid_percent, max_bid_percent,
    late_penalty_amount, security_deposit_amount, created_by,
    predefined_starting_emi, predefined_emi_increment,
    predefined_starting_comm, predefined_comm_decrement,
    predefined_starting_auction_amount, predefined_auction_decrement,
    predefined_starting_bid_amount, predefined_bid_increment,
    predefined_manager_commission_percent
  ) values (
    org_id, trim(scheme_name), 'fixed_predefined_bid', round(scheme_chit_value, 2),
    scheme_duration_months, scheme_member_count, round(scheme_chit_value / scheme_member_count, 2),
    0, scheme_start_date, 0, 100, scheme_late_penalty_amount,
    scheme_security_deposit_amount, auth.uid(), round(scheme_starting_emi, 2),
    round(scheme_emi_increment, 2), round(scheme_starting_comm, 2),
    round(scheme_comm_decrement, 2), round(scheme_starting_auction_amount, 2),
    round(scheme_auction_decrement, 2), round(scheme_starting_bid_amount, 2),
    round(scheme_bid_increment, 2), scheme_manager_commission_percent
  ) returning id into scheme_id;
  for month_no in 1..scheme_duration_months loop
    row_emi := round(scheme_starting_emi + ((month_no - 1) * scheme_emi_increment), 2);
    row_comm := round(greatest(0, scheme_starting_comm - ((month_no - 1) * scheme_comm_decrement)), 2);
    row_auction := round(greatest(0, scheme_starting_auction_amount - ((month_no - 1) * scheme_auction_decrement)), 2);
    row_bid := round(scheme_starting_bid_amount + ((month_no - 1) * scheme_bid_increment), 2);
    row_net := round(row_bid - manager_fee, 2);
    if row_net < 0 then raise exception 'Net receivable cannot be negative in month %', month_no; end if;
    insert into public.predefined_chit_schedule(
      organization_id, scheme_id, month_number, emi, comm_amount, auction_amount,
      bid_amount, manager_commission_percent, manager_commission, net_receivable
    ) values (
      org_id, scheme_id, month_no, row_emi, row_comm, row_auction, row_bid,
      scheme_manager_commission_percent, manager_fee, row_net
    );
  end loop;
  return scheme_id;
end;
$$;
grant execute on function public.chit_create_predefined_bid_scheme(text,numeric,integer,integer,date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.chit_update_predefined_schedule_month(
  input_schedule_id uuid, input_emi numeric, input_comm_amount numeric,
  input_auction_amount numeric, input_bid_amount numeric,
  input_manager_commission_percent numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare item public.predefined_chit_schedule%rowtype; s public.chit_schemes%rowtype;
  manager_fee numeric; net_value numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can edit a predefined schedule'; end if;
  select * into item from public.predefined_chit_schedule
    where id = input_schedule_id and organization_id = public.current_organization_id() for update;
  if item.id is null then raise exception 'Schedule month not found'; end if;
  if item.status <> 'pending' then raise exception 'Finalized schedule months cannot be edited'; end if;
  select * into s from public.chit_schemes where id = item.scheme_id;
  if least(input_emi, input_comm_amount, input_auction_amount, input_bid_amount, input_manager_commission_percent) < 0
    or input_manager_commission_percent > 100 then raise exception 'Invalid schedule values'; end if;
  manager_fee := round(s.chit_value * input_manager_commission_percent / 100, 2);
  net_value := round(input_bid_amount - manager_fee, 2);
  if net_value < 0 then raise exception 'Net receivable cannot be negative'; end if;
  update public.predefined_chit_schedule set emi = round(input_emi, 2),
    comm_amount = round(input_comm_amount, 2), auction_amount = round(input_auction_amount, 2),
    bid_amount = round(input_bid_amount, 2),
    manager_commission_percent = input_manager_commission_percent,
    manager_commission = manager_fee, net_receivable = net_value, updated_at = now()
  where id = item.id;
  insert into public.chit_audit_log(organization_id, scheme_id, action, before_data, after_data, actor_id)
  values(item.organization_id, item.scheme_id, 'predefined_schedule_month_edited', to_jsonb(item),
    jsonb_build_object('month', item.month_number, 'emi', input_emi, 'comm', input_comm_amount,
      'auction_amount', input_auction_amount, 'bid_amount', input_bid_amount,
      'manager_commission_percent', input_manager_commission_percent, 'net_receivable', net_value), auth.uid());
end;
$$;
grant execute on function public.chit_update_predefined_schedule_month(uuid,numeric,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.chit_finalize_predefined_month(
  input_schedule_id uuid, input_enrollment_id uuid, input_assigned_date date
) returns uuid language plpgsql security definer set search_path = public
as $$
declare item public.predefined_chit_schedule%rowtype; s public.chit_schemes%rowtype; payment_month integer;
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
  update public.predefined_chit_schedule set enrollment_id = input_enrollment_id,
    assigned_date = input_assigned_date, status = 'completed',
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
      'manager_commission', item.manager_commission, 'net_receivable', item.net_receivable), auth.uid());
  return item.id;
end;
$$;
grant execute on function public.chit_finalize_predefined_month(uuid,uuid,date) to authenticated;

create or replace function public.chit_update_predefined_payment(
  input_payment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text default null,
  input_notes text default null
) returns void language plpgsql security definer set search_path = public
as $$
declare payment public.predefined_chit_payments%rowtype;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record predefined Chit payments'; end if;
  select * into payment from public.predefined_chit_payments
    where id = input_payment_id and organization_id = public.current_organization_id() for update;
  if payment.id is null then raise exception 'Payment schedule item not found'; end if;
  if input_amount_paid <= 0 or input_amount_paid > payment.amount_due then raise exception 'Invalid payment amount'; end if;
  update public.predefined_chit_payments set amount_paid = round(input_amount_paid, 2),
    paid_date = input_paid_date, payment_mode = input_payment_mode,
    payment_reference = nullif(trim(input_payment_reference), ''), notes = nullif(trim(input_notes), ''),
    collected_by = auth.uid(),
    status = case when round(input_amount_paid, 2) = amount_due then 'paid' else 'partially_paid' end,
    updated_at = now()
  where id = payment.id;
end;
$$;
grant execute on function public.chit_update_predefined_payment(uuid,numeric,date,public.payment_mode,text,text) to authenticated;

create or replace function public.chit_delete_predefined_payment(input_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete predefined Chit payments'; end if;
  update public.predefined_chit_payments set amount_paid = 0, paid_date = null,
    payment_mode = null, payment_reference = null, notes = null,
    collected_by = null, status = 'due', updated_at = now()
  where id = input_payment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Payment schedule item not found'; end if;
end;
$$;
grant execute on function public.chit_delete_predefined_payment(uuid) to authenticated;

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
      'fixedLift', coalesce((select to_jsonb(l) from public.fixed_chit_lifts l where l.enrollment_id = enrollment.id and l.status = 'completed'), 'null'::jsonb),
      'fixedPayments', coalesce((select jsonb_agg(to_jsonb(p) order by p.payment_month) from public.fixed_chit_payments p where p.enrollment_id = enrollment.id), '[]'::jsonb),
      'auction', null, 'bids', '[]'::jsonb, 'wins', '[]'::jsonb, 'eligible', false, 'bidModel', null
    );
  elsif s.chit_type = 'fixed_predefined_bid' then
    return jsonb_build_object(
      'portalId', credential.portal_id, 'enrollmentId', enrollment.id,
      'ticketNumber', enrollment.ticket_number, 'memberName', member.full_name,
      'phone', member.phone, 'address', member.address, 'scheme', to_jsonb(s),
      'predefinedMonth', coalesce((select to_jsonb(ps) from public.predefined_chit_schedule ps where ps.enrollment_id = enrollment.id and ps.status = 'completed'), 'null'::jsonb),
      'predefinedPayments', coalesce((select jsonb_agg(to_jsonb(pp) order by pp.payment_month) from public.predefined_chit_payments pp where pp.enrollment_id = enrollment.id), '[]'::jsonb),
      'auction', null, 'bids', '[]'::jsonb, 'wins', '[]'::jsonb, 'eligible', false, 'bidModel', null
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
      select jsonb_agg(jsonb_build_object('month', c.cycle_number, 'bidAmount', b.bid_amount, 'bidDate', c.cycle_date, 'status', 'Winner') order by c.cycle_number)
      from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id
      where c.scheme_id = enrollment.scheme_id and b.enrollment_id = enrollment.id and b.status = 'winner'
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.chit_customer_dashboard(uuid) from public, anon, authenticated;
