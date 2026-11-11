import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "api/_lib/workspaceBackup.js"), "utf8");

test("workspace backup format constants are stable", () => {
  assert.match(source, /myfintracker-workspace-backup/);
  assert.match(source, /WORKSPACE_BACKUP_VERSION = 1/);
  assert.match(source, /STORAGE_BUCKET = "workspace-backups"/);
  assert.match(source, /BACKUP_FILE_SIZE_LIMIT = 524288000/);
  assert.match(source, /gzipSync/);
  assert.match(source, /\.json\.gz/);
});

test("snapshot builder covers all product modules", () => {
  assert.match(source, /exportFinance/);
  assert.match(source, /exportCashbook/);
  assert.match(source, /exportChit/);
  assert.match(source, /exportAccounts/);
  assert.match(source, /modules\.finance/);
  assert.match(source, /modules\.cashbook/);
  assert.match(source, /modules\.chit/);
  assert.match(source, /modules\.accounts/);
});

test("restore creates a pre_restore checkpoint path in API flow", () => {
  assert.match(source, /kind: "pre_restore"/);
  assert.match(source, /restore_workspace_backup_json/);
});
