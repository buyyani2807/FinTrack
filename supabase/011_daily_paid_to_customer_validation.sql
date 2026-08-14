-- Daily Finance must record the actual positive amount paid to the customer.
-- This removes any possibility of creating a Daily account with a blank or zero payout.
alter table public.finance_accounts
  add constraint finance_accounts_daily_disbursed_positive
  check (kind <> 'daily' or disbursed_amount > 0) not valid;

-- Existing accounts are preserved. The constraint is enforced for every new or edited account.
