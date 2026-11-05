import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBillDiscountToLines,
  counterEstimateTotal,
  counterLineNet,
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

test("estimate total includes GST after discounts", () => {
  const totals = counterEstimateTotal(
    [{ itemId: "a", itemName: "A", quantity: 1, rate: 100, unit: "Nos", discount: "0", gstRate: 18 }],
    { gstEnabled: true, intra: true },
  );
  assert.equal(totals.taxable, 100);
  assert.equal(totals.tax, 18);
  assert.equal(totals.total, 118);
});
