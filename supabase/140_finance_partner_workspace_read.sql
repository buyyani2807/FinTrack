-- View-only partners inherit every unlocked module in the workspace (Finance, Cashbook, Chit, Accounts).
-- Writes stay owner-only. Apply after 125. Safe to re-run.

-- Accounts: partners read as viewers (same SELECT paths as Accounts-team viewers).
create or replace function public.accounts_access_role()
returns text language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  if public.is_financier_owner() then return 'owner'; end if;
  if public.is_finance_partner() then return 'viewer'; end if;
  select role into r from public.acc_user_roles
   where organization_id = public.current_organization_id() and user_id = auth.uid();
  return r;
end;
$$;

grant execute on function public.accounts_access_role() to authenticated;

-- Partners may open every company in the org (read-only via can_accounts_read / viewer role).
create or replace function public.acc_can_access_company(input_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when input_company_id is null then false
    when public.is_financier_owner() then exists (
      select 1 from public.acc_companies c
      where c.id = input_company_id
        and c.organization_id = public.current_organization_id()
    )
    when public.is_finance_partner() then exists (
      select 1 from public.acc_companies c
      where c.id = input_company_id
        and c.organization_id = public.current_organization_id()
    )
    when public.is_accounts_team_user() then exists (
      select 1 from public.acc_user_company_access a
      where a.user_id = auth.uid()
        and a.organization_id = public.current_organization_id()
        and a.company_id = input_company_id
    )
    else false
  end;
$$;

grant execute on function public.acc_can_access_company(uuid) to authenticated;

-- Chit audit was owner-SELECT only; partners need the same read as other chit tables.
drop policy if exists chit_owner_read_chit_audit_log on public.chit_audit_log;
drop policy if exists chit_partner_read_chit_audit_log on public.chit_audit_log;
create policy chit_partner_read_chit_audit_log on public.chit_audit_log for select to authenticated
using (
  organization_id = public.current_organization_id()
  and (public.chit_is_owner() or public.is_finance_partner())
);
