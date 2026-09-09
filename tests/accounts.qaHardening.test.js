import test from "node:test";
import assert from "node:assert/strict";
import {
  assertChartOpeningsBalanced,
  chartOpeningTotals,
  financialYearContaining,
  newClientRequestId,
} from "../src/features/accounts/accountingModel.js";
import { itemPurchasesReport, itemSalesReport } from "../src/features/accounts/inventoryModel.js";
import { EINVOICE_INTEGRATION_STUB } from "../src/features/accounts/gstPrepExport.js";

test("non-April financial year ends on the day before next FY start", () => {
  const fy = financialYearContaining("2026-07-15", 7);
  assert.equal(fy.from, "2026-07-01");
  assert.equal(fy.to, "2027-06-30");
});

test("chart openings must balance debit and credit", () => {
  const unbalanced = [
    { id: "1", openingBalance: 1000, openingSide: "debit" },
    { id: "2", openingBalance: 400, openingSide: "credit" },
  ];
  assert.equal(chartOpeningTotals(unbalanced).balanced, false);
  assert.throws(() => assertChartOpeningsBalanced(unbalanced), /unbalanced/i);
  assert.doesNotThrow(() => assertChartOpeningsBalanced([
    { id: "1", openingBalance: 1000, openingSide: "debit" },
    { id: "2", openingBalance: 1000, openingSide: "credit" },
  ]));
});

test("client request ids are UUID-shaped", () => {
  assert.match(newClientRequestId(), /^[0-9a-f-]{36}$/i);
});

test("item sales and purchase reports ignore reversed and cancelled vouchers", () => {
  const vouchers = [
    { id: "v1", voucherType: "sales", status: "posted", date: "2026-09-01" },
    { id: "v2", voucherType: "sales", status: "reversed", date: "2026-09-02" },
    { id: "v3", voucherType: "sales", status: "cancelled", date: "2026-09-03" },
    { id: "v4", voucherType: "purchase", status: "posted", date: "2026-09-01" },
    { id: "v5", voucherType: "purchase", status: "reversed", date: "2026-09-02" },
  ];
  const lines = [
    { voucherId: "v1", itemId: "i1", itemName: "Laptop", quantity: 2, taxableAmount: 100 },
    { voucherId: "v2", itemId: "i1", itemName: "Laptop", quantity: 9, taxableAmount: 900 },
    { voucherId: "v3", itemId: "i1", itemName: "Laptop", quantity: 5, taxableAmount: 500 },
    { voucherId: "v4", itemId: "i1", itemName: "Laptop", quantity: 3, taxableAmount: 300 },
    { voucherId: "v5", itemId: "i1", itemName: "Laptop", quantity: 7, taxableAmount: 700 },
  ];
  const sales = itemSalesReport(lines, vouchers);
  assert.equal(sales.length, 1);
  assert.equal(sales[0].quantity, 2);
  const purchases = itemPurchasesReport(lines, vouchers);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].quantity, 3);
});

test("e-invoice stub documents prep-only marketing claim", () => {
  assert.equal(EINVOICE_INTEGRATION_STUB.enabled, false);
  assert.match(EINVOICE_INTEGRATION_STUB.note, /not implemented/i);
  assert.match(EINVOICE_INTEGRATION_STUB.marketingClaim, /preparation/i);
});
