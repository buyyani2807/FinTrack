# FinTrack operations runbook

Use this checklist after deploying to Vercel + Supabase and before onboarding real customer data.

## Monitoring

1. **Uptime** — Add a free monitor (Better Stack, UptimeRobot, or Vercel Analytics) on your production URL and `/api/auth/session`.
2. **Errors** — Set `VITE_SENTRY_DSN` on Vercel (Preview/staging and Production) and redeploy. `@sentry/react` is installed and loads only when the DSN is set. Events are scrubbed of phone numbers, emails, PAN, Aadhaar, tokens and URL query strings, and carry only the user id and role. Serverless (`/api/*`) errors still go to Vercel function logs.
3. **Supabase dashboard** — Review Auth signups, API 4xx/5xx rates, and database CPU weekly.

## Backups

1. Supabase Pro includes daily backups; verify **Database → Backups** in the project dashboard.
2. Before major migrations, run **Database → Backups → Create backup** manually.
3. **Customer workspace backups** (Settings → Backup & restore):
   - Apply migration `126_workspace_backups.sql`.
   - Create a private Storage bucket `workspace-backups` if the API cannot auto-create it.
   - Pro: raise Storage **Global file size limit** (e.g. 100–500 MB) under **Storage → Settings**, then set the `workspace-backups` bucket limit to match.
   - Free (staging): hard max is **50 MB**. Backups are gzip-compressed and automatically split into ≤40 MB parts when needed.
   - In the bucket settings, do not leave a tiny custom file-size restriction below 50 MB.
   - Set Vercel env `CRON_SECRET` (random string). Protects scheduled backup calls.
   - Schedule nightly runs with **Supabase Cron** (`pg_cron` + `pg_net`) at **00:00 IST** (`30 18 * * *` UTC) calling `/api/cron/workspace-backups` (rewrites to `/api/workspace/backups`) with `Authorization: Bearer $CRON_SECRET`.
   - Hobby is capped at **12 serverless functions**; backup cron is merged into the owner backups API (do not add a separate `api/cron` file).
   - Owners can back up / restore any modules present (Finance, Cashbook, Chit, Accounts). Restore creates a safety checkpoint first.

### Restore drill (do once on staging)

1. Create a staging Supabase project.
2. Restore a backup snapshot into staging (Supabase support/docs for your plan).
3. Point a staging Vercel preview at staging env vars and sign in.
4. Confirm one finance account and one chit scheme load correctly.
5. In Settings → Backup & restore, create a backup, change a payment, restore, and confirm the payment returns.

## Incident response

| Severity | Example | Action |
|----------|---------|--------|
| P1 | Data breach suspicion, mass wrong payments | Disable affected org, rotate Supabase service role, preserve audit logs |
| P2 | Auth outage | Check Vercel env vars, Supabase Auth status, `/api/auth/*` logs |
| P3 | UI bug | Fix forward; use audit logs to reconcile payments if needed |

Publish a support email or WhatsApp for pilot financiers.

## Security configuration

| Setting | Where |
|---------|--------|
| Signup invite (server) | Supabase SQL: `alter database postgres set app.fintrack_signup_invite_code = 'your-code';` |
| Signup invite (client) | Vercel: optional `VITE_SIGNUP_INVITE_CODE` |
| Disable public signup | Vercel: `VITE_ALLOW_PUBLIC_SIGNUP=false` |
| Service role key | Vercel only — never in the browser |

## Pre-launch smoke test

```bash
npm test
npm run build
node scripts/prelaunch-smoke.mjs
```

Then manually verify: financier login, create finance account, record payment, open Chit Fund, run migration `036_prelaunch_hardening.sql` on Supabase, then `scripts/verify-migration-036.sql`.

CI runs on every push to `main`: unit tests, smoke checks, and Playwright E2E (`npm run test:ci` locally).
