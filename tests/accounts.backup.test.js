import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNTS_BACKUP_VERSION,
  assertBackupCompanyMatch,
  backupDownloadFilename,
  buildAccountsCompanyBackup,
  parseAccountsCompanyBackup,
} from "../src/features/accounts/data/accountsBackup.js";

test("builds and parses a company-scoped Accounts backup", () => {
  const company = {
    id: "co-1",
    name: "SriHitha Infra",
    booksStartedOn: "2026-04-01",
    gstin: "29AAAAA0000A1Z5",
    stateCode: "29",
  };
  const backup = buildAccountsCompanyBackup({
    company,
    settings: { fyStartMonth: 4 },
    accounts: [{ id: "a1", code: "1000", name: "Cash" }],
    parties: [{ id: "p1", name: "ABC" }],
    vouchers: [{ id: "v1", voucherNumber: "JV-1" }],
  });

  assert.equal(backup.format, "fintrack-accounts-company-backup");
  assert.equal(backup.version, ACCOUNTS_BACKUP_VERSION);
  assert.equal(backup.company.id, "co-1");
  assert.equal(backup.counts.accounts, 1);
  assert.equal(backup.counts.parties, 1);

  const parsed = parseAccountsCompanyBackup(JSON.stringify(backup));
  assert.equal(parsed.company.name, "SriHitha Infra");
  assertBackupCompanyMatch(parsed, company);
  assert.match(backupDownloadFilename(company), /fintrack-accounts-backup-SriHitha_Infra-/);
});

test("restore rejects a backup from a different company", () => {
  const backup = buildAccountsCompanyBackup({
    company: { id: "co-a", name: "Company A", booksStartedOn: "2026-04-01" },
  });
  assert.throws(
    () => assertBackupCompanyMatch(backup, { id: "co-b", name: "Company B" }),
    /cannot overwrite/i,
  );
});
