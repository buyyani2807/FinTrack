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

After running 041 (and 042 if Save & sync failed), open **More → Accounts**, set opening balances once, then tap **Sync from FinTrack** to backfill historical collections and disbursements.

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
