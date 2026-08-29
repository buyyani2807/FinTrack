-- Digital receipts, WhatsApp templates, company branding, and payment reminders.
-- Run after 037_fix_portal_id_random_bytes.sql.

alter table public.organizations add column if not exists company_address text;
alter table public.organizations add column if not exists company_phone text;
alter table public.organizations add column if not exists company_email text;
alter table public.organizations add column if not exists company_logo_url text;
alter table public.organizations add column if not exists receipt_footer text;
alter table public.organizations add column if not exists receipt_terms text;
alter table public.organizations add column if not exists whatsapp_templates jsonb not null default '{}'::jsonb;
alter table public.organizations add column if not exists reminder_settings jsonb not null default '{"monthly":{"7":true,"3":true,"1":true,"0":true},"chit":{"7":true,"3":true,"1":true,"0":true}}'::jsonb;

create table if not exists public.receipt_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_year integer not null,
  next_number integer not null default 1 check (next_number > 0),
  primary key (organization_id, receipt_year)
);

alter table public.payments add column if not exists receipt_number text;
alter table public.chit_installments add column if not exists receipt_number text;
alter table public.fixed_chit_payments add column if not exists receipt_number text;
alter table public.predefined_chit_payments add column if not exists receipt_number text;

create unique index if not exists payments_org_receipt_number_idx
  on public.payments(organization_id, receipt_number) where receipt_number is not null;
create unique index if not exists chit_installments_org_receipt_number_idx
  on public.chit_installments(organization_id, receipt_number) where receipt_number is not null;
create unique index if not exists fixed_chit_payments_org_receipt_number_idx
  on public.fixed_chit_payments(organization_id, receipt_number) where receipt_number is not null;
create unique index if not exists predefined_chit_payments_org_receipt_number_idx
  on public.predefined_chit_payments(organization_id, receipt_number) where receipt_number is not null;

create table if not exists public.receipt_activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_source text not null check (payment_source in ('finance', 'chit_auction', 'chit_fixed', 'chit_predefined')),
  payment_id uuid not null,
  action text not null check (action in ('generated', 'viewed', 'downloaded', 'whatsapp_clicked')),
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists receipt_activity_log_org_idx on public.receipt_activity_log(organization_id, created_at desc);

create table if not exists public.payment_reminder_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reminder_source text not null check (reminder_source in ('monthly_finance', 'chit_fund')),
  source_id uuid not null,
  cycle_key text not null,
  days_before integer not null check (days_before >= 0),
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users(id),
  unique (organization_id, reminder_source, source_id, cycle_key, days_before)
);

create index if not exists payment_reminder_log_lookup_idx
  on public.payment_reminder_log(organization_id, reminder_source, source_id, cycle_key);

create or replace function public.fintrack_next_receipt_number(input_org_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  yr integer := extract(year from timezone('Asia/Kolkata', now()))::integer;
  seq integer;
begin
  perform pg_advisory_xact_lock(hashtext('receipt_seq:' || input_org_id::text || ':' || yr::text));
  insert into public.receipt_sequences(organization_id, receipt_year, next_number)
  values (input_org_id, yr, 2)
  on conflict (organization_id, receipt_year) do update
    set next_number = public.receipt_sequences.next_number + 1
  returning next_number - 1 into seq;
  return 'FT-' || yr::text || '-' || lpad(seq::text, 6, '0');
end;
$$;

create or replace function public.log_receipt_activity(
  input_payment_source text,
  input_payment_id uuid,
  input_action text
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_finance_member() then
    raise exception 'Not authorized';
  end if;
  insert into public.receipt_activity_log(organization_id, payment_source, payment_id, action, actor_id)
  values (public.current_organization_id(), input_payment_source, input_payment_id, input_action, auth.uid());
end;
$$;

create or replace function public.mark_payment_reminder_sent(
  input_reminder_source text,
  input_source_id uuid,
  input_cycle_key text,
  input_days_before integer
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_finance_member() then
    raise exception 'Not authorized';
  end if;
  insert into public.payment_reminder_log(
    organization_id, reminder_source, source_id, cycle_key, days_before, sent_by
  ) values (
    public.current_organization_id(), input_reminder_source, input_source_id,
    input_cycle_key, input_days_before, auth.uid()
  )
  on conflict (organization_id, reminder_source, source_id, cycle_key, days_before) do nothing;
end;
$$;

create or replace function public.update_organization_receipt_settings(
  input_company_name text default null,
  input_company_address text default null,
  input_company_phone text default null,
  input_company_email text default null,
  input_company_logo_url text default null,
  input_receipt_footer text default null,
  input_receipt_terms text default null,
  input_whatsapp_templates jsonb default null,
  input_reminder_settings jsonb default null
) returns void language plpgsql security definer set search_path = public
as $$
declare org_id uuid;
begin
  if not public.is_financier_owner() then
    raise exception 'Only a financier can update organization settings';
  end if;
  org_id := public.current_organization_id();
  update public.organizations set
    name = coalesce(nullif(trim(input_company_name), ''), name),
    company_address = coalesce(input_company_address, company_address),
    company_phone = coalesce(input_company_phone, company_phone),
    company_email = coalesce(input_company_email, company_email),
    company_logo_url = coalesce(input_company_logo_url, company_logo_url),
    receipt_footer = coalesce(input_receipt_footer, receipt_footer),
    receipt_terms = coalesce(input_receipt_terms, receipt_terms),
    whatsapp_templates = coalesce(input_whatsapp_templates, whatsapp_templates),
    reminder_settings = coalesce(input_reminder_settings, reminder_settings)
  where id = org_id;
end;
$$;

-- Finance payment recording with receipt number (based on 015 guard version).
create or replace function public.record_finance_payment(
  account_id uuid, payment_date date, payment_mode public.payment_mode, amount_total numeric,
  amount_interest numeric, amount_principal numeric, amount_penalty numeric,
  payment_ref text, payment_notes text, payment_cash_amount numeric, payment_upi_amount numeric
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; payment_id uuid; account_status text; receipt_no text;
begin
  if not public.is_active_finance_member() then raise exception 'Your collection agent account is inactive'; end if;
  perform pg_advisory_xact_lock(hashtext(account_id::text || ':' || payment_date::text));
  select organization_id, status into org_id, account_status from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id()
    and (public.is_financier_owner() or collection_agent_id = auth.uid());
  if org_id is null then raise exception 'Account not found or not assigned to you'; end if;
  if account_status <> 'active' then raise exception 'Collections are disabled for this account because it is %', account_status; end if;
  if exists (select 1 from public.payments where finance_account_id = account_id and paid_on = payment_date) then
    raise exception 'A collection is already recorded for this account on this date';
  end if;
  if amount_total <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if coalesce(amount_interest, 0) < 0 or coalesce(amount_principal, 0) < 0 or coalesce(amount_penalty, 0) < 0 then
    raise exception 'Payment components cannot be negative';
  end if;
  if payment_cash_amount < 0 or payment_upi_amount < 0 then raise exception 'Cash and UPI amounts cannot be negative'; end if;
  if payment_mode = 'cash_upi' and (payment_cash_amount <= 0 or payment_upi_amount <= 0 or round(payment_cash_amount + payment_upi_amount, 2) <> round(amount_total, 2)) then
    raise exception 'Cash and UPI amounts must both be positive and equal the total collected';
  end if;
  if payment_mode = 'cash' and (round(payment_cash_amount, 2) <> round(amount_total, 2) or payment_upi_amount <> 0) then raise exception 'Cash amount must equal the total collected'; end if;
  if payment_mode = 'upi' and (round(payment_upi_amount, 2) <> round(amount_total, 2) or payment_cash_amount <> 0) then raise exception 'UPI amount must equal the total collected'; end if;
  if payment_mode = 'bank' and (payment_cash_amount <> 0 or payment_upi_amount <> 0) then raise exception 'Bank-transfer payments cannot include cash or UPI amounts'; end if;
  receipt_no := public.fintrack_next_receipt_number(org_id);
  insert into public.payments(
    organization_id, finance_account_id, paid_on, mode, total_amount, interest_amount, principal_amount,
    penalty_amount, payment_reference, notes, cash_amount, upi_amount, created_by, collected_by, receipt_number
  ) values (
    org_id, account_id, payment_date, payment_mode, round(amount_total, 2), coalesce(amount_interest, 0),
    coalesce(amount_principal, 0), coalesce(amount_penalty, 0), nullif(trim(payment_ref), ''),
    nullif(trim(payment_notes), ''), round(payment_cash_amount, 2), round(payment_upi_amount, 2),
    auth.uid(), auth.uid(), receipt_no
  ) returning id into payment_id;
  perform public.write_finance_audit(account_id, 'payment_recorded', jsonb_build_object(
    'amount', amount_total, 'date', payment_date, 'mode', payment_mode,
    'cash_amount', payment_cash_amount, 'upi_amount', payment_upi_amount, 'receipt_number', receipt_no
  ), payment_id);
  perform public.log_receipt_activity('finance', payment_id, 'generated');
  return payment_id;
end;
$$;

grant execute on function public.fintrack_next_receipt_number(uuid) to authenticated;
grant execute on function public.log_receipt_activity(text, uuid, text) to authenticated;
grant execute on function public.mark_payment_reminder_sent(text, uuid, text, integer) to authenticated;
grant execute on function public.update_organization_receipt_settings(text, text, text, text, text, text, text, jsonb, jsonb) to authenticated;

-- Chit auction installment payments
create or replace function public.chit_update_installment_payment(
  input_installment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text,
  input_cash_amount numeric, input_upi_amount numeric, input_notes text
) returns void language plpgsql security definer set search_path = public
as $$
declare due numeric; org_id uuid; receipt_no text; had_payment boolean;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record or edit Chit Fund payments'; end if;
  select net_amount_due, organization_id, (amount_paid > 0 and receipt_number is not null)
    into due, org_id, had_payment
  from public.chit_installments where id = input_installment_id and organization_id = public.current_organization_id();
  if due is null then raise exception 'Installment not found'; end if;
  if input_amount_paid < 0 or input_amount_paid > due then raise exception 'Payment must be between zero and the amount due'; end if;
  if coalesce(input_cash_amount,0) < 0 or coalesce(input_upi_amount,0) < 0 then raise exception 'Cash and UPI amounts cannot be negative'; end if;
  if input_amount_paid > 0 and input_payment_mode = 'cash' and (round(input_cash_amount,2) <> round(input_amount_paid,2) or coalesce(input_upi_amount,0) <> 0) then raise exception 'Cash amount must equal total paid'; end if;
  if input_amount_paid > 0 and input_payment_mode = 'upi' and (round(input_upi_amount,2) <> round(input_amount_paid,2) or coalesce(input_cash_amount,0) <> 0) then raise exception 'UPI amount must equal total paid'; end if;
  if input_amount_paid > 0 and input_payment_mode = 'cash_upi' and (input_cash_amount <= 0 or input_upi_amount <= 0 or round(input_cash_amount + input_upi_amount,2) <> round(input_amount_paid,2)) then raise exception 'Cash and UPI amounts must equal total paid'; end if;
  if input_amount_paid > 0 and not had_payment then
    receipt_no := public.fintrack_next_receipt_number(org_id);
  end if;
  update public.chit_installments set
    amount_paid = round(input_amount_paid, 2),
    paid_date = case when input_amount_paid > 0 then coalesce(input_paid_date, current_date) else null end,
    payment_mode = case when input_amount_paid > 0 then input_payment_mode else null end,
    payment_reference = nullif(trim(input_payment_reference), ''),
    cash_amount = coalesce(input_cash_amount, 0),
    upi_amount = coalesce(input_upi_amount, 0),
    notes = nullif(trim(input_notes), ''),
    receipt_number = case
      when input_amount_paid <= 0 then null
      when receipt_number is not null then receipt_number
      else receipt_no
    end,
    status = case when input_amount_paid = 0 then 'due' when input_amount_paid < net_amount_due then 'partially_paid' else 'paid' end,
    updated_at = now()
  where id = input_installment_id;
  if input_amount_paid > 0 and receipt_no is not null then
    perform public.log_receipt_activity('chit_auction', input_installment_id, 'generated');
  end if;
end;
$$;

-- Fixed chit payments
create or replace function public.chit_update_fixed_payment(
  input_payment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text default null,
  input_notes text default null
) returns void language plpgsql security definer set search_path = public
as $$
declare payment public.fixed_chit_payments%rowtype; receipt_no text;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record Fixed Chit payments'; end if;
  select * into payment from public.fixed_chit_payments
    where id = input_payment_id and organization_id = public.current_organization_id() for update;
  if payment.id is null then raise exception 'Payment schedule item not found'; end if;
  if input_amount_paid <= 0 or input_amount_paid > payment.amount_due then raise exception 'Invalid payment amount'; end if;
  if payment.amount_paid <= 0 or payment.receipt_number is null then
    receipt_no := public.fintrack_next_receipt_number(payment.organization_id);
  end if;
  update public.fixed_chit_payments set
    amount_paid = round(input_amount_paid, 2), paid_date = input_paid_date,
    payment_mode = input_payment_mode,
    payment_reference = nullif(trim(input_payment_reference), ''),
    notes = nullif(trim(input_notes), ''), collected_by = auth.uid(),
    receipt_number = coalesce(receipt_number, receipt_no),
    status = case when round(input_amount_paid, 2) = amount_due then 'paid' else 'partially_paid' end,
    updated_at = now()
  where id = payment.id;
  if receipt_no is not null then
    perform public.log_receipt_activity('chit_fixed', payment.id, 'generated');
  end if;
end;
$$;

-- Predefined bid chit payments
create or replace function public.chit_update_predefined_payment(
  input_payment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text default null,
  input_notes text default null
) returns void language plpgsql security definer set search_path = public
as $$
declare payment public.predefined_chit_payments%rowtype; receipt_no text;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can record predefined chit payments'; end if;
  select * into payment from public.predefined_chit_payments
    where id = input_payment_id and organization_id = public.current_organization_id() for update;
  if payment.id is null then raise exception 'Payment schedule item not found'; end if;
  if input_amount_paid <= 0 or input_amount_paid > payment.amount_due then raise exception 'Invalid payment amount'; end if;
  if payment.amount_paid <= 0 or payment.receipt_number is null then
    receipt_no := public.fintrack_next_receipt_number(payment.organization_id);
  end if;
  update public.predefined_chit_payments set
    amount_paid = round(input_amount_paid, 2), paid_date = input_paid_date,
    payment_mode = input_payment_mode,
    payment_reference = nullif(trim(input_payment_reference), ''),
    notes = nullif(trim(input_notes), ''), collected_by = auth.uid(),
    receipt_number = coalesce(receipt_number, receipt_no),
    status = case when round(input_amount_paid, 2) = amount_due then 'paid' else 'partially_paid' end,
    updated_at = now()
  where id = payment.id;
  if receipt_no is not null then
    perform public.log_receipt_activity('chit_predefined', payment.id, 'generated');
  end if;
end;
$$;

-- Clear receipt numbers when chit payments are deleted/zeroed
create or replace function public.chit_delete_installment_payment(input_installment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Chit Fund payments'; end if;
  update public.chit_installments set amount_paid = 0, paid_date = null, payment_mode = null,
    payment_reference = null, cash_amount = 0, upi_amount = 0, notes = null, receipt_number = null,
    status = 'due', updated_at = now()
  where id = input_installment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Installment not found'; end if;
end;
$$;

create or replace function public.chit_delete_fixed_payment(input_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Fixed Chit payments'; end if;
  update public.fixed_chit_payments set amount_paid = 0, paid_date = null,
    payment_mode = null, payment_reference = null, notes = null,
    collected_by = null, receipt_number = null, status = 'due', updated_at = now()
  where id = input_payment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Payment schedule item not found'; end if;
end;
$$;

alter table public.receipt_activity_log enable row level security;
alter table public.payment_reminder_log enable row level security;
alter table public.receipt_sequences enable row level security;

create policy "members read receipt activity" on public.receipt_activity_log for select
  using (organization_id = public.current_organization_id());
create policy "members read reminder log" on public.payment_reminder_log for select
  using (organization_id = public.current_organization_id());
create policy "members read receipt sequences" on public.receipt_sequences for select
  using (organization_id = public.current_organization_id());
