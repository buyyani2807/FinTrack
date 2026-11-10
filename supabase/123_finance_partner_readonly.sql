-- Sleeping partners: Owner sign-in with Daily/Monthly Finance view-only access.
-- Same visibility as the owner for finance books; no create/edit/collect/delete.
-- Apply after 122. Safe to re-run.

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%';
  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'staff', 'accounts', 'finance_partner'));

create or replace function public.is_finance_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'finance_partner' and is_active
    from public.profiles
    where id = auth.uid()
  ), false)
$$;

-- Broad finance read for owners and sleeping partners (staff still use assignment policies).
create or replace function public.can_finance_read()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_financier_owner() or public.is_finance_partner()
$$;

grant execute on function public.is_finance_partner() to authenticated;
grant execute on function public.can_finance_read() to authenticated;

-- Read policies: partners see the full org finance books (same as owner SELECT).
drop policy if exists "members read assigned customers" on public.customers;
create policy "members read assigned customers" on public.customers for select to authenticated
using (organization_id = public.current_organization_id() and (
  public.can_finance_read()
  or exists (
    select 1 from public.finance_accounts a
    where a.customer_id = customers.id and a.collection_agent_id = auth.uid()
  )
));

drop policy if exists "members read assigned accounts" on public.finance_accounts;
create policy "members read assigned accounts" on public.finance_accounts for select to authenticated
using (organization_id = public.current_organization_id() and (
  public.can_finance_read() or collection_agent_id = auth.uid()
));

drop policy if exists "members read assigned payments" on public.payments;
create policy "members read assigned payments" on public.payments for select to authenticated
using (organization_id = public.current_organization_id() and (
  public.can_finance_read()
  or exists (
    select 1 from public.finance_accounts a
    where a.id = finance_account_id and a.collection_agent_id = auth.uid()
  )
));

drop policy if exists "owners read audit log" on public.finance_audit_log;
create policy "owners read audit log" on public.finance_audit_log for select to authenticated
using (organization_id = public.current_organization_id() and public.can_finance_read());

-- Rate changes: owners manage (FOR ALL). Partners need SELECT for account history.
drop policy if exists "finance partners read rate changes" on public.rate_changes;
create policy "finance partners read rate changes" on public.rate_changes for select to authenticated
using (
  public.is_finance_partner()
  and exists (
    select 1 from public.finance_accounts a
    where a.id = finance_account_id and a.organization_id = public.current_organization_id()
  )
);

-- Explicit write helper for app/API checks. Write RPCs already require is_financier_owner()
-- (record_finance_payment allows assigned staff only — partners never match either).
create or replace function public.can_finance_write()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_financier_owner()
$$;

grant execute on function public.can_finance_write() to authenticated;

-- Partners may view KYC; only owners may change it.
create or replace function public.get_customer_kyc(account_id uuid) returns jsonb
language plpgsql security definer set search_path = public, vault, extensions as $$
declare encryption_key text;
begin
  if not public.can_finance_read() then raise exception 'Only a financier can access KYC'; end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name = 'fintrack_kyc_key' limit 1;
  return (
    select jsonb_build_object(
      'aadhaar', case when c.aadhaar_ciphertext is null then '' else convert_from(pgp_sym_decrypt(decode(c.aadhaar_ciphertext, 'base64'), encryption_key), 'utf8') end,
      'pan', case when c.pan_ciphertext is null then '' else convert_from(pgp_sym_decrypt(decode(c.pan_ciphertext, 'base64'), encryption_key), 'utf8') end
    )
    from public.finance_accounts a
    join public.customers c on c.id = a.customer_id
    where a.id = account_id and a.organization_id = public.current_organization_id()
  );
end;
$$;
