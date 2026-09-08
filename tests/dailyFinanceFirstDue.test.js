import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  dailyCollectionPendingOn,
  dailyFirstDueDate,
  isDailyCollectionDueOn,
} from "../src/features/finance/loanState.js";
import { buildAttentionCenter } from "../src/features/intelligence/attentionCenter.js";
import {
  calculateFintrackCreditScore,
  dailyInstallments,
} from "../src/features/creditScore/creditScoreModel.js";
import { buildDailyFinanceFacts } from "../src/features/finance/financeIntelligence.js";

const start = "2026-09-08";
const tomorrow = addDays(start, 1);

const sameDayLoan = (overrides = {}) => ({
  id: "d-new",
  customerName: "Sai Buyyani",
  kind: "daily",
  status: "active",
  startDate: start,
  dailyCollection: 100,
  collectionAmount: 10000,
  transactions: [],
  ...overrides,
});

test("Daily Finance first due date is the calendar day after start", () => {
  assert.equal(dailyFirstDueDate(start), tomorrow);
  assert.equal(isDailyCollectionDueOn(sameDayLoan(), start), false);
  assert.equal(isDailyCollectionDueOn(sameDayLoan(), tomorrow), true);
  assert.equal(dailyCollectionPendingOn(sameDayLoan(), start), false);
  assert.equal(dailyCollectionPendingOn(sameDayLoan(), tomorrow), true);
});

test("same-day Daily Finance creation is not unpaid in Attention Center", () => {
  const center = buildAttentionCenter({
    today: start,
    dailyLoans: [sameDayLoan()],
  });
  assert.equal(center.items.some(item => item.id === "daily-unpaid-d-new"), false);
  assert.equal(center.count, 0);
});

test("Attention Center flags unpaid only after first due date", () => {
  const center = buildAttentionCenter({
    today: tomorrow,
    dailyLoans: [sameDayLoan()],
  });
  assert.ok(center.items.some(item => item.id === "daily-unpaid-d-new"));
});

test("same-day Daily Finance creation has no credit-score penalty", () => {
  const loan = sameDayLoan();
  assert.deepEqual(dailyInstallments(loan, start), []);
  const result = calculateFintrackCreditScore({ loans: [loan], asOf: start });
  assert.equal(result.summary.missed, 0);
  assert.equal(result.summary.late, 0);
  assert.equal(result.summary.onTime, 0);
});

test("eligibility and expected collection begin tomorrow", () => {
  const loan = sameDayLoan();
  const sameDayFacts = buildDailyFinanceFacts([loan], { asOf: start, isOwner: true });
  assert.equal(sameDayFacts.expectedToday, 0);
  assert.equal(sameDayFacts.pendingCount, 0);
  assert.equal(sameDayFacts.pendingCustomers.length, 0);

  const nextDayFacts = buildDailyFinanceFacts([loan], { asOf: tomorrow, isOwner: true });
  assert.equal(nextDayFacts.expectedToday, 100);
  assert.equal(nextDayFacts.pendingCount, 1);
  assert.equal(nextDayFacts.pendingCustomers[0].id, "d-new");
});
