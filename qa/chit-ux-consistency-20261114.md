# Chit Fund UI/UX consistency — 14 Nov 2026

Scope: owner-side Chit Fund (scheme list, scheme pages, member pages, forms and dialogs) for Auction, Fixed and Fixed Predefined Bid. The member portal, other modules, the database, APIs and every calculation are untouched.

## 1. Comparison before the change

Inspected on staging (`E2E_CHITUX_20261114` test business, one active scheme of each type, month 1 lifted) and in code.

| Scheme type | Navigation | Member workflow | Payment workflow | Bid / lift workflow | Reports | Inconsistencies |
| --- | --- | --- | --- | --- | --- | --- |
| Auction | Overview · Members · Monthly Bids · Payments · Dividends · Live Bidding | Members table: Ticket, Member, Phone, Lift (Yes/No), Portal. Member page metrics: Lift month, Lift amount, Discount bid; "Lift history" table | Payments tab defaults to the latest recorded month; columns include Late fee and Reference, no Mode, no Receipt | Header: Start live bidding. "Lift Chit" only in Monthly Bids tab; dialog has no month in the title, no Cancel, no calculated values; only recorded months listed | Landing → Reports only (month statement, P&L) | Overview repeats the lift amount twice ("Latest lift" and "Lift amount"); no members / duration / collections; AI health card only here |
| Fixed | Overview · Members · Schedule · Payments | Members table: no Phone; Lift month, Lift amount, Monthly payment, Remaining, Payment status. "Lift Chit" button on every unlifted member row that does not preselect the member. Member page: "Lift details" metrics | Payments tab defaults to the next *pending lift* month (Month 2 while Month 1 is overdue); no Late fee, Reference, Mode or Receipt columns | No header action; "Lift Chit" per pending schedule row | Landing → Reports only | "Chit type" shown as a metric although it is in the subtitle; card "Current month / Current lift" means the *next* lift (Auction means the *last* one) |
| Fixed Predefined Bid | Overview · Members · Schedule · Payments | Members table: Title Case headers, no Phone; EMI, Bid Amount, Lift Amount. Member page: "Lift details" | Defaults to the next pending month; has Mode and Receipt but no Reference | No header action; Edit + Lift Chit per pending row; Edit dialog has no Cancel | Landing → Reports only | Card shows "Monthly installment" = chit value ÷ members (not what members pay — the EMI); extra "Lift amount" row only on this card; Edit not offered for drafts |

Shared already (kept): page frame component, payment form fields, delete/reversal dialog, member page, member standing, portal access, scheme delete.

Landing page: KPI "Enrolled members" and the AI insights card showed 0 / ₹0 while data was still loading. Payment status badges were lowercase text. Header "Add member" duplicated the Members tab button.

### Intentional differences (business rules — kept)

- Auction lifts come from a bid (manual entry or live auction); Fixed lifts follow a fixed amount + increment; Predefined lifts follow a generated EMI / COMM / auction / bid schedule.
- Only Auction has dividends and live bidding. Live bidding: highest discount bid wins, lift amount = chit value − bid (verified in `chit_end_live_auction` / migration 051).
- Fixed contribution rises after a member lifts; Predefined EMI changes per month.
- Predefined pending months can be edited; Fixed and Auction months cannot.
- Auction manual lift has no lift-method (cash/UPI) choice — the RPC has no such parameter.

## 2. Common model implemented

- **Navigation:** Chit Fund → Scheme → Section → Member. Every scheme and member page has Back plus a breadcrumb (breadcrumb hidden ≤ 680 px). Tabs, same order for all: Overview · Members · lifts tab (Auction "Bids & lifts", others "Lift schedule") · Payments · Reports. Auction adds Live bidding next to its lifts and Dividends after Payments. Tab ids in the URL are unchanged, so existing links, refresh and browser Back still work.
- **Header actions, one rule:** draft with free tickets → "+ Add member"; active → "Lift Chit — Month N" (the next month waiting); then type extras (Auction "Live bidding"); then "Delete scheme".
- **Overview:** Scheme terms (chit value, installment, members, duration, commission) · Lift progress (months lifted, latest lift with member, next lift month, plus the scheduled amount for Fixed / Predefined) · Collections to date (due, collected, past-due outstanding, rate) · the type's own figures under a labelled heading (Auction result — Month N; Fixed lift terms; Scheduled bid — Month N) · Scheme health.
- **Members:** same columns for all — Ticket, Member, Phone, Lift month, Lift amount, type extras, Outstanding (past due only), Portal, actions. Uses enrollment ids, never names.
- **Payments:** same columns for all — Member, Ticket, Due date, Paid on, Expected, Paid, Balance, (Late fee when any), Mode, Reference, Status, Receipt, Record / Edit / Delete. Month totals in the heading. Opens on the latest month whose due date has arrived.
- **Lifts tables:** every month listed with status (Lifted / Next / Pending) and Lift Chit on pending months, for all three types.
- **Reports tab** in every scheme: month statement figures + PDF download.
- **Forms:** Scheme details (same fields, same order) → the type's terms → Charges; calculated values shown read-only with a "Calculated" tag; Cancel + primary; duplicate submit blocked while saving.
- **Dialogs:** every data-entry dialog has Cancel next to the primary action (plus ✕). Payment dialog shows scheme, member, month, due date, expected, previously paid, outstanding and recorded by; Cash + UPI shows the running split total. Auction lift dialog shows "Lift Chit — Month N" and the calculated discount, commission, distributable and dividend preview (same formula as the server; saved values come from the server).
- **States:** toasts for success / error on scheme pages (same as landing); "…" instead of 0 while member counts and lifts load; insights card shows a loading line instead of zeros.
- **Cards:** one layout — installment (type label), duration, members, months lifted, Latest lift (month · amount), Lift member, Next lift.

## 3. Files changed

New: `src/features/chitFund/model/chitSchemeView.js`, `src/features/chitFund/components/ChitSchemeSections.jsx`, `tests/chitFund.schemeView.test.js`.

Changed: `ChitFundPage.jsx`; `components/` ChitAdminControls, ChitInsightsBrief, ChitMemberManagement, ChitMemberPage, ChitMemberParts, ChitPaymentForm, ChitSchemeChrome, ChitSchemeDashboard, ChitSchemeForms, ChitUi; `auction/` AuctionChitSchemeDetails, AuctionModals; `fixed/` FixedChitSchemeDetails, FixedChitModals; `predefined/` PredefinedBidSchemeDetails, PredefinedChitModals; `model/chitSchemeChrome.js` (tabs), `model/chitFormat.js` (import extension only); `src/styles/finebank.css` (Chit block appended).

Not changed: calculations, live bidding, every save / delete call, repository, SQL, other modules.

## 4. Tests

- `npm test`: 657 tests, 650 pass, 5 fail, 2 skipped. The 5 failures are the same pre-existing ones (Accounts setup ×2, item CSV import, party statement PDF, finance-partner workspace access). New: `tests/chitFund.schemeView.test.js` (10 tests).
- `npx eslint src/features/chitFund`: 8 errors, 2 warnings — identical to `origin/staging` (none in changed lines).
- `npm run build`: passes.
- Server-render check of every shared section, form, card and member page with sample data for all three types: no runtime errors.

## 5. Remaining gaps / needs approval

- Predefined Bid drafts cannot be edited (no update RPC; `submitScheme` would call create). Needs a new RPC — approval required.
- Auction manual "Lift Chit" cannot record cash / UPI lift method (RPC parameter missing) — approval required.
- "Monthly commitments" KPI still sums `installment_amount`, which for Predefined is chit value ÷ members, not the EMI.
