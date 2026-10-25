import test from "node:test";
import assert from "node:assert/strict";
import {
  canViewItemProfitability,
  filterItemProfit,
  grossMarginPercent,
  itemProfitability,
  itemProfitTotals,
  pageItemProfit,
} from "../src/features/accounts/model/itemProfitability.js";

const cement = { id: "i1", itemType: "product", name: "Cement", sku: "CEM", unit: "Bag", categoryId: "cat", purchasePrice: 350, openingRate: 300, openingStock: 10, reorderLevel: 0 };
const lines = [
  { id: "p1", voucherId: "pv", itemId: "i1", quantity: 10, rate: 330, amount: 3300, discountAmount: 0, taxableAmount: 3300 },
  { id: "s1", voucherId: "sv", itemId: "i1", quantity: 15, rate: 420, amount: 6300, taxableAmount: 6300 },
  { id: "pr1", voucherId: "prv", itemId: "i1", quantity: 2, rate: 330, amount: 660, taxableAmount: 660 },
];
const movements = [
  { id: "m1", itemId: "i1", movementDate: "2026-04-01", quantityDelta: 10, reason: "opening", createdBy: "user-1" },
  { id: "m2", itemId: "i1", movementDate: "2026-04-10", quantityDelta: 10, reason: "purchase", voucherId: "pv", voucherItemLineId: "p1", voucherNumber: "P-1" },
  { id: "m3", itemId: "i1", movementDate: "2026-04-20", quantityDelta: -15, reason: "sale", voucherId: "sv", voucherItemLineId: "s1", voucherNumber: "S-1" },
];
const vouchers = [
  { id: "pv", voucherType: "purchase", voucherNumber: "P-1", date: "2026-04-10", status: "posted", partyId: "s" },
  { id: "sv", voucherType: "sales", voucherNumber: "S-1", date: "2026-04-20", status: "posted", partyId: "c" },
];
const parties = [{ id: "c", name: "Ravi" }, { id: "s", name: "Yard" }];
const april = { from: "2026-04-01", to: "2026-04-30" };

const reportFor = (extra = {}) => itemProfitability({
  items: [cement],
  movements,
  voucherItemLines: lines,
  vouchers,
  parties,
  ...april,
  ...extra,
}).rows[0];

test("gross margin is blank when revenue is zero", () => {
  assert.equal(grossMarginPercent(10, 0), null);
  assert.equal(grossMarginPercent(1575, 6300), 25);
});

test("one purchase and one sale use weighted-average cost", () => {
  const row = reportFor();
  assert.equal(row.quantitySold, 15);
  assert.equal(row.revenue, 6300);
  assert.equal(row.cogs, 4725);
  assert.equal(row.grossProfit, 1575);
  assert.equal(row.marginPercent, 25);
  assert.equal(row.averageSellingPrice, 420);
  assert.equal(row.averageCostPrice, 315);
  assert.equal(row.averagePurchasePrice, 330);
  assert.equal(row.stockQuantity, 5);
  assert.equal(row.stockValue, 1575);
  assert.equal(row.reconciled, true);
  assert.equal(row.invoices[0].partyName, "Ravi");
  assert.equal(row.invoices[0].profit, 1575);
  assert.equal(row.ledger.at(-1).balance, 5);
  assert.equal(row.ledger[0].recorded, true);
});

test("a discounted purchase sets the cost used for profit", () => {
  const item = { id: "x", itemType: "product", name: "Paint", sku: "P", unit: "Nos", purchasePrice: 0, openingRate: 0 };
  const row = itemProfitability({
    items: [item],
    movements: [
      { id: "a", itemId: "x", movementDate: "2026-05-01", quantityDelta: 10, reason: "purchase", voucherId: "p", voucherItemLineId: "p9", voucherNumber: "P-9" },
      { id: "b", itemId: "x", movementDate: "2026-05-02", quantityDelta: -4, reason: "sale", voucherId: "s", voucherItemLineId: "s9", voucherNumber: "S-9" },
    ],
    voucherItemLines: [
      { id: "p9", voucherId: "p", itemId: "x", quantity: 10, taxableAmount: 900, amount: 1000, discountAmount: 100 },
      { id: "s9", voucherId: "s", itemId: "x", quantity: 4, taxableAmount: 800, amount: 800, discountAmount: 40 },
    ],
    vouchers: [
      { id: "p", voucherType: "purchase", voucherNumber: "P-9", date: "2026-05-01", status: "posted" },
      { id: "s", voucherType: "sales", voucherNumber: "S-9", date: "2026-05-02", status: "posted" },
    ],
    from: "2026-05-01",
    to: "2026-05-31",
  }).rows[0];
  assert.equal(row.cogs, 360);
  assert.equal(row.revenue, 800);
  assert.equal(row.grossProfit, 440);
  assert.equal(row.averagePurchasePrice, 90);
});

test("a sales return reduces revenue and cost", () => {
  const row = reportFor({
    movements: [
      ...movements,
      { id: "m4", itemId: "i1", movementDate: "2026-04-21", quantityDelta: 3, reason: "sales_return", voucherId: "cn", voucherItemLineId: "c1", voucherNumber: "CN-1" },
    ],
    voucherItemLines: [...lines, { id: "c1", voucherId: "cn", itemId: "i1", quantity: 3, taxableAmount: 1260, amount: 1260 }],
    vouchers: [...vouchers, { id: "cn", voucherType: "credit_note", voucherNumber: "CN-1", date: "2026-04-21", status: "posted", partyId: "c" }],
  });
  assert.equal(row.quantitySold, 12);
  assert.equal(row.revenue, 5040);
  assert.equal(row.cogs, 3780);
  assert.equal(row.grossProfit, 1260);
  assert.equal(row.returnedQuantity, 3);
  assert.equal(row.stockQuantity, 8);
  assert.equal(row.reconciled, true);
});

test("a purchase return and an adjustment stay out of gross profit", () => {
  const row = reportFor({
    movements: [
      ...movements,
      { id: "m5", itemId: "i1", movementDate: "2026-04-22", quantityDelta: -2, reason: "purchase_return", voucherId: "prv", voucherItemLineId: "pr1", voucherNumber: "PR-1" },
      { id: "m6", itemId: "i1", movementDate: "2026-04-23", quantityDelta: -1, reason: "adjustment", note: "Count" },
    ],
    vouchers: [...vouchers, { id: "prv", voucherType: "debit_note", voucherNumber: "PR-1", date: "2026-04-22", status: "posted" }],
  });
  assert.equal(row.grossProfit, 1575);
  assert.equal(row.flow.purchaseReturn, 2);
  assert.equal(row.flow.adjustmentOut, 1);
  assert.equal(row.stockQuantity, 2);
  assert.equal(row.reconciled, true);
});

test("opening stock before the period is brought forward", () => {
  const row = reportFor({ from: "2026-05-01", to: "2026-05-31" });
  assert.equal(row.openingQuantity, 5);
  assert.equal(row.quantitySold, 0);
  assert.equal(row.revenue, 0);
  assert.equal(row.marginPercent, null);
  assert.equal(row.grossProfit, 0);
  assert.equal(row.stockQuantity, 5);
  assert.equal(row.reconciled, true);
});

test("a cancelled sale is left out of profit and flagged", () => {
  const row = reportFor({
    vouchers: vouchers.map(voucher => voucher.id === "sv" ? { ...voucher, status: "cancelled" } : voucher),
  });
  assert.equal(row.revenue, 0);
  assert.equal(row.cogs, 0);
  assert.equal(row.stockQuantity, 5);
  assert.equal(row.warnings.some(warning => warning.code === "cancelled"), true);
});

test("zero cost, negative stock, duplicates, missing references, and backdated rows are warnings", () => {
  const item = { id: "z", itemType: "product", name: "Free", sku: "Z", unit: "Nos", purchasePrice: 0, openingRate: 0 };
  const row = itemProfitability({
    items: [item],
    movements: [
      { id: "1", itemId: "z", movementDate: "2026-04-02", quantityDelta: -2, reason: "sale", voucherItemLineId: "same", createdAt: "2026-04-10T00:00:00Z" },
      { id: "2", itemId: "z", movementDate: "2026-04-03", quantityDelta: -1, reason: "sale", voucherItemLineId: "same" },
    ],
    voucherItemLines: [{ id: "same", voucherId: "sv", itemId: "z", quantity: 2, taxableAmount: 50, amount: 50 }],
    vouchers: [{ id: "sv", voucherType: "sales", voucherNumber: "S-2", date: "2026-04-02", status: "posted" }],
    from: "2026-04-01",
    to: "2026-04-30",
  }).rows[0];
  assert.equal(row.cogs, 0);
  assert.equal(row.grossProfit, 50);
  assert.equal(row.stockQuantity < 0, true);
  const codes = row.warnings.map(warning => warning.code);
  assert.ok(codes.includes("zero_cost"));
  assert.ok(codes.includes("negative"));
  assert.ok(codes.includes("duplicate"));
  assert.ok(codes.includes("backdated"));
  const missing = itemProfitability({
    items: [item],
    movements: [{ id: "bare", itemId: "z", movementDate: "2026-04-04", quantityDelta: -1, reason: "sale" }],
    voucherItemLines: [],
    vouchers: [],
    from: "2026-04-01",
    to: "2026-04-30",
  }).rows[0];
  assert.equal(missing.warnings.some(warning => warning.code === "missing_reference"), true);
});

test("another company's item is ignored", () => {
  const rows = itemProfitability({
    items: [cement],
    movements: [...movements, { id: "other", itemId: "i9", movementDate: "2026-04-02", quantityDelta: -4, reason: "sale" }],
    voucherItemLines: [...lines, { id: "o1", voucherId: "ov", itemId: "i9", quantity: 4, taxableAmount: 999, amount: 999 }],
    vouchers: [...vouchers, { id: "ov", voucherType: "sales", voucherNumber: "S-9", date: "2026-04-02", status: "posted" }],
    ...april,
  }).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].revenue, 6300);
});

test("filters, sort, and pagination keep totals on the full filtered list", () => {
  const items = Array.from({ length: 55 }, (_, index) => ({ id: `n${index}`, itemType: "product", name: `Item ${String(index).padStart(2, "0")}`, sku: `S${index}`, unit: "Nos", categoryId: index % 2 ? "a" : "b", purchasePrice: 10 }));
  const voucherItemLines = items.map((item, index) => ({ id: `l${index}`, voucherId: "sv", itemId: item.id, quantity: 1, taxableAmount: index + 1, amount: index + 1 }));
  const movements = items.map((item, index) => ({ id: `m${index}`, itemId: item.id, movementDate: "2026-04-02", quantityDelta: -1, reason: "sale", voucherId: "sv", voucherItemLineId: `l${index}`, voucherNumber: "S-1" }));
  const rows = itemProfitability({
    items,
    movements,
    voucherItemLines,
    vouchers: [{ id: "sv", voucherType: "sales", voucherNumber: "S-1", date: "2026-04-02", status: "posted" }],
    from: "2026-04-01",
    to: "2026-04-30",
  }).rows;
  const filtered = filterItemProfit(rows, { categoryId: "b", search: "item", sort: "profit" });
  assert.equal(filtered.length, 28);
  assert.equal(filtered.every(row => row.categoryId === "b"), true);
  const totals = itemProfitTotals(filtered);
  assert.equal(totals.count, 28);
  assert.equal(totals.revenue, filtered.reduce((sum, row) => sum + row.revenue, 0));
  const many = pageItemProfit(filterItemProfit(rows, { sort: "revenue" }), 2);
  assert.equal(many.items.length, 5);
  assert.equal(many.from, 51);
  assert.notEqual(itemProfitTotals(many.items).revenue, itemProfitTotals(rows).revenue);
  assert.equal(itemProfitTotals(rows).count, 55);
});

test("profitability is hidden from a collection agent", () => {
  assert.equal(canViewItemProfitability({ workspaceRole: "staff", accountsRole: "owner" }), false);
  assert.equal(canViewItemProfitability({ workspaceRole: "owner", accountsRole: "viewer" }), true);
  assert.equal(canViewItemProfitability({ workspaceRole: "owner", accountsRole: "accountant" }), true);
  assert.equal(canViewItemProfitability({ workspaceRole: "owner", accountsRole: null }), false);
});
