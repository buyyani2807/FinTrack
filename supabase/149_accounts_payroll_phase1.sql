-- 149: Payroll phase 1. Advances and loans, overtime, daily and hourly pay,
-- company holidays, and leave balances.
-- Safe to re-run. Apply after 148. Deploy the client together with it: without this
-- migration Payroll still opens, and the new screens say that 149 is needed.
--
-- What changes:
--   acc_payroll_profiles   how the person is paid (monthly, daily, hourly), the rate,
--                          the overtime rate, and the paid and sick leave allowed in a year
--   acc_payroll_days       hours worked and overtime hours for the day
--   acc_payroll_holidays   company holidays: a paid day off for everyone
--   acc_payroll_advances   money given to an employee ahead of pay
--   acc_payroll_advance_recoveries   what each posted month took back
--
-- Bonus, incentive and a typed overtime amount are kept on the pay run's own lines,
-- like the month's deductions, so no table is needed for them.
--
-- Who can do what: the same as the rest of Payroll. Owner and accountant write,
-- viewer reads, a cashier neither reads nor writes.

alter table public.acc_payroll_profiles
  add column if not exists pay_type text not null default 'monthly',
  add column if not exists rate numeric(14, 2) not null default 0,
  add column if not exists overtime_rate numeric(14, 2) not null default 0,
  add column if not exists paid_leave_quota numeric(6, 1) not null default 0,
  add column if not exists sick_leave_quota numeric(6, 1) not null default 0;

alter table public.acc_payroll_profiles drop constraint if exists acc_payroll_profiles_phase1_check;
alter table public.acc_payroll_profiles add constraint acc_payroll_profiles_phase1_check check (
  pay_type in ('monthly', 'daily', 'hourly')
  and rate >= 0 and overtime_rate >= 0
  and paid_leave_quota between 0 and 366 and sick_leave_quota between 0 and 366
);

alter table public.acc_payroll_days
  add column if not exists hours numeric(5, 2) not null default 0,
  add column if not exists overtime_hours numeric(5, 2) not null default 0;

alter table public.acc_payroll_days drop constraint if exists acc_payroll_days_hours_check;
alter table public.acc_payroll_days add constraint acc_payroll_days_hours_check check (
  hours between 0 and 24 and overtime_hours between 0 and 24
);

create table if not exists public.acc_payroll_holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  unique (company_id, holiday_date)
);

create table if not exists public.acc_payroll_advances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  kind text not null default 'advance' check (kind in ('advance', 'loan')),
  given_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  emi numeric(14, 2) not null default 0 check (emi >= 0),
  note text,
  post_to_books boolean not null default true,
  voucher_id uuid references public.acc_vouchers(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (emi <= amount)
);

create index if not exists acc_payroll_advances_party_idx
  on public.acc_payroll_advances (company_id, party_id, status);

create table if not exists public.acc_payroll_advance_recoveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  advance_id uuid not null references public.acc_payroll_advances(id) on delete cascade,
  period_month date not null,
  amount numeric(14, 2) not null check (amount > 0),
  source text not null default 'salary' check (source in ('salary', 'settlement')),
  created_at timestamptz not null default now(),
  unique (advance_id, period_month, source)
);

alter table public.acc_payroll_holidays enable row level security;
alter table public.acc_payroll_advances enable row level security;
alter table public.acc_payroll_advance_recoveries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['acc_payroll_holidays', 'acc_payroll_advances', 'acc_payroll_advance_recoveries']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id = public.current_organization_id()
           and company_id = public.acc_request_company_id()
           and public.can_accounts_read())', t || '_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    -- Same cashier rules as the other payroll tables (142).
    if to_regprocedure('public.acc_cashier_block_write()') is not null then
      execute format('drop trigger if exists acc_cashier_block_write on public.%I', t);
      execute format(
        'create trigger acc_cashier_block_write before insert or update or delete on public.%I
           for each row execute function public.acc_cashier_block_write()', t);
    end if;
    if to_regprocedure('public.acc_is_cashier()') is not null then
      execute format('drop policy if exists acc_cashier_no_read on public.%I', t);
      execute format(
        'create policy acc_cashier_no_read on public.%I as restrictive for select to authenticated
           using (not public.acc_is_cashier())', t);
    end if;
  end loop;
end;
$$;

-- Ledger for money given to staff ahead of pay.
insert into public.acc_coa (organization_id, company_id, code, name, group_type, account_type, is_system)
select c.organization_id, c.id, '1210', 'Staff advances', 'asset', 'other', false
from public.acc_companies c
on conflict (company_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Read: everything Payroll shows for one month.
-- ---------------------------------------------------------------------------
create or replace function public.acc_payroll_bundle(input_company_id uuid, input_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_period date;
  v_year_start date;
  v_year_end date;
begin
  if not public.can_accounts_read() then raise exception 'Accounts read access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  v_period := date_trunc('month', coalesce(input_month, current_date))::date;
  v_year_start := date_trunc('year', v_period)::date;
  v_year_end := (v_year_start + interval '1 year' - interval '1 day')::date;
  return jsonb_build_object(
    'phase', 1,
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id', p.party_id,
        'basic', p.basic,
        'hra', p.hra,
        'allowance', p.allowance,
        'day_basis', p.day_basis,
        'pay_type', p.pay_type,
        'rate', p.rate,
        'overtime_rate', p.overtime_rate,
        'paid_leave_quota', p.paid_leave_quota,
        'sick_leave_quota', p.sick_leave_quota,
        'pf', p.pf,
        'esi', p.esi,
        'professional_tax', p.professional_tax,
        'tds', p.tds,
        'other_deduction', p.other_deduction
      ) order by party.name)
      from public.acc_payroll_profiles p
      join public.acc_parties party on party.id = p.party_id
      where p.company_id = v_company_id
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id', d.party_id,
        'work_date', d.work_date,
        'status', d.status,
        'hours', d.hours,
        'overtime_hours', d.overtime_hours
      ))
      from public.acc_payroll_days d
      where d.company_id = v_company_id
        and d.work_date >= v_period
        and d.work_date < (v_period + interval '1 month')::date
    ), '[]'::jsonb),
    'leave', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'party_id', l.party_id,
        'leave_type', l.leave_type,
        'from_date', l.from_date,
        'to_date', l.to_date,
        'note', coalesce(l.note, '')
      ) order by l.from_date desc)
      from (
        select * from public.acc_payroll_leave
        where acc_payroll_leave.company_id = v_company_id
        order by from_date desc
        limit 200
      ) l
    ), '[]'::jsonb),
    -- Leave days taken in the calendar year of the chosen month, for the balance.
    'leave_used', coalesce((
      select jsonb_agg(jsonb_build_object('party_id', u.party_id, 'leave_type', u.leave_type, 'days', u.days))
      from (
        select l.party_id, l.leave_type,
               sum(least(l.to_date, v_year_end) - greatest(l.from_date, v_year_start) + 1) as days
        from public.acc_payroll_leave l
        where l.company_id = v_company_id
          and l.from_date <= v_year_end and l.to_date >= v_year_start
        group by l.party_id, l.leave_type
      ) u
    ), '[]'::jsonb),
    'holidays', coalesce((
      select jsonb_agg(jsonb_build_object('date', h.holiday_date, 'name', h.name) order by h.holiday_date)
      from public.acc_payroll_holidays h
      where h.company_id = v_company_id
        and h.holiday_date >= v_year_start and h.holiday_date <= v_year_end
    ), '[]'::jsonb),
    'advances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'party_id', a.party_id,
        'kind', a.kind,
        'given_on', a.given_on,
        'amount', a.amount,
        'emi', a.emi,
        'note', coalesce(a.note, ''),
        'post_to_books', a.post_to_books,
        'voucher_id', a.voucher_id,
        'status', a.status,
        'recovered', coalesce((
          select sum(r.amount) from public.acc_payroll_advance_recoveries r where r.advance_id = a.id
        ), 0)
      ) order by a.given_on desc, a.created_at desc)
      from public.acc_payroll_advances a
      where a.company_id = v_company_id and a.status <> 'cancelled'
    ), '[]'::jsonb),
    'run', (
      select jsonb_build_object(
        'id', r.id,
        'period_month', r.period_month,
        'status', r.status,
        'pay_date', r.pay_date,
        'pay_mode', r.pay_mode,
        'pay_account_id', r.pay_account_id,
        'lines', r.lines,
        'posted_at', r.posted_at
      )
      from public.acc_payroll_runs r
      where r.company_id = v_company_id and r.period_month = v_period
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Pay on record. One jsonb argument so later fields do not change the signature.
-- 150 replaces this to keep a history of pay changes.
-- ---------------------------------------------------------------------------
create or replace function public.acc_save_payroll_profile_v2(input_company_id uuid, input_party_id uuid, input_profile jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  org_id uuid;
  saved_id uuid;
  p jsonb := coalesce(input_profile, '{}'::jsonb);
  v_pay_type text := coalesce(nullif(p->>'pay_type', ''), 'monthly');
  v_basic numeric := coalesce(nullif(p->>'basic', '')::numeric, 0);
  v_hra numeric := coalesce(nullif(p->>'hra', '')::numeric, 0);
  v_allowance numeric := coalesce(nullif(p->>'allowance', '')::numeric, 0);
  v_rate numeric := coalesce(nullif(p->>'rate', '')::numeric, 0);
  v_overtime numeric := coalesce(nullif(p->>'overtime_rate', '')::numeric, 0);
  v_day_basis integer := coalesce(nullif(p->>'day_basis', '')::integer, 0);
  v_paid numeric := coalesce(nullif(p->>'paid_leave_quota', '')::numeric, 0);
  v_sick numeric := coalesce(nullif(p->>'sick_leave_quota', '')::numeric, 0);
  v_pf numeric := coalesce(nullif(p->>'pf', '')::numeric, 0);
  v_esi numeric := coalesce(nullif(p->>'esi', '')::numeric, 0);
  v_pt numeric := coalesce(nullif(p->>'professional_tax', '')::numeric, 0);
  v_tds numeric := coalesce(nullif(p->>'tds', '')::numeric, 0);
  v_other numeric := coalesce(nullif(p->>'other_deduction', '')::numeric, 0);
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(v_company_id, input_party_id);
  if v_pay_type not in ('monthly', 'daily', 'hourly') then raise exception 'Choose monthly, daily, or hourly pay'; end if;
  if v_day_basis not in (0, 26, 30) then raise exception 'Choose days in the month, 26 days, or 30 days'; end if;
  if least(v_basic, v_hra, v_allowance, v_rate, v_overtime, v_paid, v_sick, v_pf, v_esi, v_pt, v_tds, v_other) < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if greatest(v_paid, v_sick) > 366 then raise exception 'Leave in a year cannot be more than 366 days'; end if;
  if v_pay_type = 'monthly' then
    v_rate := 0;
  else
    v_basic := 0; v_hra := 0; v_allowance := 0;
    if v_rate <= 0 then raise exception 'Enter the rate'; end if;
  end if;
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  insert into public.acc_payroll_profiles (
    organization_id, company_id, party_id, basic, hra, allowance, day_basis,
    pay_type, rate, overtime_rate, paid_leave_quota, sick_leave_quota,
    pf, esi, professional_tax, tds, other_deduction
  ) values (
    org_id, v_company_id, input_party_id, v_basic, v_hra, v_allowance, v_day_basis,
    v_pay_type, v_rate, v_overtime, v_paid, v_sick,
    v_pf, v_esi, v_pt, v_tds, v_other
  )
  on conflict (company_id, party_id) do update set
    basic = excluded.basic,
    hra = excluded.hra,
    allowance = excluded.allowance,
    day_basis = excluded.day_basis,
    pay_type = excluded.pay_type,
    rate = excluded.rate,
    overtime_rate = excluded.overtime_rate,
    paid_leave_quota = excluded.paid_leave_quota,
    sick_leave_quota = excluded.sick_leave_quota,
    pf = excluded.pf,
    esi = excluded.esi,
    professional_tax = excluded.professional_tax,
    tds = excluded.tds,
    other_deduction = excluded.other_deduction
  returning id into saved_id;
  return saved_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance with hours. Same call as before; each day may now carry hours.
-- ---------------------------------------------------------------------------
create or replace function public.acc_set_payroll_days(
  input_company_id uuid,
  input_party_id uuid,
  input_month date,
  input_days jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  org_id uuid;
  v_period date;
  row jsonb;
  v_work_date date;
  day_status text;
  v_hours numeric;
  v_overtime numeric;
  saved integer := 0;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(v_company_id, input_party_id);
  v_period := date_trunc('month', input_month)::date;
  perform public.acc_payroll_month_open(v_company_id, v_period, (v_period + interval '1 month' - interval '1 day')::date);
  if jsonb_typeof(coalesce(input_days, '[]'::jsonb)) <> 'array' then raise exception 'Attendance could not be read'; end if;
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  delete from public.acc_payroll_days d
  where d.company_id = v_company_id
    and d.party_id = input_party_id
    and d.work_date >= v_period
    and d.work_date < (v_period + interval '1 month')::date;
  for row in select value from jsonb_array_elements(input_days)
  loop
    v_work_date := (row->>'date')::date;
    day_status := row->>'status';
    v_hours := coalesce(nullif(row->>'hours', '')::numeric, 0);
    v_overtime := coalesce(nullif(row->>'overtimeHours', '')::numeric, 0);
    if v_work_date is null or v_work_date < v_period or v_work_date >= (v_period + interval '1 month')::date then
      raise exception 'Attendance is outside this month';
    end if;
    if day_status not in ('present', 'half', 'absent', 'week_off', 'holiday') then
      raise exception 'Unknown attendance';
    end if;
    if v_hours < 0 or v_hours > 24 or v_overtime < 0 or v_overtime > 24 then
      raise exception 'Hours in a day are between 0 and 24';
    end if;
    insert into public.acc_payroll_days (organization_id, company_id, party_id, work_date, status, hours, overtime_hours)
    values (org_id, v_company_id, input_party_id, v_work_date, day_status, v_hours, v_overtime);
    saved := saved + 1;
  end loop;
  return saved;
end;
$$;

-- ---------------------------------------------------------------------------
-- Company holidays.
-- ---------------------------------------------------------------------------
create or replace function public.acc_save_payroll_holiday(input_company_id uuid, input_date date, input_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  org_id uuid;
  saved_id uuid;
  v_name text := nullif(left(trim(coalesce(input_name, '')), 80), '');
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  if input_date is null then raise exception 'Choose the date'; end if;
  if v_name is null then raise exception 'Name the holiday'; end if;
  perform public.acc_payroll_month_open(v_company_id, input_date, input_date);
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  insert into public.acc_payroll_holidays (organization_id, company_id, holiday_date, name)
  values (org_id, v_company_id, input_date, v_name)
  on conflict (company_id, holiday_date) do update set name = excluded.name
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.acc_delete_payroll_holiday(input_company_id uuid, input_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_month_open(v_company_id, input_date, input_date);
  delete from public.acc_payroll_holidays where company_id = v_company_id and holiday_date = input_date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Advances and loans.
-- The client saves the advance, posts the payment voucher with the advance id as
-- its request id, then saves again with the voucher. A retry repeats safely.
-- ---------------------------------------------------------------------------
create or replace function public.acc_save_payroll_advance(input_company_id uuid, input_advance jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  org_id uuid;
  a jsonb := coalesce(input_advance, '{}'::jsonb);
  v_id uuid := nullif(a->>'id', '')::uuid;
  v_party uuid := nullif(a->>'party_id', '')::uuid;
  v_kind text := coalesce(nullif(a->>'kind', ''), 'advance');
  v_given date := nullif(a->>'given_on', '')::date;
  v_amount numeric := coalesce(nullif(a->>'amount', '')::numeric, 0);
  v_emi numeric := coalesce(nullif(a->>'emi', '')::numeric, 0);
  v_note text := nullif(left(coalesce(a->>'note', ''), 240), '');
  v_post boolean := coalesce((a->>'post_to_books')::boolean, true);
  v_voucher uuid := nullif(a->>'voucher_id', '')::uuid;
  existing public.acc_payroll_advances;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  if v_id is null then raise exception 'The advance could not be read'; end if;
  select * into existing from public.acc_payroll_advances where id = v_id;
  if existing.id is not null then
    if existing.company_id <> v_company_id then raise exception 'Advance was not found'; end if;
    if existing.status = 'cancelled' then raise exception 'That advance was cancelled'; end if;
    -- Only the voucher can be added afterwards: the amount given is not edited.
    if v_voucher is not null then
      if not exists (select 1 from public.acc_vouchers v where v.id = v_voucher and v.company_id = v_company_id) then
        raise exception 'The payment voucher was not found';
      end if;
      update public.acc_payroll_advances set voucher_id = v_voucher where id = v_id;
    end if;
    return v_id;
  end if;
  perform public.acc_payroll_require_employee(v_company_id, v_party);
  if v_kind not in ('advance', 'loan') then raise exception 'Choose advance or loan'; end if;
  if v_given is null or v_given > current_date + 1 then raise exception 'Choose the date the money was given'; end if;
  if v_amount <= 0 then raise exception 'Enter the amount given'; end if;
  if v_emi < 0 or v_emi > v_amount then raise exception 'The monthly recovery is more than the amount given'; end if;
  if v_kind = 'loan' and v_emi <= 0 then raise exception 'Enter how much to recover each month'; end if;
  if v_voucher is not null and not exists (select 1 from public.acc_vouchers v where v.id = v_voucher and v.company_id = v_company_id) then
    raise exception 'The payment voucher was not found';
  end if;
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  insert into public.acc_payroll_advances (
    id, organization_id, company_id, party_id, kind, given_on, amount, emi, note, post_to_books, voucher_id
  ) values (
    v_id, org_id, v_company_id, v_party, v_kind, v_given, v_amount, v_emi, v_note, v_post, v_voucher
  );
  return v_id;
end;
$$;

-- Cancel an advance nothing has been recovered from. The caller cancels its voucher first.
create or replace function public.acc_cancel_payroll_advance(input_company_id uuid, input_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  if not exists (select 1 from public.acc_payroll_advances a where a.id = input_id and a.company_id = v_company_id) then
    raise exception 'Advance was not found';
  end if;
  if exists (select 1 from public.acc_payroll_advance_recoveries r where r.advance_id = input_id) then
    raise exception 'Part of this advance is already recovered from salary. It cannot be cancelled';
  end if;
  update public.acc_payroll_advances set status = 'cancelled' where id = input_id;
end;
$$;

-- Record what one posted month (or the final settlement) took back from an advance.
-- Saving the same advance and month again replaces the amount, so a retry is safe.
create or replace function public.acc_set_advance_recovery(
  input_company_id uuid,
  input_advance_id uuid,
  input_month date,
  input_amount numeric,
  input_source text default 'salary'
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_period date;
  adv public.acc_payroll_advances;
  others numeric;
  v_amount numeric := round(coalesce(input_amount, 0), 2);
  v_source text := coalesce(nullif(input_source, ''), 'salary');
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  v_period := date_trunc('month', input_month)::date;
  if v_source not in ('salary', 'settlement') then raise exception 'Unknown recovery'; end if;
  select * into adv from public.acc_payroll_advances a
   where a.id = input_advance_id and a.company_id = v_company_id for update;
  if adv.id is null or adv.status = 'cancelled' then raise exception 'Advance was not found'; end if;
  if v_amount < 0 then raise exception 'Recovery cannot be negative'; end if;
  select coalesce(sum(r.amount), 0) into others
  from public.acc_payroll_advance_recoveries r
  where r.advance_id = adv.id and not (r.period_month = v_period and r.source = v_source);
  if others + v_amount > adv.amount then raise exception 'Recovery is more than the advance outstanding'; end if;
  if v_amount = 0 then
    delete from public.acc_payroll_advance_recoveries
     where advance_id = adv.id and period_month = v_period and source = v_source;
  else
    insert into public.acc_payroll_advance_recoveries (organization_id, company_id, advance_id, period_month, amount, source)
    values (adv.organization_id, v_company_id, adv.id, v_period, v_amount, v_source)
    on conflict (advance_id, period_month, source) do update set amount = excluded.amount;
  end if;
  update public.acc_payroll_advances
     set status = case when others + v_amount >= amount then 'closed' else 'open' end
   where id = adv.id;
  return adv.amount - others - v_amount;
end;
$$;

revoke all on function public.acc_save_payroll_profile_v2(uuid, uuid, jsonb) from public, anon;
revoke all on function public.acc_save_payroll_holiday(uuid, date, text) from public, anon;
revoke all on function public.acc_delete_payroll_holiday(uuid, date) from public, anon;
revoke all on function public.acc_save_payroll_advance(uuid, jsonb) from public, anon;
revoke all on function public.acc_cancel_payroll_advance(uuid, uuid) from public, anon;
revoke all on function public.acc_set_advance_recovery(uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.acc_save_payroll_profile_v2(uuid, uuid, jsonb) to authenticated;
grant execute on function public.acc_save_payroll_holiday(uuid, date, text) to authenticated;
grant execute on function public.acc_delete_payroll_holiday(uuid, date) to authenticated;
grant execute on function public.acc_save_payroll_advance(uuid, jsonb) to authenticated;
grant execute on function public.acc_cancel_payroll_advance(uuid, uuid) to authenticated;
grant execute on function public.acc_set_advance_recovery(uuid, uuid, date, numeric, text) to authenticated;

notify pgrst, 'reload schema';
