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
/** Preferred per-bucket cap (bytes). Pro can use this; Free global max is 50 MB. */
export const BACKUP_FILE_SIZE_LIMIT = 524288000; // 500 MB
/** Free-plan safe cap — also used as max chunk size for multipart uploads. */
export const BACKUP_FREE_FILE_SIZE_LIMIT = 52428800; // 50 MB
/** Leave headroom under the 50 MB Free global limit for multipart parts. */
export const BACKUP_PART_MAX_BYTES = 40 * 1024 * 1024;

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

const withOrgId = (rows, orgId) => (rows || []).map(row => ({ ...row, organization_id: orgId }));

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
  return {
    customers: withOrgId(customers, orgId),
    finance_accounts: withOrgId(accounts, orgId),
    rate_changes: rateChanges,
    payments: withOrgId(payments, orgId),
  };
}

async function exportCashbook(orgId) {
  const ledger_accounts = await restGetAll(`ledger_accounts?organization_id=eq.${orgId}&select=*`);
  const cashbook_entries = await restGetAll(`cashbook_entries?organization_id=eq.${orgId}&select=*`);
  const account_transfers = await restGetAll(`account_transfers?organization_id=eq.${orgId}&select=*`);
  const day_closings = await restGetAll(`day_closings?organization_id=eq.${orgId}&select=*`);
  if (![ledger_accounts, cashbook_entries, account_transfers, day_closings].some(rows => rows.length)) return null;
  return {
    ledger_accounts: withOrgId(ledger_accounts, orgId),
    cashbook_entries: withOrgId(cashbook_entries, orgId),
    account_transfers: withOrgId(account_transfers, orgId),
    day_closings: withOrgId(day_closings, orgId),
  };
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
  const cycleIds = cycles.map(row => row.id);
  const bids = cycleIds.length ? await chunkIn("chit_bids", "cycle_id", cycleIds) : [];
  // installments / payouts are keyed by cycle_id (no scheme_id column).
  const installments = cycleIds.length ? await chunkIn("chit_installments", "cycle_id", cycleIds) : [];
  const payouts = cycleIds.length ? await chunkIn("chit_payouts", "cycle_id", cycleIds) : [];
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
    trade_documents,
    trade_document_lines,
    price_lists,
    price_list_rates,
    party_pipeline,
    document_settings,
    inventory_settings,
    payroll_profiles,
    payroll_days,
    payroll_leave,
    payroll_runs,
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
    restGet(`acc_settings?organization_id=eq.${company.organization_id}&select=*&limit=1`).catch(() => []),
    restGetAll(`acc_trade_documents?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_trade_document_lines?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_price_lists?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_price_list_rates?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_party_pipeline?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGet(`acc_document_settings?company_id=eq.${companyId}&select=*&limit=1`).catch(() => []),
    restGet(`acc_inventory_settings?company_id=eq.${companyId}&select=*&limit=1`).catch(() => []),
    restGetAll(`acc_payroll_profiles?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_payroll_days?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_payroll_leave?company_id=eq.${companyId}&select=*`).catch(() => []),
    restGetAll(`acc_payroll_runs?company_id=eq.${companyId}&select=*`).catch(() => []),
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
    acc_trade_documents: trade_documents,
    acc_trade_document_lines: trade_document_lines,
    acc_price_lists: price_lists,
    acc_price_list_rates: price_list_rates,
    acc_party_pipeline: party_pipeline,
    acc_document_settings: document_settings[0] || null,
    acc_inventory_settings: inventory_settings[0] || null,
    acc_payroll_profiles: payroll_profiles,
    acc_payroll_days: payroll_days,
    acc_payroll_leave: payroll_leave,
    acc_payroll_runs: payroll_runs,
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

async function putBucketFileSizeLimit(limitBytes) {
  const response = await fetch(`${supabaseUrl()}/storage/v1/bucket/${STORAGE_BUCKET}`, {
    method: "PUT",
    headers: serviceHeaders(),
    body: JSON.stringify({
      public: false,
      file_size_limit: limitBytes,
    }),
  });
  return response.ok;
}

export async function ensureBackupBucket() {
  const payload = {
    id: STORAGE_BUCKET,
    name: STORAGE_BUCKET,
    public: false,
    file_size_limit: BACKUP_FREE_FILE_SIZE_LIMIT,
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
  // Prefer Pro-sized limit; fall back to Free 50 MB when the project cannot go higher.
  if (!(await putBucketFileSizeLimit(BACKUP_FILE_SIZE_LIMIT))) {
    await putBucketFileSizeLimit(BACKUP_FREE_FILE_SIZE_LIMIT);
  }
}

function decodeBackupBytes(buffer, path = "") {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const looksGzip = path.endsWith(".gz") || (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
  if (looksGzip) return gunzipSync(bytes).toString("utf8");
  return bytes.toString("utf8");
}

async function storageFetchObject(path) {
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/authenticated/${STORAGE_BUCKET}/${path}`, {
    headers: serviceHeaders(),
  });
  if (response.ok) return Buffer.from(await response.arrayBuffer());
  const alt = await fetch(`${supabaseUrl()}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    headers: serviceHeaders(),
  });
  if (!alt.ok) throw new Error("Could not download that backup.");
  return Buffer.from(await alt.arrayBuffer());
}

async function uploadStorageBytes(path, bytes, contentType) {
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      ...serviceHeaders(),
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message = err?.message || err?.error || "Could not store the backup file.";
    const mb = (body.byteLength / (1024 * 1024)).toFixed(1);
    if (/maximum allowed size|entity too large|payload too large/i.test(String(message))) {
      throw new Error(
        `${message} (upload part ${mb} MB). On Free, Storage max is 50 MB — check Storage → Buckets → workspace-backups file size limit. On Pro, raise Storage → Settings → Global file size limit.`,
      );
    }
    throw new Error(`${message} (upload part ${mb} MB)`);
  }
}

function backupObjectPrefix(orgId, backupId) {
  return `${orgId}/${backupId}`;
}

export async function uploadBackupObject(orgId, backupId, snapshot) {
  await ensureBackupBucket();
  const json = JSON.stringify(snapshot);
  const compressed = gzipSync(Buffer.from(json, "utf8"));
  const prefix = backupObjectPrefix(orgId, backupId);

  // Small enough for a single Free-plan object.
  if (compressed.length <= BACKUP_PART_MAX_BYTES) {
    const path = `${prefix}.json.gz`;
    await uploadStorageBytes(path, compressed, "application/gzip");
    return { path, bytes: compressed.length };
  }

  // Split gzip stream into <50 MB parts so Free staging can store large workspaces.
  const parts = [];
  for (let offset = 0, index = 0; offset < compressed.length; offset += BACKUP_PART_MAX_BYTES, index += 1) {
    const chunk = compressed.subarray(offset, offset + BACKUP_PART_MAX_BYTES);
    const partPath = `${prefix}.part${String(index).padStart(3, "0")}`;
    await uploadStorageBytes(partPath, chunk, "application/octet-stream");
    parts.push(partPath);
  }
  const manifest = {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    kind: "gzip-parts",
    encoding: "gzip",
    bytes: compressed.length,
    uncompressedBytes: Buffer.byteLength(json, "utf8"),
    parts,
  };
  const path = `${prefix}.manifest.json`;
  await uploadStorageBytes(path, Buffer.from(JSON.stringify(manifest), "utf8"), "application/json");
  return { path, bytes: compressed.length };
}

export async function downloadBackupObject(path) {
  const bytes = await storageFetchObject(path);
  if (path.endsWith(".manifest.json")) {
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (manifest?.kind === "gzip-parts" && Array.isArray(manifest.parts)) {
      const chunks = [];
      for (const partPath of manifest.parts) {
        chunks.push(await storageFetchObject(partPath));
      }
      return gunzipSync(Buffer.concat(chunks)).toString("utf8");
    }
    throw new Error("Unsupported multipart backup manifest.");
  }
  return decodeBackupBytes(bytes, path);
}

export async function deleteBackupObject(path) {
  const prefixes = new Set([path]);
  if (path.endsWith(".manifest.json")) {
    prefixes.add(path.slice(0, -".manifest.json".length));
    try {
      const manifest = JSON.parse((await storageFetchObject(path)).toString("utf8"));
      for (const partPath of manifest?.parts || []) prefixes.add(partPath);
    } catch {
      // Best-effort cleanup when the manifest is already gone.
    }
  } else if (path.endsWith(".json.gz")) {
    prefixes.add(path.slice(0, -".json.gz".length));
  }
  await fetch(`${supabaseUrl()}/storage/v1/object/${STORAGE_BUCKET}`, {
    method: "DELETE",
    headers: serviceHeaders(),
    body: JSON.stringify({ prefixes: [...prefixes] }),
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

  // Snapshot live data before replace. Skip when undoing via a checkpoint so we
  // do not bury the useful copy under a newer checkpoint of already-restored data.
  if (row.kind !== "pre_restore") {
    await createWorkspaceBackup({
      orgId,
      kind: "pre_restore",
      createdBy: actorId,
      note: `Automatic checkpoint before restoring ${backupId}`,
    }).catch(() => null);
  }

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
