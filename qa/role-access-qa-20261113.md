# Role and company-isolation QA — 13 Nov 2026

Environment: https://staging-fintrack.vercel.app, Supabase project `gjqztrpgpsrfvlokmueb`, organization "Sudheer Finance" (`3a57ddd9-…`). Built-in browser, desktop. Code on staging is `e31c9a1` (main = staging = origin).

## Scope and method

Test data, all prefixed `E2E_TEST_20261113`:

| Record | ID / login |
| --- | --- |
| Accounts company A | `fd5a2ea6-2e07-4394-b53a-2d8ab90fc92b` (1 party, 2 journals posted by accountant and cashier during the test) |
| Accounts company B | `07aab4c2-12c2-418c-8a6c-65f94c08d47e` (1 party, 1 journal ₹1,000) |
| Accountant, viewer, cashier | `e2e.test.20261113.{accountant,viewer,cashier}@example.com`, company A only |
| Sleeping partner | `e2e.test.20261113.partner@example.com` |
| Finance collection agent | `AG-17BC7997`, assigned to the daily loan below |
| Accounts collection agent | `AG-67908751`, company A |
| Daily loan + customer portal | account `87a0f588-…`, portal `FT-80A3D301` (₹1,000 to collect, ₹900 paid out in cash) |
| Chit scheme + member portal | scheme `df613d17-…`, enrollment `409d81bd-…`, portal `CF-DF0B1228` |
| Created by agents during the test (defect P1-1) | companies `E2E_TEST_20261113_agentFinance_company`, `E2E_TEST_20261113_agentAccounts_company` |

Each role signed in through the real endpoints (`/auth/v1/token`, `/api/auth/agent-login`, `customer_portal_login`, `chit_customer_portal_login`). Then:

1. API reads: row counts on 25 tables with the role's own token, with `x-acc-company-id` set to A, to B, and with an explicit `company_id=eq.B` filter.
2. API writes: 15 write / privilege-escalation attempts per role (post in A and B, cross-company account ids, party in B, GST, period lock, create company, new loan, payment on an unassigned loan, cashbook entry, portal enable, `organizations.subscription_status`, own `profiles.role`, self-grant company access and Accounts role).
3. Owner-only server routes: `/api/accounts/team-user`, `/api/agents`, `/api/finance/partners`, `/api/workspace/backups`.
4. Anonymous reads with only the anon key.
5. UI: signed in as each role, read the navigation, then tried every owner route.

Fixes for part 1 (`fe24657`) are confirmed live: the deployed Cashbook bundle contains the "Brought forward" row and the payroll pay-date input has `max`.

## Defects

### P1-1 — Collection agents pass owner-only Accounts checks

- Reproduced with both agents: `acc_create_company` returned 200 and created two companies in the owner's organization (`created_by` = the agent). As the finance agent, `acc_set_integration(false)` also returned 204 (integration was already off; it stayed off).
- Cause: `accounts_access_role()` returns NULL for a user with no Accounts role. `can_accounts_admin()` is `NULL = 'owner'` → NULL, and `acc_require_admin()` does `if not NULL then raise`, which never raises. `can_accounts_write()` has the same flaw.
- Live check: `accounts_access_role` → null, `can_accounts_admin` → null, `can_accounts_write` → null for both agents.
- Company-scoped RPCs still refused agents ("Choose an Accounts company"), so no books were changed in A or B.
- Fix: `supabase/141_role_guards_and_pin_lockout.sql` wraps the three checks in `coalesce(…, false)`.
- Blocks launch: yes.

### P1-2 — PIN lockout never triggers (customer, chit member, agent)

- Seven wrong PINs on `FT-80A3D301`, six on `CF-DF0B1228`, six on `AG-17BC7997`; every reply was "Invalid … PIN", then the correct PIN signed in.
- Cause: each login function increments `failed_attempts` and then `raise exception`, which rolls back the increment. The customer and chit RPCs are granted to `anon`, so a 6-digit PIN can be guessed without signing in.
- Fix: migration 141 returns `{ error }` (customer, chit) or `null` (agent) after counting the failure. `src/lib/portalResult.js` turns `{ error }` back into a thrown error in the sign-in screen. Deploy the client before the migration.
- Blocks launch: yes.

### P2-1 — Accountant and cashier can switch accounting integration

- Accountant `acc_set_integration(false)` → 204. Setup shows "Turn integration on" to the accountant.
- Cause: `acc_set_integration` uses `acc_require_owner()`, which is the write check (owner, accountant, cashier), not the admin check.
- Fix: migration 141 uses `acc_require_admin()`. The button should also be hidden for non-owners (not changed).

### P2-2 — Cashier is Counter-only in the UI but can post any journal through the API

- The UI keeps the cashier on `/accounting/counter`; every other Accounts route redirects there.
- API: cashier `acc_post_voucher` (journal, Cash Dr / Capital Cr, ₹1) in company A → 200, posted. Cashier can also read the full chart of accounts and the audit log of A.
- Not fixed. Needs a rule for which voucher types a cashier may post (Counter sales and returns only), enforced in `acc_post_voucher`.

### P2-3 — Every signed-in role can read every staff profile in the organization

- Accountant, viewer, cashier, partner and both agents each read all 14 `profiles` rows: name, role, phone, email, collection scope.
- An agent or a company-A cashier can list the owner's and other CAs' emails and phone numbers.
- Not fixed. Narrow the `profiles` select policy to the user's own row, plus owner, plus what the agent route screen needs.

### P3-1 — Org-level audit rows visible to company-scoped users

Viewer / accountant / cashier on company A read 13 `acc_audit_log` rows with `company_id` NULL (team invites with invitee emails, integration toggles). Filtering to `company_id = A` returns only A's rows.

### P3-2 — Every role can read the organization row

All roles read `organizations` including `subscription_customer_id`, `einvoice_settings`, WhatsApp templates and reminder settings. No write succeeded (`PATCH subscription_status` changed 0 rows for every role).

### P3-3 — Sleeping partner scope differs between screens, migrations and data

- Login screen copy: partner "sees Daily Finance, Monthly Finance, and Cashbook".
- Migration 140 and the app: partner also sees Accounts for all 20 companies (read-only, by design) and a Chit Fund menu.
- Data: partner reads 0 chit schemes, members and installments (owner has 6 / 25 / 40). Migration 140 only adds a partner policy for `chit_audit_log`.
- Decide the intended scope, then align copy and policies.

### P3-4 — Write buttons shown to read-only roles

Viewer and partner see "+ Account" and "+ Add Party" in Setup; partner sees "Record sale", "Add expense" on Accounts overview and an enabled "Collect" on the dashboard. The server refused every one of these writes.

### P3-5 — Smaller UI issues

- Viewer lands on the POS Counter after sign-in.
- Agent dashboard labels the paid-out amount (₹900) as "Amount financed"; ₹1,000 was financed.
- Customer portal shows the internal account UUID as "Your finance ID" instead of the portal ID.
- Sign-out leaves earlier users' `ft-acc-access-role:*`, company and Counter-hold keys in local storage on a shared device.

## What passed

| Check | Result |
| --- | --- |
| Accountant / viewer / cashier reading company B through the API | 0 rows on every Accounts table, with B in the header and with an explicit B filter |
| Accountant / cashier posting with B's account ids under A | Refused: "Account does not belong to this company" |
| Any non-owner role posting in B | Refused |
| Viewer and partner posting anywhere | Refused |
| GST settings, period lock, create company (accountant, viewer, cashier, partner) | Refused |
| Loans, payments on unassigned loans, cashbook entries, customer portal (all non-owner roles) | Refused |
| Self-escalation: own `profiles.role`, `acc_user_roles`, `acc_user_company_access`, `organizations.subscription_status` | Refused or 0 rows changed |
| Owner-only server routes (team-user, agents, partners, backups) | 403 for every non-owner role |
| Anonymous reads | 0 rows on every table; `agent_portal_credentials` 401 |
| Finance agent | Sees only its one assigned customer (UI and API) |
| Accountant / viewer / cashier finance and chit data | 0 rows |
| Customer portal | Shows only its own loan |
| Chit member portal | Shows only its own ticket and scheme |
| Non-owner UI routes | Accountant and viewer redirected into Accounts; cashier redirected to Counter; agent redirected to its dashboard |

## Not covered

- A second organization (the owner chose two companies in one org). Cross-organization reads were not tried.
- Accounts collection agent UI, route collection by an agent, live chit bid by the member.
- Mobile and Safari.

## Fixes delivered with this report

- `supabase/141_role_guards_and_pin_lockout.sql` — P1-1, P1-2, P2-1.
- `src/lib/portalResult.js`, `src/lib/financeRepository.js` — client side of P1-2.
- `tests/roleGuardsPinLockout.test.js` — 4 tests.
- Cashbook negative-balance explanation (part 1): `cashbookModel.explainNegativeBalances`, `NegativeBalanceNotice.jsx`, 2 tests in `tests/cashbook.test.js`.

`npm test`: 610 pass, 5 fail, 2 skipped. The same 5 fail on `e31c9a1` without these changes (AI assistants ×2, item CSV import, party statement PDF, finance-partner workspace access). `npm run build` passes.

## Re-test after deploy

1. As the finance agent: `acc_create_company` and `acc_set_integration` must be refused.
2. As the accountant: `acc_set_integration` must be refused.
3. Five wrong PINs on `FT-80A3D301`, `CF-DF0B1228` and `AG-17BC7997` must lock for 15 minutes; the sixth try with the right PIN must say "Too many attempts".

## Re-test after deploy — 13 Nov 2026, afternoon

Staging bundle `index-B6jEmrQt.js` contains the portal `{ error }` handling; `CashbookRoute-CsTUcDLV.js` contains the negative-balance notice. Migration 141 is applied: both agents now get `false` (was NULL) from `can_accounts_admin`, `can_accounts_write` and `can_accounts_read`.

| Defect | Result |
| --- | --- |
| P1-1 Agents pass owner-only checks | **Fixed.** Both agents: `acc_create_company`, `acc_set_integration`, GST, period lock all refused ("Only the business owner…"). Posting refused. |
| P1-2 PIN lockout | **Fixed.** Customer `FT-80A3D301`: locked on the 5th wrong PIN; right PIN then refused with "Too many attempts". Agent `AG-67908751`: 5 × 401, then 403 "Too many attempts", right PIN refused. Chit member `CF-DF0B1228`: locked on the 4th wrong PIN in this run (one failure was already counted before the run started), right PIN refused. Sign-in screen shows "Invalid portal ID or PIN" and stays on the form for customer and chit member. |
| P2-1 Accountant / cashier switch integration | **Fixed.** Refused for accountant, cashier, viewer, partner and both agents. Integration stayed off. |
| P2-2 Cashier posts any journal | Open, as expected (not in 141). Cashier journal in A → 200. |
| P2-3 All roles read all staff profiles | Open, as expected. Still 14 rows for every role. |

Regression: accountant still posts in company A; every other write in the matrix is refused as before; company B is still invisible to the A-scoped roles; the finance agent still sees only its 1 assigned loan; partner reads are unchanged.

New observations:

- Wrong-PIN replies from `customer_portal_login` and `chit_customer_portal_login` are now HTTP 200 with `{ error }` (the lock check itself still returns 400). Monitoring that counts 4xx will no longer see failed portal logins. Low.
- Anyone who knows a portal ID can now lock that customer or member out for 15 minutes by entering 5 wrong PINs. This is the usual trade-off of a lockout; consider a longer PIN or an owner "unlock" button if it becomes a support issue.
- A chit-member tab left open for about 50 minutes across a deploy stayed on "Loading your chit dashboard" until it was reloaded. Not reproduced; possibly a lazy chunk from the previous build that no longer exists.

The test portals `FT-80A3D301`, `CF-DF0B1228` and agent `AG-67908751` were locked for 15 minutes by this run.

## Fix for P2-2 and P2-3 — migration 142

Owner decision: a cashier only uses the Counter; staff details are seen only by the owner.

`supabase/142_cashier_counter_only_and_owner_only_staff.sql`:

- Cashier may post only `sale` / `credit_note` vouchers with `source_type = 'pos_counter'`, void Counter bills and close the till day. Every other Accounts write is refused by triggers, which also fire inside the RPCs.
- Cashier can no longer read audit log, payroll, bank statements, trade documents, filings, recurring templates, period locks, team invites, routes, attachments or e-invoice payloads. The cashier still reads vouchers, parties, items, stock and chart of accounts because the Counter uses them (stock check, prices, khata credit limit).
- `profiles`: the owner reads every staff row; everyone else reads only their own. "Collected by" names on payments are blank for non-owners unless they collected the payment.

Checked on a local Postgres (PGlite) with stand-in tables and roles. `tests/cashierCounterOnly.test.js` covers the rules.

### 142 regression and fix — migration 143

142 allowed `voucher_type in ('sale', 'credit_note')`, but the `acc_vouchers` check constraint names a sale `sales`. On staging, every Counter sale by a cashier was refused after 142 ("A cashier can only post Counter sales and returns"); returns still worked. The first local check missed it because the stand-in table had no voucher-type constraint. `supabase/143_fix_cashier_counter_sales_type.sql` replaces the trigger function with `('sales', 'credit_note')`. The local check now uses the real constraint (28 of 28 pass), and `tests/cashierCounterOnly.test.js` asserts every allowed type exists in that constraint.

### Re-test on staging after 142 + 143

| Check | Result |
| --- | --- |
| Cashier posts a Counter sale (`sales`, `pos_counter`) | 200, posted |
| Cashier posts a Counter return (`credit_note`, `pos_counter`) | 200, posted |
| Cashier voids a Counter sale / return | 204, status `cancelled` |
| Cashier closes the till day | 200 |
| Cashier posts a journal, a non-Counter sale, a receipt tagged `pos_counter` | Refused |
| Cashier voids a non-Counter voucher | Refused: "A cashier can only change Counter bills" |
| Cashier creates a party | Refused: "A cashier can only use the Counter" |
| Cashier reads audit log, payroll runs and profiles, bank statements, recurring templates, period locks | 0 rows each |
| Cashier reads vouchers, parties, chart of accounts (Counter needs them) | Visible |
| Cashier signs in through the app | Lands on Counter, no errors |
| `profiles` for accountant, viewer, cashier, partner, both agents | 1 row each (own) |
| Accountant posts a journal and a non-Counter sale, reads the audit log | Allowed, as before |
| Owner reads all staff profiles | Not checked on staging (no owner session in the test browser) |
