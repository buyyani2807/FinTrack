# Vercel deploy checklist

Use this before and after every production deploy. Pair with `OPERATIONS.md`, `MIGRATION_CHECKLIST.md`, and `PRODUCTION_SETUP.md`.

## Pre-deploy (local)

```bash
npm test
npm run smoke
npm run test:e2e
node scripts/vercel-env-audit.mjs   # when .env is filled in locally
```

- [ ] All migrations through `036_prelaunch_hardening.sql` applied on Supabase
- [ ] `scripts/verify-migration-036.sql` — every check returns `ok = 1`
- [ ] No duplicate `provision_financier(text, text)` overload in Supabase
- [ ] Branch builds: `npm run build`

## Vercel environment variables

Set in **Project → Settings → Environment Variables**. Apply to **Production** at minimum; add **Preview** if you test PR deploys.

| Variable | Required | Environments | Notes |
|----------|----------|--------------|-------|
| `VITE_SUPABASE_URL` | Yes | Production, Preview, Development | Public Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Production, Preview, Development | Public anon key only |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Production, Preview | Server-only; powers `/api/auth/*` and `/api/agents` |
| `VITE_ALLOW_PUBLIC_SIGNUP` | No | Production | Omit or `true` = signup visible; `false` = hide Create business account |
| `VITE_SIGNUP_INVITE_CODE` | No | Production | Client-side invite; pair with Supabase DB setting below |
| `VITE_SENTRY_DSN` | No | Production | Optional; install `@sentry/react` before enabling |

**Never** add the service role key to a `VITE_` variable or commit it to git.

### Optional Supabase server invite

Run in Supabase SQL Editor when you want server-enforced signup codes:

```sql
alter database postgres set app.fintrack_signup_invite_code = 'your-pilot-invite';
```

Clear or remove when opening fully public signup.

## Post-deploy smoke (production URL)

1. **Login hub** — Financier, Agent, Customer, Chit customer tabs render
2. **Financier login** — sign in, land on dashboard (HttpOnly cookie via `/api/auth/login`)
3. **Session refresh** — reload page; still signed in (`/api/auth/session`)
4. **Finance flow** — open a customer, record a payment, edit payment note (modal, not browser prompt)
5. **Chit Fund** — open module, open a scheme, confirm delete/activate use in-app modals
6. **Legal** — Privacy and Terms links work from login
7. **Logout** — clears session (`/api/auth/logout`)

## Existing daily-finance testers

After this deploy:

- **One re-login** required (auth moved to HttpOnly cookies)
- **Data unchanged** — accounts, payments, collection order preserved
- **UI** — edit payment / close account / chit deletes use modals instead of browser dialogs

Suggested message:

> FinTrack was updated. Please sign out and sign in once. Your customers and collections are unchanged. Edit payment and account actions now use in-app confirmation dialogs.

## Monitoring (first week)

- [ ] Uptime monitor on production `/` and `/api/auth/session`
- [ ] Vercel function logs — watch `/api/auth/*` for 4xx/5xx spikes
- [ ] Supabase dashboard — Auth, API errors, database CPU
- [ ] Support channel published (email or WhatsApp)

## Rollback

1. Vercel → Deployments → promote previous deployment
2. If a migration caused issues, restore Supabase backup (see `OPERATIONS.md`)
3. Notify testers if auth cookies changed again

## Quick audit command

```bash
node scripts/vercel-env-audit.mjs
```

Checks required keys in `.env` (without printing secrets) and runs unit tests.
