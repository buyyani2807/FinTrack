import test from "node:test";
import assert from "node:assert/strict";

import { monthlyInterestOnBalance, dailyInstallmentAmount, monthlyRateOnDate, rateChangesAfterEdit } from "../src/features/finance/model/calculations.js";
import { nextMonthlyPayment } from "../src/features/receipts/model/receiptModel.js";
import { monthlyCollectionDue } from "../src/features/finance/model/loanState.js";

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

test("an early interest payment clears the coming monthly reminder", () => {
  const loan = {
    kind: "monthly",
    status: "active",
    startDate: "2026-09-08",
    principal: 100000,
    annualRate: 1,
    rateChanges: [],
    transactions: [],
  };
  const unpaid = nextMonthlyPayment(loan, "2026-10-03");
  assert.equal(unpaid.dueDate, "2026-10-08");
  assert.equal(unpaid.amount, 1000);
  assert.equal(unpaid.daysRemaining, 5);

  const paidEarly = nextMonthlyPayment({
    ...loan,
    transactions: [{ date: "2026-10-03", interestAmount: 1000, principalAmount: 0 }],
  }, "2026-10-03");
  assert.equal(paidEarly.dueDate, "2026-11-08");

  const partial = nextMonthlyPayment({
    ...loan,
    transactions: [{ date: "2026-10-03", interestAmount: 400, principalAmount: 0 }],
  }, "2026-10-03");
  assert.equal(partial.dueDate, "2026-10-08");
  assert.equal(partial.amount, 600);
});

test("monthly collections stay collected after this month's interest is paid", () => {
  const loan = {
    kind: "monthly",
    status: "active",
    startDate: "2026-09-08",
    principal: 100000,
    annualRate: 1,
    rateChanges: [],
    transactions: [],
  };
  assert.deepEqual(monthlyCollectionDue(loan, "2026-10-03"), { amount: 1000, pending: true, settled: false });
  assert.deepEqual(monthlyCollectionDue({
    ...loan,
    transactions: [{ date: "2026-10-02", interestAmount: 1000, principalAmount: 0 }],
  }, "2026-10-07"), { amount: 0, pending: false, settled: true });
});
