-- 082 Route-based receivable collections + GST filing tracker.
-- Apply after 081_accounts_trade_documents.sql.
--   * acc_collection_routes / acc_collection_route_stops: owner or accountant groups customers into routes (beats),
--     assigns a collection agent (an existing Collection Staff login) and the weekdays the route runs.
--   * Agents never get Accounts access. acc_agent_route_sheet returns only their routes' customers with outstanding,
--     and acc_agent_record_collection posts a receipt voucher (Dr cash/UPI/bank, Cr Accounts Receivable) dated today,
--     for at most the customer's outstanding balance.
--   * acc_route_collections_report: field collections by agent and mode for cash handover.
--   * acc_compliance_filings: which GST returns were marked filed for which period.

create table if not exists public.acc_collection_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  agent_id uuid references public.profiles(id) on delete set null,
  weekdays smallint[] not null default '{}',
  notes text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists acc_collection_routes_agent_idx
  on public.acc_collection_routes (agent_id) where is_active;

create table if not exists public.acc_collection_route_stops (
  route_id uuid not null references public.acc_collection_routes(id) on delete cascade,
  party_id uuid not null references public.acc_parties(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  stop_order integer not null default 0,
  primary key (route_id, party_id),
  unique (party_id)
);

create table if not exists public.acc_compliance_filings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  return_code text not null check (return_code in ('GSTR1', 'GSTR3B', 'CMP08', 'PMT06')),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  filed_on date not null,
  reference text,
  marked_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, return_code, period)
);

create index if not exists acc_vouchers_field_collection_idx
  on public.acc_vouchers (company_id, voucher_date) where source_module = 'field_collection';

alter table public.acc_collection_routes enable row level security;
alter table public.acc_collection_route_stops enable row level security;
alter table public.acc_compliance_filings enable row level security;

drop policy if exists acc_collection_routes_select on public.acc_collection_routes;
create policy acc_collection_routes_select on public.acc_collection_routes for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_read() and company_id = public.acc_request_company_id());

drop policy if exists acc_collection_route_stops_select on public.acc_collection_route_stops;
create policy acc_collection_route_stops_select on public.acc_collection_route_stops for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_read() and company_id = public.acc_request_company_id());

drop policy if exists acc_compliance_filings_select on public.acc_compliance_filings;
create policy acc_compliance_filings_select on public.acc_compliance_filings for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_read() and company_id = public.acc_request_company_id());

revoke all on table public.acc_collection_routes from authenticated;
revoke all on table public.acc_collection_route_stops from authenticated;
revoke all on table public.acc_compliance_filings from authenticated;
grant select on table public.acc_collection_routes to authenticated;
grant select on table public.acc_collection_route_stops to authenticated;
grant select on table public.acc_compliance_filings to authenticated;

-- Receivable balance of one party across every receivable ledger (same rule as the Accounts reports).
create or replace function public.acc_party_receivable(input_party_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(l.debit - l.credit), 2), 0)
  from public.acc_voucher_lines l
  join public.acc_vouchers v on v.id = l.voucher_id and v.status in ('posted', 'reversed')
  join public.acc_coa c on c.id = l.coa_id and c.account_type = 'receivable'
  where l.party_id = input_party_id
$$;
revoke all on function public.acc_party_receivable(uuid) from public, authenticated;

-- People who can be assigned to a route: active Collection Staff and the owner.
create or replace function public.acc_list_collection_agents()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare org_id uuid;
begin
  if not public.can_accounts_write() then
    raise exception 'Accounting is available only to the business owner or accountant';
  end if;
  org_id := public.current_organization_id();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'phone', p.phone,
      'role', p.role,
      'is_active', p.is_active
    ) order by (p.role = 'staff') desc, p.full_name)
    from public.profiles p
    where p.organization_id = org_id
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.acc_list_collection_agents() to authenticated;

create or replace function public.acc_save_collection_route(
  input_id uuid,
  input_name text,
  input_agent_id uuid default null,
  input_weekdays integer[] default '{}',
  input_notes text default null,
  input_is_active boolean default true,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  route_id uuid;
  clean_days smallint[];
  clean_name text := trim(coalesce(input_name, ''));
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if clean_name = '' then raise exception 'Route name is required'; end if;
  if length(clean_name) > 80 then raise exception 'Route name is too long'; end if;
  if input_agent_id is not null and not exists (
    select 1 from public.profiles p where p.id = input_agent_id and p.organization_id = org_id
  ) then
    raise exception 'Collection agent not found in this business';
  end if;
  select coalesce(array_agg(distinct d::smallint order by d::smallint), '{}')
    into clean_days
  from unnest(coalesce(input_weekdays, '{}'::integer[])) as d
  where d between 1 and 7;

  if input_id is null then
    insert into public.acc_collection_routes(organization_id, company_id, name, agent_id, weekdays, notes, is_active, created_by)
    values (org_id, active_company_id, clean_name, input_agent_id, clean_days, nullif(trim(coalesce(input_notes, '')), ''), coalesce(input_is_active, true), auth.uid())
    returning id into route_id;
  else
    update public.acc_collection_routes
      set name = clean_name,
          agent_id = input_agent_id,
          weekdays = clean_days,
          notes = nullif(trim(coalesce(input_notes, '')), ''),
          is_active = coalesce(input_is_active, true),
          updated_at = now()
    where id = input_id and company_id = active_company_id
    returning id into route_id;
    if route_id is null then raise exception 'Route not found'; end if;
  end if;

  perform public.acc_write_audit(org_id, 'collection_route', route_id, case when input_id is null then 'create' else 'update' end, null,
    jsonb_build_object('name', clean_name, 'agent_id', input_agent_id, 'weekdays', clean_days, 'is_active', coalesce(input_is_active, true)),
    null, active_company_id);
  return route_id;
exception
  when unique_violation then
    raise exception 'A route named "%" already exists', clean_name;
end;
$$;
grant execute on function public.acc_save_collection_route(uuid, text, uuid, integer[], text, boolean, uuid) to authenticated;

create or replace function public.acc_delete_collection_route(input_id uuid, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  route_name text;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  delete from public.acc_collection_routes
  where id = input_id and company_id = active_company_id
  returning name into route_name;
  if route_name is null then raise exception 'Route not found'; end if;
  perform public.acc_write_audit(org_id, 'collection_route', input_id, 'delete', jsonb_build_object('name', route_name), null, null, active_company_id);
end;
$$;
grant execute on function public.acc_delete_collection_route(uuid, uuid) to authenticated;

-- Replaces the route's stops with the given customers, in visiting order. A customer sits on one route only,
-- so customers taken from another route move to this one.
create or replace function public.acc_set_route_stops(input_route_id uuid, input_party_ids uuid[], input_company_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  ids uuid[] := coalesce(input_party_ids, '{}'::uuid[]);
  stop_count integer;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if not exists (
    select 1 from public.acc_collection_routes r where r.id = input_route_id and r.company_id = active_company_id
  ) then
    raise exception 'Route not found';
  end if;
  if cardinality(ids) > 500 then raise exception 'A route can have at most 500 customers'; end if;
  if exists (
    select 1 from unnest(ids) as t(party_id)
    where not exists (
      select 1 from public.acc_parties p
      where p.id = t.party_id and p.company_id = active_company_id and p.party_type <> 'supplier'
    )
  ) then
    raise exception 'Every stop must be a customer of this company';
  end if;

  delete from public.acc_collection_route_stops where route_id = input_route_id;
  delete from public.acc_collection_route_stops where party_id = any(ids);
  insert into public.acc_collection_route_stops(route_id, party_id, organization_id, company_id, stop_order)
  select input_route_id, t.party_id, org_id, active_company_id, min(t.ord)::integer
  from unnest(ids) with ordinality as t(party_id, ord)
  group by t.party_id;
  get diagnostics stop_count = row_count;
  update public.acc_collection_routes set updated_at = now() where id = input_route_id;
  perform public.acc_write_audit(org_id, 'collection_route', input_route_id, 'stops', null,
    jsonb_build_object('stops', stop_count), null, active_company_id);
  return stop_count;
end;
$$;
grant execute on function public.acc_set_route_stops(uuid, uuid[], uuid) to authenticated;

-- The signed-in agent's routes, customers (with outstanding / overdue) and today's field collections.
-- Overdue = outstanding beyond the not-yet-due part of recent sales invoices (oldest invoices are paid first).
create or replace function public.acc_agent_route_sheet(input_date date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org_id uuid;
  agent_name text;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
  sheet_date date;
  result jsonb;
begin
  if uid is null then raise exception 'Sign in to view your collection routes'; end if;
  select p.organization_id, p.full_name into org_id, agent_name
  from public.profiles p where p.id = uid and p.is_active;
  if org_id is null then raise exception 'Your collection agent account is inactive'; end if;
  sheet_date := least(coalesce(input_date, today_ist), today_ist);

  with my_routes as (
    select r.*
    from public.acc_collection_routes r
    join public.acc_companies c on c.id = r.company_id and c.status = 'active'
    where r.organization_id = org_id and r.agent_id = uid and r.is_active
  ),
  my_stops as (
    select s.route_id, s.stop_order, p.id as party_id, p.company_id, p.name, p.phone, p.address, p.gstin
    from public.acc_collection_route_stops s
    join my_routes r on r.id = s.route_id
    join public.acc_parties p on p.id = s.party_id and p.is_active
  ),
  balances as (
    select l.party_id, round(sum(l.debit - l.credit), 2) as outstanding
    from public.acc_voucher_lines l
    join public.acc_vouchers v on v.id = l.voucher_id and v.status in ('posted', 'reversed')
    join public.acc_coa c on c.id = l.coa_id and c.account_type = 'receivable'
    where l.party_id in (select party_id from my_stops)
    group by l.party_id
  ),
  not_due as (
    select l.party_id, round(sum(l.debit), 2) as amount
    from public.acc_voucher_lines l
    join public.acc_vouchers v on v.id = l.voucher_id
      and v.status = 'posted'
      and v.voucher_type = 'sales'
      and coalesce(v.source_type, '') <> 'reversal'
      and coalesce(v.due_date, v.voucher_date + 7) >= sheet_date
    join public.acc_coa c on c.id = l.coa_id and c.account_type = 'receivable'
    where l.party_id in (select party_id from my_stops)
    group by l.party_id
  ),
  last_paid as (
    select v.party_id, max(v.voucher_date) as paid_on
    from public.acc_vouchers v
    where v.party_id in (select party_id from my_stops)
      and v.voucher_type = 'receipt' and v.status = 'posted'
    group by v.party_id
  ),
  my_collections as (
    select v.id, v.voucher_number, v.voucher_date, v.party_id, v.source_type, v.created_at, v.company_id,
           round(sum(l.debit), 2) as amount
    from public.acc_vouchers v
    join public.acc_voucher_lines l on l.voucher_id = v.id
    join public.acc_coa c on c.id = l.coa_id and c.account_type in ('cash', 'upi', 'bank')
    where v.organization_id = org_id
      and v.source_module = 'field_collection'
      and v.created_by = uid
      and v.status = 'posted'
      and v.voucher_date = sheet_date
    group by v.id
  )
  select jsonb_build_object(
    'date', sheet_date,
    'today', today_ist,
    'agent_name', agent_name,
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'gstin', c.gstin,
        'upi_id', ds.upi_id,
        'upi_payee_name', ds.upi_payee_name,
        'phone', ds.business_phone
      ) order by c.name)
      from public.acc_companies c
      left join public.acc_document_settings ds on ds.company_id = c.id
      where c.id in (select company_id from my_routes)
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'company_id', r.company_id,
        'name', r.name,
        'weekdays', to_jsonb(r.weekdays),
        'notes', r.notes
      ) order by r.name)
      from my_routes r
    ), '[]'::jsonb),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'route_id', s.route_id,
        'stop_order', s.stop_order,
        'party_id', s.party_id,
        'company_id', s.company_id,
        'name', s.name,
        'phone', s.phone,
        'address', s.address,
        'outstanding', coalesce(b.outstanding, 0),
        'overdue', greatest(0, coalesce(b.outstanding, 0) - coalesce(n.amount, 0)),
        'last_paid_on', lp.paid_on
      ) order by s.route_id, s.stop_order, s.name)
      from my_stops s
      left join balances b on b.party_id = s.party_id
      left join not_due n on n.party_id = s.party_id
      left join last_paid lp on lp.party_id = s.party_id
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'voucher_id', m.id,
        'voucher_number', m.voucher_number,
        'date', m.voucher_date,
        'party_id', m.party_id,
        'company_id', m.company_id,
        'mode', m.source_type,
        'amount', m.amount,
        'created_at', m.created_at
      ) order by m.created_at)
      from my_collections m
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
grant execute on function public.acc_agent_route_sheet(date) to authenticated;

create or replace function public.acc_agent_record_collection(
  input_party_id uuid,
  input_amount numeric,
  input_mode text,
  input_reference text default null,
  input_note text default null,
  input_client_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org_id uuid;
  agent_name text;
  party public.acc_parties%rowtype;
  route public.acc_collection_routes%rowtype;
  company public.acc_companies%rowtype;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
  v_amount numeric := round(coalesce(input_amount, 0), 2);
  v_mode text := lower(trim(coalesce(input_mode, '')));
  v_reference text := nullif(trim(coalesce(input_reference, '')), '');
  v_note text := nullif(trim(coalesce(input_note, '')), '');
  money_code text;
  money_coa uuid;
  ar_coa uuid;
  v_outstanding numeric;
  v_voucher_id uuid;
  v_voucher_no text;
  v_narration text;
  replay boolean := false;
begin
  if uid is null then raise exception 'Sign in to record collections'; end if;
  select p.organization_id, p.full_name into org_id, agent_name
  from public.profiles p where p.id = uid and p.is_active;
  if org_id is null then raise exception 'Your collection agent account is inactive'; end if;

  select * into party from public.acc_parties where id = input_party_id and organization_id = org_id;
  if party.id is null then raise exception 'Customer not found'; end if;
  select r.* into route
  from public.acc_collection_route_stops s
  join public.acc_collection_routes r on r.id = s.route_id
  where s.party_id = party.id and r.agent_id = uid and r.is_active;
  if route.id is null then raise exception 'This customer is not on your collection route'; end if;
  select * into company from public.acc_companies where id = party.company_id and status = 'active';
  if company.id is null then raise exception 'Accounts company not found'; end if;

  if input_client_request_id is not null then
    select v.id, v.voucher_number into v_voucher_id, v_voucher_no
    from public.acc_vouchers v
    where v.company_id = company.id and v.client_request_id = input_client_request_id
    limit 1;
    if v_voucher_id is not null then
      replay := true;
      select coalesce(sum(l.debit), 0) into v_amount
      from public.acc_voucher_lines l
      join public.acc_coa c on c.id = l.coa_id and c.account_type in ('cash', 'upi', 'bank')
      where l.voucher_id = v_voucher_id;
    end if;
  end if;

  if not replay then
    if v_amount <= 0 then raise exception 'Enter the amount collected'; end if;
    if v_amount > 100000000 then raise exception 'Amount is too large'; end if;
    money_code := case v_mode when 'cash' then '1000' when 'upi' then '1010' when 'bank' then '1020' when 'cheque' then '1020' else null end;
    if money_code is null then raise exception 'Choose cash, UPI, cheque or bank transfer'; end if;
    if v_mode in ('cheque', 'bank') and v_reference is null then raise exception 'Enter the cheque number or transaction reference'; end if;
    perform public.acc_assert_period_open(org_id, today_ist, company.id);
    select id into money_coa from public.acc_coa where company_id = company.id and code = money_code limit 1;
    select id into ar_coa from public.acc_coa where company_id = company.id and code = '1100' limit 1;
    if money_coa is null or ar_coa is null then
      raise exception 'The cash, UPI, bank or receivable account is missing in this company''s chart of accounts';
    end if;
    -- Serialise collections for one customer so two agents cannot both take the last rupee.
    perform 1 from public.acc_parties where id = party.id for update;
    v_outstanding := public.acc_party_receivable(party.id);
    if v_outstanding <= 0 then raise exception 'This customer has no outstanding balance'; end if;
    if v_amount > v_outstanding then raise exception 'Amount is more than the outstanding balance of %', v_outstanding; end if;

    v_narration := concat_ws(' · ', 'Route collection', route.name,
      case v_mode when 'upi' then 'UPI' when 'bank' then 'Bank transfer' else initcap(v_mode) end,
      'by ' || agent_name, v_reference, v_note);
    v_voucher_no := public.acc_next_number(company.id, 'receipt');
    insert into public.acc_vouchers(
      organization_id, company_id, voucher_type, voucher_number, voucher_date, narration, status, party_id,
      source_module, source_type, client_request_id, settlements, created_by, posted_at, posted_by
    ) values (
      org_id, company.id, 'receipt', v_voucher_no, today_ist, left(v_narration, 500), 'posted', party.id,
      'field_collection', v_mode, input_client_request_id, '[]'::jsonb, uid, now(), uid
    ) returning id into v_voucher_id;
    insert into public.acc_voucher_lines(organization_id, company_id, voucher_id, line_no, coa_id, party_id, debit, credit, description)
    values
      (org_id, company.id, v_voucher_id, 1, money_coa, party.id, v_amount, 0, left(v_narration, 500)),
      (org_id, company.id, v_voucher_id, 2, ar_coa, party.id, 0, v_amount, left(v_narration, 500));
    perform public.acc_write_audit(org_id, 'voucher', v_voucher_id, 'post', null, jsonb_build_object(
      'voucher_number', v_voucher_no, 'voucher_type', 'receipt', 'debit', v_amount, 'credit', v_amount,
      'source', 'field_collection', 'route_id', route.id, 'mode', v_mode
    ), v_narration, company.id);
  end if;

  return jsonb_build_object(
    'voucher_id', v_voucher_id,
    'voucher_number', v_voucher_no,
    'date', today_ist,
    'amount', v_amount,
    'mode', v_mode,
    'reference', v_reference,
    'already_recorded', replay,
    'outstanding_after', public.acc_party_receivable(party.id),
    'party_id', party.id,
    'party_name', party.name,
    'party_phone', party.phone,
    'company_id', company.id,
    'company_name', company.name,
    'route_name', route.name,
    'agent_name', agent_name
  );
exception
  when unique_violation then
    if input_client_request_id is not null then
      select v.id into v_voucher_id from public.acc_vouchers v
      where v.company_id = party.company_id and v.client_request_id = input_client_request_id limit 1;
      if v_voucher_id is not null then
        return jsonb_build_object('voucher_id', v_voucher_id, 'already_recorded', true, 'party_id', party.id, 'party_name', party.name);
      end if;
    end if;
    raise;
end;
$$;
grant execute on function public.acc_agent_record_collection(uuid, numeric, text, text, text, uuid) to authenticated;

-- Field collections in a date range, with the agent who collected them (for cash handover).
create or replace function public.acc_route_collections_report(input_from date, input_to date, input_company_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  org_id uuid := public.current_organization_id();
  active_company_id uuid := coalesce(input_company_id, public.acc_request_company_id());
begin
  if not public.can_accounts_read() then raise exception 'Accounts access is required'; end if;
  if active_company_id is null or not exists (
    select 1 from public.acc_companies c where c.id = active_company_id and c.organization_id = org_id
  ) then
    raise exception 'Accounts company not found';
  end if;
  return coalesce((
    select jsonb_agg(row_data order by (row_data->>'date') desc, (row_data->>'created_at') desc)
    from (
      select jsonb_build_object(
        'voucher_id', v.id,
        'voucher_number', v.voucher_number,
        'date', v.voucher_date,
        'status', v.status,
        'party_id', v.party_id,
        'party_name', p.name,
        'mode', v.source_type,
        'amount', (
          select round(coalesce(sum(l.debit), 0), 2)
          from public.acc_voucher_lines l
          join public.acc_coa c on c.id = l.coa_id and c.account_type in ('cash', 'upi', 'bank')
          where l.voucher_id = v.id
        ),
        'agent_id', v.created_by,
        'agent_name', pr.full_name,
        'narration', v.narration,
        'created_at', v.created_at
      ) as row_data
      from public.acc_vouchers v
      left join public.acc_parties p on p.id = v.party_id
      left join public.profiles pr on pr.id = v.created_by
      where v.company_id = active_company_id
        and v.source_module = 'field_collection'
        and v.voucher_date between input_from and input_to
    ) report_rows
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.acc_route_collections_report(date, date, uuid) to authenticated;

create or replace function public.acc_set_compliance_filing(
  input_return_code text,
  input_period text,
  input_filed_on date default null,
  input_reference text default null,
  input_clear boolean default false,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_return_code not in ('GSTR1', 'GSTR3B', 'CMP08', 'PMT06') then raise exception 'Unknown return %', input_return_code; end if;
  if input_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Period must look like 2026-09'; end if;
  if coalesce(input_clear, false) then
    delete from public.acc_compliance_filings
    where company_id = active_company_id and return_code = input_return_code and period = input_period;
    perform public.acc_write_audit(org_id, 'compliance_filing', null, 'clear', null,
      jsonb_build_object('return', input_return_code, 'period', input_period), null, active_company_id);
    return;
  end if;
  if coalesce(input_filed_on, today_ist) > today_ist then raise exception 'Filing date cannot be in the future'; end if;
  insert into public.acc_compliance_filings(organization_id, company_id, return_code, period, filed_on, reference, marked_by)
  values (org_id, active_company_id, input_return_code, input_period, coalesce(input_filed_on, today_ist), nullif(trim(coalesce(input_reference, '')), ''), auth.uid())
  on conflict (company_id, return_code, period) do update
    set filed_on = excluded.filed_on, reference = excluded.reference, marked_by = excluded.marked_by;
  perform public.acc_write_audit(org_id, 'compliance_filing', null, 'filed', null,
    jsonb_build_object('return', input_return_code, 'period', input_period, 'filed_on', coalesce(input_filed_on, today_ist)), null, active_company_id);
end;
$$;
grant execute on function public.acc_set_compliance_filing(text, text, date, text, boolean, uuid) to authenticated;
