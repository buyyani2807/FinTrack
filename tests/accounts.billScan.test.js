import test from "node:test";
import assert from "node:assert/strict";
import { markDuplicateInvoices, normalizeBillScan, purchaseFormFromBill, reviewBillScan } from "../src/features/accounts/model/billScan.js";
import { DEFAULT_CHART_OF_ACCOUNTS, buildVoucher, paymentLines } from "../src/features/accounts/model/accountingModel.js";
import handler, { modelCandidates, readFailure } from "../api/accounts/bill-scan.js";

const parties = [
  { id: "s1", name: "City Supplies", partyType: "supplier", gstin: "29ABCDE1234F1Z5", isActive: true, creditDays: 15 },
  { id: "c1", name: "City Supplies", partyType: "customer", gstin: "29ABCDE1234F1Z5", isActive: true },
];
const items = [
  { id: "i1", name: "Primer", sku: "PR-1", itemType: "product", unit: "Litre", gstRate: "18", hsnSac: "3208", isActive: true },
];

test("a new Gemini project uses a current flash model", () => {
  const models = modelCandidates("gemini-2.5-flash");
  assert.equal(models[0], "gemini-2.5-flash");
  assert.ok(models.includes("gemini-3.5-flash-lite"));
  assert.equal(models.includes("gemini-2.5-flash-lite"), false);
});

test("a rejected Gemini key is not described as a bad photo", () => {
  const message = readFailure(401, { error: { message: "API key not valid. Please pass a valid API key." } });
  assert.match(message, /Gemini key/);
  assert.equal(message.includes("clearer photo"), false);
});

test("bill scan route requires a signed-in user", async () => {
  let status = 0;
  const res = {
    status(code) { status = code; return this; },
    json() { return this; },
  };
  await handler({ method: "POST", headers: {}, body: {} }, res);
  assert.equal(status, 401);
});

test("a supplier bill becomes a purchase draft and does not invent a party or item", () => {
  const draft = purchaseFormFromBill({
    supplierName: "Unknown Paints",
    supplierGstin: "not-a-gstin",
    billNumber: "B-19",
    billDate: "08/09/2026",
    lines: [
      { name: "Initial Coat", quantity: 2, rate: 400, gstRate: 18 },
      { name: "", quantity: 1, rate: 10 },
    ],
  }, { parties, items, today: "2026-10-05" });

  assert.equal(draft.form.partyId, "");
  assert.equal(draft.form.date, "2026-09-08");
  assert.equal(draft.form.settlement, "credit");
  assert.equal(draft.form.entryMode, "items");
  assert.equal(draft.form.itemLines.length, 1);
  assert.equal(draft.form.itemLines[0].itemId, "");
  assert.equal(draft.form.itemLines[0].itemName, "Initial Coat");
  assert.equal(draft.form.itemLines[0].quantity, "2");
  assert.equal(draft.form.itemLines[0].rate, "400");
  assert.match(draft.form.narration, /B-19/);
  assert.match(draft.form.narration, /Unknown Paints/);
  assert.equal(draft.form.voucherId, undefined);
  assert.ok(draft.warnings.some(line => /Unknown Paints/.test(line)));
  assert.ok(draft.warnings.some(line => /Initial Coat/.test(line)));
});

test("gstin and item name fill the existing supplier and catalogue item", () => {
  const draft = purchaseFormFromBill({
    supplierName: "Someone else",
    supplierGstin: "29abcde1234f1z5",
    billDate: "2026-09-02",
    paid: true,
    lines: [{ name: "primer", quantity: "3", amount: 900, gstRate: 17.8, hsn: "3208" }],
  }, { parties, items, today: "2026-10-05" });

  assert.equal(draft.form.partyId, "s1");
  assert.equal(draft.form.settlement, "paid");
  assert.equal(draft.form.dueDate, "2026-09-17");
  assert.equal(draft.form.itemLines[0].itemId, "i1");
  assert.equal(draft.form.itemLines[0].rate, "300");
  assert.equal(draft.form.itemLines[0].gstRate, "18");
  assert.equal(draft.form.itemLines[0].unit, "Litre");
  assert.equal(draft.warnings.length, 0);
});

test("normalize drops unreadable lines and a future bill date is clamped by the form mapper", () => {
  const bill = normalizeBillScan({ lines: [{ description: "Putty", qty: 0, price: -5 }, { name: "  " }] });
  assert.equal(bill.lines.length, 1);
  assert.equal(bill.lines[0].name, "Putty");
  assert.equal(bill.lines[0].quantity, 1);
  assert.equal(bill.lines[0].rate, 0);
  const draft = purchaseFormFromBill({
    supplierName: "City Supplies",
    billDate: "2026-12-01",
    lines: [{ name: "Putty", quantity: 1, rate: 50 }],
  }, { parties, items, today: "2026-10-05" });
  assert.equal(draft.form.date, "2026-10-05");
  assert.equal(draft.form.partyId, "s1");
});

test("a bill review lists missing fields, a duplicate, GST class, and an expense ledger without posting", () => {
  const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));
  const rent = buildVoucher({
    voucherType: "payment",
    voucherNumber: "PMT-000002",
    date: "2026-09-07",
    lines: paymentLines({ accounts, cash: 6000, expenseCode: "5000" }),
    narration: "Rent for September",
    partyId: "s1",
  });
  const duplicate = {
    status: "posted",
    partyId: "s1",
    voucherNumber: "PUR-000010",
    date: "2026-09-02",
    narration: "Bill INV-4412",
  };
  const cancelled = { ...duplicate, status: "cancelled", voucherNumber: "PUR-000009" };
  const otherParty = { ...duplicate, partyId: "other", voucherNumber: "PUR-000008" };
  const review = reviewBillScan({
    documentKind: "receipt",
    supplierName: "Rent",
    billNumber: "INV-4412",
    billDate: "2026-10-01",
    paymentStatus: "paid",
    total: 6000,
    lines: [],
  }, {
    parties,
    items,
    today: "2026-10-05",
    companyState: "29",
    vouchers: [rent, duplicate, cancelled, otherParty],
    accounts,
  });

  assert.equal(review.documentLabel, "Receipt");
  assert.equal(review.confidence, "medium");
  assert.deepEqual(review.missing, ["Line items"]);
  assert.equal(review.duplicate.voucherNumber, "PUR-000010");
  assert.equal(review.expense.expenseCode, "5000");
  assert.equal(review.expense.amount, 6000);
  assert.match(review.gst.label, /missing/);
  assert.equal(review.draft.form.voucherId, undefined);
  assert.equal(review.draft.form.partyId, "");
  assert.ok(review.draft.warnings.some(line => /PUR-000010/.test(line)));
  assert.ok(review.draft.warnings.some(line => /receipt/.test(line)));

  const intra = reviewBillScan({
    documentKind: "invoice",
    supplierName: "City Supplies",
    supplierGstin: "29ABCDE1234F1Z5",
    billNumber: "INV-9001",
    billDate: "2026-09-02",
    paymentStatus: "unpaid",
    lines: [{ name: "primer", quantity: 3, amount: 900, gstRate: 18 }],
  }, { parties, items, today: "2026-10-05", companyState: "29", vouchers: [], accounts });
  assert.equal(intra.confidence, "high");
  assert.deepEqual(intra.missing, []);
  assert.equal(intra.duplicate, null);
  assert.equal(intra.supplier.id, "s1");
  assert.equal(intra.gst.supply, "intra");
  assert.equal(intra.draft.form.itemLines[0].itemId, "i1");

  const inter = reviewBillScan({
    supplierGstin: "29ABCDE1234F1Z5",
    supplierName: "City Supplies",
    billNumber: "B19",
    billDate: "2026-09-02",
    paymentStatus: "paid",
    lines: [{ name: "primer", quantity: 1, rate: 10, gstRate: 18 }],
  }, {
    parties,
    items,
    today: "2026-10-05",
    companyState: "36",
    vouchers: [duplicate],
    accounts,
  });
  assert.equal(inter.gst.supply, "inter");
  assert.equal(inter.duplicate, null);
});

test("the same supplier, date, and amount is a duplicate purchase even without an invoice number", () => {
  const purchase = number => ({
    status: "posted",
    voucherType: "purchase",
    voucherNumber: number,
    date: "2026-09-15",
    partyId: "s1",
    narration: "",
    lines: [{ debit: 12614.8 }, { credit: 12614.8 }],
  });
  const review = reviewBillScan({
    supplierName: "City Supplies",
    supplierGstin: "29ABCDE1234F1Z5",
    billDate: "2026-09-15",
    paymentStatus: "unpaid",
    total: 12614.8,
    lines: [{ name: "Initial Coatings", quantity: 1, rate: 10690.51, gstRate: 18 }],
  }, {
    parties,
    items,
    today: "2026-10-06",
    vouchers: [purchase("PUR-000002"), purchase("PUR-000003"), purchase("PUR-000004")],
  });
  assert.deepEqual(review.duplicates.map(row => row.voucherNumber), ["PUR-000002", "PUR-000003", "PUR-000004"]);
  assert.match(review.draft.warnings[0], /PUR-000002, PUR-000003, PUR-000004/);

  const different = reviewBillScan({
    supplierName: "City Supplies",
    supplierGstin: "29ABCDE1234F1Z5",
    billDate: "2026-09-15",
    paymentStatus: "unpaid",
    total: 500,
    lines: [],
  }, { parties, items, today: "2026-10-06", vouchers: [purchase("PUR-000002")] });
  assert.equal(different.duplicate, null);
  const marked = markDuplicateInvoices([
    { id: "a", reference: "PUR-000002", partyId: "s1", partyName: "Initial Coatings", invoiceDate: "2026-09-15", amount: 12614.8 },
    { id: "b", reference: "PUR-000003", partyId: "s1", partyName: "Initial Coatings", invoiceDate: "2026-09-15", amount: 12614.8 },
    { id: "c", reference: "PUR-000004", partyId: "s1", partyName: "Initial Coatings", invoiceDate: "2026-09-15", amount: 12614.8 },
  ]);
  assert.equal(marked.find(row => row.reference === "PUR-000002").possibleDuplicate, undefined);
  assert.equal(marked.find(row => row.reference === "PUR-000003").possibleDuplicate, true);
  assert.equal(marked.find(row => row.reference === "PUR-000004").possibleDuplicate, true);
});
