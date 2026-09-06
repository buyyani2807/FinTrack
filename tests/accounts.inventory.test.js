import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateItemizedGst,
  currentStockForItem,
  itemizedEntryDraft,
  stockStatus,
  validateItemForm,
  validateItemLines,
} from "../src/features/accounts/inventoryModel.js";

const accounts = [
  { id: "cash", code: "1000", name: "Cash", accountType: "cash", groupType: "asset" },
  { id: "ar", code: "1100", name: "Accounts Receivable", accountType: "receivable", groupType: "asset" },
  { id: "ap", code: "2100", name: "Accounts Payable", accountType: "payable", groupType: "liability" },
  { id: "sales", code: "4300", name: "Sales", accountType: "income", groupType: "income" },
  { id: "purchase", code: "5110", name: "Purchase", accountType: "expense", groupType: "expense" },
  { id: "ocgst", code: "2210", name: "Output CGST", accountType: "tax", groupType: "liability" },
  { id: "osgst", code: "2211", name: "Output SGST", accountType: "tax", groupType: "liability" },
  { id: "oigst", code: "2212", name: "Output IGST", accountType: "tax", groupType: "liability" },
  { id: "icgst", code: "1140", name: "Input CGST", accountType: "tax", groupType: "asset" },
  { id: "isgst", code: "1141", name: "Input SGST", accountType: "tax", groupType: "asset" },
  { id: "iigst", code: "1142", name: "Input IGST", accountType: "tax", groupType: "asset" },
];

test("item form validation requires name and sku", () => {
  assert.match(validateItemForm({ name: "", sku: "CEM" }), /name/i);
  assert.match(validateItemForm({ name: "Cement", sku: "" }), /SKU/i);
  assert.equal(validateItemForm({
    name: "Cement 50kg",
    sku: "CEM-50",
    itemType: "product",
    unit: "Bag",
    sellingPrice: 420,
    purchasePrice: 350,
    gstRate: 28,
    openingStock: 100,
  }), "");
});

test("stock is opening plus movements and flags low stock", () => {
  const item = { id: "i1", itemType: "product", openingStock: 100, reorderLevel: 50 };
  assert.equal(currentStockForItem(item, []), 100);
  assert.equal(currentStockForItem(item, [
    { itemId: "i1", quantityDelta: 100, reason: "opening" },
    { itemId: "i1", quantityDelta: 50, reason: "purchase" },
    { itemId: "i1", quantityDelta: -20, reason: "sale" },
  ]), 130);
  assert.equal(stockStatus(35, 50), "low");
  assert.equal(stockStatus(130, 50), "normal");
  assert.equal(currentStockForItem({ id: "s1", itemType: "service" }, []), null);
});

test("itemized sale draft keeps double-entry balanced with GST", () => {
  const draft = itemizedEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-09-06",
    partyId: "p1",
    settlement: "credit",
    narration: "Credit sale",
    intra: false,
    gstEnabled: true,
    itemLines: [
      { itemId: "i1", itemName: "Cement 50kg", quantity: 20, rate: 420, gstRate: 28, hsnSac: "2523", itemType: "product", unit: "Bag" },
    ],
  });
  const debit = draft.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = draft.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  assert.equal(debit, credit);
  assert.equal(draft.voucherType, "sales");
  assert.equal(draft.itemLines.length, 1);
  assert.ok(draft.totals.total > draft.totals.taxable);
  assert.ok(draft.gstLines.length >= 1);
});

test("rejects invalid item lines", () => {
  assert.match(validateItemLines([]), /at least one/i);
  assert.match(validateItemLines([{ itemId: "a", itemName: "A", quantity: 0, rate: 10 }]), /quantity/i);
  assert.match(validateItemLines([
    { itemId: "a", itemName: "A", quantity: 1, rate: 10 },
    { itemId: "a", itemName: "A", quantity: 2, rate: 10 },
  ]), /Duplicate/i);
});

test("aggregate GST supports mixed lines", () => {
  const agg = aggregateItemizedGst([
    { itemName: "A", quantity: 1, rate: 100, gstRate: 18 },
    { itemName: "B", quantity: 2, rate: 50, gstRate: 5 },
  ], { intra: true });
  assert.equal(agg.taxable, 200);
  assert.ok(agg.cgst > 0);
  assert.ok(agg.sgst > 0);
  assert.equal(agg.igst, 0);
});
