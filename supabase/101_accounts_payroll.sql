-- Payroll inside Accounts: salary profile, attendance, leave, and the monthly pay run.
-- Apply after 100_ai_rate_limit.sql. Does not add an employee login.
-- Salary still posts through acc_post_voucher. This migration only stores the register.

create table if not exists public.acc_payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  basic numeric(14, 2) not null default 0 check (basic >= 0),
  hra numeric(14, 2) not null default 0 check (hra >= 0),
  allowance numeric(14, 2) not null default 0 check (allowance >= 0),
  day_basis integer not null default 0 check (day_basis in (0, 26, 30)),
  pf numeric(14, 2) not null default 0 check (pf >= 0),
  esi numeric(14, 2) not null default 0 check (esi >= 0),
  professional_tax numeric(14, 2) not null default 0 check (professional_tax >= 0),
  tds numeric(14, 2) not null default 0 check (tds >= 0),
  other_deduction numeric(14, 2) not null default 0 check (other_deduction >= 0),
  unique (company_id, party_id)
);

create table if not exists public.acc_payroll_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  work_date date not null,
  status text not null check (status in ('present', 'half', 'absent', 'week_off', 'holiday')),
  unique (company_id, party_id, work_date)
);

create index if not exists acc_payroll_days_month_idx
  on public.acc_payroll_days (company_id, work_date);

create table if not exists public.acc_payroll_leave (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  leave_type text not null check (leave_type in ('paid', 'unpaid', 'sick')),
  from_date date not null,
  to_date date not null,
  note text,
  check (to_date >= from_date)
);

create index if not exists acc_payroll_leave_party_idx
  on public.acc_payroll_leave (company_id, party_id, from_date);

create table if not exists public.acc_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  period_month date not null,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  pay_date date,
  pay_mode text not null default 'bank' check (pay_mode in ('cash', 'bank', 'upi')),
  pay_account_id uuid references public.acc_coa(id),
  lines jsonb not null default '[]'::jsonb,
  posted_at timestamptz,
  unique (company_id, period_month)
);

alter table public.acc_payroll_profiles enable row level security;
alter table public.acc_payroll_days enable row level security;
alter table public.acc_payroll_leave enable row level security;
alter table public.acc_payroll_runs enable row level security;

drop policy if exists acc_payroll_profiles_read on public.acc_payroll_profiles;
create policy acc_payroll_profiles_read on public.acc_payroll_profiles
  for select to authenticated
  using (organization_id = public.current_organization_id() and company_id = public.acc_request_company_id() and public.can_accounts_read());

drop policy if exists acc_payroll_days_read on public.acc_payroll_days;
create policy acc_payroll_days_read on public.acc_payroll_days
  for select to authenticated
  using (organization_id = public.current_organization_id() and company_id = public.acc_request_company_id() and public.can_accounts_read());

drop policy if exists acc_payroll_leave_read on public.acc_payroll_leave;
create policy acc_payroll_leave_read on public.acc_payroll_leave
  for select to authenticated
  using (organization_id = public.current_organization_id() and company_id = public.acc_request_company_id() and public.can_accounts_read());

drop policy if exists acc_payroll_runs_read on public.acc_payroll_runs;
create policy acc_payroll_runs_read on public.acc_payroll_runs
  for select to authenticated
  using (organization_id = public.current_organization_id() and company_id = public.acc_request_company_id() and public.can_accounts_read());

revoke all on public.acc_payroll_profiles from anon, authenticated;
revoke all on public.acc_payroll_days from anon, authenticated;
revoke all on public.acc_payroll_leave from anon, authenticated;
revoke all on public.acc_payroll_runs from anon, authenticated;
grant select on public.acc_payroll_profiles to authenticated;
grant select on public.acc_payroll_days to authenticated;
grant select on public.acc_payroll_leave to authenticated;
grant select on public.acc_payroll_runs to authenticated;

insert into public.acc_coa (organization_id, company_id, code, name, group_type, account_type, is_system)
select c.organization_id, c.id, '2220', 'Salary deductions payable', 'liability', 'other', false
from public.acc_companies c
on conflict (company_id, code) do nothing;

create or replace function public.acc_seed_coa_for_company(input_org_id uuid, input_company_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.acc_coa(organization_id, company_id, code, name, group_type, account_type, is_system)
  values
    (input_org_id, input_company_id, '1000', 'Cash in Hand', 'asset', 'cash', true),
    (input_org_id, input_company_id, '1010', 'UPI', 'asset', 'upi', true),
    (input_org_id, input_company_id, '1020', 'Bank', 'asset', 'bank', true),
    (input_org_id, input_company_id, '1100', 'Accounts Receivable', 'asset', 'receivable', true),
    (input_org_id, input_company_id, '1110', 'Daily Finance Receivable', 'asset', 'receivable', true),
    (input_org_id, input_company_id, '1120', 'Monthly Finance Receivable', 'asset', 'receivable', true),
    (input_org_id, input_company_id, '1130', 'Chit Fund Receivable', 'asset', 'receivable', true),
    (input_org_id, input_company_id, '1200', 'Loans & Advances', 'asset', 'other', false),
    (input_org_id, input_company_id, '1300', 'Fixed Assets', 'asset', 'other', false),
    (input_org_id, input_company_id, '2000', 'Accounts Payable', 'liability', 'payable', true),
    (input_org_id, input_company_id, '2100', 'Loans Payable', 'liability', 'payable', false),
    (input_org_id, input_company_id, '3000', 'Capital', 'equity', 'capital', true),
    (input_org_id, input_company_id, '3100', 'Drawings', 'equity', 'drawing', true),
    (input_org_id, input_company_id, '3200', 'Retained Earnings', 'equity', 'retained', true),
    (input_org_id, input_company_id, '4000', 'Interest Income', 'income', 'income', true),
    (input_org_id, input_company_id, '4100', 'Other Income', 'income', 'income', true),
    (input_org_id, input_company_id, '4200', 'Chit Commission', 'income', 'income', true),
    (input_org_id, input_company_id, '4300', 'Sales', 'income', 'income', true),
    (input_org_id, input_company_id, '4310', 'Service Income', 'income', 'income', false),
    (input_org_id, input_company_id, '5000', 'Rent', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5010', 'Salary', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5020', 'Agent Commission', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5030', 'Fuel', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5040', 'Electricity', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5050', 'Internet', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5060', 'Office Supplies', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5065', 'Office Expenses', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5070', 'Maintenance', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5080', 'Marketing', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5090', 'Travel', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5100', 'Bank Charges', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5110', 'Purchase', 'expense', 'expense', true),
    (input_org_id, input_company_id, '5120', 'Professional Fees', 'expense', 'expense', false),
    (input_org_id, input_company_id, '5990', 'Other Expenses', 'expense', 'expense', true),
    (input_org_id, input_company_id, '2220', 'Salary deductions payable', 'liability', 'other', false)
  on conflict (company_id, code) do nothing;
end;
$$;

create or replace function public.acc_payroll_company(input_company_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if input_company_id is null or not exists (
    select 1 from public.acc_companies
    where id = input_company_id and organization_id = public.current_organization_id()
  ) then
    raise exception 'Accounts company not found';
  end if;
  return input_company_id;
end;
$$;

create or replace function public.acc_payroll_require_employee(input_company_id uuid, input_party_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.acc_parties
    where id = input_party_id
      and company_id = input_company_id
      and organization_id = public.current_organization_id()
      and party_type = 'employee'
      and is_active
  ) then
    raise exception 'Choose an employee';
  end if;
end;
$$;

create or replace function public.acc_payroll_month_open(input_company_id uuid, input_from date, input_to date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if input_from is null or input_to is null then
    raise exception 'Choose the dates';
  end if;
  if exists (
    select 1 from public.acc_payroll_runs r
    where r.company_id = input_company_id
      and r.status = 'posted'
      and r.period_month <= date_trunc('month', input_to)::date
      and (r.period_month + interval '1 month')::date > date_trunc('month', input_from)::date
  ) then
    raise exception 'That month is already posted';
  end if;
end;
$$;

create or replace function public.acc_payroll_bundle(input_company_id uuid, input_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  company_id uuid;
  period date;
begin
  if not public.can_accounts_read() then raise exception 'Accounts read access is required'; end if;
  company_id := public.acc_payroll_company(input_company_id);
  period := date_trunc('month', coalesce(input_month, current_date))::date;
  return jsonb_build_object(
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id', p.party_id,
        'basic', p.basic,
        'hra', p.hra,
        'allowance', p.allowance,
        'day_basis', p.day_basis,
        'pf', p.pf,
        'esi', p.esi,
        'professional_tax', p.professional_tax,
        'tds', p.tds,
        'other_deduction', p.other_deduction
      ) order by party.name)
      from public.acc_payroll_profiles p
      join public.acc_parties party on party.id = p.party_id
      where p.company_id = company_id
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id', d.party_id,
        'work_date', d.work_date,
        'status', d.status
      ))
      from public.acc_payroll_days d
      where d.company_id = company_id
        and d.work_date >= period
        and d.work_date < (period + interval '1 month')::date
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
        where company_id = company_id
        order by from_date desc
        limit 200
      ) l
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
      where r.company_id = company_id and r.period_month = period
    )
  );
end;
$$;

create or replace function public.acc_save_payroll_profile(
  input_company_id uuid,
  input_party_id uuid,
  input_basic numeric,
  input_hra numeric,
  input_allowance numeric,
  input_day_basis integer,
  input_pf numeric,
  input_esi numeric,
  input_professional_tax numeric,
  input_tds numeric,
  input_other_deduction numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  company_id uuid;
  org_id uuid;
  saved_id uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(company_id, input_party_id);
  if input_day_basis not in (0, 26, 30) then raise exception 'Choose days in the month, 26 days, or 30 days'; end if;
  if least(input_basic, input_hra, input_allowance, input_pf, input_esi, input_professional_tax, input_tds, input_other_deduction) < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  select organization_id into org_id from public.acc_companies where id = company_id;
  insert into public.acc_payroll_profiles (
    organization_id, company_id, party_id, basic, hra, allowance, day_basis, pf, esi, professional_tax, tds, other_deduction
  ) values (
    org_id, company_id, input_party_id,
    coalesce(input_basic, 0), coalesce(input_hra, 0), coalesce(input_allowance, 0), coalesce(input_day_basis, 0),
    coalesce(input_pf, 0), coalesce(input_esi, 0), coalesce(input_professional_tax, 0), coalesce(input_tds, 0), coalesce(input_other_deduction, 0)
  )
  on conflict (company_id, party_id) do update set
    basic = excluded.basic,
    hra = excluded.hra,
    allowance = excluded.allowance,
    day_basis = excluded.day_basis,
    pf = excluded.pf,
    esi = excluded.esi,
    professional_tax = excluded.professional_tax,
    tds = excluded.tds,
    other_deduction = excluded.other_deduction
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.acc_set_payroll_days(
  input_company_id uuid,
  input_party_id uuid,
  input_month date,
  input_days jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare
  company_id uuid;
  org_id uuid;
  period date;
  row jsonb;
  work_date date;
  day_status text;
  saved integer := 0;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(company_id, input_party_id);
  period := date_trunc('month', input_month)::date;
  perform public.acc_payroll_month_open(company_id, period, (period + interval '1 month' - interval '1 day')::date);
  if jsonb_typeof(coalesce(input_days, '[]'::jsonb)) <> 'array' then raise exception 'Attendance could not be read'; end if;
  select organization_id into org_id from public.acc_companies where id = company_id;
  delete from public.acc_payroll_days
  where company_id = company_id
    and party_id = input_party_id
    and work_date >= period
    and work_date < (period + interval '1 month')::date;
  for row in select value from jsonb_array_elements(input_days)
  loop
    work_date := (row->>'date')::date;
    day_status := row->>'status';
    if work_date is null or work_date < period or work_date >= (period + interval '1 month')::date then
      raise exception 'Attendance is outside this month';
    end if;
    if day_status not in ('present', 'half', 'absent', 'week_off', 'holiday') then
      raise exception 'Unknown attendance';
    end if;
    insert into public.acc_payroll_days (organization_id, company_id, party_id, work_date, status)
    values (org_id, company_id, input_party_id, work_date, day_status);
    saved := saved + 1;
  end loop;
  return saved;
end;
$$;

create or replace function public.acc_save_payroll_leave(
  input_company_id uuid,
  input_party_id uuid,
  input_leave_type text,
  input_from date,
  input_to date,
  input_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  company_id uuid;
  org_id uuid;
  saved_id uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(company_id, input_party_id);
  if input_leave_type not in ('paid', 'unpaid', 'sick') then raise exception 'Choose a leave type'; end if;
  if input_from is null or input_to is null or input_to < input_from then raise exception 'Leave ends before it starts'; end if;
  if input_to - input_from > 366 then raise exception 'Leave is longer than a year'; end if;
  perform public.acc_payroll_month_open(company_id, input_from, input_to);
  if exists (
    select 1 from public.acc_payroll_leave
    where company_id = company_id
      and party_id = input_party_id
      and daterange(from_date, to_date, '[]') && daterange(input_from, input_to, '[]')
  ) then
    raise exception 'Leave already covers one of these dates';
  end if;
  select organization_id into org_id from public.acc_companies where id = company_id;
  insert into public.acc_payroll_leave (organization_id, company_id, party_id, leave_type, from_date, to_date, note)
  values (org_id, company_id, input_party_id, input_leave_type, input_from, input_to, nullif(left(coalesce(input_note, ''), 240), ''))
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.acc_delete_payroll_leave(input_company_id uuid, input_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  company_id uuid;
  row public.acc_payroll_leave;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  company_id := public.acc_payroll_company(input_company_id);
  select * into row from public.acc_payroll_leave where id = input_id and company_id = company_id;
  if row.id is null then raise exception 'Leave was not found'; end if;
  perform public.acc_payroll_month_open(company_id, row.from_date, row.to_date);
  delete from public.acc_payroll_leave where id = row.id;
end;
$$;

create or replace function public.acc_save_payroll_run(
  input_company_id uuid,
  input_month date,
  input_pay_date date,
  input_pay_mode text,
  input_pay_account_id uuid,
  input_lines jsonb,
  input_status text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  company_id uuid;
  org_id uuid;
  period date;
  saved_id uuid;
  existing_status text;
  line jsonb;
  party uuid;
  voucher uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  company_id := public.acc_payroll_company(input_company_id);
  period := date_trunc('month', input_month)::date;
  if input_status not in ('draft', 'posted') then raise exception 'Unknown pay status'; end if;
  if input_pay_mode not in ('cash', 'bank', 'upi') then raise exception 'Choose cash, bank, or UPI'; end if;
  if jsonb_typeof(coalesce(input_lines, '[]'::jsonb)) <> 'array' then raise exception 'Pay lines could not be read'; end if;
  select status into existing_status from public.acc_payroll_runs where company_id = company_id and period_month = period;
  if existing_status = 'posted' then raise exception 'That month is already posted'; end if;
  for line in select value from jsonb_array_elements(input_lines)
  loop
    party := (line->>'partyId')::uuid;
    if not exists (
      select 1 from public.acc_parties
      where id = party and company_id = company_id and organization_id = public.current_organization_id()
    ) then
      raise exception 'Unknown employee';
    end if;
    if nullif(line->>'voucherId', '') is not null then
      voucher := (line->>'voucherId')::uuid;
      if not exists (select 1 from public.acc_vouchers where id = voucher and company_id = company_id) then
        raise exception 'Salary voucher was not found';
      end if;
    end if;
  end loop;
  if input_pay_account_id is not null and not exists (
    select 1 from public.acc_coa
    where id = input_pay_account_id and company_id = company_id and account_type in ('cash', 'bank', 'upi')
  ) then
    raise exception 'Choose the account the salary is paid from';
  end if;
  select organization_id into org_id from public.acc_companies where id = company_id;
  insert into public.acc_payroll_runs (
    organization_id, company_id, period_month, status, pay_date, pay_mode, pay_account_id, lines, posted_at
  ) values (
    org_id, company_id, period, input_status, input_pay_date, input_pay_mode, input_pay_account_id, input_lines,
    case when input_status = 'posted' then now() else null end
  )
  on conflict (company_id, period_month) do update set
    status = excluded.status,
    pay_date = excluded.pay_date,
    pay_mode = excluded.pay_mode,
    pay_account_id = excluded.pay_account_id,
    lines = excluded.lines,
    posted_at = excluded.posted_at
  returning id into saved_id;
  return saved_id;
end;
$$;

revoke all on function public.acc_payroll_company(uuid) from public, anon, authenticated;
revoke all on function public.acc_payroll_require_employee(uuid, uuid) from public, anon, authenticated;
revoke all on function public.acc_payroll_month_open(uuid, date, date) from public, anon, authenticated;

revoke all on function public.acc_payroll_bundle(uuid, date) from public;
revoke all on function public.acc_save_payroll_profile(uuid, uuid, numeric, numeric, numeric, integer, numeric, numeric, numeric, numeric, numeric) from public;
revoke all on function public.acc_set_payroll_days(uuid, uuid, date, jsonb) from public;
revoke all on function public.acc_save_payroll_leave(uuid, uuid, text, date, date, text) from public;
revoke all on function public.acc_delete_payroll_leave(uuid, uuid) from public;
revoke all on function public.acc_save_payroll_run(uuid, date, date, text, uuid, jsonb, text) from public;

grant execute on function public.acc_payroll_bundle(uuid, date) to authenticated;
grant execute on function public.acc_save_payroll_profile(uuid, uuid, numeric, numeric, numeric, integer, numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.acc_set_payroll_days(uuid, uuid, date, jsonb) to authenticated;
grant execute on function public.acc_save_payroll_leave(uuid, uuid, text, date, date, text) to authenticated;
grant execute on function public.acc_delete_payroll_leave(uuid, uuid) to authenticated;
grant execute on function public.acc_save_payroll_run(uuid, date, date, text, uuid, jsonb, text) to authenticated;
