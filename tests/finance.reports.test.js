import test from "node:test";
import assert from "node:assert/strict";
import { buildProfitLossCsvRows, filterCollectionReportAccounts, filterProfitLossAccounts } from "../src/features/finance/reports.js";

const statusOf = loan => loan.status;
const loans = [
  { id: "d1", kind: "daily", status: "active", customerName: "Vamsee" },
  { id: "d2", kind: "daily", status: "closed", customerName: "Old Daily" },
  { id: "d3", kind: "daily", status: "bankrupt", customerName: "Lost Daily" },
  { id: "d4", kind: "daily", status: "overdue", customerName: "Late Daily" },
  { id: "m1", kind: "monthly", status: "active", customerName: "Meena" },
  { id: "m2", kind: "monthly", status: "closed", customerName: "Closed Monthly" },
];

test("collection report includes only active accounts", () => {
  const rows = filterCollectionReportAccounts(loans, { kind: "all", customer: "", statusOf });
  assert.deepEqual(rows.map(row => row.id), ["d1", "m1"]);
});

test("collection report daily filter still excludes non-active daily accounts", () => {
  const rows = filterCollectionReportAccounts(loans, { kind: "daily", customer: "", statusOf });
  assert.deepEqual(rows.map(row => row.id), ["d1"]);
});

test("collection report customer filter still keeps only active accounts", () => {
  const rows = filterCollectionReportAccounts(loans, { kind: "all", customer: "vam", statusOf });
  assert.deepEqual(rows.map(row => row.id), ["d1"]);
});

test("profit and loss report keeps the selected status filter", () => {
  const closed = filterProfitLossAccounts(loans, { kind: "all", status: "closed", customer: "", statusOf });
  assert.deepEqual(closed.map(row => row.id), ["d2", "m2"]);
  const named = filterProfitLossAccounts(loans, { kind: "monthly", status: "all", customer: "mee", statusOf });
  assert.deepEqual(named.map(row => row.id), ["m1"]);
});

test("profit and loss csv includes filters, totals, and detail rows", () => {
  const rows = buildProfitLossCsvRows([
    { customerName: "Vamsee", kindLabel: "Daily", statusLabel: "Active", invested: 8500, collected: 1800, outstanding: 6700, profit: 0, loss: 0 },
    { customerName: "Meena", kindLabel: "Monthly", statusLabel: "Closed", invested: 100000, collected: 12000, outstanding: 100000, profit: 12000, loss: 0 },
  ], { kind: "all", status: "all", customer: "", generatedOn: "2026-08-31" });
  assert.equal(rows[0][0], "FinTrack Profit & Loss Report");
  assert.deepEqual(rows[1], ["Generated on", "2026-08-31"]);
  assert.deepEqual(rows[2], ["Finance type", "Daily + Monthly"]);
  assert.deepEqual(rows[4], ["Customer filter", "All customers"]);
  assert.deepEqual(rows[5], ["Accounts in report", 2]);
  assert.deepEqual(rows[6], ["Paid to customers", 108500]);
  assert.deepEqual(rows[11], ["Net profit / loss", 12000]);
  assert.equal(rows[13][0], "Customer");
  assert.equal(rows[14][0], "Vamsee");
  assert.equal(rows[15][8], 12000);
  assert.deepEqual(rows[17], ["Total", "", "", 108500, 13800, 106700, 12000, 0, 12000]);
});
