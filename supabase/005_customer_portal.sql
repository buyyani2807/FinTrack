-- Run after 004_account_type_switch.sql.
create table if not exists public.customer_portal_credentials (
  finance_account_id uuid primary key references public.finance_accounts(id) on delete cascade,
  portal_id text unique not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.customer_portal_credentials enable row level security;

-- A financier may see only portal IDs belonging to accounts in their workspace.
drop policy if exists "financiers read their portal credentials" on public.customer_portal_credentials;
create policy "financiers read their portal credentials"
on public.customer_portal_credentials for select to authenticated
using (
  exists (
    select 1 from public.finance_accounts a
    where a.id = finance_account_id
      and a.organization_id = public.current_organization_id()
  )
);

-- Portal access is enabled explicitly by the financier after account creation.
-- This avoids a shared or predictable customer PIN.
create or replace function public.create_finance_account(
  customer_full_name text, customer_phone text, customer_address text,
  account_kind public.finance_kind, account_start_date date,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; new_customer_id uuid; new_account_id uuid;
begin
  select organization_id into org_id from public.profiles where id = auth.uid();
  if org_id is null then raise exception 'No financier workspace found'; end if;
  insert into public.customers (organization_id, full_name, phone, address)
  values (org_id, trim(customer_full_name), trim(customer_phone), nullif(trim(customer_address), '')) returning id into new_customer_id;
  insert into public.finance_accounts (organization_id, customer_id, kind, start_date, collection_amount, disbursed_amount, daily_collection, principal, monthly_interest_rate, penalty_rate)
  values (org_id, new_customer_id, account_kind, account_start_date, account_collection_amount, account_disbursed_amount, account_daily_collection, account_principal, account_monthly_interest_rate, coalesce(account_penalty_rate, 0)) returning id into new_account_id;
  return new_account_id;
end;
$$;

create or replace function public.enable_customer_portal(account_id uuid, new_pin text)
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare public_id text;
begin
  if not new_pin ~ '^[0-9]{6,}$' then
    raise exception 'PIN must be at least 6 digits';
  end if;
  if not exists (
    select 1 from public.finance_accounts
    where id = account_id and organization_id = public.current_organization_id()
  ) then
    raise exception 'Account not found';
  end if;
  public_id := 'FT-' || upper(substr(replace(account_id::text, '-', ''), 1, 8));
  insert into public.customer_portal_credentials (finance_account_id, portal_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (account_id, public_id, crypt(new_pin, gen_salt('bf')), 0, null, now())
  on conflict (finance_account_id) do update set
    pin_hash = excluded.pin_hash,
    failed_attempts = 0,
    locked_until = null,
    updated_at = now();
  return public_id;
end;
$$;

create or replace function public.reset_customer_portal_pin(account_id uuid, new_pin text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not new_pin ~ '^[0-9]{6,}$' then raise exception 'PIN must be at least 6 digits'; end if;
  if not exists (select 1 from public.finance_accounts where id = account_id and organization_id = public.current_organization_id()) then raise exception 'Account not found'; end if;
  update public.customer_portal_credentials set pin_hash = crypt(new_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null, updated_at = now() where finance_account_id = account_id;
end;
$$;

create or replace function public.customer_portal_login(input_portal_id text, input_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare credential public.customer_portal_credentials%rowtype; result jsonb;
begin
  select * into credential from public.customer_portal_credentials where portal_id = upper(trim(input_portal_id));
  if not found then raise exception 'Invalid portal ID or PIN'; end if;
  if credential.locked_until is not null and credential.locked_until > now() then raise exception 'Too many attempts. Try again in 15 minutes'; end if;
  if credential.pin_hash <> crypt(input_pin, credential.pin_hash) then
    update public.customer_portal_credentials set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end where finance_account_id = credential.finance_account_id;
    raise exception 'Invalid portal ID or PIN';
  end if;
  update public.customer_portal_credentials set failed_attempts = 0, locked_until = null where finance_account_id = credential.finance_account_id;
  select jsonb_build_object('id', a.id, 'portalId', credential.portal_id, 'customerName', c.full_name, 'phone', c.phone,
    'address', c.address, 'kind', a.kind, 'startDate', a.start_date, 'collectionAmount', a.collection_amount,
    'disbursedAmount', a.disbursed_amount, 'dailyCollection', a.daily_collection, 'principal', a.principal,
    'annualRate', a.monthly_interest_rate, 'penaltyRate', a.penalty_rate,
    'rateChanges', coalesce((select jsonb_agg(jsonb_build_object('effectiveDate', r.effective_date, 'annualRate', r.monthly_interest_rate)) from public.rate_changes r where r.finance_account_id = a.id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'date', p.paid_on, 'mode', p.mode, 'amount', p.total_amount, 'interestAmount', p.interest_amount, 'principalAmount', p.principal_amount, 'penaltyAmount', p.penalty_amount, 'ref', p.payment_reference, 'notes', p.notes) order by p.paid_on desc) from public.payments p where p.finance_account_id = a.id), '[]'::jsonb)) into result
  from public.finance_accounts a join public.customers c on c.id = a.customer_id where a.id = credential.finance_account_id;
  return result;
end;
$$;
grant execute on function public.reset_customer_portal_pin(uuid,text) to authenticated;
grant execute on function public.enable_customer_portal(uuid,text) to authenticated;
grant execute on function public.customer_portal_login(text,text) to anon, authenticated;
