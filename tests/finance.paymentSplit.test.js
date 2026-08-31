import test from "node:test";
import assert from "node:assert/strict";
import { cashUpiSplit, cashUpiSplitIsValid } from "../src/features/finance/paymentSplit.js";

test("cash and upi modes put the full amount on one side", () => {
  assert.deepEqual(cashUpiSplit("cash", 5000, 1, 2), { cash: 5000, upi: 0 });
  assert.deepEqual(cashUpiSplit("upi", 5000, 1, 2), { cash: 0, upi: 5000 });
});

test("cash_upi keeps the entered split", () => {
  assert.deepEqual(cashUpiSplit("cash_upi", 5000, 2000, 3000), { cash: 2000, upi: 3000 });
});

test("cash_upi is invalid until both sides are positive and equal the total", () => {
  assert.equal(cashUpiSplitIsValid("cash_upi", 5000, 2000, 3000), true);
  assert.equal(cashUpiSplitIsValid("cash_upi", 5000, 5000, 0), false);
  assert.equal(cashUpiSplitIsValid("cash_upi", 5000, 0, 0), false);
  assert.equal(cashUpiSplitIsValid("cash", 5000, 0, 0), true);
});
