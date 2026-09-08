/** Company-scoped Accounts backup (export / validate). Restore must confirm and stay company-isolated. */

export const ACCOUNTS_BACKUP_VERSION = 1;

export function buildAccountsCompanyBackup({
  company,
  settings,
  accounts = [],
  parties = [],
  items = [],
  vouchers = [],
  gstLines = [],
  voucherItemLines = [],
  stockMovements = [],
  statements = [],
  audit = [],
  periodLocks = [],
}) {
  if (!company?.id) throw new Error("Company is required for backup.");
  return {
    format: "fintrack-accounts-company-backup",
    version: ACCOUNTS_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    company: {
      id: company.id,
      name: company.name,
      booksStartedOn: company.booksStartedOn,
      gstin: company.gstin || "",
      stateCode: company.stateCode || "",
      gstRegistration: company.gstRegistration || "",
    },
    settings: settings || {},
    accounts,
    parties,
    items,
    vouchers,
    gstLines,
    voucherItemLines,
    stockMovements,
    statements,
    audit,
    periodLocks,
    counts: {
      accounts: accounts.length,
      parties: parties.length,
      items: items.length,
      vouchers: vouchers.length,
      statements: statements.length,
    },
  };
}

export function parseAccountsCompanyBackup(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || data.format !== "fintrack-accounts-company-backup") {
    throw new Error("Not a FinTrack Accounts company backup file.");
  }
  if (Number(data.version) !== ACCOUNTS_BACKUP_VERSION) {
    throw new Error(`Unsupported backup version ${data.version}.`);
  }
  if (!data.company?.id || !data.company?.name) {
    throw new Error("Backup is missing company identity.");
  }
  return data;
}

export function assertBackupCompanyMatch(backup, activeCompany) {
  if (!activeCompany?.id) throw new Error("Select a company before restore.");
  if (backup.company.id !== activeCompany.id) {
    throw new Error(
      `This backup belongs to “${backup.company.name}” and cannot overwrite “${activeCompany.name}”. Switch company or restore into a matching company only.`,
    );
  }
}

export function assertBackupRestorable(backup, { activeCompany, vouchers = [] } = {}) {
  assertBackupCompanyMatch(backup, activeCompany);
  if ((vouchers || []).length > 0) {
    throw new Error(
      "Restore is only allowed into a company with no vouchers yet. Create a fresh company or clear books before restore.",
    );
  }
}

export function backupDownloadFilename(company) {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = String(company?.name || "company").replace(/[^\w\-]+/g, "_").slice(0, 40);
  return `fintrack-accounts-backup-${safe}-${stamp}.json`;
}
