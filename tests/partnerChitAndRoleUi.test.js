import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("partners get read-only chit access, never portal credentials", () => {
  const sql = read("supabase/145_finance_partner_chit_read.sql");
  assert.match(sql, /for select to authenticated/);
  assert.doesNotMatch(sql, /for (all|insert|update|delete)/);
  assert.match(sql, /coalesce\(public\.is_finance_partner\(\), false\)/);
  for (const table of ["chit_schemes", "chit_members", "chit_enrollments", "chit_installments", "chit_live_auctions"]) {
    assert.ok(sql.includes(`'${table}'`), table);
  }
  const list = sql.slice(sql.indexOf("foreach"), sql.indexOf("loop"));
  assert.doesNotMatch(list, /portal_credentials|portal_sessions/);
});

test("read-only Accounts roles do not see create buttons", () => {
  assert.match(read("src/features/accounts/sections/setup/ChartOfAccountsPanel.jsx"), /actions=\{canWrite \?/);
  assert.match(read("src/features/accounts/sections/setup/PartiesSetupPanel.jsx"), /actions=\{canWrite \?/);
  const pulse = read("src/features/accounts/components/AccOverviewWidgets.jsx");
  assert.match(pulse, /\.\.\.\(canWrite \? \[\s+\{ label: "Record sale"/);
});

test("dashboard labels the cash paid out, not the amount financed", () => {
  const section = read("src/features/finance/components/DashboardFinanceSection.jsx");
  assert.match(section, /kind === "daily" \? "Paid to customers" : "Principal lent"/);
  assert.doesNotMatch(section, /label="Amount financed" value=\{money\(financed\)\}/);
});

test("customer portal shows the portal ID, not the internal account id", () => {
  const view = read("src/features/finance/CustomerAccountView.jsx");
  assert.match(view, /Your portal ID: \{loan\.portalId/);
  assert.doesNotMatch(view, /Your finance ID: \{loan\.id\}/);
});

test("viewers parked on Counter while the role loads are moved to Overview", () => {
  const product = read("src/features/accounts/AccountingProduct.jsx");
  assert.match(product, /parkedOnCounterRef\.current = true/);
  assert.match(product, /if \(parkedOnCounterRef\.current\) \{/);
});
