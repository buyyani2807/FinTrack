import test from "node:test";
import assert from "node:assert/strict";
import {
  monthlyComponentsMatch,
  paymentExceedsRemaining,
  remainingCollectable,
} from "../src/features/finance/paymentLimits.js";

test("monthly interest + principal + penalty must equal the total", () => {
  assert.equal(monthlyComponentsMatch(1500, 1000, 400, 100), true);
  assert.equal(monthlyComponentsMatch(1500, 1000, 400, 0), false);
  assert.equal(monthlyComponentsMatch(100.5, 50.25, 50.25, 0), true);
});

test("daily remaining collection excludes a payment being edited", () => {
  const loan = {
    kind: "daily",
    collectionAmount: 10000,
    transactions: [
      { id: "p1", amount: 100 },
      { id: "p2", amount: 200 },
    ],
  };
  assert.equal(remainingCollectable(loan), 9700);
  assert.equal(remainingCollectable(loan, { excludePaymentId: "p2" }), 9900);
  assert.equal(paymentExceedsRemaining(loan, { amount: 9700 }), false);
  assert.equal(paymentExceedsRemaining(loan, { amount: 9700.01 }), true);
});

test("monthly remaining principal caps extra repayment", () => {
  const loan = {
    kind: "monthly",
    principal: 100000,
    transactions: [{ id: "p1", principalAmount: 20000, interestAmount: 3000 }],
  };
  assert.equal(remainingCollectable(loan), 80000);
  assert.equal(paymentExceedsRemaining(loan, { principalAmount: 80000 }), false);
  assert.equal(paymentExceedsRemaining(loan, { principalAmount: 80000.01 }), true);
  assert.equal(paymentExceedsRemaining(loan, { principalAmount: 90000, excludePaymentId: "p1" }), false);
});
