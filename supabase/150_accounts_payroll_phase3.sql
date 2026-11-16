-- 150: Payroll phase 3. Staff details and bank accounts, salary revision history,
-- final settlement, and the staff login (Staff ID + PIN) with punch in / punch out.
-- Safe to re-run. Apply after 149. Deploy the client together with it.
--
-- Staff login, in short:
--   * The owner issues a Staff ID (ST-XXXXXXXX) and a 6-digit PIN from Payroll > Staff app.
--     The PIN is shown once and only its hash is stored. Five wrong PINs lock the ID for 15 minutes.
--   * Staff are NOT Supabase Auth users and get no role in the workspace. They hold an
--     opaque session cookie. Every staff_portal_* function below is callable by the
--     service role only (the /api/staff endpoint), and works for that one employee.
--   * A punch stores the time, the location and a small selfie. Selfies are kept in
--     acc_payroll_punch_photos for 90 days, then removed. Only the owner can open them.
--
-- Who can do what in the workspace: owner and accountant write, viewer reads, a cashier
-- neither reads nor writes. Issuing a PIN and opening a selfie are owner-only.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.acc_payroll_staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  joined_on date,
  left_on date,
  fixed_term boolean not null default false,
  bank_holder text,
  bank_account text,
  bank_ifsc text,
  bank_name text,
  unique (company_id, party_id)
);

create table if not exists public.acc_payroll_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  effective_from date not null,
  pay_type text not null default 'monthly' check (pay_type in ('monthly', 'daily', 'hourly')),
  basic numeric(14, 2) not null default 0,
  hra numeric(14, 2) not null default 0,
  allowance numeric(14, 2) not null default 0,
  rate numeric(14, 2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  unique (company_id, party_id, effective_from)
);

create table if not exists public.acc_payroll_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  last_day date not null,
  pay_date date,
  unpaid_salary numeric(14, 2) not null default 0,
  leave_days numeric(6, 1) not null default 0,
  leave_encashment numeric(14, 2) not null default 0,
  gratuity numeric(14, 2) not null default 0,
  other_pay numeric(14, 2) not null default 0,
  advance_recovery numeric(14, 2) not null default 0,
  other_deduction numeric(14, 2) not null default 0,
  net numeric(14, 2) not null default 0,
  note text,
  voucher_id uuid references public.acc_vouchers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  created_at timestamptz not null default now(),
  unique (company_id, party_id)
);

create table if not exists public.acc_payroll_punches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  work_date date not null,
  in_at timestamptz not null default now(),
  in_lat numeric(9, 6),
  in_lng numeric(9, 6),
  in_accuracy numeric(8, 1),
  out_at timestamptz,
  out_lat numeric(9, 6),
  out_lng numeric(9, 6),
  out_accuracy numeric(8, 1),
  unique (company_id, party_id, work_date)
);

create table if not exists public.acc_payroll_punch_photos (
  punch_id uuid not null references public.acc_payroll_punches(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  content_base64 text not null,
  created_at timestamptz not null default now(),
  primary key (punch_id, kind)
);

create table if not exists public.acc_payroll_leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  leave_type text not null check (leave_type in ('paid', 'unpaid', 'sick')),
  from_date date not null,
  to_date date not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (to_date >= from_date)
);

create table if not exists public.acc_staff_portal_credentials (
  party_id uuid primary key references public.acc_parties(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  staff_id text not null unique,
  pin_hash text not null,
  enabled boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.acc_staff_portal_sessions (
  token_hash text primary key,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.acc_payroll_staff enable row level security;
alter table public.acc_payroll_revisions enable row level security;
alter table public.acc_payroll_settlements enable row level security;
alter table public.acc_payroll_punches enable row level security;
alter table public.acc_payroll_punch_photos enable row level security;
alter table public.acc_payroll_leave_requests enable row level security;
alter table public.acc_staff_portal_credentials enable row level security;
alter table public.acc_staff_portal_sessions enable row level security;

-- PIN hashes, sessions and selfies are never readable from the browser.
revoke all on public.acc_staff_portal_credentials from public, anon, authenticated;
revoke all on public.acc_staff_portal_sessions from public, anon, authenticated;
revoke all on public.acc_payroll_punch_photos from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'acc_payroll_staff', 'acc_payroll_revisions', 'acc_payroll_settlements',
    'acc_payroll_punches', 'acc_payroll_leave_requests'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id = public.current_organization_id()
           and company_id = public.acc_request_company_id()
           and public.can_accounts_read())', t || '_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
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

-- Every salary on record today becomes the starting point of its history.
insert into public.acc_payroll_revisions (organization_id, company_id, party_id, effective_from, pay_type, basic, hra, allowance, rate, note)
select p.organization_id, p.company_id, p.party_id, date '2000-01-01', p.pay_type, p.basic, p.hra, p.allowance, p.rate, 'Starting pay'
from public.acc_payroll_profiles p
where not exists (
  select 1 from public.acc_payroll_revisions r where r.company_id = p.company_id and r.party_id = p.party_id
);

-- ---------------------------------------------------------------------------
-- Pay on record, now with history. Replaces the 149 version.
-- A change takes effect from the 1st of the chosen month. Months before it keep the old pay.
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
  v_effective date := date_trunc('month', coalesce(nullif(p->>'effective_from', '')::date, current_date))::date;
  v_note text := nullif(left(coalesce(p->>'revision_note', ''), 160), '');
  latest public.acc_payroll_revisions;
  pay_changed boolean;
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

  -- History. The first pay ever saved is the starting point, whatever month was chosen.
  if not exists (select 1 from public.acc_payroll_revisions r where r.company_id = v_company_id and r.party_id = input_party_id) then
    insert into public.acc_payroll_revisions (organization_id, company_id, party_id, effective_from, pay_type, basic, hra, allowance, rate, note)
    values (org_id, v_company_id, input_party_id, date '2000-01-01', v_pay_type, v_basic, v_hra, v_allowance, v_rate, coalesce(v_note, 'Starting pay'));
  else
    -- The pay that applies in the chosen month today.
    select * into latest from public.acc_payroll_revisions r
     where r.company_id = v_company_id and r.party_id = input_party_id and r.effective_from <= v_effective
     order by r.effective_from desc limit 1;
    pay_changed := latest.id is null
      or (latest.pay_type, latest.basic, latest.hra, latest.allowance, latest.rate)
         is distinct from (v_pay_type, v_basic, v_hra, v_allowance, v_rate);
    if pay_changed then
      -- A month that is already posted keeps the pay it was posted with: the change cannot start inside it.
      if exists (
        select 1 from public.acc_payroll_runs r
        where r.company_id = v_company_id and r.status = 'posted' and r.period_month >= v_effective
          and exists (
            select 1 from jsonb_array_elements(r.lines) l
            where l.value->>'partyId' = input_party_id::text
              and coalesce(nullif(l.value->>'earned', ''), '0')::numeric > 0
          )
      ) then
        raise exception 'Pay for that month is already posted. Choose a later month for the change';
      end if;
      insert into public.acc_payroll_revisions (organization_id, company_id, party_id, effective_from, pay_type, basic, hra, allowance, rate, note)
      values (org_id, v_company_id, input_party_id, v_effective, v_pay_type, v_basic, v_hra, v_allowance, v_rate, v_note)
      on conflict (company_id, party_id, effective_from) do update set
        pay_type = excluded.pay_type, basic = excluded.basic, hra = excluded.hra,
        allowance = excluded.allowance, rate = excluded.rate, note = coalesce(excluded.note, acc_payroll_revisions.note);
    end if;
  end if;

  -- The profile row always carries the newest pay; each month reads its own from the history.
  select * into latest from public.acc_payroll_revisions r
   where r.company_id = v_company_id and r.party_id = input_party_id
   order by r.effective_from desc limit 1;

  insert into public.acc_payroll_profiles (
    organization_id, company_id, party_id, basic, hra, allowance, day_basis,
    pay_type, rate, overtime_rate, paid_leave_quota, sick_leave_quota,
    pf, esi, professional_tax, tds, other_deduction
  ) values (
    org_id, v_company_id, input_party_id, latest.basic, latest.hra, latest.allowance, v_day_basis,
    latest.pay_type, latest.rate, v_overtime, v_paid, v_sick,
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
-- Staff details and bank account.
-- ---------------------------------------------------------------------------
create or replace function public.acc_save_payroll_staff(input_company_id uuid, input_party_id uuid, input_staff jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  org_id uuid;
  saved_id uuid;
  s jsonb := coalesce(input_staff, '{}'::jsonb);
  v_joined date := nullif(s->>'joined_on', '')::date;
  v_account text := nullif(regexp_replace(coalesce(s->>'bank_account', ''), '\s', '', 'g'), '');
  v_ifsc text := nullif(upper(trim(coalesce(s->>'bank_ifsc', ''))), '');
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(v_company_id, input_party_id);
  if v_joined is not null and v_joined > current_date + 366 then raise exception 'Check the joining date'; end if;
  if v_account is not null and v_account !~ '^[0-9]{6,18}$' then raise exception 'The account number is 6 to 18 digits'; end if;
  if v_ifsc is not null and v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then raise exception 'The IFSC is 11 characters, like HDFC0001234'; end if;
  if (v_account is null) <> (v_ifsc is null) then raise exception 'Enter both the account number and the IFSC'; end if;
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  insert into public.acc_payroll_staff (organization_id, company_id, party_id, joined_on, fixed_term, bank_holder, bank_account, bank_ifsc, bank_name)
  values (
    org_id, v_company_id, input_party_id, v_joined, coalesce((s->>'fixed_term')::boolean, false),
    nullif(left(trim(coalesce(s->>'bank_holder', '')), 80), ''), v_account, v_ifsc,
    nullif(left(trim(coalesce(s->>'bank_name', '')), 80), '')
  )
  on conflict (company_id, party_id) do update set
    joined_on = excluded.joined_on,
    fixed_term = excluded.fixed_term,
    bank_holder = excluded.bank_holder,
    bank_account = excluded.bank_account,
    bank_ifsc = excluded.bank_ifsc,
    bank_name = excluded.bank_name
  returning id into saved_id;
  return saved_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Final settlement. Saved first as a draft; saved again with the voucher to finish.
-- Finishing records the last day, switches the employee off, and ends their staff login.
-- ---------------------------------------------------------------------------
create or replace function public.acc_save_payroll_settlement(input_company_id uuid, input_settlement jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  org_id uuid;
  s jsonb := coalesce(input_settlement, '{}'::jsonb);
  v_id uuid := nullif(s->>'id', '')::uuid;
  v_party uuid := nullif(s->>'party_id', '')::uuid;
  v_last date := nullif(s->>'last_day', '')::date;
  v_voucher uuid := nullif(s->>'voucher_id', '')::uuid;
  v_finish boolean := coalesce((s->>'finish')::boolean, false);
  existing public.acc_payroll_settlements;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  if v_id is null or v_party is null then raise exception 'The settlement could not be read'; end if;
  if v_last is null then raise exception 'Choose the last working day'; end if;
  if not exists (select 1 from public.acc_parties p where p.id = v_party and p.company_id = v_company_id and p.party_type = 'employee') then
    raise exception 'Choose an employee';
  end if;
  select * into existing from public.acc_payroll_settlements t where t.company_id = v_company_id and t.party_id = v_party;
  if existing.id is not null and existing.status = 'posted' then
    if existing.id = v_id then return existing.id; end if;
    raise exception 'This employee is already settled';
  end if;
  if v_voucher is not null and not exists (select 1 from public.acc_vouchers v where v.id = v_voucher and v.company_id = v_company_id) then
    raise exception 'The settlement voucher was not found';
  end if;
  if least(
    coalesce(nullif(s->>'unpaid_salary', '')::numeric, 0), coalesce(nullif(s->>'leave_days', '')::numeric, 0),
    coalesce(nullif(s->>'leave_encashment', '')::numeric, 0), coalesce(nullif(s->>'gratuity', '')::numeric, 0),
    coalesce(nullif(s->>'other_pay', '')::numeric, 0), coalesce(nullif(s->>'advance_recovery', '')::numeric, 0),
    coalesce(nullif(s->>'other_deduction', '')::numeric, 0), coalesce(nullif(s->>'net', '')::numeric, 0)
  ) < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  insert into public.acc_payroll_settlements (
    id, organization_id, company_id, party_id, last_day, pay_date, unpaid_salary, leave_days, leave_encashment,
    gratuity, other_pay, advance_recovery, other_deduction, net, note, voucher_id, status
  ) values (
    coalesce(existing.id, v_id), org_id, v_company_id, v_party, v_last, nullif(s->>'pay_date', '')::date,
    coalesce(nullif(s->>'unpaid_salary', '')::numeric, 0), coalesce(nullif(s->>'leave_days', '')::numeric, 0),
    coalesce(nullif(s->>'leave_encashment', '')::numeric, 0), coalesce(nullif(s->>'gratuity', '')::numeric, 0),
    coalesce(nullif(s->>'other_pay', '')::numeric, 0), coalesce(nullif(s->>'advance_recovery', '')::numeric, 0),
    coalesce(nullif(s->>'other_deduction', '')::numeric, 0), coalesce(nullif(s->>'net', '')::numeric, 0),
    nullif(left(coalesce(s->>'note', ''), 240), ''), v_voucher,
    case when v_finish then 'posted' else 'draft' end
  )
  on conflict (company_id, party_id) do update set
    last_day = excluded.last_day, pay_date = excluded.pay_date, unpaid_salary = excluded.unpaid_salary,
    leave_days = excluded.leave_days, leave_encashment = excluded.leave_encashment, gratuity = excluded.gratuity,
    other_pay = excluded.other_pay, advance_recovery = excluded.advance_recovery,
    other_deduction = excluded.other_deduction, net = excluded.net, note = excluded.note,
    voucher_id = coalesce(excluded.voucher_id, acc_payroll_settlements.voucher_id), status = excluded.status;
  if v_finish then
    insert into public.acc_payroll_staff (organization_id, company_id, party_id, left_on)
    values (org_id, v_company_id, v_party, v_last)
    on conflict (company_id, party_id) do update set left_on = excluded.left_on;
    update public.acc_parties set is_active = false where id = v_party and company_id = v_company_id;
    update public.acc_staff_portal_credentials set enabled = false, updated_at = now() where party_id = v_party;
    delete from public.acc_staff_portal_sessions where party_id = v_party;
  end if;
  return coalesce(existing.id, v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Read for the workspace: staff details, pay history, settlements, staff logins,
-- the month's punches, and leave requests waiting for an answer.
-- ---------------------------------------------------------------------------
create or replace function public.acc_payroll_phase3_bundle(input_company_id uuid, input_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_period date;
begin
  if not public.can_accounts_read() then raise exception 'Accounts read access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  v_period := date_trunc('month', coalesce(input_month, current_date))::date;
  return jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id', s.party_id, 'joined_on', s.joined_on, 'left_on', s.left_on, 'fixed_term', s.fixed_term,
        'bank_holder', coalesce(s.bank_holder, ''), 'bank_account', coalesce(s.bank_account, ''),
        'bank_ifsc', coalesce(s.bank_ifsc, ''), 'bank_name', coalesce(s.bank_name, '')
      )) from public.acc_payroll_staff s where s.company_id = v_company_id
    ), '[]'::jsonb),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'party_id', r.party_id, 'effective_from', r.effective_from, 'pay_type', r.pay_type,
        'basic', r.basic, 'hra', r.hra, 'allowance', r.allowance, 'rate', r.rate,
        'note', coalesce(r.note, ''), 'created_at', r.created_at
      ) order by r.effective_from, r.created_at)
      from public.acc_payroll_revisions r where r.company_id = v_company_id
    ), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'party_id', t.party_id, 'party_name', p.name, 'last_day', t.last_day, 'pay_date', t.pay_date,
        'unpaid_salary', t.unpaid_salary, 'leave_days', t.leave_days, 'leave_encashment', t.leave_encashment,
        'gratuity', t.gratuity, 'other_pay', t.other_pay, 'advance_recovery', t.advance_recovery,
        'other_deduction', t.other_deduction, 'net', t.net, 'note', coalesce(t.note, ''),
        'voucher_id', t.voucher_id, 'status', t.status
      ) order by t.created_at desc)
      from public.acc_payroll_settlements t join public.acc_parties p on p.id = t.party_id
      where t.company_id = v_company_id
    ), '[]'::jsonb),
    'logins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id', c.party_id, 'staff_id', c.staff_id, 'enabled', c.enabled,
        'locked', c.locked_until is not null and c.locked_until > now()
      )) from public.acc_staff_portal_credentials c where c.company_id = v_company_id
    ), '[]'::jsonb),
    'punches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'party_id', n.party_id, 'work_date', n.work_date,
        'in_at', n.in_at, 'in_lat', n.in_lat, 'in_lng', n.in_lng, 'in_accuracy', n.in_accuracy,
        'out_at', n.out_at, 'out_lat', n.out_lat, 'out_lng', n.out_lng, 'out_accuracy', n.out_accuracy,
        'has_in_photo', exists (select 1 from public.acc_payroll_punch_photos f where f.punch_id = n.id and f.kind = 'in'),
        'has_out_photo', exists (select 1 from public.acc_payroll_punch_photos f where f.punch_id = n.id and f.kind = 'out')
      ) order by n.work_date desc)
      from public.acc_payroll_punches n
      where n.company_id = v_company_id
        and n.work_date >= v_period and n.work_date < (v_period + interval '1 month')::date
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'party_id', q.party_id, 'leave_type', q.leave_type, 'from_date', q.from_date,
        'to_date', q.to_date, 'note', coalesce(q.note, ''), 'status', q.status, 'created_at', q.created_at
      ) order by q.created_at desc)
      from (
        select * from public.acc_payroll_leave_requests
        where acc_payroll_leave_requests.company_id = v_company_id
        order by (status = 'pending') desc, created_at desc
        limit 100
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff login: issue, switch off, open a selfie, answer a leave request.
-- ---------------------------------------------------------------------------
create or replace function public.acc_issue_staff_portal(input_company_id uuid, input_party_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_company_id uuid;
  org_id uuid;
  v_staff_id text;
  v_pin text;
  attempt integer := 0;
begin
  if not public.can_accounts_admin() then raise exception 'Only the owner can issue a staff login'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(v_company_id, input_party_id);
  v_pin := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  select staff_id into v_staff_id from public.acc_staff_portal_credentials where party_id = input_party_id;
  if v_staff_id is null then
    loop
      attempt := attempt + 1;
      if attempt > 30 then raise exception 'Could not generate a Staff ID'; end if;
      v_staff_id := 'ST-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
      exit when not exists (select 1 from public.acc_staff_portal_credentials where staff_id = v_staff_id);
    end loop;
    select organization_id into org_id from public.acc_companies where id = v_company_id;
    insert into public.acc_staff_portal_credentials (party_id, organization_id, company_id, staff_id, pin_hash)
    values (input_party_id, org_id, v_company_id, v_staff_id, extensions.crypt(v_pin, extensions.gen_salt('bf')));
  else
    update public.acc_staff_portal_credentials
       set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf')),
           enabled = true, failed_attempts = 0, locked_until = null, updated_at = now()
     where party_id = input_party_id;
    -- A new PIN signs the employee out everywhere.
    delete from public.acc_staff_portal_sessions where party_id = input_party_id;
  end if;
  return jsonb_build_object('staff_id', v_staff_id, 'pin', v_pin);
end;
$$;

create or replace function public.acc_disable_staff_portal(input_company_id uuid, input_party_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  if not public.can_accounts_admin() then raise exception 'Only the owner can switch off a staff login'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  if not exists (
    select 1 from public.acc_staff_portal_credentials c where c.party_id = input_party_id and c.company_id = v_company_id
  ) then
    raise exception 'Staff login was not found';
  end if;
  update public.acc_staff_portal_credentials set enabled = false, updated_at = now() where party_id = input_party_id;
  delete from public.acc_staff_portal_sessions where party_id = input_party_id;
end;
$$;

create or replace function public.acc_punch_photo(input_company_id uuid, input_punch_id uuid, input_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  body text;
begin
  if not public.can_accounts_admin() then raise exception 'Only the owner can open a punch photo'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  select f.content_base64 into body
  from public.acc_payroll_punch_photos f
  where f.punch_id = input_punch_id and f.kind = input_kind and f.company_id = v_company_id;
  return body;
end;
$$;

create or replace function public.acc_decide_leave_request(input_company_id uuid, input_id uuid, input_approve boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  q public.acc_payroll_leave_requests;
  leave_id uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  select * into q from public.acc_payroll_leave_requests r where r.id = input_id and r.company_id = v_company_id for update;
  if q.id is null then raise exception 'Leave request was not found'; end if;
  if q.status <> 'pending' then raise exception 'That request is already answered'; end if;
  if coalesce(input_approve, false) then
    perform public.acc_payroll_month_open(v_company_id, q.from_date, q.to_date);
    if exists (
      select 1 from public.acc_payroll_leave l
      where l.company_id = v_company_id and l.party_id = q.party_id
        and daterange(l.from_date, l.to_date, '[]') && daterange(q.from_date, q.to_date, '[]')
    ) then
      raise exception 'Leave already covers one of these dates';
    end if;
    insert into public.acc_payroll_leave (organization_id, company_id, party_id, leave_type, from_date, to_date, note)
    values (q.organization_id, v_company_id, q.party_id, q.leave_type, q.from_date, q.to_date, q.note)
    returning id into leave_id;
  end if;
  update public.acc_payroll_leave_requests
     set status = case when coalesce(input_approve, false) then 'approved' else 'declined' end, decided_at = now()
   where id = q.id;
  return leave_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff side. Service role only: called by /api/staff with the hash of the session cookie.
-- These return {"error": "..."} instead of raising, so a wrong PIN still counts
-- towards the lockout (an exception would roll the counter back).
-- ---------------------------------------------------------------------------
create or replace function public.staff_portal_login(input_staff_id text, input_pin text, input_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.acc_staff_portal_credentials;
  active boolean;
begin
  if coalesce(length(input_token_hash), 0) < 32 then return jsonb_build_object('error', 'Sign in failed'); end if;
  select * into c from public.acc_staff_portal_credentials where staff_id = upper(trim(coalesce(input_staff_id, '')));
  if c.party_id is null then return jsonb_build_object('error', 'Invalid Staff ID or PIN'); end if;
  if c.locked_until is not null and c.locked_until > now() then
    return jsonb_build_object('error', 'Too many attempts. Try again in 15 minutes');
  end if;
  if coalesce(input_pin, '') !~ '^[0-9]{6}$' or c.pin_hash <> extensions.crypt(input_pin, c.pin_hash) then
    update public.acc_staff_portal_credentials
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end,
           updated_at = now()
     where party_id = c.party_id;
    return jsonb_build_object('error', case when c.failed_attempts + 1 >= 5
      then 'Too many attempts. Try again in 15 minutes' else 'Invalid Staff ID or PIN' end);
  end if;
  select p.is_active into active from public.acc_parties p where p.id = c.party_id and p.party_type = 'employee';
  if not c.enabled or active is not true then
    return jsonb_build_object('error', 'This staff login is switched off. Ask your employer.');
  end if;
  update public.acc_staff_portal_credentials set failed_attempts = 0, locked_until = null, updated_at = now()
   where party_id = c.party_id;
  delete from public.acc_staff_portal_sessions where expires_at < now();
  insert into public.acc_staff_portal_sessions (token_hash, party_id, expires_at)
  values (input_token_hash, c.party_id, now() + interval '30 days');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.staff_portal_logout(input_token_hash text)
returns void language sql security definer set search_path = public as $$
  delete from public.acc_staff_portal_sessions where token_hash = input_token_hash;
$$;

-- Who the session belongs to, or null.
create or replace function public.staff_portal_party(input_token_hash text)
returns uuid language sql stable security definer set search_path = public as $$
  select s.party_id
  from public.acc_staff_portal_sessions s
  join public.acc_staff_portal_credentials c on c.party_id = s.party_id and c.enabled
  join public.acc_parties p on p.id = s.party_id and p.is_active and p.party_type = 'employee'
  where s.token_hash = input_token_hash and s.expires_at > now();
$$;

create or replace function public.staff_portal_home(input_token_hash text, input_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_party uuid := public.staff_portal_party(input_token_hash);
  v_company uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_period date;
  v_year_start date;
  v_year_end date;
begin
  if v_party is null then return jsonb_build_object('error', 'signed_out'); end if;
  select company_id into v_company from public.acc_staff_portal_credentials where party_id = v_party;
  v_period := date_trunc('month', coalesce(input_month, v_today))::date;
  if v_period > date_trunc('month', v_today)::date then v_period := date_trunc('month', v_today)::date; end if;
  v_year_start := date_trunc('year', v_period)::date;
  v_year_end := (v_year_start + interval '1 year' - interval '1 day')::date;
  return jsonb_build_object(
    'today', v_today,
    'month', v_period,
    'employee', (
      select jsonb_build_object('party_id', p.id, 'name', p.name, 'company', c.name, 'staff_id', k.staff_id)
      from public.acc_parties p
      join public.acc_companies c on c.id = v_company
      join public.acc_staff_portal_credentials k on k.party_id = p.id
      where p.id = v_party
    ),
    'profile', (
      select jsonb_build_object('pay_type', f.pay_type, 'paid_leave_quota', f.paid_leave_quota, 'sick_leave_quota', f.sick_leave_quota)
      from public.acc_payroll_profiles f where f.company_id = v_company and f.party_id = v_party
    ),
    'punch', (
      select jsonb_build_object('in_at', n.in_at, 'out_at', n.out_at)
      from public.acc_payroll_punches n where n.company_id = v_company and n.party_id = v_party and n.work_date = v_today
    ),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('party_id', d.party_id, 'work_date', d.work_date, 'status', d.status, 'hours', d.hours, 'overtime_hours', d.overtime_hours))
      from public.acc_payroll_days d
      where d.company_id = v_company and d.party_id = v_party
        and d.work_date >= v_period and d.work_date < (v_period + interval '1 month')::date
    ), '[]'::jsonb),
    'leave', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'party_id', l.party_id, 'leave_type', l.leave_type, 'from_date', l.from_date, 'to_date', l.to_date))
      from public.acc_payroll_leave l
      where l.company_id = v_company and l.party_id = v_party
        and l.from_date <= v_year_end and l.to_date >= v_year_start
    ), '[]'::jsonb),
    'leave_used', coalesce((
      select jsonb_agg(jsonb_build_object('party_id', v_party, 'leave_type', u.leave_type, 'days', u.days))
      from (
        select l.leave_type, sum(least(l.to_date, v_year_end) - greatest(l.from_date, v_year_start) + 1) as days
        from public.acc_payroll_leave l
        where l.company_id = v_company and l.party_id = v_party
          and l.from_date <= v_year_end and l.to_date >= v_year_start
        group by l.leave_type
      ) u
    ), '[]'::jsonb),
    'holidays', coalesce((
      select jsonb_agg(jsonb_build_object('date', h.holiday_date, 'name', h.name) order by h.holiday_date)
      from public.acc_payroll_holidays h
      where h.company_id = v_company and h.holiday_date >= v_year_start and h.holiday_date <= v_year_end
    ), '[]'::jsonb),
    'punches', coalesce((
      select jsonb_agg(jsonb_build_object('work_date', n.work_date, 'in_at', n.in_at, 'out_at', n.out_at) order by n.work_date desc)
      from public.acc_payroll_punches n
      where n.company_id = v_company and n.party_id = v_party
        and n.work_date >= v_period and n.work_date < (v_period + interval '1 month')::date
    ), '[]'::jsonb),
    'payslips', coalesce((
      select jsonb_agg(jsonb_build_object('period_month', x.period_month, 'pay_date', x.pay_date, 'line', x.line) order by x.period_month desc)
      from (
        select r.period_month, r.pay_date, l.value as line
        from public.acc_payroll_runs r, jsonb_array_elements(r.lines) l
        where r.company_id = v_company and r.status = 'posted'
          and l.value->>'partyId' = v_party::text
          and coalesce(nullif(l.value->>'voucherId', ''), '') <> ''
        order by r.period_month desc
        limit 12
      ) x
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'leave_type', q.leave_type, 'from_date', q.from_date, 'to_date', q.to_date, 'note', coalesce(q.note, ''), 'status', q.status) order by q.created_at desc)
      from (
        select * from public.acc_payroll_leave_requests
        where acc_payroll_leave_requests.company_id = v_company and acc_payroll_leave_requests.party_id = v_party
        order by created_at desc limit 10
      ) q
    ), '[]'::jsonb),
    'advance_outstanding', coalesce((
      select sum(a.amount - coalesce((select sum(r.amount) from public.acc_payroll_advance_recoveries r where r.advance_id = a.id), 0))
      from public.acc_payroll_advances a
      where a.company_id = v_company and a.party_id = v_party and a.status = 'open'
    ), 0)
  );
end;
$$;

create or replace function public.staff_portal_punch(
  input_token_hash text,
  input_kind text,
  input_lat numeric,
  input_lng numeric,
  input_accuracy numeric,
  input_photo text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_party uuid := public.staff_portal_party(input_token_hash);
  c public.acc_staff_portal_credentials;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_period date := date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)::date;
  n public.acc_payroll_punches;
  month_posted boolean;
  worked numeric;
begin
  if v_party is null then return jsonb_build_object('error', 'signed_out'); end if;
  if input_kind not in ('in', 'out') then return jsonb_build_object('error', 'Choose punch in or punch out'); end if;
  if input_lat is null or input_lng is null or input_lat not between -90 and 90 or input_lng not between -180 and 180 then
    return jsonb_build_object('error', 'Your location is needed to punch. Allow location and try again.');
  end if;
  if coalesce(length(input_photo), 0) < 200 then return jsonb_build_object('error', 'A photo is needed to punch.'); end if;
  if length(input_photo) > 280000 then return jsonb_build_object('error', 'The photo is too large. Try again.'); end if;
  select * into c from public.acc_staff_portal_credentials where party_id = v_party;
  select * into n from public.acc_payroll_punches
   where company_id = c.company_id and party_id = v_party and work_date = v_today for update;
  if input_kind = 'in' then
    if n.id is not null then return jsonb_build_object('error', 'You have already punched in today.'); end if;
    insert into public.acc_payroll_punches (organization_id, company_id, party_id, work_date, in_at, in_lat, in_lng, in_accuracy)
    values (c.organization_id, c.company_id, v_party, v_today, now(), round(input_lat, 6), round(input_lng, 6), least(greatest(coalesce(input_accuracy, 0), 0), 9999999))
    returning * into n;
  else
    if n.id is null then return jsonb_build_object('error', 'Punch in first.'); end if;
    if n.out_at is not null then return jsonb_build_object('error', 'You have already punched out today.'); end if;
    update public.acc_payroll_punches
       set out_at = now(), out_lat = round(input_lat, 6), out_lng = round(input_lng, 6),
           out_accuracy = least(greatest(coalesce(input_accuracy, 0), 0), 9999999)
     where id = n.id returning * into n;
  end if;
  insert into public.acc_payroll_punch_photos (punch_id, kind, company_id, content_base64)
  values (n.id, input_kind, c.company_id, input_photo)
  on conflict (punch_id, kind) do update set content_base64 = excluded.content_base64, created_at = now();
  delete from public.acc_payroll_punch_photos where company_id = c.company_id and created_at < now() - interval '90 days';

  -- A punch marks the day present, unless the month is posted or the day is already marked.
  select exists (
    select 1 from public.acc_payroll_runs r
    where r.company_id = c.company_id and r.status = 'posted' and r.period_month = v_period
  ) into month_posted;
  if not month_posted then
    insert into public.acc_payroll_days (organization_id, company_id, party_id, work_date, status)
    values (c.organization_id, c.company_id, v_party, v_today, 'present')
    on conflict (company_id, party_id, work_date) do nothing;
    if input_kind = 'out' then
      worked := least(24, round((extract(epoch from (n.out_at - n.in_at)) / 3600.0)::numeric, 2));
      -- Hours fill in for someone paid by the hour, unless the owner already typed them.
      update public.acc_payroll_days d set hours = worked
       where d.company_id = c.company_id and d.party_id = v_party and d.work_date = v_today and d.hours = 0
         and exists (select 1 from public.acc_payroll_profiles f
                     where f.company_id = c.company_id and f.party_id = v_party and f.pay_type = 'hourly');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'in_at', n.in_at, 'out_at', n.out_at);
end;
$$;

create or replace function public.staff_portal_request_leave(
  input_token_hash text,
  input_leave_type text,
  input_from date,
  input_to date,
  input_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_party uuid := public.staff_portal_party(input_token_hash);
  c public.acc_staff_portal_credentials;
begin
  if v_party is null then return jsonb_build_object('error', 'signed_out'); end if;
  if input_leave_type not in ('paid', 'unpaid', 'sick') then return jsonb_build_object('error', 'Choose a leave type.'); end if;
  if input_from is null or input_to is null or input_to < input_from then return jsonb_build_object('error', 'Leave ends before it starts.'); end if;
  if input_to - input_from > 60 then return jsonb_build_object('error', 'Ask for at most 60 days at a time.'); end if;
  select * into c from public.acc_staff_portal_credentials where party_id = v_party;
  if (select count(*) from public.acc_payroll_leave_requests q where q.party_id = v_party and q.status = 'pending') >= 5 then
    return jsonb_build_object('error', 'You already have requests waiting for an answer.');
  end if;
  if exists (
    select 1 from public.acc_payroll_leave_requests q
    where q.party_id = v_party and q.status = 'pending'
      and daterange(q.from_date, q.to_date, '[]') && daterange(input_from, input_to, '[]')
  ) or exists (
    select 1 from public.acc_payroll_leave l
    where l.company_id = c.company_id and l.party_id = v_party
      and daterange(l.from_date, l.to_date, '[]') && daterange(input_from, input_to, '[]')
  ) then
    return jsonb_build_object('error', 'Leave already covers one of these dates.');
  end if;
  insert into public.acc_payroll_leave_requests (organization_id, company_id, party_id, leave_type, from_date, to_date, note)
  values (c.organization_id, c.company_id, v_party, input_leave_type, input_from, input_to, nullif(left(coalesce(input_note, ''), 240), ''));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.acc_save_payroll_staff(uuid, uuid, jsonb) from public, anon;
revoke all on function public.acc_save_payroll_settlement(uuid, jsonb) from public, anon;
revoke all on function public.acc_payroll_phase3_bundle(uuid, date) from public, anon;
revoke all on function public.acc_issue_staff_portal(uuid, uuid) from public, anon;
revoke all on function public.acc_disable_staff_portal(uuid, uuid) from public, anon;
revoke all on function public.acc_punch_photo(uuid, uuid, text) from public, anon;
revoke all on function public.acc_decide_leave_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.acc_save_payroll_staff(uuid, uuid, jsonb) to authenticated;
grant execute on function public.acc_save_payroll_settlement(uuid, jsonb) to authenticated;
grant execute on function public.acc_payroll_phase3_bundle(uuid, date) to authenticated;
grant execute on function public.acc_issue_staff_portal(uuid, uuid) to authenticated;
grant execute on function public.acc_disable_staff_portal(uuid, uuid) to authenticated;
grant execute on function public.acc_punch_photo(uuid, uuid, text) to authenticated;
grant execute on function public.acc_decide_leave_request(uuid, uuid, boolean) to authenticated;

revoke all on function public.staff_portal_login(text, text, text) from public, anon, authenticated;
revoke all on function public.staff_portal_logout(text) from public, anon, authenticated;
revoke all on function public.staff_portal_party(text) from public, anon, authenticated;
revoke all on function public.staff_portal_home(text, date) from public, anon, authenticated;
revoke all on function public.staff_portal_punch(text, text, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.staff_portal_request_leave(text, text, date, date, text) from public, anon, authenticated;
grant execute on function public.staff_portal_login(text, text, text) to service_role;
grant execute on function public.staff_portal_logout(text) to service_role;
grant execute on function public.staff_portal_party(text) to service_role;
grant execute on function public.staff_portal_home(text, date) to service_role;
grant execute on function public.staff_portal_punch(text, text, numeric, numeric, numeric, text) to service_role;
grant execute on function public.staff_portal_request_leave(text, text, date, date, text) to service_role;

notify pgrst, 'reload schema';
