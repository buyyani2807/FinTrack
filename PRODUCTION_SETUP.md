# FinTrack: production setup

Complete the steps below before entering real Aadhaar, PAN, or production payment data. See also `MIGRATION_CHECKLIST.md`, `OPERATIONS.md`, and `DEPLOYMENT.md`.

## 1. Create the secure data layer

1. Create a Supabase project in the India region if available for your account.
2. Run every migration in `MIGRATION_CHECKLIST.md` order, ending with `036_prelaunch_hardening.sql`.
3. Enable email/password sign-in and invite the first financier account (or enable pilot signup env vars).
4. Copy `.env.example` to `.env` and fill in the public project URL and anon key.
5. On Vercel, add the same `VITE_` variables plus `SUPABASE_SERVICE_ROLE_KEY` for `/api/agents` and `/api/auth/*`.

Optional server-side signup invite:

```sql
alter database postgres set app.fintrack_signup_invite_code = 'your-pilot-invite';
```

## 2. Security rules

- Each financier is one `organization`.
- Every customer, account, and payment belongs to one organization.
- Row Level Security prevents one financier from reading another financier's records.
- Aadhaar and PAN columns are reserved for encrypted values only. Encryption must run in a server-side function; never store raw KYC values in browser storage.
- Customer portal access is enabled per account by the financier, using a portal ID and unique numeric PIN. Do not send the PIN in a public message.

## 3. Before accepting paid customers

- Run `npm test` and `npm run smoke` after each deploy.
- Configure uptime monitoring and document backup restore (`OPERATIONS.md`).
- To hide new business signup, set `VITE_ALLOW_PUBLIC_SIGNUP=false` on Vercel.
- Add a support contact on your deployment.
- Obtain legal advice for your lending model and data obligations.
