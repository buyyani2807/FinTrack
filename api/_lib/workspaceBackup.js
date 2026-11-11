/* global process */
/**
 * Modular workspace backup: export / store / restore whatever modules
 * the organization actually has (finance, cashbook, chit, accounts).
 */
import { gunzipSync, gzipSync } from "node:zlib";

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
};

export const WORKSPACE_BACKUP_FORMAT = "myfintracker-workspace-backup";
export const WORKSPACE_BACKUP_VERSION = 1;
export const BACKUP_RETENTION_DAYS = 14;
export const STORAGE_BUCKET = "workspace-backups";
/** Per-bucket cap (bytes). Pro global Storage limit must be >= this in Dashboard. */
export const BACKUP_FILE_SIZE_LIMIT = 524288000; // 500 MB

export const supabaseUrl = () => readEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
export const serviceKey = () => readEnv("SUPABASE_SERVICE_ROLE_KEY");
export const anonKey = () => readEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");

export const serviceHeaders = (extra = {}) => ({
  apikey: serviceKey(),
  Authorization: `Bearer ${serviceKey()}`,
  "Content-Type": "application/json",
  ...extra,
});

const restGetAll = async (path) => {
  const rows = [];
  let offset = 0;
  const page = 1000;
  for (;;) {
    const response = await fetch(`${supabaseUrl()}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${page}&offset=${offset}`, {
      headers: { ...serviceHeaders(), Prefer: "count=exact" },
    });
    const batch = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(batch?.message || batch?.error || `Could not read ${path}`);
    }
    if (!Array.isArray(batch) || !batch.length) break;
    rows.push(...batch);
    if (batch.length < page) break;
    offset += page;
  }
  return rows;
};

const restGet = async (path) => {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, { headers: serviceHeaders() });
  const body = await response.json().catch(() => []);
  if (!response.ok) throw new Error(body?.message || body?.error || `Could not read ${path}`);
  return Array.isArray(body) ? body : [];
};

export async function callerOwnerProfile(accessToken) {
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: anonKey(), Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user?.id) return null;
  const rows = await restGet(`profiles?id=eq.${user.id}&select=id,organization_id,role,is_active,full_name,email&limit=1`);
  const profile = rows[0];
  if (!profile || profile.role !== "owner" || profile.is_active === false) return null;
  return { ...profile, userId: user.id };
}

async function exportFinance(orgId) {
  const customers = await restGetAll(`customers?organization_id=eq.${orgId}&select=*`);
  const accounts = await restGetAll(`finance_accounts?organization_id=eq.${orgId}&select=*`);
  const accountIds = accounts.map(row => row.id);
  let rateChanges = [];
  let payments = [];
  if (accountIds.length) {
    // Chunk IN filters to stay under URL limits.
    for (let i = 0; i < accountIds.length; i += 80) {
      const chunk = accountIds.slice(i, i + 80).join(",");
      rateChanges = rateChanges.concat(await restGetAll(`rate_changes?finance_account_id=in.(${chunk})&select=*`));
    }
    payments = await restGetAll(`payments?organization_id=eq.${orgId}&select=*`);
  }
  if (!customers.length && !accounts.length && !payments.length) return null;
  return { customers, finance_accounts: accounts, rate_changes: rateChanges, payments };
}

async function exportCashbook(orgId) {
  const ledger_accounts = await restGetAll(`ledger_accounts?organization_id=eq.${orgId}&select=*`);
  const cashbook_entries = await restGetAll(`cashbook_entries?organization_id=eq.${orgId}&select=*`);
  const account_transfers = await restGetAll(`account_transfers?organization_id=eq.${orgId}&select=*`);
  const day_closings = await restGetAll(`day_closings?organization_id=eq.${orgId}&select=*`);
  if (![ledger_accounts, cashbook_entries, account_transfers, day_closings].some(rows => rows.length)) return null;
  return { ledger_accounts, cashbook_entries, account_transfers, day_closings };
}

async function exportChit(orgId) {
  const schemes = await restGetAll(`chit_schemes?organization_id=eq.${orgId}&select=*`).catch(() => []);
  const members = await restGetAll(`chit_members?organization_id=eq.${orgId}&select=*`).catch(() => []);
  if (!schemes.length && !members.length) return null;
  const schemeIds = schemes.map(row => row.id);
  const memberIds = members.map(row => row.id);
  const chunkIn = async (table, column, ids) => {
    const out = [];
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80).join(",");
      out.push(...await restGetAll(`${table}?${column}=in.(${chunk})&select=*`).catch(() => []));
    }
    return out;
  };
  const enrollments = schemeIds.length ? await chunkIn("chit_enrollments", "scheme_id", schemeIds) : [];
  const cycles = schemeIds.length ? await chunkIn("chit_cycles", "scheme_id", schemeIds) : [];
  const bids = cycles.length ? await chunkIn("chit_bids", "cycle_id", cycles.map(row => row.id)) : [];
  const installments = schemeIds.length ? await chunkIn("chit_installments", "scheme_id", schemeIds) : [];
  const payouts = schemeIds.length ? await chunkIn("chit_payouts", "scheme_id", schemeIds) : [];
  const deposits = schemeIds.length ? await chunkIn("chit_security_deposits", "scheme_id", schemeIds) : [];
  const predefined_chit_schedule = schemeIds.length ? await chunkIn("predefined_chit_schedule", "scheme_id", schemeIds) : [];
  const predefined_chit_payments = schemeIds.length ? await chunkIn("predefined_chit_payments", "scheme_id", schemeIds) : [];
  const fixed_chit_lifts = schemeIds.length ? await chunkIn("fixed_chit_lifts", "scheme_id", schemeIds) : [];
  const fixed_chit_payments = schemeIds.length ? await chunkIn("fixed_chit_payments", "scheme_id", schemeIds) : [];
  return {
    chit_schemes: schemes,
    chit_members: members,
    chit_enrollments: enrollments,
    chit_cycles: cycles,
    chit_bids: bids,
    chit_installments: installments,
    chit_payouts: payouts,
    chit_security_deposits: deposits,
    predefined_chit_schedule,
    predefined_chit_payments,
    fixed_chit_lifts,
    fixed_chit_payments,
  };
}

async function exportAccountsCompany(company) {
  const companyId = company.id;
  const [
    coa,
    parties,
    vouchers,
    voucher_lines,
    items,
    item_categories,
    voucher_item_lines,
    stock_movements,
    gst_lines,
    settings,
  ] = await Promise.all([
    restGetAll(`acc_coa?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_parties?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_vouchers?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_voucher_lines?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_items?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_item_categories?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_voucher_item_lines?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_stock_movements?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_gst_lines?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGet(`acc_settings?company_id=eq.${companyId}&select=*&limit=1`).catch(() => []),
  ]);
  return {
    company,
    settings: settings[0] || null,
    acc_coa: coa,
    acc_parties: parties,
    acc_vouchers: vouchers,
    acc_voucher_lines: voucher_lines,
    acc_items: items,
    acc_item_categories: item_categories,
    acc_voucher_item_lines: voucher_item_lines,
    acc_stock_movements: stock_movements,
    acc_gst_lines: gst_lines,
  };
}

async function exportAccounts(orgId) {
  const companies = await restGetAll(`acc_companies?organization_id=eq.${orgId}&select=*&order=created_at.asc`).catch(() => []);
  if (!companies.length) return null;
  const packs = [];
  for (const company of companies) {
    packs.push(await exportAccountsCompany(company));
  }
  return { companies: packs };
}

export async function buildWorkspaceSnapshot(orgId) {
  const orgs = await restGet(
    `organizations?id=eq.${orgId}&select=id,name,feature_packs,module_overrides,company_address,company_phone,company_email,company_logo_url,receipt_footer,receipt_terms,whatsapp_templates,reminder_settings&limit=1`,
  );
  const organization = orgs[0];
  if (!organization) throw new Error("Organization not found.");

  const [finance, cashbook, chit, accounts] = await Promise.all([
    exportFinance(orgId),
    exportCashbook(orgId),
    exportChit(orgId),
    exportAccounts(orgId),
  ]);

  const modules = {};
  if (finance) modules.finance = finance;
  if (cashbook) modules.cashbook = cashbook;
  if (chit) modules.chit = chit;
  if (accounts) modules.accounts = accounts;

  const moduleKeys = Object.keys(modules);
  return {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    organization: {
      id: organization.id,
      name: organization.name,
      feature_packs: organization.feature_packs,
      module_overrides: organization.module_overrides,
      company_address: organization.company_address,
      company_phone: organization.company_phone,
      company_email: organization.company_email,
      company_logo_url: organization.company_logo_url,
      receipt_footer: organization.receipt_footer,
      receipt_terms: organization.receipt_terms,
      whatsapp_templates: organization.whatsapp_templates,
      reminder_settings: organization.reminder_settings,
    },
    modules,
    moduleKeys,
    counts: {
      financeAccounts: finance?.finance_accounts?.length || 0,
      payments: finance?.payments?.length || 0,
      cashbookEntries: cashbook?.cashbook_entries?.length || 0,
      chitSchemes: chit?.chit_schemes?.length || 0,
      accountsCompanies: accounts?.companies?.length || 0,
    },
  };
}

export function parseWorkspaceBackup(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || data.format !== WORKSPACE_BACKUP_FORMAT) {
    throw new Error("Not a MyFinTracker workspace backup file.");
  }
  if (Number(data.version) !== WORKSPACE_BACKUP_VERSION) {
    throw new Error(`Unsupported backup version ${data.version}.`);
  }
  if (!data.organization?.id) throw new Error("Backup is missing organization identity.");
  return data;
}

export async function ensureBackupBucket() {
  const payload = {
    id: STORAGE_BUCKET,
    name: STORAGE_BUCKET,
    public: false,
    file_size_limit: BACKUP_FILE_SIZE_LIMIT,
  };
  const response = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(payload),
  });
  // 200 create or 409 already exists are fine
  if (!response.ok && response.status !== 409) {
    const body = await response.json().catch(() => ({}));
    // Older projects may already have the bucket; ignore conflict-like messages.
    if (!/exists|duplicate|already/i.test(String(body?.message || body?.error || ""))) {
      throw new Error(body?.message || "Could not create backup storage bucket.");
    }
  }
  // Raise limit on existing buckets (create alone does not update them).
  await fetch(`${supabaseUrl()}/storage/v1/bucket/${STORAGE_BUCKET}`, {
    method: "PUT",
    headers: serviceHeaders(),
    body: JSON.stringify({
      public: false,
      file_size_limit: BACKUP_FILE_SIZE_LIMIT,
    }),
  }).catch(() => {});
}

function decodeBackupBytes(buffer, path = "") {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const looksGzip = path.endsWith(".gz") || (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
  if (looksGzip) return gunzipSync(bytes).toString("utf8");
  return bytes.toString("utf8");
}

export async function uploadBackupObject(orgId, backupId, snapshot) {
  await ensureBackupBucket();
  const path = `${orgId}/${backupId}.json.gz`;
  const json = JSON.stringify(snapshot);
  const body = gzipSync(Buffer.from(json, "utf8"));
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      ...serviceHeaders(),
      "Content-Type": "application/gzip",
      "x-upsert": "true",
    },
    body,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message = err?.message || "Could not store the backup file.";
    if (/maximum allowed size|entity too large|payload too large/i.test(message)) {
      throw new Error(
        `${message} Raise Storage → Settings → Global file size limit (Pro) to at least 100 MB, then edit the workspace-backups bucket limit to match.`,
      );
    }
    throw new Error(message);
  }
  return { path, bytes: body.length };
}

export async function downloadBackupObject(path) {
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/authenticated/${STORAGE_BUCKET}/${path}`, {
    headers: serviceHeaders(),
  });
  if (response.ok) {
    return decodeBackupBytes(Buffer.from(await response.arrayBuffer()), path);
  }
  // Prefer service download path
  const alt = await fetch(`${supabaseUrl()}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    headers: serviceHeaders(),
  });
  if (!alt.ok) throw new Error("Could not download that backup.");
  return decodeBackupBytes(Buffer.from(await alt.arrayBuffer()), path);
}

export async function deleteBackupObject(path) {
  await fetch(`${supabaseUrl()}/storage/v1/object/${STORAGE_BUCKET}`, {
    method: "DELETE",
    headers: serviceHeaders(),
    body: JSON.stringify({ prefixes: [path] }),
  }).catch(() => {});
}

export async function insertBackupRow({
  orgId,
  kind,
  moduleKeys,
  storagePath,
  bytes,
  counts,
  createdBy,
  note = null,
}) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/workspace_backups`, {
    method: "POST",
    headers: { ...serviceHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      kind,
      module_keys: moduleKeys,
      storage_path: storagePath,
      bytes,
      counts: counts || {},
      created_by: createdBy || null,
      note,
      status: "ready",
    }),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(rows?.message || "Could not save backup metadata.");
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function listBackupRows(orgId) {
  return restGet(
    `workspace_backups?organization_id=eq.${orgId}&select=id,kind,module_keys,bytes,counts,status,note,created_at,created_by&order=created_at.desc&limit=60`,
  );
}

export async function getBackupRow(orgId, backupId) {
  const rows = await restGet(
    `workspace_backups?id=eq.${backupId}&organization_id=eq.${orgId}&select=*&limit=1`,
  );
  return rows[0] || null;
}

export async function createWorkspaceBackup({ orgId, kind = "manual", createdBy = null, note = null }) {
  const snapshot = await buildWorkspaceSnapshot(orgId);
  if (!snapshot.moduleKeys.length) {
    throw new Error("There is no module data to back up yet.");
  }
  const backupId = crypto.randomUUID();
  const { path, bytes } = await uploadBackupObject(orgId, backupId, snapshot);
  try {
    const row = await insertBackupRow({
      orgId,
      kind,
      moduleKeys: snapshot.moduleKeys,
      storagePath: path,
      bytes,
      counts: snapshot.counts,
      createdBy,
      note,
    });
    return { row, snapshot };
  } catch (err) {
    await deleteBackupObject(path);
    throw err;
  }
}

export async function restoreWorkspaceBackup({ orgId, backupId, actorId, modules = null }) {
  const row = await getBackupRow(orgId, backupId);
  if (!row || row.status !== "ready") throw new Error("Backup not found.");
  const raw = await downloadBackupObject(row.storage_path);
  const snapshot = parseWorkspaceBackup(raw);
  if (snapshot.organization.id !== orgId) {
    throw new Error("This backup belongs to a different workspace.");
  }

  // Safety checkpoint of current state before replace.
  await createWorkspaceBackup({
    orgId,
    kind: "pre_restore",
    createdBy: actorId,
    note: `Automatic checkpoint before restoring ${backupId}`,
  }).catch(() => null);

  const wanted = Array.isArray(modules) && modules.length
    ? modules.filter(key => snapshot.moduleKeys.includes(key))
    : snapshot.moduleKeys;

  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/restore_workspace_backup_json`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      target_org_id: orgId,
      payload: snapshot,
      module_keys: wanted,
      actor_id: actorId,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || "Could not restore the workspace backup.");
  }
  return { restored: wanted, result: body };
}

export async function listOrgsForScheduledBackup() {
  return restGet(
    "organizations?backup_schedule_enabled=eq.true&select=id,name,subscription_status,trial_ends_at&order=created_at.asc&limit=5000",
  );
}

export async function pruneOldBackups(orgId) {
  const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 86400000).toISOString();
  const old = await restGet(
    `workspace_backups?organization_id=eq.${orgId}&kind=eq.scheduled&created_at=lt.${cutoff}&select=id,storage_path`,
  );
  for (const row of old) {
    if (row.storage_path) await deleteBackupObject(row.storage_path);
    await fetch(`${supabaseUrl()}/rest/v1/workspace_backups?id=eq.${row.id}`, {
      method: "DELETE",
      headers: serviceHeaders(),
    }).catch(() => {});
  }
}
