import test from "node:test";
import assert from "node:assert/strict";

import { monthlyInterestOnBalance, dailyInstallmentAmount } from "../src/features/finance/calculations.js";

test("monthly interest uses the monthly percent, not annual/12", () => {
  assert.equal(monthlyInterestOnBalance(100000, 3), 3000);
  assert.equal(Math.round(100000 * 3 / 1200), 250);
});

test("daily installment is collection/100, not ceil, so 100 days match the total", () => {
  assert.equal(dailyInstallmentAmount(10000), 100);
  assert.equal(dailyInstallmentAmount(10050), 100.5);
  assert.equal(dailyInstallmentAmount(10001), 100.01);
  assert.notEqual(dailyInstallmentAmount(10050), Math.ceil(10050 / 100));
  assert.equal(dailyInstallmentAmount(10050) * 100, 10050);
  assert.equal(dailyInstallmentAmount(0), 0);
});
