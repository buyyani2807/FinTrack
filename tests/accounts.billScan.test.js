import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBillScan, purchaseFormFromBill } from "../src/features/accounts/model/billScan.js";
import handler, { readFailure } from "../api/accounts/bill-scan.js";

const parties = [
  { id: "s1", name: "City Supplies", partyType: "supplier", gstin: "29ABCDE1234F1Z5", isActive: true, creditDays: 15 },
  { id: "c1", name: "City Supplies", partyType: "customer", gstin: "29ABCDE1234F1Z5", isActive: true },
];
const items = [
  { id: "i1", name: "Primer", sku: "PR-1", itemType: "product", unit: "Litre", gstRate: "18", hsnSac: "3208", isActive: true },
];

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
