-- View-only finance partners may read Cashbook (same org as owner).
-- Writes stay owner-only via existing RPCs (is_financier_owner) and write policies.
-- Paste after 124. Safe to re-run. Requires can_finance_read() from 123.

-- ledger_accounts
drop policy if exists ledger_accounts_owner on public.ledger_accounts;
drop policy if exists ledger_accounts_owner_write on public.ledger_accounts;
drop policy if exists ledger_accounts_finance_read on public.ledger_accounts;
create policy ledger_accounts_finance_read on public.ledger_accounts
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_finance_read());
create policy ledger_accounts_owner_write on public.ledger_accounts
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());

-- cashbook_entries
drop policy if exists cashbook_entries_owner on public.cashbook_entries;
drop policy if exists cashbook_entries_owner_write on public.cashbook_entries;
drop policy if exists cashbook_entries_finance_read on public.cashbook_entries;
create policy cashbook_entries_finance_read on public.cashbook_entries
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_finance_read());
create policy cashbook_entries_owner_write on public.cashbook_entries
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());

-- account_transfers
drop policy if exists account_transfers_owner on public.account_transfers;
drop policy if exists account_transfers_owner_write on public.account_transfers;
drop policy if exists account_transfers_finance_read on public.account_transfers;
create policy account_transfers_finance_read on public.account_transfers
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_finance_read());
create policy account_transfers_owner_write on public.account_transfers
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());

-- day_closings
drop policy if exists day_closings_owner on public.day_closings;
drop policy if exists day_closings_owner_write on public.day_closings;
drop policy if exists day_closings_finance_read on public.day_closings;
create policy day_closings_finance_read on public.day_closings
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_finance_read());
create policy day_closings_owner_write on public.day_closings
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_financier_owner())
  with check (organization_id = public.current_organization_id() and public.is_financier_owner());
