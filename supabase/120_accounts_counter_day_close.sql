-- Counter day-close / Z report stored per company + till + date (server-side).
-- Apply after 115+ (acc_can_access_company / can_accounts_write). Safe to re-run.
-- If a failed earlier draft of this file left the table/policies half-created, this repairs them.

create table if not exists public.acc_counter_day_closes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  close_date date not null,
  till_id text not null default 'till-1',
  till_label text not null default 'Till 1',
  cashier_name text not null default '',
  opening_float numeric(14, 2) not null default 0,
  expected_cash numeric(14, 2) not null default 0,
  counted_cash numeric(14, 2) not null default 0,
  variance numeric(14, 2) not null default 0,
  reason text not null default '',
  bill_count integer not null default 0,
  report_json jsonb not null default '{}'::jsonb,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz not null default timezone('utc', now()),
  unique (company_id, close_date, till_id)
);

-- Repair tables created by the broken first draft (missing organization_id).
alter table public.acc_counter_day_closes
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.acc_counter_day_closes c
set organization_id = co.organization_id
from public.acc_companies co
where c.organization_id is null
  and co.id = c.company_id;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'acc_counter_day_closes'
      and column_name = 'organization_id'
      and is_nullable = 'YES'
  ) then
    alter table public.acc_counter_day_closes
      alter column organization_id set not null;
  end if;
end $$;

create index if not exists acc_counter_day_closes_company_date_idx
  on public.acc_counter_day_closes (organization_id, company_id, close_date desc);

alter table public.acc_counter_day_closes enable row level security;

drop policy if exists acc_counter_day_closes_select on public.acc_counter_day_closes;
create policy acc_counter_day_closes_select on public.acc_counter_day_closes
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_read()
    and company_id = public.acc_request_company_id()
  );

drop policy if exists acc_counter_day_closes_write on public.acc_counter_day_closes;

revoke all on table public.acc_counter_day_closes from authenticated;
grant select on table public.acc_counter_day_closes to authenticated;

create or replace function public.acc_upsert_counter_day_close(
  input_company_id uuid default null,
  input_close_date date default null,
  input_till_id text default 'till-1',
  input_till_label text default 'Till 1',
  input_cashier_name text default '',
  input_opening_float numeric default 0,
  input_expected_cash numeric default 0,
  input_counted_cash numeric default 0,
  input_variance numeric default 0,
  input_reason text default '',
  input_bill_count integer default 0,
  input_report_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  active_company_id uuid;
  row_id uuid;
begin
  if not public.can_accounts_write() then
    raise exception 'Accounts write access is required';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  active_company_id := public.acc_require_company(input_company_id);
  if input_close_date is null then
    raise exception 'Close date is required';
  end if;

  insert into public.acc_counter_day_closes (
    organization_id, company_id, close_date, till_id, till_label, cashier_name,
    opening_float, expected_cash, counted_cash, variance, reason,
    bill_count, report_json, closed_by, closed_at
  ) values (
    org_id,
    active_company_id,
    input_close_date,
    coalesce(nullif(trim(input_till_id), ''), 'till-1'),
    coalesce(nullif(trim(input_till_label), ''), 'Till 1'),
    coalesce(trim(input_cashier_name), ''),
    coalesce(input_opening_float, 0),
    coalesce(input_expected_cash, 0),
    coalesce(input_counted_cash, 0),
    coalesce(input_variance, 0),
    coalesce(trim(input_reason), ''),
    coalesce(input_bill_count, 0),
    coalesce(input_report_json, '{}'::jsonb),
    auth.uid(),
    timezone('utc', now())
  )
  on conflict (company_id, close_date, till_id) do update set
    till_label = excluded.till_label,
    cashier_name = excluded.cashier_name,
    opening_float = excluded.opening_float,
    expected_cash = excluded.expected_cash,
    counted_cash = excluded.counted_cash,
    variance = excluded.variance,
    reason = excluded.reason,
    bill_count = excluded.bill_count,
    report_json = excluded.report_json,
    closed_by = auth.uid(),
    closed_at = timezone('utc', now())
  returning id into row_id;

  return row_id;
end;
$$;

revoke all on function public.acc_upsert_counter_day_close(uuid, date, text, text, text, numeric, numeric, numeric, numeric, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.acc_upsert_counter_day_close(uuid, date, text, text, text, numeric, numeric, numeric, numeric, text, integer, jsonb) to authenticated;

create or replace function public.acc_list_counter_day_closes(
  input_company_id uuid default null,
  input_from date default null,
  input_to date default null
)
returns setof public.acc_counter_day_closes
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  active_company_id uuid;
begin
  if not public.can_accounts_read() then
    raise exception 'Accounts read access is required';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  active_company_id := public.acc_require_company(input_company_id);

  return query
  select *
  from public.acc_counter_day_closes c
  where c.organization_id = org_id
    and c.company_id = active_company_id
    and (input_from is null or c.close_date >= input_from)
    and (input_to is null or c.close_date <= input_to)
  order by c.close_date desc, c.till_label asc;
end;
$$;

revoke all on function public.acc_list_counter_day_closes(uuid, date, date) from public, anon, authenticated;
grant execute on function public.acc_list_counter_day_closes(uuid, date, date) to authenticated;
