import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBillDiscountToLines,
  cashChangeDue,
  counterEstimateTotal,
  counterLineNet,
  counterOversellLines,
  fefoLotsForItem,
} from "../src/features/accounts/model/counterBillMath.js";

test("line discount accepts rupees or percent", () => {
  assert.equal(counterLineNet({ quantity: 2, rate: 100, unit: "Nos", discount: "20" }), 180);
  assert.equal(counterLineNet({ quantity: 2, rate: 100, unit: "Nos", discount: "10%" }), 180);
});

test("bill discount prorates onto lines without inventing negative stock", () => {
  const lines = [
    { itemId: "a", itemName: "A", quantity: 1, rate: 100, unit: "Nos", discount: "" },
    { itemId: "b", itemName: "B", quantity: 1, rate: 300, unit: "Nos", discount: "" },
  ];
  const next = applyBillDiscountToLines(lines, "40");
  assert.equal(counterLineNet(next[0]) + counterLineNet(next[1]), 360);
  assert.equal(Number(next[0].discount) + Number(next[1].discount), 40);
});

test("FEFO sorts lots by earliest expiry and skips expired", () => {
  const items = [
    { id: "1", name: "Syrup", sku: "S-A", expiryDate: "2026-12-01", isActive: true },
    { id: "2", name: "Syrup", sku: "S-B", expiryDate: "2026-11-10", isActive: true },
    { id: "3", name: "Syrup", sku: "S-C", expiryDate: "2026-01-01", isActive: true },
  ];
  const lots = fefoLotsForItem(items[0], items, { today: "2026-11-05" });
  assert.deepEqual(lots.map(row => row.id), ["2", "1"]);
});

test("cash change due is tendered minus total", () => {
  assert.equal(cashChangeDue("500", 336), 164);
  assert.equal(cashChangeDue("", 100), null);
  assert.equal(cashChangeDue("50", 100), -50);
});

test("oversell lines flag qty above stock and skip services", () => {
  const items = [
    { id: "p", name: "Paint", itemType: "product", unit: "Nos" },
    { id: "s", name: "Fit", itemType: "service", unit: "Nos" },
  ];
  const bad = counterOversellLines(
    [
      { itemId: "p", quantity: 5, unit: "Nos", sellUnit: "Nos" },
      { itemId: "s", quantity: 9, unit: "Nos", sellUnit: "Nos" },
    ],
    { p: 2, s: 0 },
    items,
  );
  assert.equal(bad.length, 1);
  assert.equal(bad[0].itemId, "p");
  assert.equal(bad[0].need, 5);
  assert.equal(bad[0].stock, 2);
});

test("estimate total includes GST after discounts", () => {
  const totals = counterEstimateTotal(
    [{ itemId: "a", itemName: "A", quantity: 1, rate: 100, unit: "Nos", discount: "0", gstRate: 18 }],
    { gstEnabled: true, intra: true },
  );
  assert.equal(totals.taxable, 100);
  assert.equal(totals.tax, 18);
  assert.equal(totals.total, 118);
});
