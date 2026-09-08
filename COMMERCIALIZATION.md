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

- **Accounts roles** (migration **070**): `owner` (financier owner), `accountant`, `viewer` via `acc_user_roles` + `accounts_access_role()`.
  - Read: owner / accountant / viewer (`can_accounts_read`)
  - Write / post: owner / accountant (`can_accounts_write`)
  - Admin (role assignment, etc.): owner only (`can_accounts_admin` / `acc_set_user_role`)
- Company isolation remains via `x-acc-company-id` / `company_id`; roles do not bypass company scope.
- Product analytics (`track_product_event` / client `trackProductEvent`) must stay **non-PII** — no phones, GSTIN, tokens, or secrets in event properties.
- Attention Center and GST prep are **advisory / calculated only** — they never invent balances or claim government filing.

## E-invoice stub

`EINVOICE_INTEGRATION_STUB` in `gstPrepExport.js` and org `einvoice_settings` (JSON) store configuration only.

- **Not enabled** by default; no IRN / e-Way / GSP live calls.
- Required secrets (GSTIN, IRP credentials, optional GSP) must come from verified government or GSP partners.
- Do not fake IRN, signed QR, or ack numbers.

GSTR-1 / GSTR-3B helpers export **books preparation** with `filingStatus: "not_filed"` and an explicit disclaimer.

## Backup isolation rules

Company-scoped Accounts backups (`accountsBackup.js` / `accountsRestore.js`):

1. Format `fintrack-accounts-company-backup`, version pinned (`ACCOUNTS_BACKUP_VERSION`).
2. Backup always embeds company `id` + `name` (and books/GST identity fields).
3. **Restore only into the matching active company** — `assertBackupCompanyMatch` rejects cross-company overwrite.
4. **Empty books only** — restore requires the target company to have **zero vouchers** (`assertBackupRestorable`).
5. Client restore remaps IDs via existing create/post RPCs; voucher numbers are reassigned by the server.
6. Export / validate are safe to run widely; restore requires explicit UI confirmation.

## Related migrations

Run `supabase/070_commercialization_foundations.sql` after **069**, then `supabase/071_accounts_access_role_client.sql` (see `MIGRATION_CHECKLIST.md`).
