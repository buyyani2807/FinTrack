# FinTrack commercialization foundations

Architecture notes for SaaS packaging, security roles, GST e-invoice stubs, and company-isolated Accounts backups. Billing is not wired yet — tiers below are blueprints only.

## SaaS tiers (`SAAS_TIER_BLUEPRINT`)

From `src/features/commercial/featurePacks.js`:

| Tier | Packs | Limits / notes |
|------|--------|----------------|
| **trial** | `full` | 14 days; full product for evaluation; soft limits only |
| **basic** | `finance` | 1 company, 2 users |
| **pro** | `finance`, `chit` | 3 companies, 5 users |
| **business** | `full` | 10 companies, 20 users |

Feature packs (`FEATURE_PACKS`) map verticals to modules (`dashboard`, `daily`, `monthly`, `chit`, `accounts`, `cashbook`, `reports`, `receipts`, `ai`). Org settings may store `feature_packs` / `module_overrides` (migration **070**). Runtime enablement uses `resolveEnabledModules` / `isModuleEnabled`.

Default pilot entitlements (`DEFAULT_ENTITLEMENTS`) stay on `pro_pilot` with the `full` pack until billing is connected.

## Security notes

- **Accounts roles** (migration **070** + **072/073** admin gates): `owner` (financier owner), `accountant`, `viewer` via `acc_user_roles` + `accounts_access_role()`.
  - Read: owner / accountant / viewer (`can_accounts_read`)
  - Write / post: owner / accountant (`can_accounts_write` / `acc_require_owner` writers)
  - Admin (GST save, period lock, create/archive company, company settings, role assignment): owner only (`can_accounts_admin` / `acc_require_admin`)
  - **Email invites** (migration **075**): owner invites CA/accountant/viewer by email; pending invites auto-claim on signup via `acc_claim_team_invites`. UUID paste remains as fallback.
- Company isolation remains via `x-acc-company-id` / `company_id`; roles do not bypass company scope.
- **Recurring templates** (migration **075**): schedule sale/expense/etc.; “Run now” opens a guided entry and advances `next_run_on` after post — not auto-posting cron.
- Product analytics (`track_product_event` / client `trackProductEvent`) must stay **non-PII** — no phones, GSTIN, tokens, or secrets in event properties.
- Attention Center and GST prep are **advisory / calculated only** — they never invent balances or claim government filing.
- Live RLS/API checks: `npm run test:accounts-live` (skipped unless `SUPABASE_URL` + role JWTs are set). See `scripts/live-accounts-rls.mjs`.

## E-invoice stub

`EINVOICE_INTEGRATION_STUB` in `gstPrepExport.js` and org `einvoice_settings` (JSON) store configuration only.

- **Not enabled** by default; no IRN / e-Way / GSP live calls.
- Required secrets (GSTIN, IRP credentials, optional GSP) must come from verified government or GSP partners.
- Do not fake IRN, signed QR, or ack numbers.
- Migration **073** stores queued outbound payloads in `acc_einvoice_payloads` with status `not_submitted`.

GSTR-1 / GSTR-3B helpers export **books preparation** as CSV **and JSON** with `filingStatus: "not_filed"` and an explicit disclaimer.

## Bill-wise AR/AP

Receipts, payments, and notes may store `settlements` links (`invoice_voucher_id` + amount) on the voucher (migration **073**). Reports prefer bill-wise links; leftover / legacy vouchers still allocate with party FIFO.

## Backup isolation rules

Company-scoped Accounts backups (`accountsBackup.js` / `accountsRestore.js`):

1. Format `fintrack-accounts-company-backup`, version pinned (`ACCOUNTS_BACKUP_VERSION`).
2. Backup always embeds company `id` + `name` (and books/GST identity fields).
3. **Restore only into the matching active company** — `assertBackupCompanyMatch` rejects cross-company overwrite.
4. **Empty books only** — restore requires the target company to have **zero vouchers** (`assertBackupRestorable`).
5. Client restore remaps IDs via existing create/post RPCs; voucher numbers are reassigned by the server.
6. Export / validate are safe to run widely; restore requires explicit UI confirmation.

## Related migrations

Run `supabase/070_commercialization_foundations.sql` after **069**, then `071`–`075` in order (see `MIGRATION_CHECKLIST.md`). Wave 1 client features need **075** live for invites and recurring templates.
