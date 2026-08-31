-- FT-022 through FT-027. Run after 046_ft018_ft021_integrity.sql.
-- Does not change Daily/Monthly/Chit payment or prize calculations.

-- ---------------------------------------------------------------------------
-- FT-022 — Receipt numbers only for the caller's organisation
-- ---------------------------------------------------------------------------
create or replace function public.fintrack_next_receipt_number(input_org_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  yr integer := extract(year from timezone('Asia/Kolkata', now()))::integer;
  seq integer;
begin
  org_id := public.current_organization_id();
  if org_id is null or not public.is_active_finance_member() then
    raise exception 'Not authorized';
  end if;
  if input_org_id is distinct from org_id then
    raise exception 'Not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtext('receipt_seq:' || org_id::text || ':' || yr::text));
  insert into public.receipt_sequences(organization_id, receipt_year, next_number)
  values (org_id, yr, 2)
  on conflict (organization_id, receipt_year) do update
    set next_number = public.receipt_sequences.next_number + 1
  returning next_number - 1 into seq;
  return 'FT-' || yr::text || '-' || lpad(seq::text, 6, '0');
end;
$$;

revoke all on function public.fintrack_next_receipt_number(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- FT-027 — Receipt/reminder logs are not org-wide for staff
-- ---------------------------------------------------------------------------
drop policy if exists "members read receipt activity" on public.receipt_activity_log;
drop policy if exists "owners read receipt activity" on public.receipt_activity_log;
create policy "owners read receipt activity" on public.receipt_activity_log for select
  using (organization_id = public.current_organization_id() and public.is_financier_owner());

drop policy if exists "members read reminder log" on public.payment_reminder_log;
drop policy if exists "owners and assigned staff read reminder log" on public.payment_reminder_log;
create policy "owners and assigned staff read reminder log" on public.payment_reminder_log for select
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_financier_owner()
      or sent_by = auth.uid()
      or (
        reminder_source = 'monthly_finance'
        and exists (
          select 1 from public.finance_accounts a
          where a.id = source_id
            and a.organization_id = public.current_organization_id()
            and a.collection_agent_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "members read receipt sequences" on public.receipt_sequences;
drop policy if exists "owners read receipt sequences" on public.receipt_sequences;
create policy "owners read receipt sequences" on public.receipt_sequences for select
  using (organization_id = public.current_organization_id() and public.is_financier_owner());

-- ---------------------------------------------------------------------------
-- FT-023 — Re-sync cashbook when disbursed amount / principal is edited
-- ---------------------------------------------------------------------------
create or replace function public.accounts_sync_finance_disbursement(input_account_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_account_id uuid;
  v_org_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_start_date date;
  v_kind public.finance_kind;
  cash_ledger uuid;
  paid numeric;
begin
  perform public.accounts_remove_source_entries('finance_disbursement', input_account_id);

  select fa.id, fa.organization_id, fa.customer_id, c.full_name, fa.start_date, fa.kind,
    case when fa.kind = 'daily' then fa.disbursed_amount else fa.principal end
    into v_account_id, v_org_id, v_customer_id, v_customer_name, v_start_date, v_kind, paid
  from public.finance_accounts fa
  join public.customers c on c.id = fa.customer_id
  where fa.id = input_account_id and fa.kind in ('daily', 'monthly');

  if not found or coalesce(paid, 0) <= 0 then return; end if;

  perform public.accounts_ensure_default_ledgers(v_org_id);
  cash_ledger := public.accounts_ledger_for_mode(v_org_id, 'cash');
  perform public.accounts_upsert_entry(
    v_org_id, cash_ledger, v_start_date, 'money_out', 'Disbursement',
    coalesce(v_customer_name, 'Customer') || case when v_kind = 'daily' then ' · Paid to customer' else ' · Principal financed' end,
    0, paid, 'finance_disbursement', v_account_id, 'main', v_customer_id, v_account_id,
    null, null, 'cash', null, null, false
  );
end;
$$;

create or replace function public.update_finance_account(
  account_id uuid, customer_full_name text, customer_phone text, customer_address text, account_kind public.finance_kind,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare customer_uuid uuid; before_data jsonb;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can edit accounts'; end if;
  select customer_id, to_jsonb(a) into customer_uuid, before_data from public.finance_accounts a
    where id = account_id and organization_id = public.current_organization_id();
  if customer_uuid is null then raise exception 'Finance account not found'; end if;
  update public.customers set full_name = trim(customer_full_name), phone = trim(customer_phone),
    address = nullif(trim(customer_address), '') where id = customer_uuid;
  update public.finance_accounts set kind = account_kind, collection_amount = account_collection_amount,
    disbursed_amount = account_disbursed_amount, daily_collection = account_daily_collection,
    principal = account_principal, monthly_interest_rate = account_monthly_interest_rate,
    penalty_rate = coalesce(account_penalty_rate, 0)
  where id = account_id;
  perform public.write_finance_audit(account_id, 'account_updated', jsonb_build_object('before', before_data));
  if to_regprocedure('public.accounts_sync_finance_disbursement(uuid)') is not null then
    perform public.accounts_sync_finance_disbursement(account_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- FT-025 — Chit lift / auction payouts post as cashbook money-out
-- ---------------------------------------------------------------------------
do $$
declare con name;
begin
  for con in
    select c.conname
    from pg_constraint c
    join unnest(c.conkey) as cols(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = cols.attnum
    where c.conrelid = 'public.cashbook_entries'::regclass
      and c.contype = 'c'
      and a.attname = 'source_type'
  loop
    execute format('alter table public.cashbook_entries drop constraint %I', con);
  end loop;
end $$;

alter table public.cashbook_entries drop constraint if exists cashbook_entries_source_type_check;
alter table public.cashbook_entries add constraint cashbook_entries_source_type_check
  check (source_type is null or source_type in (
    'finance_payment', 'finance_disbursement', 'chit_auction', 'chit_fixed', 'chit_predefined',
    'chit_fixed_lift', 'chit_predefined_payout', 'chit_auction_payout',
    'manual', 'expense', 'transfer', 'opening_balance', 'day_closing_adjustment'
  ));

create or replace function public.accounts_sync_chit_payout(
  input_source_type text, input_source_id uuid, input_org_id uuid,
  input_amount numeric, input_paid_date date, input_member_name text, input_label text
) returns void language plpgsql security definer set search_path = public
as $$
declare cash_ledger uuid;
begin
  perform public.accounts_remove_source_entries(input_source_type, input_source_id);
  if coalesce(input_amount, 0) <= 0 or input_org_id is null then return; end if;
  perform public.accounts_ensure_default_ledgers(input_org_id);
  cash_ledger := public.accounts_ledger_for_mode(input_org_id, 'cash');
  perform public.accounts_upsert_entry(
    input_org_id, cash_ledger, coalesce(input_paid_date, current_date), 'money_out', 'Chit Payout',
    coalesce(input_member_name, 'Member') || ' · ' || coalesce(input_label, 'Lift payout'),
    0, round(input_amount, 2), input_source_type, input_source_id, 'main',
    null, null, null, null, 'cash', null, null, false
  );
end;
$$;

create or replace function public.accounts_trg_fixed_chit_lift_payout()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text;
begin
  if new.status = 'completed' then
    select cm.full_name into member_name
    from public.chit_enrollments ce
    join public.chit_members cm on cm.id = ce.member_id
    where ce.id = new.enrollment_id;
    perform public.accounts_sync_chit_payout(
      'chit_fixed_lift', new.id, new.organization_id,
      coalesce(new.amount_paid_to_member, new.lift_amount), new.lift_date,
      member_name, 'Fixed Chit lift'
    );
  else
    perform public.accounts_remove_source_entries('chit_fixed_lift', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_fixed_chit_lift_payout on public.fixed_chit_lifts;
create trigger accounts_fixed_chit_lift_payout
  after insert or update of status, amount_paid_to_member, lift_amount, lift_date, enrollment_id
  on public.fixed_chit_lifts
  for each row execute function public.accounts_trg_fixed_chit_lift_payout();

create or replace function public.accounts_trg_predefined_chit_payout()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text;
begin
  if new.status = 'completed' then
    select cm.full_name into member_name
    from public.chit_enrollments ce
    join public.chit_members cm on cm.id = ce.member_id
    where ce.id = new.enrollment_id;
    perform public.accounts_sync_chit_payout(
      'chit_predefined_payout', new.id, new.organization_id,
      new.net_receivable, new.assigned_date, member_name, 'Predefined Bid payout'
    );
  else
    perform public.accounts_remove_source_entries('chit_predefined_payout', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_predefined_chit_payout on public.predefined_chit_schedule;
create trigger accounts_predefined_chit_payout
  after insert or update of status, net_receivable, assigned_date, enrollment_id
  on public.predefined_chit_schedule
  for each row execute function public.accounts_trg_predefined_chit_payout();

create or replace function public.accounts_trg_auction_cycle_payout()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_name text;
begin
  if new.status = 'settled' and coalesce(new.winning_bid_amount, 0) > 0 then
    select cm.full_name into member_name
    from public.chit_enrollments ce
    join public.chit_members cm on cm.id = ce.member_id
    where ce.id = new.winning_enrollment_id;
    perform public.accounts_sync_chit_payout(
      'chit_auction_payout', new.id, new.organization_id,
      new.winning_bid_amount, new.cycle_date, member_name, 'Auction payout'
    );
  else
    perform public.accounts_remove_source_entries('chit_auction_payout', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_auction_cycle_payout on public.chit_cycles;
create trigger accounts_auction_cycle_payout
  after insert or update of status, winning_bid_amount, cycle_date, winning_enrollment_id
  on public.chit_cycles
  for each row execute function public.accounts_trg_auction_cycle_payout();

-- ---------------------------------------------------------------------------
-- FT-024 — Sync from FinTrack includes chit collections and lift payouts
-- ---------------------------------------------------------------------------
create or replace function public.accounts_backfill_cashbook()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare p record; cnt integer := 0; org_id uuid; member_name text;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can backfill cashbook'; end if;
  org_id := public.current_organization_id();
  perform public.accounts_ensure_default_ledgers(org_id);

  for p in select id from public.payments where organization_id = org_id loop
    perform public.accounts_sync_finance_payment(p.id);
    cnt := cnt + 1;
  end loop;
  for p in select id from public.finance_accounts where organization_id = org_id loop
    perform public.accounts_sync_finance_disbursement(p.id);
    cnt := cnt + 1;
  end loop;

  if to_regclass('public.chit_installments') is not null then
    for p in
      select i.id, i.amount_paid, i.paid_date, i.payment_mode, i.cash_amount, i.upi_amount,
        i.receipt_number, i.payment_reference, i.enrollment_id
      from public.chit_installments i
      where i.organization_id = org_id and coalesce(i.amount_paid, 0) > 0
    loop
      select cm.full_name into member_name
      from public.chit_enrollments ce
      join public.chit_members cm on cm.id = ce.member_id
      where ce.id = p.enrollment_id;
      perform public.accounts_sync_chit_payment(
        'chit_auction', p.id, p.amount_paid, p.paid_date, p.payment_mode,
        p.cash_amount, p.upi_amount, p.receipt_number, p.payment_reference, member_name
      );
      cnt := cnt + 1;
    end loop;
  end if;

  if to_regclass('public.fixed_chit_payments') is not null then
    for p in
      select i.id, i.amount_paid, i.paid_date, i.payment_mode, i.cash_amount, i.upi_amount,
        i.receipt_number, i.payment_reference, i.enrollment_id
      from public.fixed_chit_payments i
      where i.organization_id = org_id and coalesce(i.amount_paid, 0) > 0
    loop
      select cm.full_name into member_name
      from public.chit_enrollments ce
      join public.chit_members cm on cm.id = ce.member_id
      where ce.id = p.enrollment_id;
      perform public.accounts_sync_chit_payment(
        'chit_fixed', p.id, p.amount_paid, p.paid_date, p.payment_mode,
        p.cash_amount, p.upi_amount, p.receipt_number, p.payment_reference, member_name
      );
      cnt := cnt + 1;
    end loop;
  end if;

  if to_regclass('public.predefined_chit_payments') is not null then
    for p in
      select i.id, i.amount_paid, i.paid_date, i.payment_mode, i.cash_amount, i.upi_amount,
        i.receipt_number, i.payment_reference, i.enrollment_id
      from public.predefined_chit_payments i
      where i.organization_id = org_id and coalesce(i.amount_paid, 0) > 0
    loop
      select cm.full_name into member_name
      from public.chit_enrollments ce
      join public.chit_members cm on cm.id = ce.member_id
      where ce.id = p.enrollment_id;
      perform public.accounts_sync_chit_payment(
        'chit_predefined', p.id, p.amount_paid, p.paid_date, p.payment_mode,
        p.cash_amount, p.upi_amount, p.receipt_number, p.payment_reference, member_name
      );
      cnt := cnt + 1;
    end loop;
  end if;

  if to_regclass('public.fixed_chit_lifts') is not null then
    for p in
      select l.id, l.organization_id, l.amount_paid_to_member, l.lift_amount, l.lift_date, l.enrollment_id
      from public.fixed_chit_lifts l
      where l.organization_id = org_id and l.status = 'completed'
    loop
      select cm.full_name into member_name
      from public.chit_enrollments ce
      join public.chit_members cm on cm.id = ce.member_id
      where ce.id = p.enrollment_id;
      perform public.accounts_sync_chit_payout(
        'chit_fixed_lift', p.id, p.organization_id,
        coalesce(p.amount_paid_to_member, p.lift_amount), p.lift_date, member_name, 'Fixed Chit lift'
      );
      cnt := cnt + 1;
    end loop;
  end if;

  if to_regclass('public.predefined_chit_schedule') is not null then
    for p in
      select s.id, s.organization_id, s.net_receivable, s.assigned_date, s.enrollment_id
      from public.predefined_chit_schedule s
      where s.organization_id = org_id and s.status = 'completed'
    loop
      select cm.full_name into member_name
      from public.chit_enrollments ce
      join public.chit_members cm on cm.id = ce.member_id
      where ce.id = p.enrollment_id;
      perform public.accounts_sync_chit_payout(
        'chit_predefined_payout', p.id, p.organization_id,
        p.net_receivable, p.assigned_date, member_name, 'Predefined Bid payout'
      );
      cnt := cnt + 1;
    end loop;
  end if;

  if to_regclass('public.chit_cycles') is not null then
    for p in
      select c.id, c.organization_id, c.winning_bid_amount, c.cycle_date, c.winning_enrollment_id
      from public.chit_cycles c
      where c.organization_id = org_id and c.status = 'settled'
    loop
      select cm.full_name into member_name
      from public.chit_enrollments ce
      join public.chit_members cm on cm.id = ce.member_id
      where ce.id = p.winning_enrollment_id;
      perform public.accounts_sync_chit_payout(
        'chit_auction_payout', p.id, p.organization_id,
        p.winning_bid_amount, p.cycle_date, member_name, 'Auction payout'
      );
      cnt := cnt + 1;
    end loop;
  end if;

  return jsonb_build_object('synced', cnt);
end;
$$;
