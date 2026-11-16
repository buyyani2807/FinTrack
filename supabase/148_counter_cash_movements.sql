-- 148: Counter cash in / out (petty cash, float top-up, cash handed to the owner).
-- Safe to re-run. Apply after 147. Deploy the client together with it: without this
-- migration the Counter's "Cash in / out" button reports that 148 is needed.
--
-- Why a separate table: a cashier may only post Counter sales and returns (142, 144).
-- Cash taken from or added to the drawer is recorded here as a till record, not as an
-- accounting voucher. The owner or accountant later posts each record to a ledger from
-- the Counter; the cashier never chooses a ledger and still writes nothing else in Accounts.
--
-- Who can do what:
--   record   owner, accountant, cashier (cashier: today only, till not closed)
--   list     owner, accountant, viewer: all rows of the company; cashier: own rows only
--   cancel   owner, accountant: any unposted row; cashier: own row, same day, till not closed
--   post     owner, accountant only (marks the row with the voucher they posted)
-- The table is not readable or writable directly; every path is one of the functions below.

create table if not exists public.acc_counter_cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  movement_date date not null,
  till_id text not null default 'till-1',
  till_label text not null default 'Till 1',
  direction text not null check (direction in ('in', 'out')),
  amount numeric(14, 2) not null check (amount > 0),
  reason text not null check (char_length(trim(reason)) > 0),
  note text not null default '',
  cashier_name text not null default '',
  client_request_id text,
  created_by uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  posted_voucher_id uuid references public.acc_vouchers(id) on delete set null,
  posted_by uuid,
  posted_at timestamptz
);

create unique index if not exists acc_counter_cash_movements_request_idx
  on public.acc_counter_cash_movements (company_id, client_request_id)
  where client_request_id is not null;

create index if not exists acc_counter_cash_movements_day_idx
  on public.acc_counter_cash_movements (organization_id, company_id, movement_date desc, till_id);

alter table public.acc_counter_cash_movements enable row level security;
revoke all on table public.acc_counter_cash_movements from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Record cash in or cash out at the till. Returns the row id.
-- The same client_request_id returns the first row again (double tap, retry).
-- ---------------------------------------------------------------------------
create or replace function public.acc_record_counter_cash_movement(
  input_direction text,
  input_amount numeric,
  input_reason text,
  input_note text default '',
  input_till_id text default 'till-1',
  input_till_label text default 'Till 1',
  input_cashier_name text default '',
  input_movement_date date default null,
  input_client_request_id text default null,
  input_company_id uuid default null
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
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
  move_date date;
  till text;
  request_id text := nullif(trim(coalesce(input_client_request_id, '')), '');
begin
  if not public.can_accounts_write() then
    raise exception 'Counter access is required';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  active_company_id := public.acc_require_company(input_company_id);

  if input_direction is null or input_direction not in ('in', 'out') then
    raise exception 'Choose cash in or cash out';
  end if;
  if input_amount is null or round(input_amount, 2) <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if char_length(trim(coalesce(input_reason, ''))) = 0 then
    raise exception 'Choose a reason';
  end if;

  move_date := coalesce(input_movement_date, today_ist);
  if move_date > today_ist then
    raise exception 'The date cannot be in the future';
  end if;
  if public.acc_is_cashier() and move_date <> today_ist then
    raise exception 'A cashier can record cash in or out for today only';
  end if;

  till := coalesce(nullif(trim(input_till_id), ''), 'till-1');
  if exists (
    select 1 from public.acc_counter_day_closes c
    where c.company_id = active_company_id and c.close_date = move_date and c.till_id = till
  ) then
    raise exception 'This till is closed for the day';
  end if;

  if request_id is not null then
    select m.id into row_id
    from public.acc_counter_cash_movements m
    where m.company_id = active_company_id and m.client_request_id = request_id;
    if found then return row_id; end if;
  end if;

  insert into public.acc_counter_cash_movements (
    organization_id, company_id, movement_date, till_id, till_label, direction, amount,
    reason, note, cashier_name, client_request_id, created_by
  ) values (
    org_id,
    active_company_id,
    move_date,
    till,
    coalesce(nullif(trim(input_till_label), ''), 'Till 1'),
    input_direction,
    round(input_amount, 2),
    trim(input_reason),
    coalesce(trim(input_note), ''),
    coalesce(trim(input_cashier_name), ''),
    request_id,
    auth.uid()
  )
  returning id into row_id;

  perform public.acc_write_audit(
    org_id, 'counter_cash_movement', row_id, 'cash_' || input_direction, null,
    jsonb_build_object('amount', round(input_amount, 2), 'reason', trim(input_reason), 'till_id', till, 'date', move_date),
    nullif(trim(coalesce(input_note, '')), ''), active_company_id
  );
  return row_id;
end;
$$;

revoke all on function public.acc_record_counter_cash_movement(text, numeric, text, text, text, text, text, date, text, uuid) from public, anon;
grant execute on function public.acc_record_counter_cash_movement(text, numeric, text, text, text, text, text, date, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- List. A cashier sees only the rows they recorded.
-- ---------------------------------------------------------------------------
create or replace function public.acc_list_counter_cash_movements(
  input_from date default null,
  input_to date default null,
  input_company_id uuid default null
)
returns setof public.acc_counter_cash_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  active_company_id uuid;
  own_only boolean := public.acc_is_cashier();
begin
  if not public.can_accounts_read() then
    raise exception 'Accounts read access is required';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  active_company_id := public.acc_require_company(input_company_id);

  return query
  select m.*
  from public.acc_counter_cash_movements m
  where m.organization_id = org_id
    and m.company_id = active_company_id
    and (input_from is null or m.movement_date >= input_from)
    and (input_to is null or m.movement_date <= input_to)
    and (not own_only or m.created_by = auth.uid())
  order by m.created_at desc;
end;
$$;

revoke all on function public.acc_list_counter_cash_movements(date, date, uuid) from public, anon;
grant execute on function public.acc_list_counter_cash_movements(date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cancel a record that is not posted to the books yet.
-- ---------------------------------------------------------------------------
create or replace function public.acc_cancel_counter_cash_movement(
  input_id uuid,
  input_reason text default null,
  input_company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  active_company_id uuid;
  movement public.acc_counter_cash_movements%rowtype;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
  is_manager boolean := coalesce(public.accounts_access_role() in ('owner', 'accountant'), false);
begin
  if not public.can_accounts_write() then
    raise exception 'Counter access is required';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  active_company_id := public.acc_require_company(input_company_id);

  select * into movement
  from public.acc_counter_cash_movements m
  where m.id = input_id and m.organization_id = org_id and m.company_id = active_company_id
  for update;
  if not found then
    raise exception 'That cash entry was not found';
  end if;
  if movement.cancelled_at is not null then
    return;
  end if;
  if movement.posted_voucher_id is not null then
    raise exception 'This entry is already posted to the books. Reverse its voucher in Accounts instead.';
  end if;

  if not is_manager then
    if movement.created_by is distinct from auth.uid() or movement.movement_date <> today_ist then
      raise exception 'Only the owner can cancel this entry';
    end if;
    if exists (
      select 1 from public.acc_counter_day_closes c
      where c.company_id = active_company_id and c.close_date = movement.movement_date and c.till_id = movement.till_id
    ) then
      raise exception 'This till is closed for the day. Ask the owner to cancel the entry.';
    end if;
  end if;

  update public.acc_counter_cash_movements
    set cancelled_at = timezone('utc', now()),
        cancelled_by = auth.uid(),
        cancel_reason = nullif(trim(coalesce(input_reason, '')), '')
    where id = movement.id;

  perform public.acc_write_audit(
    org_id, 'counter_cash_movement', movement.id, 'cancel',
    jsonb_build_object('amount', movement.amount, 'direction', movement.direction, 'reason', movement.reason),
    null, nullif(trim(coalesce(input_reason, '')), ''), active_company_id
  );
end;
$$;

revoke all on function public.acc_cancel_counter_cash_movement(uuid, text, uuid) from public, anon;
grant execute on function public.acc_cancel_counter_cash_movement(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner or accountant: link the record to the voucher they posted for it.
-- ---------------------------------------------------------------------------
create or replace function public.acc_mark_counter_cash_movement_posted(
  input_id uuid,
  input_voucher_id uuid,
  input_company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  active_company_id uuid;
  movement public.acc_counter_cash_movements%rowtype;
begin
  if not coalesce(public.accounts_access_role() in ('owner', 'accountant'), false) then
    raise exception 'Only the owner or accountant can post cash entries to the books';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  active_company_id := public.acc_require_company(input_company_id);

  select * into movement
  from public.acc_counter_cash_movements m
  where m.id = input_id and m.organization_id = org_id and m.company_id = active_company_id
  for update;
  if not found then
    raise exception 'That cash entry was not found';
  end if;
  if movement.cancelled_at is not null then
    raise exception 'This cash entry was cancelled';
  end if;
  if movement.posted_voucher_id is not null then
    if movement.posted_voucher_id = input_voucher_id then return; end if;
    raise exception 'This cash entry is already posted to the books';
  end if;
  if input_voucher_id is null or not exists (
    select 1 from public.acc_vouchers v
    where v.id = input_voucher_id and v.company_id = active_company_id and v.status = 'posted'
  ) then
    raise exception 'The voucher for this cash entry was not found';
  end if;

  update public.acc_counter_cash_movements
    set posted_voucher_id = input_voucher_id,
        posted_by = auth.uid(),
        posted_at = timezone('utc', now())
    where id = movement.id;

  perform public.acc_write_audit(
    org_id, 'counter_cash_movement', movement.id, 'post', null,
    jsonb_build_object('voucher_id', input_voucher_id, 'amount', movement.amount, 'direction', movement.direction),
    null, active_company_id
  );
end;
$$;

revoke all on function public.acc_mark_counter_cash_movement_posted(uuid, uuid, uuid) from public, anon;
grant execute on function public.acc_mark_counter_cash_movement_posted(uuid, uuid, uuid) to authenticated;
