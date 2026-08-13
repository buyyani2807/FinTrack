-- FinTrack operations, roles, auditability and collection ordering.
-- Run AFTER migrations 001 through 006 in the Supabase SQL Editor.
-- Existing `owner` profiles are Financiers/Admins. Existing `staff` profiles are Collection Agents.

alter table public.finance_accounts drop constraint if exists finance_accounts_status_check;
alter table public.finance_accounts add constraint finance_accounts_status_check
  check (status in ('active', 'completed', 'closed', 'bankrupt'));
alter table public.finance_accounts add column if not exists collection_order integer;
alter table public.finance_accounts add column if not exists collection_agent_id uuid references public.profiles(id) on delete set null;
alter table public.finance_accounts add column if not exists loss_amount numeric(12,2) not null default 0;
alter table public.finance_accounts add column if not exists status_changed_at timestamptz;
alter table public.finance_accounts add column if not exists status_changed_by uuid references auth.users(id);
alter table public.payments add column if not exists collected_by uuid references public.profiles(id) on delete set null;
alter table public.payments add column if not exists updated_by uuid references auth.users(id);
alter table public.payments add column if not exists updated_at timestamptz;

update public.finance_accounts
set collection_order = ordered.position
from (
  select id, row_number() over (partition by organization_id order by created_at, id) as position
  from public.finance_accounts
) ordered
where ordered.id = finance_accounts.id and finance_accounts.collection_order is null;
alter table public.finance_accounts alter column collection_order set default 999999;

create table if not exists public.finance_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finance_account_id uuid references public.finance_accounts(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists finance_audit_log_account_idx on public.finance_audit_log(finance_account_id, created_at desc);
alter table public.finance_audit_log enable row level security;

create or replace function public.current_profile_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_financier_owner() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_profile_role() = 'owner', false) $$;

create or replace function public.write_finance_audit(
  account_id uuid, event_action text, event_details jsonb default '{}'::jsonb, event_payment_id uuid default null
) returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.finance_audit_log(organization_id, finance_account_id, payment_id, action, actor_id, details)
  select organization_id, account_id, event_payment_id, event_action, auth.uid(), coalesce(event_details, '{}'::jsonb)
  from public.finance_accounts where id = account_id;
end;
$$;

-- Replace broad browser-table policies with role-aware policies. Financial writes go through RPCs below.
drop policy if exists "members manage customers" on public.customers;
drop policy if exists "members manage accounts" on public.finance_accounts;
drop policy if exists "members manage rate changes" on public.rate_changes;
drop policy if exists "members manage payments" on public.payments;
drop policy if exists "owners manage customers" on public.customers;
drop policy if exists "members read assigned customers" on public.customers;
drop policy if exists "owners manage accounts" on public.finance_accounts;
drop policy if exists "members read assigned accounts" on public.finance_accounts;
drop policy if exists "owners manage rate changes" on public.rate_changes;
drop policy if exists "members read assigned payments" on public.payments;
drop policy if exists "owners read audit log" on public.finance_audit_log;
create policy "owners manage customers" on public.customers for all to authenticated
using (organization_id = public.current_organization_id() and public.is_financier_owner())
with check (organization_id = public.current_organization_id() and public.is_financier_owner());
create policy "members read assigned customers" on public.customers for select to authenticated
using (organization_id = public.current_organization_id() and (
  public.is_financier_owner() or exists (select 1 from public.finance_accounts a where a.customer_id = customers.id and a.collection_agent_id = auth.uid())
));
create policy "owners manage accounts" on public.finance_accounts for all to authenticated
using (organization_id = public.current_organization_id() and public.is_financier_owner())
with check (organization_id = public.current_organization_id() and public.is_financier_owner());
create policy "members read assigned accounts" on public.finance_accounts for select to authenticated
using (organization_id = public.current_organization_id() and (public.is_financier_owner() or collection_agent_id = auth.uid()));
create policy "owners manage rate changes" on public.rate_changes for all to authenticated
using (public.is_financier_owner() and exists (select 1 from public.finance_accounts a where a.id = finance_account_id and a.organization_id = public.current_organization_id()))
with check (public.is_financier_owner() and exists (select 1 from public.finance_accounts a where a.id = finance_account_id and a.organization_id = public.current_organization_id()));
create policy "members read assigned payments" on public.payments for select to authenticated
using (organization_id = public.current_organization_id() and (public.is_financier_owner() or exists (select 1 from public.finance_accounts a where a.id = finance_account_id and a.collection_agent_id = auth.uid())));
create policy "owners read audit log" on public.finance_audit_log for select to authenticated
using (organization_id = public.current_organization_id() and public.is_financier_owner());

-- Only an owner can create or alter accounts. Daily payout remains explicit and editable after creation.
create or replace function public.create_finance_account(
  customer_full_name text, customer_phone text, customer_address text, account_kind public.finance_kind, account_start_date date,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; new_customer_id uuid; new_account_id uuid;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can create accounts'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  insert into public.customers(organization_id, full_name, phone, address) values (org_id, trim(customer_full_name), trim(customer_phone), nullif(trim(customer_address), '')) returning id into new_customer_id;
  insert into public.finance_accounts(organization_id, customer_id, kind, start_date, collection_amount, disbursed_amount, daily_collection, principal, monthly_interest_rate, penalty_rate, collection_order)
  values (org_id, new_customer_id, account_kind, account_start_date, account_collection_amount, account_disbursed_amount, account_daily_collection, account_principal, account_monthly_interest_rate, coalesce(account_penalty_rate, 0),
    (select coalesce(max(collection_order), 0) + 1 from public.finance_accounts where organization_id = org_id)) returning id into new_account_id;
  perform public.write_finance_audit(new_account_id, 'account_created', jsonb_build_object('kind', account_kind, 'start_date', account_start_date));
  return new_account_id;
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
  select customer_id, to_jsonb(a) into customer_uuid, before_data from public.finance_accounts a where id = account_id and organization_id = public.current_organization_id();
  if customer_uuid is null then raise exception 'Finance account not found'; end if;
  update public.customers set full_name = trim(customer_full_name), phone = trim(customer_phone), address = nullif(trim(customer_address), '') where id = customer_uuid;
  update public.finance_accounts set kind = account_kind, collection_amount = account_collection_amount, disbursed_amount = account_disbursed_amount,
    daily_collection = account_daily_collection, principal = account_principal, monthly_interest_rate = account_monthly_interest_rate, penalty_rate = coalesce(account_penalty_rate, 0)
  where id = account_id;
  perform public.write_finance_audit(account_id, 'account_updated', jsonb_build_object('before', before_data));
end;
$$;

create or replace function public.record_finance_payment(
  account_id uuid, payment_date date, payment_mode public.payment_mode, amount_total numeric,
  amount_interest numeric default 0, amount_principal numeric default 0, amount_penalty numeric default 0,
  payment_ref text default null, payment_notes text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; payment_id uuid; account_status text;
begin
  select organization_id, status into org_id, account_status from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id()
    and (public.is_financier_owner() or collection_agent_id = auth.uid());
  if org_id is null then raise exception 'Account not found or not assigned to you'; end if;
  if account_status <> 'active' then raise exception 'Collections are disabled for this account because it is %', account_status; end if;
  if amount_total <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  insert into public.payments(organization_id, finance_account_id, paid_on, mode, total_amount, interest_amount, principal_amount, penalty_amount, payment_reference, notes, created_by, collected_by)
  values(org_id, account_id, payment_date, payment_mode, amount_total, amount_interest, amount_principal, amount_penalty, nullif(trim(payment_ref), ''), nullif(trim(payment_notes), ''), auth.uid(), auth.uid()) returning id into payment_id;
  perform public.write_finance_audit(account_id, 'payment_recorded', jsonb_build_object('amount', amount_total, 'date', payment_date, 'mode', payment_mode), payment_id);
  return payment_id;
end;
$$;

create or replace function public.update_payment_notes(payment_id uuid, payment_notes text)
returns void language plpgsql security definer set search_path = public
as $$
declare account_id uuid; old_notes text;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can edit existing payment notes'; end if;
  select finance_account_id, notes into account_id, old_notes from public.payments where id = payment_id and organization_id = public.current_organization_id();
  if account_id is null then raise exception 'Payment not found'; end if;
  update public.payments set notes = nullif(trim(payment_notes), ''), updated_by = auth.uid(), updated_at = now() where id = payment_id;
  perform public.write_finance_audit(account_id, 'payment_notes_updated', jsonb_build_object('before', old_notes, 'after', nullif(trim(payment_notes), '')), payment_id);
end;
$$;

create or replace function public.set_finance_account_status(account_id uuid, new_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare balance numeric; account_kind public.finance_kind;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can change account status'; end if;
  select kind into account_kind from public.finance_accounts where id = account_id and organization_id = public.current_organization_id();
  if account_kind is null or new_status not in ('active', 'closed', 'bankrupt') then raise exception 'Invalid account status'; end if;
  select case when account_kind = 'daily' then greatest(0, a.collection_amount - coalesce(sum(p.total_amount), 0))
              else greatest(0, a.principal - coalesce(sum(p.principal_amount), 0)) end into balance
  from public.finance_accounts a left join public.payments p on p.finance_account_id = a.id where a.id = account_id
  group by a.id, a.kind, a.collection_amount, a.principal;
  update public.finance_accounts set status = new_status, loss_amount = case when new_status = 'bankrupt' then balance else 0 end,
    status_changed_at = now(), status_changed_by = auth.uid() where id = account_id;
  perform public.write_finance_audit(account_id, 'account_status_changed', jsonb_build_object('status', new_status, 'loss_amount', case when new_status = 'bankrupt' then balance else 0 end));
end;
$$;

create or replace function public.set_collection_order(account_ids uuid[])
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can change collection order'; end if;
  if exists (select 1 from unnest(account_ids) id where not exists (select 1 from public.finance_accounts where finance_accounts.id = id and organization_id = public.current_organization_id())) then raise exception 'Invalid account in collection order'; end if;
  update public.finance_accounts a set collection_order = o.position from unnest(account_ids) with ordinality as o(id, position) where a.id = o.id;
  perform public.write_finance_audit(account_ids[1], 'collection_order_updated', jsonb_build_object('account_count', cardinality(account_ids)));
end;
$$;

create or replace function public.assign_collection_agent(account_id uuid, agent_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can assign collection agents'; end if;
  if agent_id is not null and not exists (select 1 from public.profiles where id = agent_id and organization_id = public.current_organization_id() and role = 'staff') then raise exception 'Collection agent not found'; end if;
  update public.finance_accounts set collection_agent_id = agent_id where id = account_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Account not found'; end if;
  perform public.write_finance_audit(account_id, 'collection_agent_assigned', jsonb_build_object('agent_id', agent_id));
end;
$$;

-- KYC and customer portal administration are owner-only.
create or replace function public.save_customer_kyc(account_id uuid, aadhaar text, pan text) returns void language plpgsql security definer set search_path = public, vault, extensions as $$
declare encryption_key text;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can access KYC'; end if;
  if not exists (select 1 from public.finance_accounts where id = account_id and organization_id = public.current_organization_id()) then raise exception 'Account not found'; end if;
  if nullif(trim(aadhaar), '') is not null and trim(aadhaar) !~ '^[0-9]{12}$' then raise exception 'Aadhaar must contain exactly 12 digits'; end if;
  if nullif(trim(pan), '') is not null and upper(trim(pan)) !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then raise exception 'PAN format is invalid'; end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name = 'fintrack_kyc_key' limit 1;
  update public.customers c set aadhaar_ciphertext = case when nullif(trim(aadhaar), '') is null then null else encode(pgp_sym_encrypt(trim(aadhaar), encryption_key, 'cipher-algo=aes256, compress-algo=1'), 'base64') end,
    pan_ciphertext = case when nullif(trim(pan), '') is null then null else encode(pgp_sym_encrypt(upper(trim(pan)), encryption_key, 'cipher-algo=aes256, compress-algo=1'), 'base64') end from public.finance_accounts a where a.id = account_id and c.id = a.customer_id;
end; $$;
create or replace function public.get_customer_kyc(account_id uuid) returns jsonb language plpgsql security definer set search_path = public, vault, extensions as $$
declare encryption_key text;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can access KYC'; end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name = 'fintrack_kyc_key' limit 1;
  return (select jsonb_build_object('aadhaar', case when c.aadhaar_ciphertext is null then '' else convert_from(pgp_sym_decrypt(decode(c.aadhaar_ciphertext, 'base64'), encryption_key), 'utf8') end, 'pan', case when c.pan_ciphertext is null then '' else convert_from(pgp_sym_decrypt(decode(c.pan_ciphertext, 'base64'), encryption_key), 'utf8') end) from public.finance_accounts a join public.customers c on c.id = a.customer_id where a.id = account_id and a.organization_id = public.current_organization_id());
end; $$;

create or replace function public.delete_finance_account(account_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can delete accounts'; end if;
  delete from public.finance_accounts where id = account_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Finance account not found'; end if;
end; $$;

create or replace function public.enable_customer_portal(account_id uuid, new_pin text)
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare public_id text;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can manage the customer portal'; end if;
  if not new_pin ~ '^[0-9]{6,}$' then raise exception 'PIN must be at least 6 digits'; end if;
  if not exists (select 1 from public.finance_accounts where id = account_id and organization_id = public.current_organization_id()) then raise exception 'Account not found'; end if;
  public_id := 'FT-' || upper(substr(replace(account_id::text, '-', ''), 1, 8));
  insert into public.customer_portal_credentials(finance_account_id, portal_id, pin_hash, failed_attempts, locked_until, updated_at)
  values(account_id, public_id, crypt(new_pin, gen_salt('bf')), 0, null, now())
  on conflict(finance_account_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  return public_id;
end; $$;

create or replace function public.reset_customer_portal_pin(account_id uuid, new_pin text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can manage the customer portal'; end if;
  if not new_pin ~ '^[0-9]{6,}$' then raise exception 'PIN must be at least 6 digits'; end if;
  if not exists (select 1 from public.finance_accounts where id = account_id and organization_id = public.current_organization_id()) then raise exception 'Account not found'; end if;
  update public.customer_portal_credentials set pin_hash = crypt(new_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null, updated_at = now() where finance_account_id = account_id;
end; $$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_financier_owner() to authenticated;
grant execute on function public.create_finance_account(text,text,text,public.finance_kind,date,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.update_finance_account(uuid,text,text,text,public.finance_kind,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.record_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.update_payment_notes(uuid,text) to authenticated;
grant execute on function public.set_finance_account_status(uuid,text) to authenticated;
grant execute on function public.set_collection_order(uuid[]) to authenticated;
grant execute on function public.assign_collection_agent(uuid,uuid) to authenticated;
grant execute on function public.save_customer_kyc(uuid,text,text) to authenticated;
grant execute on function public.get_customer_kyc(uuid) to authenticated;
grant execute on function public.delete_finance_account(uuid) to authenticated;
grant execute on function public.enable_customer_portal(uuid,text) to authenticated;
grant execute on function public.reset_customer_portal_pin(uuid,text) to authenticated;
