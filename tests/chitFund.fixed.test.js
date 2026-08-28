import test from "node:test";
import assert from "node:assert/strict";
import {
  fixedChitMonth,
  fixedChitSchedule,
  fixedCommissionFromPercent,
  fixedCommissionPercentFromAmount,
  formatFixedManagerCommissionSummary,
  normalizeFixedCommissionAmount,
  resolveFixedManagerCommission,
  validateFixedChit,
} from "../src/features/chitFund/fixedChit.js";

const example = {
  chitValue: 100000,
  memberCount: 20,
  durationMonths: 20,
  monthlyContribution: 5000,
  commissionAmount: 5000,
  initialLiftAmount: 95000,
  monthlyLiftIncrement: 1000,
};

test("generates the required 20-month Fixed Chit lift sequence", () => {
  assert.deepEqual(
    fixedChitSchedule(example).map(row => row.liftAmount),
    [95000, 96000, 97000, 98000, 99000, 100000, 101000, 102000, 103000, 104000, 105000, 106000, 107000, 108000, 109000, 110000, 111000, 112000, 113000, 114000],
  );
});

test("calculates Fixed Chit payment obligations from the lift month", () => {
  assert.equal(fixedChitMonth({ ...example, month: 1 }).totalRemainingPayment, 114000);
  assert.deepEqual(fixedChitMonth({ ...example, month: 5 }), {
    month: 5,
    liftAmount: 99000,
    monthlyPayment: 6000,
    remainingMonths: 15,
    totalRemainingPayment: 90000,
  });
  assert.equal(fixedChitMonth({ ...example, month: 20 }).totalRemainingPayment, 0);
});

test("accepts manager commission as a percent of chit value", () => {
  assert.equal(fixedCommissionFromPercent(100000, 5), 5000);
  assert.equal(fixedCommissionPercentFromAmount(100000, 5000), "5");
  assert.deepEqual(validateFixedChit({ ...example, commissionPercent: 5 }).commissionAmount, 5000);
  assert.throws(() => validateFixedChit({ ...example, commissionPercent: 101 }), /percentage/);
});

test("resolves fixed manager commission from scheme amount or lift schedule", () => {
  assert.equal(normalizeFixedCommissionAmount(100000, 5), 5000);
  assert.equal(normalizeFixedCommissionAmount(100000, 5000), 5000);
  assert.equal(normalizeFixedCommissionAmount(10000, 50), 50);
  assert.deepEqual(resolveFixedManagerCommission({ chitValue: 100000, fixedCommissionAmount: 5000 }), {
    amount: 5000,
    percent: "5",
  });
  assert.deepEqual(resolveFixedManagerCommission({
    chitValue: 100000,
    fixedCommissionAmount: 5,
  }), {
    amount: 5000,
    percent: "5",
  });
  assert.deepEqual(resolveFixedManagerCommission({
    chitValue: 100000,
    fixedCommissionAmount: null,
    lifts: [{ manager_commission: 5 }],
  }), {
    amount: 5000,
    percent: "5",
  });
  assert.equal(
    formatFixedManagerCommissionSummary({ chitValue: 100000, fixedCommissionAmount: 5 }, value => `Rs.${value}`),
    "Rs.5000 / month · 5% of chit value",
  );
});

test("validates configuration without using Auction Chit calculations", () => {
  assert.equal(validateFixedChit(example).schedule.length, 20);
  assert.throws(() => fixedChitMonth({ ...example, month: 0 }), /Invalid Fixed Chit month/);
  assert.throws(() => fixedChitMonth({ ...example, month: 21 }), /Invalid Fixed Chit month/);
  assert.throws(() => validateFixedChit({ ...example, monthlyContribution: 5001 }), /must equal chit value/);
  assert.throws(() => validateFixedChit({ ...example, monthlyLiftIncrement: -1 }), /increment/);
  assert.throws(() => validateFixedChit({ ...example, durationMonths: 21 }), /Duration/);
});
