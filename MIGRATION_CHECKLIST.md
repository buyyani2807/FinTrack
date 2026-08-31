# Supabase migration checklist

Run these in the Supabase SQL Editor **in order**. Each file is idempotent where noted.

| # | File | Purpose |
|---|------|---------|
| — | `schema.sql` | Foundation tables, RLS, `provision_financier` |
| 002 | `002_finance_operations.sql` | Finance RPCs |
| 003 | `003_account_management.sql` | Update/delete accounts |
| 004 | `004_account_type_switch.sql` | Account type fix |
| 005 | `005_customer_portal.sql` | Customer portal |
| 006 | `006_secure_kyc.sql` | KYC encryption |
| 007 | `007_operations_roles_audit.sql` | Roles, audit, collection order |
| 008 | `008_closure_and_bankruptcy_rules.sql` | Closure rules |
| 009 | `009_collection_agents.sql` | Staff profiles |
| 010 | `010_collection_staff_directory.sql` | Staff email |
| 011 | `011_daily_paid_to_customer_validation.sql` | Daily validation |
| 012 | `012_payment_corrections.sql` | Payment edits |
| 013 | `013_production_security_and_deletion.sql` | Production RLS |
| 014 | `014_split_payments.sql` | Cash + UPI split |
| 015 | `015_financial_integrity_guards.sql` | Payment guards |
| 016 | `016_chit_fund_schema.sql` | Chit schema |
| 017 | `017_chit_fund_access.sql` | Chit RLS |
| 018 | `018_chit_scheme_edit.sql` | Draft edit |
| 019 | `019_chit_installment_corrections.sql` | Chit payment edits |
| 020 | `020_chit_scheme_full_edit.sql` | Full draft edit |
| 021 | `021_chit_payment_modes.sql` | Chit payment modes |
| 022 | `022_chit_monthly_bid_calculations.sql` | Bid snapshots |
| 023 | `023_chit_installment_notes.sql` | Installment notes |
| 024 | `024_chit_rpc_only_writes_and_kyc.sql` | RPC-only chit writes |
| 025 | `025_chit_live_auction.sql` | Live auction |
| 026 | `026_chit_customer_live_bidding.sql` | Customer bidding |
| 027 | `027_chit_live_bid_after_commission.sql` | Bid cap rules |
| 028 | `028_fixed_chit.sql` | Fixed chit |
| 029 | `029_fixed_predefined_bid_chit.sql` | Predefined bid chit |
| 030 | `030_chit_member_management.sql` | Member management |
| 031 | `031_all_member_chit_payment_schedules.sql` | All-member schedules |
| 032 | `032_chit_customer_dashboard_payments.sql` | Customer dashboard payments |
| 033 | `033_chit_customer_multi_scheme_login.sql` | Multi-scheme login |
| 034 | `034_chit_scheme_and_member_delete.sql` | Safe delete |
| 035 | `035_fix_fixed_chit_commission.sql` | Fixed chit commission |
| 036 | `036_prelaunch_hardening.sql` | **Pre-launch security hardening** |
| 037 | `037_fix_portal_id_random_bytes.sql` | Fix portal ID generation (`extensions.gen_random_bytes`) |
| 038 | `038_digital_receipts_and_reminders.sql` | Digital receipts, branding, WhatsApp templates, payment reminders |
| 039 | `039_upcoming_chit_payments_rpc.sql` | Upcoming chit payments RPC |
| 040 | `040_chit_enroll_active_scheme.sql` | Enroll members on active chit schemes |
| 041 | `041_accounts_cashbook.sql` | **Accounts / Cashbook** — ledger accounts, auto-sync from finance & chit payments |
| 042 | `042_accounts_cashbook_sync_fix.sql` | Fix sync backfill error (`record "fa" is not assigned yet`) |
| 043 | `043_accounts_delete_manual_entry.sql` | Delete manual cashbook entries (Salary, Rent, Capital, etc.) |
| 044 | `044_ft001_ft006_integrity.sql` | Chit Cash+UPI cashbook sync, owner-only chit SELECT, account-delete ledger cleanup, monthly disbursement |
| 045 | `045_ft008_ft014_integrity.sql` | Daily bankrupt capital loss, batch collection-staff assignment |
| 046a | `046a_ft021_list_duplicate_payment_days.sql` | Optional: list same-day finance payments (read-only) |
| 046b | `046b_ft021_keep_one_payment_per_day.sql` | **Do not run** — would delete pilot same-day backfill payments |
| 047a | `047a_ft022_ft023_integrity.sql` | **FT-022 / FT-023** — receipt numbers locked to current org; cashbook re-syncs when disbursed/principal is edited |
| 047 | `047_ft022_ft027_integrity.sql` | FT-022–027 together (includes 047a, plus chit Sync/lifts and reminder-log RLS) |
| 048 | `048_ft028_ft031_integrity.sql` | **FT-028 / FT-031** — monthly rate edits apply from today; inactive staff cannot SELECT assigned finance rows |
| 049 | `049_ft029_ft034_integrity.sql` | **FT-029 / FT-030 / FT-032** — monthly split must match total; collection cannot exceed remaining; edit cannot reuse another payment date |
| 050 | `050_disbursement_payout_mode.sql` | Daily / Monthly money-out can be Cash, UPI, or Cash+UPI (cashbook posts to the matching ledger) |

After running 041 (and 042 if Save & sync failed), open **More → Accounts**, set opening balances once, then tap **Sync from FinTrack** to backfill historical collections and disbursements. If Cashbook **Delete** does nothing, run 043. After 044, tap **Sync from FinTrack** again so monthly principal disbursements are posted. After 045, existing daily bankrupt `loss_amount` values are rewritten to disbursed − collected.

After 046, same-day duplicate finance payments are **kept** (pilot users entered existing accounts on one calendar day). Do **not** run 046b. The unique `(finance_account_id, paid_on)` index is deferred. The record-payment RPC still rejects a new second payment on the same date going forward.

After **047a** (or 047), receipt numbers cannot be minted for another organisation, and editing Paid to customer / principal updates the cashbook disbursement row.

After the full 047, also tap **Sync from FinTrack** in Accounts so historical chit collections and lift payouts post to cashbook.

After **048**, inactive collection agents cannot read assigned finance rows, and editing a monthly interest rate writes `rate_changes` so earlier months keep the previous rate. No extra Sync is required.

After **049**, finance payment RPCs reject a monthly split that does not equal the total, a collection above remaining daily/principal, and a payment-date change onto a day that already has a collection.

After **050**, creating or editing a Daily / Monthly account lets you choose **Cash**, **UPI**, or **Cash + UPI** for the amount paid to the customer (or principal financed). Existing accounts stay Cash. After running 050, tap **Sync from FinTrack** only if you edit an account’s payout mode; new accounts sync automatically.

After running 036, verify in Supabase SQL Editor:

```bash
# Paste and run: scripts/verify-migration-036.sql
```

Each query should return `ok = 1`. If any check fails, re-run `036_prelaunch_hardening.sql`.

After running 037, verify with `scripts/verify-migration-037.sql` (each row should show `ok = 1`).

## Verify RLS after migrations

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('customers', 'finance_accounts', 'payments', 'chit_schemes', 'customer_portal_credentials')
order by tablename;
```

All should show `rowsecurity = true`.

## Optional: server-side signup invite

```sql
alter database postgres set app.fintrack_signup_invite_code = 'your-secret-invite';
```

Remove or clear when opening public signup.
