-- 145: View-only partners can read Chit Fund, as 140 intended.
-- Safe to re-run. Apply after 144. No client change is required.
--
-- 140 said partners "inherit every unlocked module", and the app shows them the
-- Chit Fund menu, but the only chit policy it added was for chit_audit_log.
-- Partners therefore saw an empty Chit Fund. This adds read-only (SELECT) policies
-- for partners on the chit tables the owner reads. Portal credentials and portal
-- sessions stay owner-only. Writes stay owner-only (chit writes go through RPCs
-- that require the owner).

do $$
declare t text;
begin
  foreach t in array array[
    'chit_schemes', 'chit_members', 'chit_enrollments', 'chit_cycles', 'chit_bids',
    'chit_installments', 'chit_payouts', 'chit_security_deposits', 'chit_report_configs',
    'chit_live_auctions', 'chit_live_auction_bids',
    'fixed_chit_lifts', 'fixed_chit_payments',
    'predefined_chit_payments', 'predefined_chit_schedule'
  ]
  loop
    if to_regclass('public.' || t) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = 'organization_id'
       ) then
      execute format('drop policy if exists %I on public.%I', 'chit_partner_read_' || t, t);
      execute format(
        'create policy %I on public.%I for select to authenticated
           using (organization_id = public.current_organization_id() and coalesce(public.is_finance_partner(), false))',
        'chit_partner_read_' || t, t);
    end if;
  end loop;
end;
$$;
