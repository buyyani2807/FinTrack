# FinTrack Staging E2E QA Report

**Date:** 2026-11-09  
**Environment:** https://staging-fintrack.vercel.app/  
**Tester:** Cursor browser QA agent  
**Session:** Existing authenticated Owner/Financier (Sudheer Finance workspace; Accounts company Buyyani's Enterprises)  
**Browser/device:** Cursor embedded Chromium/Electron · macOS · primary viewport ~648×803 (tablet/phone-ish); Collection Staff also viewed with wider sidebar layout  
**Test data prefix:** `E2E_TEST_20261109_`  
**Source code:** not modified during this run  

---

## Executive Summary

**Overall result:** Core owner workflows on staging are largely usable (navigation, Daily/Monthly account create, Counter charge, module store UI, Collection Staff list).  

**Launch readiness:** **READY ONLY AFTER P0/P1 FIXES**

This is **not** a claim that every PRD item was executed. Full matrix (every report/export/device/browser/agent-login/API IDOR) was **not** completed in this session. Findings below are evidence-based from what was actually exercised.

### Major strengths
- Owner session stable across Dashboard, Daily, Monthly, Accounts/Counter, Modules, Collection Staff
- Daily Finance create with distinct Amount financed (₹10,000) vs Paid to customer (₹9,000)
- Collection correctly blocked until tomorrow (`Starts tomorrow`)
- Counter cash tendered gate works; GST total ₹990 → ₹1,168.20; post-charge Print receipt CTA appears; cart clears
- Module store shows correct differentiated pricing (standard ₹587.64; Accounts+POS ₹705.64)

### Major risks
- Cashbook / dashboard show large **negative cash** figures (trust/integrity)
- Commercial payment unlock still stubbed (cannot verify paid entitlements end-to-end)
- Existing customer **second business org registration** still missing (known product gap)
- This workspace has **all modules Active** — locked-module UX could not be verified here
- Account create auto-opens WhatsApp confirmation (external side effect)

### Critical blockers for public paid launch
1. **P0** — Razorpay / module payment verify not production-ready (create-order stub / no live unlock path)
2. **P1** — Negative cash / bank balances need investigation before marketing “books you can trust”
3. **P1** — Second FinTrack business account for existing owners not implemented

---

## Test Coverage

| Area | Status |
| --- | --- |
| Staging URL + auth session | Verified |
| Global menu items present | Verified (Dashboard, Daily, Monthly, Chit, Cashbook, Accounts, Collection Staff, Settings, Modules, Ask, Logout) |
| Dashboard | Smoke passed |
| Daily Finance create + detail | Partial — create + schedule gate verified; payment edit/delete/close/bankrupt/P&L not run |
| Monthly Finance create | Partial — create verified; interest payment lifecycle not run |
| Chit Fund | Route load only (interrupted by navigation race); scheme lifecycle not exercised |
| Accounts overview | Smoke passed |
| POS Counter charge | Passed for 1 cash sale |
| Cashbook | Attempted; load interrupted by subsequent navigation — balances seen earlier on Dashboard |
| Inventory | Indirect via Counter stock line only |
| GST | Indirect via Counter GST on sale; no GST report deep dive |
| Reports / Trial Balance / BS | Not fully verified |
| Collection Staff (owner UI) | List smoke passed; agent login RBAC not tested |
| AI advisory | Present on Accounts overview; advisory-only copy observed; no mutation tested |
| Module locks after Finance-only purchase | **Unable to verify** (all modules Active on this org) |
| Agent login / unauthorized API | **Unable to verify safely** (no agent PIN used; no credential reset) |
| WhatsApp / SMS / card payments | Marked unsafe / external — WhatsApp auto-open observed |
| Mobile/tablet/desktop matrix | Partial (tablet-ish + one wider layout); Safari/Firefox/iOS not available |
| Cleanup of E2E records | Left in place for review (see Cleanup) |

---

## Results by Module

### Auth / company
- **Passed:** Session persists across routes; Owner nav visible; company selector Buyyani's Enterprises on Accounts
- **Failed / gap:** Second-org registration for existing email not available (`provision_financier` still one-workspace)
- **Unable:** Password reset, invalid login, session expiry, agent login (by design of this session)

### Daily Finance
- **Passed:** Create `E2E_TEST_20261109_Daily_Cust` / 9000000099; portal ID shown; status active; `Starts tomorrow` disabled; Days Completed 1 / Remaining 99
- **Passed:** Paid-to-customer stayed ₹9,000 with financed ₹10,000 (not forced equal)
- **Partial:** Today’s collections did not list new account as due (consistent with starts tomorrow)
- **Not run:** Record/edit/delete collection, close/reopen/bankrupt, reports exports, duplicate collection

### Monthly Finance
- **Passed:** Create `E2E_TEST_20261109_Monthly_Cust` / 9000000098; principal ₹50,000; rate 3%
- **Not run:** Interest payment ₹1,500 expected calc verification on collection UI, penalty, close/reopen

### Chit Fund
- **Partial / incomplete:** Navigate started; full scheme lifecycle not completed this run

### Accounts / POS
- **Passed:** Counter search Burma Paper; add line; cash tendered required; Charge ₹1,168.20 posted; bill empty after; Today · 1; Print receipt + Share post-charge bar
- **Passed:** Last-sale header chip not present (matches recent product decision)
- **Observation:** GST 18% on ₹990 → ₹1,168.20 correct
- **Unable safely:** Actual thermal print dialog completion / WhatsApp share send

### Modules / billing UI
- **Passed:** Pricing copy and Accounts+POS premium displayed
- **Passed:** All four products show Active
- **Unable:** Post-trial lock + Finance-only entitlement behavior on this account
- **Unable:** Pay & unlock live charge (provider stub)

### Collection Staff
- **Passed:** Page loads; create agent CTA; staff table
- **P2:** Multiple staff share mobile `9160710101`
- **P2:** Two active staff show **Agent ID: Not created**
- **Unable:** Agent login negative permissions

### AI
- **Passed:** Advisory panels and “advisory only” language on Accounts overview
- **P3:** Historical pay phrasing like “pays -3–4 days” is confusing
- **Unable:** Prove AI never writes books under all paths (spot check only)

---

## Bug Classification

### P0 — Critical blocker
| ID | Title | Evidence | Launch block? |
| --- | --- | --- | --- |
| P0-1 | Module payment / Razorpay unlock not live | Module store Pay disabled until selection; known stubbed API from product state | Yes for paid public launch |

### P1 — High
| ID | Title | Steps / evidence | Impact |
| --- | --- | --- | --- |
| P1-1 | Negative cash balances | Dashboard Cash on hand **₹-27,64,100**; Accounts company Bank **₹-78,900** | Undermines financial integrity trust |
| P1-2 | Existing customer cannot register another FinTrack business org | Product/backend still one `provision_financier` per auth user | Blocks multi-business commercial story |
| P1-3 | Module lock behavior unverified on staging owner org | `/subscribe/modules` all Active (trial/legacy full) | Cannot prove post-trial gating before launch |

### P2 — Medium
| ID | Title | Evidence |
| --- | --- | --- |
| P2-1 | Account create auto-opens WhatsApp | “WhatsApp confirmation opened” after Daily/Monthly create |
| P2-2 | Collection Staff Agent ID missing while Active | Neeraj Buyyani / Sai B — Agent ID Not created |
| P2-3 | Duplicate staff mobile numbers | Several agents listed with 9160710101 |

### P3 — Low
| ID | Title | Evidence |
| --- | --- | --- |
| P3-1 | AI “historically pays -N days” wording | Accounts overview collection priorities |
| P3-2 | Emulation/layout flicker during automation | Transient blank frames when switching device metrics |

---

## Financial Integrity Summary

| Check | Result |
| --- | --- |
| Daily financed vs paid-to-customer distinct | Verified on create |
| Daily first collection gate | Verified (starts tomorrow) |
| Monthly interest math on payment UI | Not verified |
| Chit bid/dividend math | Not verified |
| POS GST on sale | Verified (₹990 + 18% = ₹1,168.20) |
| Inventory decrement after POS | Not re-checked after sale |
| Trial Balance / BS / P&L reconcile | Not verified |
| Cashbook running balance integrity | **Suspect** (large negative cash) |
| Duplicate sale prevention | Not stress-tested |
| Payment correction/delete | Not verified |

---

## Security Summary

| Check | Result |
| --- | --- |
| Owner session isolation basics | Appears OK in UI |
| Agent RBAC | Unable to verify (no agent login this run) |
| Company isolation (Accounts companies) | Not cross-checked with writes |
| IDOR/API | Not tested |
| Secrets in UI | No tokens/passwords captured |
| External messaging | WhatsApp auto-open observed — treat carefully |

---

## Performance Summary

| Observation | Notes |
| --- | --- |
| Route transitions | Occasional empty “Loading FinTrack” frames 1–3s |
| Counter charge | Posted within ~5s |
| Heavy reports | Not timed |
| Mobile | Tablet-ish viewport usable for Counter/Accounts |

---

## Cleanup / retained test data

Retain for review (do not bulk-delete without owner confirm):

1. Daily: `E2E_TEST_20261109_Daily_Cust` · phone 9000000099 · account `8ba7a690-cf65-4fbd-a7de-13750bd76f76`
2. Monthly: `E2E_TEST_20261109_Monthly_Cust` · phone 9000000098
3. POS: 1 × Burma Paper sale · walk-in `E2E_TEST_20261109_Walkin` · ₹1,168.20 cash · stock reduced by 1 kg

No intentional edits to pre-existing customers/invoices beyond this POS stock movement.

---

## Final Verdict

**READY ONLY AFTER P0/P1 FIXES**

### Must-fix before public launch
1. Wire and verify Razorpay module unlock + entitlement grants (happy path + failure)
2. Investigate and correct negative cash/bank aggregate displays (or explain with clear opening/transfer rules)
3. Implement or explicitly defer “existing customer → additional business account” registration
4. Re-test module locks on a **post-trial Finance-only** org (not this all-Active workspace)
5. Complete remaining deep suites: Chit lifecycle math, Reports TB/BS/P&L, Agent RBAC, Cashbook day close, Inventory reconciliation, GST reports (without portal filing)

### Recommended next QA pass
Dedicated Finance-only sandbox org + Agent PIN test account + desktop Chrome/Safari + scripted report checklist.
