import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOfflineReceiptInvoice,
  isLikelyNetworkError,
  nextOfflineReference,
  offlineChargeBlocked,
  pendingOfflineBills,
  OFFLINE_MAX_MS,
} from "../src/features/accounts/model/counterOffline.js";

test("offline references increment per calendar day", () => {
  assert.equal(nextOfflineReference("2026-11-03", []), "OFF-20261103-0001");
  assert.equal(
    nextOfflineReference("2026-11-03", ["OFF-20261103-0001", "OFF-20261103-0007"]),
    "OFF-20261103-0008",
  );
});

test("charge blocks only when pending bills exceed 48 hours", () => {
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  assert.equal(offlineChargeBlocked([], now).blocked, false);
  assert.equal(offlineChargeBlocked([{
    syncStatus: "pending",
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  }], now).blocked, false);
  const blocked = offlineChargeBlocked([{
    syncStatus: "pending",
    createdAt: new Date(now - OFFLINE_MAX_MS - 1000).toISOString(),
  }], now);
  assert.equal(blocked.blocked, true);
  assert.match(blocked.reason, /2 days/);
});

test("pending queue includes error bills and skips synced", () => {
  const rows = pendingOfflineBills([
    { id: "1", syncStatus: "pending" },
    { id: "2", syncStatus: "synced" },
    { id: "3", syncStatus: "error" },
  ]);
  assert.deepEqual(rows.map(row => row.id), ["1", "3"]);
});

test("network errors are detected for offline fallback", () => {
  assert.equal(isLikelyNetworkError({ message: "Failed to fetch" }), true);
  assert.equal(isLikelyNetworkError({ message: "Missing Sales account" }), false);
});

test("offline receipt invoice uses provisional number and no due date", () => {
  const invoice = buildOfflineReceiptInvoice({
    bill: {
      offlineRef: "OFF-20261103-0002",
      date: "2026-11-03",
      createdAt: "2026-11-03T10:00:00.000Z",
      moneyMode: "cash",
      amount: 4050,
      payload: {
        narration: "Counter sale · Till 1 · Cash",
        totals: { taxable: 3857.14, tax: 192.86, total: 4050 },
        itemLines: [{
          itemName: "Bat",
          quantity: 1,
          rate: 3857.14,
          taxableAmount: 3857.14,
          cgstAmount: 96.43,
          sgstAmount: 96.43,
          igstAmount: 0,
          gstRate: 5,
          unit: "Nos",
        }],
      },
    },
    companyName: "Buyyani Sports",
  });
  assert.equal(invoice.invoiceNumber, "OFF-20261103-0002");
  assert.equal(invoice.dueDate, "");
  assert.equal(invoice.documentTemplate, "thermal");
  assert.equal(invoice.taxable, 3857.14);
  assert.equal(invoice.cgst, 96.43);
  assert.equal(invoice.sgst, 96.43);
  assert.match(invoice.receiptFooter, /Offline/);
});
