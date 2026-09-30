import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateItemizedGst,
  currentStockForItem,
  itemizedEntryDraft,
  itemPurchasesReport,
  itemSalesReport,
  mapVoucherItemLinesForRpc,
  normalizeItemLine,
  parseLineDiscount,
  stockStatus,
  supportsItemLines,
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
  assert.equal(draft.itemLines[0].itemName, "Cement 50kg");
  assert.equal(draft.itemLines[0].itemId, "i1");
  assert.equal(draft.itemLines[0].item_name, undefined);
  assert.ok(draft.totals.total > draft.totals.taxable);
  assert.ok(draft.gstLines.length >= 1);
});

test("rejects invalid item lines", () => {
  assert.match(validateItemLines([]), /at least one/i);
  assert.match(validateItemLines([{ itemId: "a", itemName: "A", quantity: 0, rate: 10 }]), /quantity/i);
  assert.match(validateItemLines([{ itemId: "a", itemName: "A", quantity: 1, rate: 10, discount: "11" }]), /more than the line amount/i);
  assert.match(validateItemLines([{ itemId: "a", itemName: "A", quantity: 1, rate: 10, discount: "-1" }]), /negative/i);
  assert.match(validateItemLines([{ itemId: "a", itemName: "A", quantity: 1, rate: 10, discount: "abc" }]), /amount or a percent/i);
});

test("same item may appear on several lines (e.g. free goods, different rates)", () => {
  assert.equal(validateItemLines([
    { itemId: "a", itemName: "A", quantity: 1, rate: 10 },
    { itemId: "a", itemName: "A", quantity: 2, rate: 0 },
  ]), "");
});

test("line discount accepts rupees or percent and reduces taxable value before GST", () => {
  assert.equal(parseLineDiscount("", 1000), 0);
  assert.equal(parseLineDiscount("50", 1000), 50);
  assert.equal(parseLineDiscount("10%", 1000), 100);
  assert.equal(parseLineDiscount(" 2.5 % ", 1000), 25);
  const line = normalizeItemLine({ itemName: "A", quantity: 10, rate: 100, discount: "10%" });
  assert.equal(line.amount, 1000);
  assert.equal(line.discountAmount, 100);
  assert.equal(line.netAmount, 900);

  const agg = aggregateItemizedGst([
    { itemName: "A", quantity: 10, rate: 100, discount: "10%", gstRate: 18 },
  ], { intra: true });
  assert.equal(agg.taxable, 900);
  assert.equal(agg.cgst, 81);
  assert.equal(agg.sgst, 81);
  assert.equal(agg.lines[0].discountAmount, 100);
  assert.equal(agg.lines[0].taxableAmount, 900);
});

test("saved lines keep their stored discount amount", () => {
  const line = normalizeItemLine({ itemName: "A", quantity: 2, rate: 100, discountAmount: 30 });
  assert.equal(line.discountAmount, 30);
  assert.equal(line.netAmount, 170);
});

test("itemized sale draft carries discount through to item lines and ledger", () => {
  const draft = itemizedEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-09-06",
    partyId: "p1",
    settlement: "credit",
    intra: true,
    gstEnabled: true,
    itemLines: [
      { itemId: "i1", itemName: "Cement", quantity: 10, rate: 100, discount: "100", gstRate: 18, itemType: "product" },
    ],
  });
  assert.equal(draft.itemLines[0].amount, 1000);
  assert.equal(draft.itemLines[0].discountAmount, 100);
  assert.equal(draft.itemLines[0].taxableAmount, 900);
  assert.equal(draft.lines.find(line => line.code === "4300").credit, 900);
  assert.equal(draft.lines.find(line => line.code === "1100").debit, 1062);
  assert.equal(mapVoucherItemLinesForRpc(draft.itemLines)[0].discount_amount, 100);
});

test("itemized credit note (sales return) reverses sales and GST against the customer", () => {
  const draft = itemizedEntryDraft({
    kind: "credit_note",
    accounts,
    date: "2026-09-06",
    partyId: "c1",
    intra: true,
    gstEnabled: true,
    itemLines: [
      { itemId: "i1", itemName: "Cement", quantity: 2, rate: 100, gstRate: 18, itemType: "product" },
    ],
  });
  assert.equal(draft.voucherType, "credit_note");
  assert.equal(draft.dueDate, null);
  assert.equal(draft.narration, "Sales return");
  const debit = draft.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = draft.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  assert.equal(debit, credit);
  assert.equal(draft.lines.find(line => line.code === "4300").debit, 200);
  assert.equal(draft.lines.find(line => line.code === "1100").credit, 236);
  assert.equal(draft.lines.find(line => line.code === "1100").partyId, "c1");
  assert.equal(draft.itemLines[0].quantity, 2);
});

test("itemized debit note (purchase return) reverses purchase against the supplier", () => {
  const draft = itemizedEntryDraft({
    kind: "debit_note",
    accounts,
    date: "2026-09-06",
    partyId: "s1",
    itemLines: [
      { itemId: "i1", itemName: "Cement", quantity: 3, rate: 50, itemType: "product" },
    ],
  });
  assert.equal(draft.voucherType, "debit_note");
  assert.equal(draft.lines.find(line => line.code === "5110").credit, 150);
  assert.equal(draft.lines.find(line => line.code === "2100").debit, 150);
});

test("itemized returns require the party", () => {
  assert.throws(() => itemizedEntryDraft({
    kind: "credit_note",
    accounts,
    date: "2026-09-06",
    itemLines: [{ itemId: "i1", itemName: "Cement", quantity: 1, rate: 100 }],
  }), /customer/i);
  assert.throws(() => itemizedEntryDraft({
    kind: "debit_note",
    accounts,
    date: "2026-09-06",
    itemLines: [{ itemId: "i1", itemName: "Cement", quantity: 1, rate: 100 }],
  }), /supplier/i);
});

test("item sales and purchase reports are net of returns", () => {
  const vouchers = [
    { id: "s", voucherType: "sales", status: "posted", date: "2026-09-01" },
    { id: "cn", voucherType: "credit_note", status: "posted", date: "2026-09-02" },
    { id: "p", voucherType: "purchase", status: "posted", date: "2026-09-01" },
    { id: "dn", voucherType: "debit_note", status: "posted", date: "2026-09-02" },
    { id: "cnx", voucherType: "credit_note", status: "cancelled", date: "2026-09-03" },
  ];
  const lines = [
    { voucherId: "s", itemId: "i1", itemName: "Cement", quantity: 10, taxableAmount: 1000 },
    { voucherId: "cn", itemId: "i1", itemName: "Cement", quantity: 2, taxableAmount: 200 },
    { voucherId: "cnx", itemId: "i1", itemName: "Cement", quantity: 5, taxableAmount: 500 },
    { voucherId: "p", itemId: "i1", itemName: "Cement", quantity: 20, taxableAmount: 1400 },
    { voucherId: "dn", itemId: "i1", itemName: "Cement", quantity: 4, taxableAmount: 280 },
  ];
  const [sales] = itemSalesReport(lines, vouchers);
  assert.equal(sales.quantity, 8);
  assert.equal(sales.amount, 800);
  assert.equal(sales.returnedQuantity, 2);
  const [purchases] = itemPurchasesReport(lines, vouchers);
  assert.equal(purchases.quantity, 16);
  assert.equal(purchases.amount, 1120);
});

test("supportsItemLines covers sales, purchases and both return notes", () => {
  assert.equal(supportsItemLines("sale"), true);
  assert.equal(supportsItemLines("purchase"), true);
  assert.equal(supportsItemLines("credit_note"), true);
  assert.equal(supportsItemLines("debit_note"), true);
  assert.equal(supportsItemLines("expense"), false);
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

test("RPC item-line mapper accepts camelCase and snake_case", () => {
  const fromCamel = mapVoucherItemLinesForRpc([
    { itemId: "i1", itemName: "Widget", quantity: 2, rate: 50, gstRate: 18, itemType: "product" },
  ]);
  assert.equal(fromCamel[0].item_id, "i1");
  assert.equal(fromCamel[0].item_name, "Widget");
  assert.equal(fromCamel[0].quantity, 2);
  const fromSnake = mapVoucherItemLinesForRpc([
    { item_id: "i2", item_name: "Service", quantity: 1, rate: 100, gst_rate: 18, item_type: "service" },
  ]);
  assert.equal(fromSnake[0].item_id, "i2");
  assert.equal(fromSnake[0].item_name, "Service");
  assert.equal(fromSnake[0].item_type, "service");
});
