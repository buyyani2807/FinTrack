import test from "node:test";
import assert from "node:assert/strict";

import { monthlyInterestOnBalance, dailyInstallmentAmount, monthlyRateOnDate, rateChangesAfterEdit } from "../src/features/finance/calculations.js";

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

test("monthly rate on a date uses the latest rate_changes row, not a later account rate", () => {
  const loan = {
    annualRate: 4,
    rateChanges: [
      { effectiveDate: "2026-01-01", annualRate: 3 },
      { effectiveDate: "2026-08-31", annualRate: 4 },
    ],
  };
  assert.equal(monthlyRateOnDate(loan, "2026-03-15"), 3);
  assert.equal(monthlyRateOnDate(loan, "2026-08-30"), 3);
  assert.equal(monthlyRateOnDate(loan, "2026-08-31"), 4);
  assert.equal(monthlyRateOnDate({ annualRate: 3, rateChanges: [] }, "2026-08-31"), 3);
});

test("editing the monthly rate seeds history and applies the new rate from today", () => {
  const next = rateChangesAfterEdit({
    startDate: "2026-01-15",
    currentRate: 3,
    rateChanges: [],
    nextRate: 4,
    effectiveDate: "2026-08-31",
  });
  assert.deepEqual(next, [
    { effectiveDate: "2026-01-15", annualRate: 3 },
    { effectiveDate: "2026-08-31", annualRate: 4 },
  ]);
  const loan = { annualRate: 4, rateChanges: next };
  assert.equal(monthlyRateOnDate(loan, "2026-02-15"), 3);
  assert.equal(monthlyRateOnDate(loan, "2026-08-31"), 4);
});

test("same-day rate edit updates today's row and does not seed history when start is today", () => {
  const first = rateChangesAfterEdit({
    startDate: "2026-08-31",
    currentRate: 3,
    rateChanges: [],
    nextRate: 4,
    effectiveDate: "2026-08-31",
  });
  assert.deepEqual(first, [{ effectiveDate: "2026-08-31", annualRate: 4 }]);
  const second = rateChangesAfterEdit({
    startDate: "2026-01-15",
    currentRate: 4,
    rateChanges: [
      { effectiveDate: "2026-01-15", annualRate: 3 },
      { effectiveDate: "2026-08-31", annualRate: 4 },
    ],
    nextRate: 3.5,
    effectiveDate: "2026-08-31",
  });
  assert.deepEqual(second, [
    { effectiveDate: "2026-01-15", annualRate: 3 },
    { effectiveDate: "2026-08-31", annualRate: 3.5 },
  ]);
});
