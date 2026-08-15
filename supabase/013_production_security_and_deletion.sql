-- FinTrack production hardening: owner/staff RLS and safe permanent account deletion.
-- Run after 012_payment_corrections.sql.

-- Replace the original organisation-wide write policies. Owners use the existing
-- security-definer functions; staff may read only the accounts assigned to them.
drop policy if exists "members manage customers" on public.customers;
drop policy if exists "members manage accounts" on public.finance_accounts;
drop policy if exists "members manage rate changes" on public.rate_changes;
drop policy if exists "members manage payments" on public.payments;
drop policy if exists "owners read all customers" on public.customers;
drop policy if exists "staff read assigned customers" on public.customers;
drop policy if exists "owners read all accounts" on public.finance_accounts;
drop policy if exists "staff read assigned accounts" on public.finance_accounts;
drop policy if exists "owners read all rate changes" on public.rate_changes;
drop policy if exists "staff read assigned rate changes" on public.rate_changes;
drop policy if exists "owners read all payments" on public.payments;
drop policy if exists "staff read assigned payments" on public.payments;
drop policy if exists "owners read finance audit" on public.finance_audit_log;

create policy "owners read all customers" on public.customers for select
using (organization_id = public.current_organization_id() and public.is_financier_owner());
create policy "staff read assigned customers" on public.customers for select
using (organization_id = public.current_organization_id() and exists (
  select 1 from public.finance_accounts a
  where a.customer_id = customers.id and a.organization_id = public.current_organization_id()
    and a.collection_agent_id = auth.uid()
));

create policy "owners read all accounts" on public.finance_accounts for select
using (organization_id = public.current_organization_id() and public.is_financier_owner());
create policy "staff read assigned accounts" on public.finance_accounts for select
using (organization_id = public.current_organization_id() and collection_agent_id = auth.uid());

create policy "owners read all rate changes" on public.rate_changes for select
using (public.is_financier_owner() and exists (
  select 1 from public.finance_accounts a
  where a.id = rate_changes.finance_account_id and a.organization_id = public.current_organization_id()
));
create policy "staff read assigned rate changes" on public.rate_changes for select
using (exists (
  select 1 from public.finance_accounts a
  where a.id = rate_changes.finance_account_id and a.organization_id = public.current_organization_id()
    and a.collection_agent_id = auth.uid()
));

create policy "owners read all payments" on public.payments for select
using (organization_id = public.current_organization_id() and public.is_financier_owner());
create policy "staff read assigned payments" on public.payments for select
using (organization_id = public.current_organization_id() and exists (
  select 1 from public.finance_accounts a
  where a.id = payments.finance_account_id and a.organization_id = public.current_organization_id()
    and a.collection_agent_id = auth.uid()
));

create policy "owners read finance audit" on public.finance_audit_log for select
using (organization_id = public.current_organization_id() and public.is_financier_owner());

-- Permanent deletion is owner-only. Payments must be deleted first because the
-- schema deliberately restricts direct account deletion when payment history exists.
-- The customer record is intentionally retained in case it is used by another account.
create or replace function public.delete_finance_account(account_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare account_snapshot jsonb; payment_count integer;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can delete accounts'; end if;

  select to_jsonb(a) into account_snapshot from public.finance_accounts a
  where a.id = account_id and a.organization_id = public.current_organization_id();
  if account_snapshot is null then raise exception 'Finance account not found'; end if;

  select count(*) into payment_count from public.payments
  where finance_account_id = account_id and organization_id = public.current_organization_id();
  perform public.write_finance_audit(account_id, 'account_deleted',
    jsonb_build_object('account', account_snapshot, 'deleted_payment_count', payment_count));

  delete from public.payments
  where finance_account_id = account_id and organization_id = public.current_organization_id();
  delete from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id();
end;
$$;

grant execute on function public.delete_finance_account(uuid) to authenticated;
