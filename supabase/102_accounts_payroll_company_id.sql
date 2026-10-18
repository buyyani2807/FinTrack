-- Fix payroll functions after 101. A variable named company_id clashed with the column.
-- Run this in the Supabase SQL editor. Tables are unchanged.

create or replace function public.acc_payroll_bundle(input_company_id uuid, input_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_period date;
begin
  if not public.can_accounts_read() then raise exception 'Accounts read access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  v_period := date_trunc('month', coalesce(input_month, current_date))::date;
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
      where p.company_id = v_company_id
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id', d.party_id,
        'work_date', d.work_date,
        'status', d.status
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
  v_company_id uuid;
  org_id uuid;
  saved_id uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(v_company_id, input_party_id);
  if input_day_basis not in (0, 26, 30) then raise exception 'Choose days in the month, 26 days, or 30 days'; end if;
  if least(input_basic, input_hra, input_allowance, input_pf, input_esi, input_professional_tax, input_tds, input_other_deduction) < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  insert into public.acc_payroll_profiles (
    organization_id, company_id, party_id, basic, hra, allowance, day_basis, pf, esi, professional_tax, tds, other_deduction
  ) values (
    org_id, v_company_id, input_party_id,
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
  v_company_id uuid;
  org_id uuid;
  v_period date;
  row jsonb;
  v_work_date date;
  day_status text;
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
    if v_work_date is null or v_work_date < v_period or v_work_date >= (v_period + interval '1 month')::date then
      raise exception 'Attendance is outside this month';
    end if;
    if day_status not in ('present', 'half', 'absent', 'week_off', 'holiday') then
      raise exception 'Unknown attendance';
    end if;
    insert into public.acc_payroll_days (organization_id, company_id, party_id, work_date, status)
    values (org_id, v_company_id, input_party_id, v_work_date, day_status);
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
  v_company_id uuid;
  org_id uuid;
  saved_id uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  perform public.acc_payroll_require_employee(v_company_id, input_party_id);
  if input_leave_type not in ('paid', 'unpaid', 'sick') then raise exception 'Choose a leave type'; end if;
  if input_from is null or input_to is null or input_to < input_from then raise exception 'Leave ends before it starts'; end if;
  if input_to - input_from > 366 then raise exception 'Leave is longer than a year'; end if;
  perform public.acc_payroll_month_open(v_company_id, input_from, input_to);
  if exists (
    select 1 from public.acc_payroll_leave l
    where l.company_id = v_company_id
      and l.party_id = input_party_id
      and daterange(l.from_date, l.to_date, '[]') && daterange(input_from, input_to, '[]')
  ) then
    raise exception 'Leave already covers one of these dates';
  end if;
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  insert into public.acc_payroll_leave (organization_id, company_id, party_id, leave_type, from_date, to_date, note)
  values (org_id, v_company_id, input_party_id, input_leave_type, input_from, input_to, nullif(left(coalesce(input_note, ''), 240), ''))
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.acc_delete_payroll_leave(input_company_id uuid, input_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  row public.acc_payroll_leave;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  select * into row from public.acc_payroll_leave l where l.id = input_id and l.company_id = v_company_id;
  if row.id is null then raise exception 'Leave was not found'; end if;
  perform public.acc_payroll_month_open(v_company_id, row.from_date, row.to_date);
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
  v_company_id uuid;
  org_id uuid;
  v_period date;
  saved_id uuid;
  existing_status text;
  line jsonb;
  party uuid;
  voucher uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  v_period := date_trunc('month', input_month)::date;
  if input_status not in ('draft', 'posted') then raise exception 'Unknown pay status'; end if;
  if input_pay_mode not in ('cash', 'bank', 'upi') then raise exception 'Choose cash, bank, or UPI'; end if;
  if jsonb_typeof(coalesce(input_lines, '[]'::jsonb)) <> 'array' then raise exception 'Pay lines could not be read'; end if;
  select r.status into existing_status from public.acc_payroll_runs r where r.company_id = v_company_id and r.period_month = v_period;
  if existing_status = 'posted' then raise exception 'That month is already posted'; end if;
  for line in select value from jsonb_array_elements(input_lines)
  loop
    party := (line->>'partyId')::uuid;
    if not exists (
      select 1 from public.acc_parties p
      where p.id = party and p.company_id = v_company_id and p.organization_id = public.current_organization_id()
    ) then
      raise exception 'Unknown employee';
    end if;
    if nullif(line->>'voucherId', '') is not null then
      voucher := (line->>'voucherId')::uuid;
      if not exists (select 1 from public.acc_vouchers v where v.id = voucher and v.company_id = v_company_id) then
        raise exception 'Salary voucher was not found';
      end if;
    end if;
  end loop;
  if input_pay_account_id is not null and not exists (
    select 1 from public.acc_coa c
    where c.id = input_pay_account_id and c.company_id = v_company_id and c.account_type in ('cash', 'bank', 'upi')
  ) then
    raise exception 'Choose the account the salary is paid from';
  end if;
  select organization_id into org_id from public.acc_companies where id = v_company_id;
  insert into public.acc_payroll_runs (
    organization_id, company_id, period_month, status, pay_date, pay_mode, pay_account_id, lines, posted_at
  ) values (
    org_id, v_company_id, v_period, input_status, input_pay_date, input_pay_mode, input_pay_account_id, input_lines,
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
