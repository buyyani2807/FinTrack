# FinTrack: production setup

This app is still a local prototype. Do not enter real Aadhaar, PAN, or production payment data until this setup is complete.

## 1. Create the secure data layer

1. Create a Supabase project in the India region if available for your account.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. Then run `supabase/002_finance_operations.sql`.
4. Then run `supabase/003_account_management.sql`, `supabase/004_account_type_switch.sql`, and `supabase/005_customer_portal.sql`.
5. Enable email/password sign-in and invite the first financier account.
6. Copy `.env.example` to `.env` and fill in the public project URL and anon key.

If you already ran the schema before the `provision_financier` function was added, run the updated `supabase/schema.sql` again. The statements are safe to re-run except for the initial table creations; in that case run only the final `provision_financier` block.

## 2. Security rules

- Each financier is one `organization`.
- Every customer, account, and payment belongs to one organization.
- Row Level Security prevents one financier from reading another financier's records.
- Aadhaar and PAN columns are reserved for encrypted values only. Encryption must run in a server-side function; never store raw KYC values in browser storage.
- Customer portal access is enabled per account by the financier, using a portal ID and unique numeric PIN. Do not send the PIN in a public message.

## 3. Before accepting paid customers

- Implement Supabase Auth in the frontend.
- Move all reads/writes from `localStorage` to the database.
- Add server-side KYC encryption and audit records for payment edits.
- Add regular backup, support contact, privacy policy, and terms.
- Obtain legal advice for your lending model and data obligations.
