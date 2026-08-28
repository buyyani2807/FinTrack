# FinTrack operations runbook

Use this checklist after deploying to Vercel + Supabase and before onboarding real customer data.

## Monitoring

1. **Uptime** — Add a free monitor (Better Stack, UptimeRobot, or Vercel Analytics) on your production URL and `/api/auth/session`.
2. **Errors** — Optional: set `VITE_SENTRY_DSN` and add `@sentry/react` when you are ready for client error tracking. Until then, watch the Vercel function logs and Supabase logs daily during pilot.
3. **Supabase dashboard** — Review Auth signups, API 4xx/5xx rates, and database CPU weekly.

## Backups

1. Supabase Pro includes daily backups; verify **Database → Backups** in the project dashboard.
2. Before major migrations, run **Database → Backups → Create backup** manually.
3. Export a monthly CSV of active finance accounts and chit schemes as an operator backup (`Reports` in the app).

### Restore drill (do once on staging)

1. Create a staging Supabase project.
2. Restore a backup snapshot into staging (Supabase support/docs for your plan).
3. Point a staging Vercel preview at staging env vars and sign in.
4. Confirm one finance account and one chit scheme load correctly.

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
