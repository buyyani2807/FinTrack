import test from "node:test";
import assert from "node:assert/strict";
import { parseVoucherCsvRows, planVoucherImport, VOUCHER_CSV_TEMPLATE } from "../io/voucherCsvImport.js";

test("parseVoucherCsvRows groups template headers", () => {
  const lines = VOUCHER_CSV_TEMPLATE.split("\n");
  const headers = lines[0].split(",");
  const body = lines.slice(1).map(line => line.split(","));
  const rows = parseVoucherCsvRows(headers, body);
  assert.ok(rows.length >= 3);
  assert.equal(rows[0].type, "sale");
  assert.equal(rows[1].type, "purchase");
});

test("planVoucherImport flags missing party when create is off", () => {
  const rows = parseVoucherCsvRows(
    ["Type", "Date", "Party", "GSTIN", "Invoice number", "Amount", "Item", "Qty", "Rate", "GST %", "HSN", "Narration"],
    [["sale", "2026-09-01", "New Customer", "", "INV-1", "1000", "", "", "", "", "", ""]],
  );
  const plan = planVoucherImport(rows, {
    parties: [],
    items: [],
    vouchers: [],
    company: { id: "c1", gstRegistration: "none", stateCode: "29" },
    today: "2026-10-01",
    createMissingParties: false,
    companyId: "c1",
  });
  assert.equal(plan.counts.errors, 1);
  assert.match(plan.entries[0].errors[0], /No customer/);
});

test("planVoucherImport queues new party when create is on", () => {
  const rows = parseVoucherCsvRows(
    ["Type", "Date", "Party", "Amount"],
    [["purchase", "2026-09-02", "New Supplier", "500"]],
  );
  const plan = planVoucherImport(rows, {
    parties: [],
    accounts: [
      { id: "a1", code: "4000", name: "Sales", groupType: "income", accountType: "income", isActive: true },
      { id: "a2", code: "5000", name: "Purchases", groupType: "expense", accountType: "expense", isActive: true },
      { id: "a3", code: "1300", name: "Debtors", groupType: "asset", accountType: "receivable", isActive: true },
      { id: "a4", code: "2100", name: "Creditors", groupType: "liability", accountType: "payable", isActive: true },
    ],
    items: [],
    vouchers: [],
    company: { id: "c1", gstRegistration: "none", stateCode: "29" },
    today: "2026-10-01",
    createMissingParties: true,
    companyId: "c1",
  });
  assert.equal(plan.newParties.length, 1);
  assert.equal(plan.newParties[0].partyType, "supplier");
  assert.equal(plan.entries[0].partyRef, "BP1");
  assert.equal(plan.entries[0].status, "warning");
});
