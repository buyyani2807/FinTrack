import test from "node:test";
import assert from "node:assert/strict";
import {
  counterBrowseItems,
  counterSaleCounts,
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

test("stock alerts convert g↔kg sell units before comparing on-hand", () => {
  const dal = { id: "dal", name: "Toor Dal", itemType: "product", unit: "Kg", sellingPrice: 125, reorderLevel: 0 };
  const ok = counterStockAlerts({
    items: [dal],
    stockByItem: { dal: 100 },
    lines: [{ itemId: "dal", itemName: "Toor Dal", unit: "Kg", sellUnit: "Gram", quantity: "500", rate: "125" }],
    today: "2026-11-03",
  });
  assert.equal(ok.some(row => row.id === "stock-short-dal"), false);

  const short = counterStockAlerts({
    items: [dal],
    stockByItem: { dal: 0.2 },
    lines: [{ itemId: "dal", itemName: "Toor Dal", unit: "Kg", sellUnit: "Gram", quantity: "500", rate: "125" }],
    today: "2026-11-03",
  });
  assert.ok(short.some(row => row.id === "stock-short-dal" && /0\.5/.test(row.detail)));
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

test("sale counts cover the last 14 days of sales and deliveries only", () => {
  const counts = counterSaleCounts([
    { itemId: "i1", movementDate: "2026-11-10", reason: "sale", quantityDelta: -2 },
    { itemId: "i1", movementDate: "2026-11-12", reason: "delivery", quantityDelta: -1 },
    { itemId: "i1", movementDate: "2026-10-01", reason: "sale", quantityDelta: -9 },
    { itemId: "i2", movementDate: "2026-11-11", reason: "purchase", quantityDelta: 50 },
    { itemId: "i2", movementDate: "2026-11-11", reason: "sale", quantityDelta: 0 },
    { itemId: "i2", movementDate: "2026-11-16", reason: "sale", quantityDelta: -1 },
  ], { today: "2026-11-15" });
  assert.deepEqual(counts, { i1: 2 });
  assert.deepEqual(counterSaleCounts([{ itemId: "i1", movementDate: "2026-11-10", reason: "sale", quantityDelta: -2 }]), {});
});

test("default Counter list puts the most sold items first and keeps catalog order for the rest", () => {
  const catalog = [
    { id: "a", name: "Atta" },
    { id: "b", name: "Besan" },
    { id: "c", name: "Chana", isActive: false },
    { id: "d", name: "Dal" },
    { id: "e", name: "Elaichi" },
  ];
  const listed = counterBrowseItems(catalog, { d: 5, e: 5, c: 9, b: 1 });
  assert.deepEqual(listed.map(item => item.id), ["d", "e", "b", "a"]);
  assert.deepEqual(counterBrowseItems(catalog, {}, { limit: 2 }).map(item => item.id), ["a", "b"]);
});
