import test from "node:test";
import assert from "node:assert/strict";
import {
  costItemMovements,
  itemOpeningRate,
  periodStockValues,
  physicalCountVariances,
  stockAgeing,
  stockValuation,
} from "../src/features/accounts/inventoryValuation.js";
import { parseItemCsv, planItemImport, ITEM_CSV_TEMPLATE } from "../src/features/accounts/itemCsvImport.js";

const cement = { id: "i1", itemType: "product", name: "Cement", sku: "CEM", unit: "Bag", purchasePrice: 350, openingRate: 300, openingStock: 10 };
const lines = [
  { id: "p1", quantity: 10, rate: 330, amount: 3300, discountAmount: 0, taxableAmount: 3300 },
  { id: "s1", quantity: 15, rate: 420, amount: 6300, taxableAmount: 6300 },
  { id: "pr1", quantity: 2, rate: 330, amount: 660, taxableAmount: 660 },
];
const movements = [
  { id: "m1", itemId: "i1", movementDate: "2026-04-01", quantityDelta: 10, reason: "opening" },
  { id: "m2", itemId: "i1", movementDate: "2026-04-10", quantityDelta: 10, reason: "purchase", voucherItemLineId: "p1" },
  { id: "m3", itemId: "i1", movementDate: "2026-04-20", quantityDelta: -15, reason: "sale", voucherItemLineId: "s1" },
];

test("opening rate falls back to purchase price", () => {
  assert.equal(itemOpeningRate(cement), 300);
  assert.equal(itemOpeningRate({ purchasePrice: 350 }), 350);
  assert.equal(itemOpeningRate({ purchasePrice: 350, openingRate: 0 }), 0);
});

test("weighted average: opening + purchase, sale issues at average", () => {
  const result = costItemMovements(cement, movements, lines);
  // (10 × 300 + 10 × 330) / 20 = 315; 5 left
  assert.equal(result.quantity, 5);
  assert.equal(result.averageCost, 315);
  assert.equal(result.value, 1575);
  assert.equal(result.movements[2].unitCost, 315);
  assert.equal(result.lastInDate, "2026-04-10");
});

test("valuation is date-aware", () => {
  assert.equal(costItemMovements(cement, movements, lines, { asOf: "2026-04-05" }).value, 3000);
  assert.equal(costItemMovements(cement, movements, lines, { asOf: "2026-04-15" }).value, 6300);
});

test("purchase cost uses the net (after-discount, pre-GST) line value", () => {
  const discounted = [{ id: "p9", quantity: 10, rate: 100, amount: 1000, discountAmount: 100, taxableAmount: 900 }];
  const result = costItemMovements(
    { id: "x", itemType: "product", purchasePrice: 0 },
    [{ id: "a", itemId: "x", movementDate: "2026-05-01", quantityDelta: 10, reason: "purchase", voucherItemLineId: "p9" }],
    discounted,
  );
  assert.equal(result.averageCost, 90);
  assert.equal(result.value, 900);
});

test("returns and reversals keep value consistent", () => {
  const withReturns = [
    ...movements,
    { id: "m4", itemId: "i1", movementDate: "2026-04-21", quantityDelta: 3, reason: "sales_return" },
    { id: "m5", itemId: "i1", movementDate: "2026-04-22", quantityDelta: -2, reason: "purchase_return", voucherItemLineId: "pr1" },
  ];
  const result = costItemMovements(cement, withReturns, lines);
  // 5 @315 + 3 @315 = 8 @315 (2520); purchase return 2 @330 → 6 left, 1860
  assert.equal(result.quantity, 6);
  assert.equal(result.value, 1860);

  const reversed = [
    ...movements,
    { id: "m6", itemId: "i1", movementDate: "2026-04-20", createdAt: "z", quantityDelta: 15, reason: "reversal", voucherItemLineId: "s1" },
  ];
  const undone = costItemMovements(cement, reversed, lines);
  assert.equal(undone.quantity, 20);
  assert.equal(undone.value, 6300);
});

test("legacy items without movement rows use opening stock", () => {
  const result = costItemMovements({ ...cement, id: "legacy", openingStockDate: "2026-04-01" }, [], []);
  assert.equal(result.quantity, 10);
  assert.equal(result.value, 3000);
});

test("stock valuation totals and skips services", () => {
  const report = stockValuation({
    items: [cement, { id: "svc", itemType: "service", name: "Delivery" }],
    movements,
    voucherItemLines: lines,
  });
  assert.equal(report.rows.length, 1);
  assert.equal(report.totalValue, 1575);
  assert.equal(report.itemsInStock, 1);
});

test("period stock values: opening at period start, closing at period end", () => {
  const april = periodStockValues({ items: [cement], movements, voucherItemLines: lines, from: "2026-04-01", to: "2026-04-30" });
  // Item-master opening dated inside the period counts as opening stock.
  assert.equal(april.openingStock, 3000);
  assert.equal(april.closingStock, 1575);
  const may = periodStockValues({ items: [cement], movements, voucherItemLines: lines, from: "2026-05-01", to: "2026-05-31" });
  assert.equal(may.openingStock, 1575);
  assert.equal(may.closingStock, 1575);
  assert.equal(periodStockValues({ items: [], movements: [] }).hasStock, false);
});

test("stock ageing uses first-in-first-out layers", () => {
  const report = stockAgeing({ items: [cement], movements, voucherItemLines: lines, asOf: "2026-08-01" });
  // Sale of 15 consumed all 10 opening + 5 of the purchase; 5 left from 2026-04-10 (113 days).
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].oldestDays, 113);
  assert.equal(report.rows[0].d91_180, 1575);
  assert.equal(report.totals.d0_30, 0);
});

test("physical count returns only variances", () => {
  const variances = physicalCountVariances({
    items: [cement, { id: "i2", itemType: "product", name: "Sand", purchasePrice: 50 }],
    movements,
    voucherItemLines: lines,
    counts: { i1: "4", i2: "" },
    date: "2026-04-30",
  });
  assert.equal(variances.length, 1);
  assert.equal(variances[0].quantityDelta, -1);
  assert.equal(variances[0].valueImpact, -315);
  assert.throws(() => physicalCountVariances({ items: [cement], movements, counts: { i1: "-2" }, date: "2026-04-30" }), /valid counted/);
});

test("item CSV import parses the template and plans creates, duplicates and invalid rows", () => {
  const rows = parseItemCsv(ITEM_CSV_TEMPLATE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sku, "CEM-50");
  assert.equal(rows[0].unit, "Bag");
  assert.equal(rows[0].openingStock, "100");
  assert.equal(rows[0].openingRate, "340");
  assert.equal(rows[0].openingStockDate, "2026-04-01");
  assert.equal(rows[0].categoryName, "Construction");
  assert.equal(rows[1].itemType, "service");

  const csv = "Item name,Code,Unit,Sale price,Cost,Opening qty,Opening date\nSand,snd,kg,\"1,200\",900,5,01/04/2026\nNo code,,Nos,1,1,0,\n";
  const parsed = parseItemCsv(csv);
  assert.equal(parsed[0].sku, "SND");
  assert.equal(parsed[0].unit, "Kg");
  assert.equal(parsed[0].sellingPrice, "1200");
  assert.equal(parsed[0].openingStockDate, "2026-04-01");

  const plan = planItemImport([...rows, ...parsed, rows[0]], [{ sku: "dlv" }]);
  assert.deepEqual(plan.toCreate.map(row => row.sku), ["CEM-50", "SND"]);
  assert.deepEqual(plan.duplicates.map(row => row.sku), ["DLV", "CEM-50"]);
  assert.equal(plan.invalid.length, 1);
  assert.match(plan.invalid[0].error, /SKU/);
});
