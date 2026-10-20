-- A posted month stays locked for people who were actually paid.
-- Someone saved with no salary and no voucher was not paid. Their line can be replaced
-- once a salary is set, and a new employee can still be appended.
-- Run this once in the Supabase SQL editor after 103_accounts_payroll_late_employee.sql.

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
  stored_lines jsonb := '[]'::jsonb;
  line jsonb;
  stored jsonb;
  incoming jsonb;
  party uuid;
  voucher uuid;
  has_new boolean := false;
  completing boolean := false;
  replacing_unset boolean := false;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  v_company_id := public.acc_payroll_company(input_company_id);
  v_period := date_trunc('month', input_month)::date;
  if input_status not in ('draft', 'posted') then raise exception 'Unknown pay status'; end if;
  if input_pay_mode not in ('cash', 'bank', 'upi') then raise exception 'Choose cash, bank, or UPI'; end if;
  if jsonb_typeof(coalesce(input_lines, '[]'::jsonb)) <> 'array' then raise exception 'Pay lines could not be read'; end if;
  select r.status, coalesce(r.lines, '[]'::jsonb)
    into existing_status, stored_lines
  from public.acc_payroll_runs r
  where r.company_id = v_company_id and r.period_month = v_period;

  if existing_status = 'posted' then
    if input_status <> 'posted' then raise exception 'That month is already posted'; end if;
    for stored in select value from jsonb_array_elements(stored_lines)
    loop
      select item into incoming
      from (
        select value as item
        from jsonb_array_elements(input_lines)
      ) as listed
      where item->>'partyId' = stored->>'partyId'
      limit 1;
      if incoming is null then raise exception 'Posted pay cannot be changed'; end if;
      if coalesce(stored->>'voucherId', '') = ''
        and coalesce(nullif(stored->>'earned', ''), '0')::numeric = 0
        and coalesce(nullif(stored->>'gross', ''), '0')::numeric = 0
        and coalesce(nullif(stored->>'basic', ''), '0')::numeric
          + coalesce(nullif(stored->>'hra', ''), '0')::numeric
          + coalesce(nullif(stored->>'allowance', ''), '0')::numeric = 0
      then
        if coalesce(nullif(incoming->>'earned', ''), '0')::numeric > 0
          or nullif(incoming->>'voucherId', '') is not null
        then
          replacing_unset := true;
        end if;
      else
        if coalesce(nullif(stored->>'earned', ''), '0')::numeric
          is distinct from coalesce(nullif(incoming->>'earned', ''), '0')::numeric
          or coalesce(nullif(stored->>'net', ''), '0')::numeric
          is distinct from coalesce(nullif(incoming->>'net', ''), '0')::numeric
        then
          raise exception 'Posted pay cannot be changed';
        end if;
        if nullif(stored->>'voucherId', '') is not null
          and nullif(stored->>'voucherId', '') is distinct from nullif(incoming->>'voucherId', '')
        then
          raise exception 'Posted pay cannot be changed';
        end if;
        if nullif(stored->>'voucherId', '') is null and nullif(incoming->>'voucherId', '') is not null then
          completing := true;
        end if;
      end if;
    end loop;
    for line in select value from jsonb_array_elements(input_lines)
    loop
      if not exists (
        select 1
        from (
          select value as item
          from jsonb_array_elements(stored_lines)
        ) as listed
        where item->>'partyId' = line->>'partyId'
      ) then
        has_new := true;
        perform public.acc_payroll_require_employee(v_company_id, (line->>'partyId')::uuid);
      end if;
    end loop;
    if not has_new and not completing and not replacing_unset then raise exception 'That month is already posted'; end if;
  end if;

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

  if existing_status = 'posted' then
    update public.acc_payroll_runs r
      set lines = input_lines
    where r.company_id = v_company_id and r.period_month = v_period
    returning r.id into saved_id;
    return saved_id;
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
