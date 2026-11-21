-- RC3 release fixes. Paste in the Supabase SQL editor after 153.
-- Idempotent: every object is created with "or replace" / "drop ... if exists".
--
--  P1-1  A double-submitted "Create account" opened two accounts and two cash disbursements.
--  P1-2  Counter returns had no cap: 50 units refunded when 2 had ever been sold.
--  P2-2  Collections and chit payments could be dated in the future or before the account began.
--  P2-4  A recorded chit lift could not be reversed.
-- Existing rows are not touched; the date guards only apply when a date is written or changed.

-- ---------------------------------------------------------------------------
-- India business date (the app's "today").
-- ---------------------------------------------------------------------------
create or replace function public.fintrack_ist_today()
returns date language sql stable set search_path = public
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------------------
-- P1-1  Refuse an identical finance account opened again within 30 seconds.
-- Same organisation, kind, customer phone, start date and amounts = the same click twice.
-- The advisory lock serialises two requests that arrive together.
-- ---------------------------------------------------------------------------
create or replace function public.finance_accounts_reject_double_submit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare new_phone text;
begin
  select regexp_replace(coalesce(phone, ''), '\D', '', 'g') into new_phone
    from public.customers where id = new.customer_id;
  perform pg_advisory_xact_lock(hashtext('finance-account-create:' || new.organization_id::text || ':' || coalesce(new_phone, '')));
  if exists (
    select 1
    from public.finance_accounts fa
    join public.customers c on c.id = fa.customer_id
    where fa.organization_id = new.organization_id
      and fa.id <> new.id
      and fa.kind = new.kind
      and fa.start_date = new.start_date
      and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = coalesce(new_phone, '')
      and coalesce(fa.collection_amount, 0) = coalesce(new.collection_amount, 0)
      and coalesce(fa.disbursed_amount, 0) = coalesce(new.disbursed_amount, 0)
      and coalesce(fa.principal, 0) = coalesce(new.principal, 0)
      and fa.created_at > now() - interval '30 seconds'
  ) then
    raise exception 'This account was just created. Refresh the list instead of creating it again.';
  end if;
  return new;
end;
$$;
drop trigger if exists finance_accounts_double_submit_guard on public.finance_accounts;
create trigger finance_accounts_double_submit_guard
  before insert on public.finance_accounts
  for each row execute function public.finance_accounts_reject_double_submit();

-- ---------------------------------------------------------------------------
-- P2-2  Finance collection dates: not in the future, not before the account could be collected.
-- Daily: first collection is the day after the start (same rule as dailyFirstDueDate in the app).
-- ---------------------------------------------------------------------------
create or replace function public.payments_reject_bad_date()
returns trigger language plpgsql security definer set search_path = public
as $$
declare acct public.finance_accounts%rowtype; earliest date;
begin
  if tg_op = 'UPDATE' and new.paid_on is not distinct from old.paid_on then return new; end if;
  if new.paid_on > public.fintrack_ist_today() then
    raise exception 'A payment cannot be dated in the future';
  end if;
  select * into acct from public.finance_accounts where id = new.finance_account_id;
  if acct.id is not null and acct.start_date is not null then
    earliest := case when acct.kind = 'daily' then acct.start_date + 1 else acct.start_date end;
    if new.paid_on < earliest then
      raise exception '%', case when acct.kind = 'daily'
        then format('Daily collections start the day after the account opens (%s)', earliest)
        else format('A payment cannot be dated before the account start date (%s)', earliest) end;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists payments_date_guard on public.payments;
create trigger payments_date_guard
  before insert or update of paid_on on public.payments
  for each row execute function public.payments_reject_bad_date();

-- Chit payments and lift/payout dates: not in the future.
create or replace function public.chit_reject_future_paid_date()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.paid_date is not null
     and (tg_op = 'INSERT' or new.paid_date is distinct from old.paid_date)
     and new.paid_date > public.fintrack_ist_today() then
    raise exception 'A payment cannot be dated in the future';
  end if;
  return new;
end;
$$;
drop trigger if exists chit_installments_date_guard on public.chit_installments;
create trigger chit_installments_date_guard
  before insert or update of paid_date on public.chit_installments
  for each row execute function public.chit_reject_future_paid_date();
drop trigger if exists fixed_chit_payments_date_guard on public.fixed_chit_payments;
create trigger fixed_chit_payments_date_guard
  before insert or update of paid_date on public.fixed_chit_payments
  for each row execute function public.chit_reject_future_paid_date();
drop trigger if exists predefined_chit_payments_date_guard on public.predefined_chit_payments;
create trigger predefined_chit_payments_date_guard
  before insert or update of paid_date on public.predefined_chit_payments
  for each row execute function public.chit_reject_future_paid_date();

create or replace function public.chit_cycles_reject_future_date()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.cycle_date > public.fintrack_ist_today() then
    raise exception 'A lift cannot be dated in the future. Record it on the day the money is paid.';
  end if;
  return new;
end;
$$;
drop trigger if exists chit_cycles_date_guard on public.chit_cycles;
create trigger chit_cycles_date_guard
  before insert or update of cycle_date on public.chit_cycles
  for each row execute function public.chit_cycles_reject_future_date();

create or replace function public.fixed_chit_lifts_reject_future_date()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'completed' and new.lift_date > public.fintrack_ist_today() then
    raise exception 'A lift cannot be dated in the future. Record it on the day the money is paid.';
  end if;
  return new;
end;
$$;
drop trigger if exists fixed_chit_lifts_date_guard on public.fixed_chit_lifts;
create trigger fixed_chit_lifts_date_guard
  before insert or update of lift_date, status on public.fixed_chit_lifts
  for each row execute function public.fixed_chit_lifts_reject_future_date();

create or replace function public.predefined_chit_schedule_reject_future_date()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'completed' and new.assigned_date > public.fintrack_ist_today() then
    raise exception 'A payout cannot be dated in the future. Record it on the day the money is paid.';
  end if;
  return new;
end;
$$;
drop trigger if exists predefined_chit_schedule_date_guard on public.predefined_chit_schedule;
create trigger predefined_chit_schedule_date_guard
  before insert or update of assigned_date, status on public.predefined_chit_schedule
  for each row execute function public.predefined_chit_schedule_reject_future_date();

-- ---------------------------------------------------------------------------
-- P1-2  Counter returns: quantity within what was sold, refund rate within what was billed.
-- Per item, across this company's live (not cancelled / reversed) vouchers:
--   returned on credit notes  <=  sold on sales vouchers
--   return net rate           <=  highest net (after discount, before GST) sale rate
-- Runs after each item line of a Counter credit note, inside the posting transaction.
-- ---------------------------------------------------------------------------
create or replace function public.acc_counter_return_within_sales()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v public.acc_vouchers%rowtype; sold numeric; returned numeric; max_rate numeric; this_rate numeric;
begin
  if new.item_id is null then return new; end if;
  select * into v from public.acc_vouchers where id = new.voucher_id;
  if v.id is null or v.voucher_type <> 'credit_note' or coalesce(v.source_type, '') <> 'pos_counter' then
    return new;
  end if;
  select
    coalesce(sum(l.quantity) filter (where vv.voucher_type = 'sales'), 0),
    coalesce(sum(l.quantity) filter (where vv.voucher_type = 'credit_note'), 0),
    coalesce(max(round(l.taxable_amount / nullif(l.quantity, 0), 2)) filter (where vv.voucher_type = 'sales'), 0)
  into sold, returned, max_rate
  from public.acc_voucher_item_lines l
  join public.acc_vouchers vv on vv.id = l.voucher_id
  where l.company_id = new.company_id
    and l.item_id = new.item_id
    and vv.status not in ('cancelled', 'reversed');
  if returned > sold then
    raise exception '%: only % can be returned — that is what was sold and not yet returned',
      new.item_name, greatest(0, sold - (returned - new.quantity));
  end if;
  this_rate := round(new.taxable_amount / nullif(new.quantity, 0), 2);
  if this_rate > max_rate + 0.01 then
    raise exception '%: refund rate % is above the billed price after discount (%)', new.item_name, this_rate, max_rate;
  end if;
  return new;
end;
$$;
drop trigger if exists acc_counter_return_guard on public.acc_voucher_item_lines;
create trigger acc_counter_return_guard
  after insert on public.acc_voucher_item_lines
  for each row execute function public.acc_counter_return_within_sales();

-- ---------------------------------------------------------------------------
-- P2-4  Reverse a recorded chit lift (auction month, Fixed lift, or Predefined month).
-- Refused when any instalment of that month is already collected, or when the payout was
-- already synced into Accounts. The payout cashbook entry is removed by the existing
-- payout triggers / source cleanup, and every reversal is written to chit_audit_log.
-- ---------------------------------------------------------------------------
create or replace function public.chit_reverse_lift(input_scheme_id uuid, input_month_number integer, input_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare s public.chit_schemes%rowtype; c public.chit_cycles%rowtype;
  fl public.fixed_chit_lifts%rowtype; pd public.predefined_chit_schedule%rowtype;
  source_kind text; source_id uuid; before_row jsonb; member uuid; payout_date date;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can reverse a lift'; end if;
  if nullif(trim(coalesce(input_reason, '')), '') is null then raise exception 'A reason is required to reverse this lift'; end if;
  perform pg_advisory_xact_lock(hashtext('chit-lift-reverse:' || input_scheme_id::text));
  select * into s from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if s.id is null then raise exception 'Scheme not found'; end if;

  if s.chit_type = 'fixed' then
    select * into fl from public.fixed_chit_lifts where scheme_id = s.id and month_number = input_month_number for update;
    if fl.id is null or fl.status <> 'completed' then raise exception 'This month has no recorded lift'; end if;
    source_kind := 'chit_fixed_lift'; source_id := fl.id; before_row := to_jsonb(fl);
    member := fl.enrollment_id; payout_date := fl.lift_date;
    if exists (select 1 from public.fixed_chit_payments p where p.scheme_id = s.id and p.enrollment_id = fl.enrollment_id
               and p.payment_month > fl.month_number and coalesce(p.amount_paid, 0) > 0) then
      raise exception 'The lift member has already paid a later month at the post-lift amount. Reverse those payments first.';
    end if;
  elsif s.chit_type = 'fixed_predefined_bid' then
    select * into pd from public.predefined_chit_schedule where scheme_id = s.id and month_number = input_month_number for update;
    if pd.id is null or pd.status <> 'completed' then raise exception 'This month has no recorded payout'; end if;
    source_kind := 'chit_predefined_payout'; source_id := pd.id; before_row := to_jsonb(pd);
    member := pd.enrollment_id; payout_date := pd.assigned_date;
  else
    select * into c from public.chit_cycles where scheme_id = s.id and cycle_number = input_month_number for update;
    if c.id is null then raise exception 'This month has no recorded lift'; end if;
    if exists (select 1 from public.chit_installments where cycle_id = c.id and coalesce(amount_paid, 0) > 0) then
      raise exception 'Members have already paid this month. Reverse those payments first, then the lift.';
    end if;
    source_kind := 'chit_auction_payout'; source_id := c.id; before_row := to_jsonb(c);
    member := c.winning_enrollment_id; payout_date := c.cycle_date;
  end if;

  if exists (select 1 from public.acc_vouchers where source_type = source_kind and source_transaction_id = source_id
             and status not in ('cancelled', 'reversed')) then
    raise exception 'This payout is already in Accounts. Cancel that Accounts voucher first.';
  end if;
  perform public.acc_assert_period_open(s.organization_id, coalesce(payout_date, public.fintrack_ist_today()));

  if s.chit_type = 'fixed' then
    update public.fixed_chit_lifts set enrollment_id = null, amount_paid_to_member = null,
      remaining_months = null, total_remaining_payment = null, lift_date = null, status = 'pending',
      payout_mode = 'cash', payout_cash_amount = 0, payout_upi_amount = 0,
      finalized_at = null, finalized_by = null, updated_at = now()
    where id = fl.id;
    perform public.chit_build_member_payment_schedules(s.id);
  elsif s.chit_type = 'fixed_predefined_bid' then
    update public.predefined_chit_schedule set enrollment_id = null, assigned_date = null, status = 'pending',
      payout_mode = 'cash', payout_cash_amount = 0, payout_upi_amount = 0,
      finalized_at = null, finalized_by = null, updated_at = now()
    where id = pd.id;
    perform public.chit_build_member_payment_schedules(s.id);
  else
    update public.chit_live_auctions set finalized_cycle_id = null, status = 'cancelled', updated_at = now()
      where finalized_cycle_id = c.id;
    delete from public.chit_payouts where cycle_id = c.id;
    delete from public.chit_bids where cycle_id = c.id;
    delete from public.chit_installments where cycle_id = c.id;
    delete from public.chit_cycles where id = c.id;
  end if;
  -- Payout triggers clear the cashbook line on the status change; this covers the deleted auction row.
  perform public.accounts_remove_source_entries(source_kind, source_id);

  if s.status = 'closed' then
    update public.chit_schemes set status = 'active', updated_at = now() where id = s.id;
  end if;
  insert into public.chit_audit_log(organization_id, scheme_id, enrollment_id, action, before_data, after_data, actor_id)
  values (s.organization_id, s.id, member, 'lift_reversed', before_row,
    jsonb_build_object('month', input_month_number, 'reason', trim(input_reason), 'chit_type', s.chit_type), auth.uid());
end;
$$;
revoke all on function public.chit_reverse_lift(uuid, integer, text) from public, anon;
grant execute on function public.chit_reverse_lift(uuid, integer, text) to authenticated;

notify pgrst, 'reload schema';
