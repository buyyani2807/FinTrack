-- FT-018 is frontend-only (daily installment). Run this after 045 if you want the checklist complete.
-- FT-021 unique (finance_account_id, paid_on) is deferred.
-- Pilot users recorded several existing-account payments on one calendar day.
-- Those rows stay. Do not run 046b.

drop index if exists public.payments_account_paid_on_uidx;
