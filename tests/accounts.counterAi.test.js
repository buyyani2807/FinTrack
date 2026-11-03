import test from "node:test";
import assert from "node:assert/strict";
import {
  counterDayCloseCoach,
  counterStockAlerts,
  counterTillAnomalies,
} from "../src/features/accounts/model/counterAi.js";

const items = [
  { id: "i1", name: "Paint", itemType: "product", unit: "Tin", sellingPrice: 1000, reorderLevel: 5 },
  { id: "i2", name: "Brush", itemType: "product", unit: "Nos", sellingPrice: 50, reorderLevel: 0 },
];

test("stock alerts warn when bill exceeds on-hand and when cover is short", () => {
  const alerts = counterStockAlerts({
    items,
    stockByItem: { i1: 2, i2: 4 },
    lines: [
      { itemId: "i1", itemName: "Paint", quantity: "3", rate: "1000" },
      { itemId: "i2", itemName: "Brush", quantity: "1", rate: "50" },
    ],
    stockMovements: [
      { itemId: "i2", movementDate: "2026-10-25", reason: "sale", quantityDelta: -14 },
      { itemId: "i2", movementDate: "2026-10-28", reason: "sale", quantityDelta: -14 },
      { itemId: "i2", movementDate: "2026-11-01", reason: "sale", quantityDelta: -14 },
    ],
    today: "2026-11-03",
  });
  assert.ok(alerts.some(row => row.id === "stock-short-i1"));
  // remaining 3 after bill, daily ≈ 3 → about 1 day of cover
  assert.ok(alerts.some(row => row.id === "stock-cover-i2"));
});

test("till anomalies flag low rate and same-amount repeat within minutes", () => {
  const now = Date.parse("2026-11-03T10:05:00.000Z");
  const alerts = counterTillAnomalies({
    items,
    lines: [{ itemId: "i1", itemName: "Paint", quantity: "1", rate: "500" }],
    vouchers: [{
      id: "v1",
      voucherNumber: "SALE-000001",
      date: "2026-11-03",
      sourceType: "pos_counter",
      status: "posted",
      narration: "Counter sale · Till 1 · Cash",
      postedAt: "2026-11-03T10:02:00.000Z",
      lines: [
        { debit: 500, credit: 0 },
        { debit: 0, credit: 500 },
      ],
    }],
    tillLabel: "Till 1",
    today: "2026-11-03",
    now,
    cartTotal: 500,
  });
  assert.ok(alerts.some(row => row.id === "rate-low-i1"));
  assert.ok(alerts.some(row => row.id === "dup-amount-500" && row.severity === "high"));
});

test("day-close coach keeps UPI and card out of the drawer explanation", () => {
  const tips = counterDayCloseCoach({
    report: {
      sales: 1000,
      tender: { cash: 400, upi: 300, card: 300, total: 1000 },
    },
    openingFloat: 100,
    countedCash: 450,
    expectedCash: 500,
    variance: -50,
  });
  assert.ok(tips.some(row => row.id === "close-summary" && /UPI/.test(row.detail) && /Card/.test(row.detail)));
  assert.ok(tips.some(row => row.id === "close-short"));
  assert.equal(tips.some(row => /fraud|theft/i.test(`${row.title} ${row.detail}`)), false);
});
