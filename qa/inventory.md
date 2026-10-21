# Application inventory

Sources: `src/app/AppRoutes.jsx`, module navigation, and the signed-in staging UI. Status is what was observed, not what a roadmap claims.

## Stack

Vite, React, Supabase. Tests: `node --test` and Playwright. Login route `/login` leads to `/dashboard` when signed in. Public marketing routes exist (`/`, `/features`, `/pricing`, `/about`, and others). Unknown app paths redirect to `/dashboard`.

## Roles seen in code

Financier / owner, accountant, viewer, collection agent, customer portal, chit member portal. This pass used only the financier session. Other roles are **not verified**.

## Routes opened on staging in the 20–21 Oct passes

| Route | Status |
| --- | --- |
| `/dashboard` | Implemented. Loaded. Three daily collections pending. None recorded. |
| `/daily-finance/*` | Implemented. Overview, customers, today's collections, reports opened. Empty create is refused. No customer was saved. |
| `/monthly-finance/*` | Implemented. Overview and reports opened. No account was saved. |
| `/chit-fund/schemes`, members, reports | Implemented. One New scheme button. No scheme, bid, or lift was run. |
| `/cashbook/cashbook` | Implemented. Balances load. Today movement is ₹0. Brought forward is absent on staging. |
| `/accounting/*` on Buyyani's Enterprises | Implemented. Overview, trial balance, P&L, balance sheet, cash flow, receivables, payables, payroll, New menu. |
| `/collection-staff` | Implemented. Page opened. |
| `/route-collections` | Implemented. This user has no route assigned. |
| `/settings/company` | Implemented. Page opened. |
| `/subscribe` | Implemented. Plan page opened. Enforcement was not tried. |

## Accounts reports present in the UI

Day book, trial balance, accounting P&L, balance sheet, cash flow, receivables, payables, sales, purchases, GST, ledger, item sales, item purchases, stock movement. Export buttons CSV, Excel, and PDF are on the trial balance. File contents were not opened this pass.

## Integrations

| Integration | Status |
| --- | --- |
| Cashbook to Accounts | Setting exists in code. Not proven on Buyyani. The two cash totals differ, by design of the separate books. |
| Chit to Accounts | Not run. |
| Bank statement import | Ran earlier on company E2E-TEST-20261020, not on Buyyani. Matching was not completed. |
| Bill scan | Draft only, on the test company. Not on Buyyani. |
| WhatsApp | Not sent. |
| GST portal filing | Not implemented. Reports are in-app. |
| Payroll statutory engine | Not implemented. Deductions are amounts the owner enters. |

## Automated tests

- Unit: 519 cases collected, 517 passed, 2 skipped, 0 failed, this pass.
- Playwright: 38 tests across 6 spec files. Not re-run this pass.
