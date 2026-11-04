# FinTrack × MargBooks — Phase 1 analysis (no product changes)

**Branch:** `docs/margbooks-inspired-phase1`  
**Date:** 2026-11-04  
**Scope:** Demo review, FinTrack architecture audit, gap matrix, UI/UX issues, priority roadmap.  
**Safety:** No financial calculations, GST, inventory math, auth, permissions, or APIs were changed in this phase.

FinTrack must remain FinTrack. MargBooks is a usability/polish benchmark only — not a design or feature clone.

---

## 0. Media review status

### Screenshots reviewed (all)

WhatsApp images attached in chat (Create Item, Item List, Dashboard KPIs, Banking Reconciliation + Stock Management Conversion, Stock Summary Expired, Purchase Bill import, Create Ledger, Sale Bill grid, Combined Report tabs).

### Videos reviewed (all 10)

| File | Status | How reviewed |
|------|--------|--------------|
| `WhatsApp Video 2026-11-04 at 15.54.25.mp4` | Reviewed | 4 frames extracted (Swift AVFoundation) |
| `WhatsApp Video 2026-11-04 at 15.54.30.mp4` | Reviewed | 4 frames |
| `WhatsApp Video 2026-11-04 at 15.54.33.mp4` | Reviewed | 4 frames |
| `WhatsApp Video 2026-11-04 at 15.54.39.mp4` | Reviewed | 4 frames |
| `WhatsApp Video 2026-11-04 at 15.54.48.mp4` | Reviewed | 4 frames |
| `WhatsApp Video 2026-11-04 at 16.01.48.mp4` | Reviewed | 4 frames |
| `WhatsApp Video 2026-11-04 at 16.01.52.mp4` | Reviewed | 4 frames |
| `WhatsApp Video 2026-11-04 at 16.04.00.mp4` | Reviewed | 4 frames |
| `WhatsApp Video 2026-11-04 at 16.04.10.mp4` | Reviewed | 4 frames |
| `WhatsApp Video 2026-11-04 at 16.04.26.mp4` | Reviewed | 4 frames |

**None failed.** Frames live under `.tmp/margbooks-demo/frames/` (local only; not for commit). Audio/narration was not transcribed; analysis is visual + FinTrack code evidence.

---

## 1. MargBooks demo analysis (by workflow)

### 1.1 Application shell & dashboard

| Field | Detail |
|-------|--------|
| **Feature** | Branch-aware shell + KPI dashboard |
| **Does** | Dark/icon sidebar, teal header, Net Sale/Purchase/Gross Profit charts, Cash in Hand (Cash/UPI/Bank), Due Payment, Fund Summary, Outstanding, GST payable chips, stock ops counts |
| **Problem solved** | Owner sees cash + dues + stock health in one glance |
| **Screens** | `/dashboard` |
| **Nav** | Persistent sidebar modules + top utility icons (Import, Help, Settings, Notification, Shortcut, History) |
| **Filters** | Last 30 days / FY selector |
| **Mobile** | Not clearly shown in demo (desktop Meet share) |
| **In FinTrack?** | **Partial** — Accounts Overview + Attention Center + finance dashboards exist; not the same dense “FMCG owner wall” |
| **Need** | UI/UX improvement of Overview (not new ledger math) |
| **Complexity** | M |
| **Risk** | Low if metrics reuse existing report helpers |
| **Priority** | P1 |

### 1.2 Keyboard shortcuts panel

| Field | Detail |
|-------|--------|
| **Feature** | Docked Shortcut Keys (Alt+N Sale, Alt+I Items, F10 Save, etc.) |
| **Does** | Power-user speed for bill entry |
| **In FinTrack?** | **Partial** — Counter only (F2/F4/F9) |
| **Need** | Workflow improvement: optional Accounts shortcut map |
| **Complexity** | S–M |
| **Risk** | Low if additive and role-gated |
| **Priority** | P2 |

### 1.3 Item master (Create Item)

| Field | Detail |
|-------|--------|
| **Feature** | Item create with Unit, Conversion, Unit in Decimal, Multi Unit / ConversionConfigure, Packing, MRP, rates, HSN |
| **Does** | Defines how stock units relate to sell units; packing disambiguates duplicate names |
| **Toast seen** | “Packing Is Required For Duplicate Product Names” |
| **Confirm** | “Do you want to add item Opening” after save |
| **In FinTrack?** | **Partial** — items, HSN suggest, batch/expiry, kirana units, **pack contains** (Bag→Kg) in progress on Counter; no free-text Packing as identity, no full multi-unit matrix, no “Unit in Decimal” toggle (fractional is unit-type based) |
| **Need** | Finish/polish pack-contains UX; clarify Packing vs pack-contains product rule |
| **Complexity** | M (extend existing) / L (full multi-UOM) |
| **Risk** | Medium if inventory posting rules change — **must not** without approval |
| **Priority** | P0 for pack UX polish; P2 for multi-UOM matrix (needs clarification) |

### 1.4 Stock Management → Conversion / BOM

| Field | Detail |
|-------|--------|
| **Feature** | Dedicated Conversion + Bill of Materials under Stock Management |
| **Does** | Explicit stock convert / assemble workflows (beyond sell-time unit switch) |
| **In FinTrack?** | **Partial** — Manufacturing workspace exists; sell-time pack conversion on Counter; no dedicated “Conversion” voucher UX like Marg |
| **Need** | Business clarification: is Counter pack enough for kirana, or do they need stock-convert vouchers? |
| **Complexity** | L |
| **Risk** | High (stock movements) |
| **Priority** | Clarify before build |

### 1.5 Sale bill grid

| Field | Detail |
|-------|--------|
| **Feature** | Dense Sale Bill: Party, Bill No, Store, grid with Barcode, Product, **Packing**, Batch, Exp, Qty, Unit, Rate, Disc, Amount |
| **Does** | Fast keyboard invoice entry with packing + unit on each line |
| **In FinTrack?** | **Available** — Counter + Simple Entry + Documents; packing column not mirrored; Counter now has Bag/Kg/g after pack size |
| **Need** | UI density / packing display; keep FinTrack Counter identity |
| **Complexity** | M |
| **Risk** | Low–medium |
| **Priority** | P1 |

### 1.6 Purchase bill + import modal

| Field | Detail |
|-------|--------|
| **Feature** | “How would you like to create your purchase bill?” — Upload & Auto Read vs Manual |
| **Does** | Guided import of PDF/Excel/CSV vs blank grid |
| **In FinTrack?** | **Available** — bill photo/PDF scan, bulk bill import, voucher CSV |
| **Need** | UI/UX: clearer first-step chooser on purchase entry |
| **Complexity** | S |
| **Risk** | Low |
| **Priority** | P2 |

### 1.7 Create Ledger (party)

| Field | Detail |
|-------|--------|
| **Feature** | Tabbed Create Ledger: General, GST (verify + history), Licence, Contact, Bank, Loyalty; Bill-by-Bill; Cr/Dr opening; F10/F9/Esc |
| **Does** | One modal for creditors/debtors with GSTIN verify |
| **In FinTrack?** | **Available** — Party modal, GST fields, credit days, openings via COA/party flows |
| **Need** | UI polish (tabs density, GST verify affordance if API exists) |
| **Complexity** | S–M |
| **Risk** | Low if UI-only |
| **Priority** | P2 |

### 1.8 Item list + detail footer

| Field | Detail |
|-------|--------|
| **Feature** | Dense item table + bottom strip (pur rate, cost, sale, margin %, HSN, GST split, barcode) |
| **Does** | Scan list without opening every edit dialog |
| **In FinTrack?** | **Partial** — inventory tables exist; less dense footer preview |
| **Need** | UI improvement |
| **Complexity** | M |
| **Risk** | Low |
| **Priority** | P2 |

### 1.9 Stock Summary : Expired

| Field | Detail |
|-------|--------|
| **Feature** | Expired stock report (Product, Packing, MRP, Expiry, Expired Stock, Unit, Supplier) with decimal qty |
| **Does** | Pharmacy/FMCG expiry control |
| **In FinTrack?** | **Partial** — item expiry + Counter warnings + write-off reason; **no dedicated expired-stock report** |
| **Need** | New report surface reusing stock + expiry fields (no calc change) |
| **Complexity** | M |
| **Risk** | Low |
| **Priority** | P1 (esp. medical/kirana) |

### 1.10 Banking reconciliation

| Field | Detail |
|-------|--------|
| **Feature** | Bank recon table + Difference / Computer / Bank balances + shortcut strip |
| **Does** | Match bank clearing to books |
| **In FinTrack?** | **Available** — statement import + match UI + AI bank agent; not identical UX |
| **Need** | UI/UX polish; avoid rewriting match engine |
| **Complexity** | M |
| **Risk** | Medium if posting behavior changes — **UI only unless approved** |
| **Priority** | P2 |

### 1.11 Combined Report center

| Field | Detail |
|-------|--------|
| **Feature** | Tabs: Accounts / Inventory / Statutory / Management / Report Designer |
| **Does** | Browseable report catalog |
| **In FinTrack?** | **Available** — Accounts reports hub + export CSV/XLS/PDF; plain-language copy on some reports |
| **Need** | Information architecture + non-accountant explanations (existing prompt direction) |
| **Complexity** | M |
| **Risk** | Low if calculations untouched |
| **Priority** | P1 |

### 1.12 CRM / Staff / Other Products

| Field | Detail |
|-------|--------|
| **Feature** | CRM, Staff Register, Other Products in Marg sidebar |
| **In FinTrack?** | Different product shape: Collection Staff, Route Collections, Chit, Daily/Monthly finance — **not Marg CRM** |
| **Need** | **Not appropriate** to clone; keep FinTrack modules |
| **Priority** | Skip |

---

## 2. FinTrack architecture summary (code)

| Layer | Location |
|-------|----------|
| Entry | `src/main.jsx` → `App.jsx` → `app/AppRoutes.jsx` |
| Session | `app/SessionLayout.jsx`, roles financier/agent/customer/chitCustomer |
| Workspace | `features/workspace/` — module gates, company context |
| Accounts | `features/accounts/` — Counter, inventory, parties, vouchers, GST, reports, banking, docs, payroll, manufacturing, AI review, CA pack |
| Daily/Monthly | `features/finance/` |
| Chit | `features/chitFund/` |
| Cashbook | `features/cashbook/` |
| Design tokens | `src/styles/colors.css`, `fonts.css` (`--ft-*`); Accounts UI `AccUi.jsx`, `accountingProduct.css` |
| Isolation | `accountingRepository.js` — `company_id`, `x-acc-company-id`, RPC `input_company_id` |
| Offline Counter | `counterOffline*.js` (~48h queue) |

FinTrack is already a multi-product Indian SMB stack (Accounts + lending + chit). Marg-style “books-only” density is only one facet.

---

## 3. Feature comparison matrix

| Capability | MargBooks (demo) | FinTrack today | Gap class |
|------------|------------------|----------------|-----------|
| Owner KPI dashboard | Dense cards + charts | Overview + Attention + finance dashboards | Available, needs UI |
| Global shortcuts | Docked panel | Counter F2/F4/F9 | Partial |
| Item packing identity | Packing field + duplicate rule | Pack-contains qty/unit; single SKU | Partial |
| Multi-unit / conversion | ConversionConfigure + Stock Conversion | Pack sell units + manufacturing | Partial / clarify |
| Decimal stock | Shown (e.g. −25.87 L, 0.1 PCS) | Fractional by unit type; Bag fractional when selling loose | Available (polish bugs separately) |
| Sale bill density | Packing + Unit columns | Counter / entry / docs | Available, needs UI |
| Purchase import chooser | Modal Import vs Manual | Scan + CSV + bulk (less guided) | Available, needs UI |
| Party / ledger create | Tabbed + GST verify | Party modal | Available, needs UI |
| Expired stock report | Dedicated | Expiry fields + warnings only | Missing but valuable |
| Bank reconciliation | Classic recon UI | Statement match + AI | Available, needs UI |
| Report catalog | Combined Report tabs | Reports hub | Available, needs UI |
| Bill of Materials | First-class | Manufacturing workspace | Partial |
| CRM | Present | Not the FinTrack thesis | Not appropriate |
| Offline POS | Not shown | Yes | FinTrack ahead |
| Daily/Monthly / Chit | N/A | Core FinTrack | FinTrack ahead |
| WhatsApp ops | Not deep in demo | Share / reminders / portals | FinTrack ahead |
| AI close / bookkeeper | Chat widget only | Bookkeeper, migration, AI Review | FinTrack ahead |
| Multi-alias SKU | Multi Alias badge | Single SKU + barcode | Missing / clarify |
| Multi-store | Store dropdown | Company-centric; not multi-store SKU | Clarify |

---

## 4. FinTrack UI/UX audit (prioritized)

### P0 — Fix / finish in flight (do not redesign around)

1. Counter loose sell from Bag (pack contains + charge validation) — already in local WIP; ship carefully on staging.
2. Stock alerts must use sell-unit → base-unit qty (g↔kg) — fixed in WIP.

### P1 — High user value, low calc risk

1. Accounts Overview: clearer KPIs (cash, dues, stock alerts) with plain language — reuse existing metrics.
2. Reports hub: group like Accounts / Inventory / Statutory / Management; keep export; add short “what this means” where missing.
3. Expired / near-expiry stock list report.
4. Counter / sale line: show pack size permanently on bag items; less clutter than Marg packing column.
5. Inventory item list: optional detail strip (rate, GST, stock) without full modal.
6. Mobile Accounts bottom nav + Counter density pass at 375/414.

### P2 — Polish

1. Purchase entry first-step: Import vs Manual chooser (wires existing importers).
2. Party form sectioning (GST / bank / credit) closer to tab clarity — FinTrack labels.
3. Optional Accounts shortcut help panel (discoverability).
4. Banking match screen visual hierarchy (Difference / balances).
5. Empty/loading/error consistency via AccUi primitives.

### P3 — Later / clarify

1. Full multi-UOM conversion matrix.
2. Stock Conversion voucher module.
3. Multi-alias SKUs.
4. Multi-store inventory.
5. Marg-like Report Designer (custom report builder) — high cost, unclear need.

### Observed FinTrack issues (general)

- Navigation depth in Accounts can overwhelm non-accountants.
- Some tables are wide on mobile (horizontal scroll).
- Terminology mix (voucher vs bill vs document) — improve labels, not engines.
- Design system exists (`--ft-*`) but density/spacing varies across modules.
- Do **not** chase Marg dark-sidebar clone; keep FinTrack light-first + brand.

---

## 5. Design direction (FinTrack-original)

- Light-first, `--ft-*` tokens only (no new hex without ask).
- Type scale from `fonts.css` only.
- Professional SMB: clear primary action, 44px touch targets, readable money.
- Cards for interaction containers; avoid dashboard card spam.
- Plain-language report intros; charts as aids, not decoration.
- No Marg logo, teal clone, or identical layouts.

---

## 6. Priority roadmap (staging only)

| Phase | Work | Status |
|-------|------|--------|
| **1** | Demo + code audit + this doc + branch | **This deliverable** |
| **2** | Shared AccUi consistency (buttons, tables, empty/loading) — UI only | Next after approval |
| **3** | Shell polish (Accounts nav clarity, breadcrumbs) — no ACL changes | After 2 |
| **4a** | Overview KPI presentation | After 3 |
| **4b** | Reports hub IA + expired stock report | After 3 |
| **4c** | Purchase import chooser + party form sections | Parallel low-risk |
| **4d** | Counter pack UX completion (already started) | Separate staging PR |
| **5** | Responsive sweep 320–1440 | After 4 |
| **6** | Regression: finance, chit, GST, reports, permissions | Required before merge |

**Explicitly not starting without confirmation:** multi-UOM matrix, stock Conversion vouchers, multi-alias SKU, multi-store, Report Designer, CRM clone, any change to GST/inventory/finance math.

---

## 7. Components / pages redesigned

**None in Phase 1.** Documentation only.

---

## 8. New functionality implemented

**None in Phase 1.**

Local uncommitted Counter pack/loose-kg work may exist on the working tree from earlier sessions — treat as separate PR, not part of this analysis commit.

---

## 9. Files changed (Phase 1)

- `docs/margbooks-inspired-phase1.md` (this file)
- Branch: `docs/margbooks-inspired-phase1`

---

## 10. Tests / build / responsive

| Check | Result |
|-------|--------|
| Automated tests | Not re-run for doc-only phase |
| Build / lint | N/A (no app code in this commit) |
| Responsive | Deferred to Phase 5 |
| Before/after screenshots | N/A until UI phases |

---

## 11. Known limitations of this analysis

- Demo was desktop Meet share; Marg mobile behavior not observed.
- Video audio not transcribed; intent inferred from UI + your FinTrack context (kirana Bag/Kg).
- Marg internal business rules (exact conversion posting) are not reverse-engineered — only UX patterns.

---

## 12. Intentionally not implemented

- Marg branding / exact screens
- CRM, Staff Register clone
- Report Designer
- Full multi-unit ConversionConfigure
- Stock Conversion voucher module
- Loyalty tabs on parties
- Changes to Daily/Monthly/Chit/Accounts calculations
- Permission expansions for Collection Staff

---

## 13. Business decisions (defaults — owner asked to choose what is best)

Recorded 2026-11-04 after “do what is best”:

| # | Topic | Decision |
|---|--------|----------|
| 1 | Kirana pack model | **Counter “1 Bag = N Kg” + sell Kg/g only.** No Marg-style Stock Conversion voucher for now (high risk, not needed for loose rice). |
| 2 | Packing field | **Keep SKU uniqueness + pack-contains.** No free-text Packing / duplicate-name toast unless a customer asks later. |
| 3 | Multi-alias SKU | **Defer.** Single SKU + barcode is enough; revisit if POS needs multiple codes per item. |
| 4 | Expired stock report | **Yes — P1 read-only report** (no posting/calc changes). |
| 5 | First implementation slice | **(C) Finish Counter pack charge fix**, then **(A) Expired stock report**. Overview KPI polish and full AccUi redesign wait until these are stable on staging. |

---

## 14. Next step (in progress on this branch)

1. Commit Counter loose-kg charge validation fix.
2. Add Accounts → Reports → Expired stock (read-only).
3. Push staging after review; run migration `119` if not applied.
4. Later: Overview KPI presentation + AccUi consistency (Phase 2–3), still no calc changes.
