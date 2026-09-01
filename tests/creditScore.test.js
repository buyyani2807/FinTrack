import test from "node:test";
import assert from "node:assert/strict";
import {
  GAUGE_SEGMENTS,
  SCORE_WEIGHTS,
  addDays,
  calculateFintrackCreditScore,
  dailyInstallments,
  hasEnoughHistory,
  scoreBand,
  scoreToGaugeAngle,
} from "../src/features/creditScore/creditScoreModel.js";

const asOf = "2026-08-30";

const dailyLoan = ({ payments = [], startDate = "2026-07-01", status = "active", extra = {} } = {}) => ({
  id: extra.id || "D1",
  kind: "daily",
  startDate,
  dailyCollection: 1000,
  collectionAmount: 100000,
  disbursedAmount: 85000,
  status,
  transactions: payments.map((item, index) => ({
    id: `p${index}`,
    date: item.date,
    amount: item.amount ?? 1000,
  })),
  ...extra,
});

const monthlyLoan = ({ payments = [], startDate = "2026-01-15", status = "active", extra = {} } = {}) => ({
  id: extra.id || "M1",
  kind: "monthly",
  startDate,
  principal: 100000,
  annualRate: 10,
  status,
  rateChanges: [],
  transactions: payments.map((item, index) => ({
    id: `m${index}`,
    date: item.date,
    interestAmount: item.interest ?? 10000,
    principalAmount: item.principal ?? 0,
    penaltyAmount: 0,
  })),
  ...extra,
});

const onTimeDaily = (collectionStart, days) =>
  Array.from({ length: days }, (_, index) => ({ date: addDays(collectionStart, index + 1), amount: 1000 }));

test("weights total 100%", () => {
  const total = Object.values(SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0);
  assert.equal(Number(total.toFixed(2)), 1);
});

test("scoreBand maps requested ranges", () => {
  assert.equal(scoreBand(742).label, "Good");
  assert.equal(scoreBand(800).label, "Excellent");
  assert.equal(scoreBand(620).label, "Needs Attention");
  assert.equal(scoreBand(500).label, "High Risk");
});

test("gauge colours and labels match score bands", () => {
  const byId = Object.fromEntries(GAUGE_SEGMENTS.map(item => [item.id, item]));
  assert.equal(byId.high_risk.label, "HIGH RISK");
  assert.equal(byId.high_risk.color, "#ff7373");
  assert.equal(byId.excellent.label, "EXCELLENT");
  assert.equal(byId.excellent.color, "#4fd08d");
});

test("gauge needle stays inside the matching score band", () => {
  const poor = scoreToGaugeAngle(580);
  const fair = scoreToGaugeAngle(620);
  const excellent = scoreToGaugeAngle(820);
  assert.ok(poor >= 180 && poor <= 216, `580 should sit in High Risk, got ${poor}`);
  assert.ok(fair >= 216 && fair <= 252, `620 should sit in Needs Attention, got ${fair}`);
  assert.ok(excellent >= 324 && excellent <= 360, `820 should sit in EXCELLENT, got ${excellent}`);
  assert.ok(poor < fair && fair < excellent);
});

test("scenario 1: every daily installment on time is Excellent", () => {
  const result = calculateFintrackCreditScore({
    loans: [dailyLoan({ payments: onTimeDaily("2026-07-01", 61) })],
    asOf,
  });
  assert.equal(result.available, true);
  assert.ok(result.score >= 750, `expected Excellent, got ${result.score}`);
  assert.equal(result.rating, "Excellent");
  assert.equal(result.summary.missed, 0);
  assert.equal(result.summary.late, 0);
});

test("scenario 2: a couple of missed daily collections only reduce the score slightly", () => {
  const payments = onTimeDaily("2026-08-01", 30).filter((_, index) => index !== 6 && index !== 13);
  const missed = calculateFintrackCreditScore({ loans: [dailyLoan({ startDate: "2026-08-01", payments })], asOf });
  const perfect = calculateFintrackCreditScore({
    loans: [dailyLoan({ startDate: "2026-08-01", payments: onTimeDaily("2026-08-01", 30) })],
    asOf,
  });
  assert.ok(missed.available && perfect.available);
  assert.ok(missed.score < perfect.score);
  assert.ok(perfect.score - missed.score <= 65, `drop too large: ${perfect.score - missed.score}`);
  assert.ok(missed.score >= 780);
  assert.equal(missed.summary.missed, 2);
  assert.equal(missed.summary.late, 0);
});

test("scenario 3: frequent missed daily collections cause a moderate reduction", () => {
  const payments = onTimeDaily("2026-08-01", 30).filter((_, index) => index % 2 === 0);
  const result = calculateFintrackCreditScore({ loans: [dailyLoan({ startDate: "2026-08-01", payments })], asOf });
  assert.ok(result.score < 750);
  assert.ok(result.score >= 550);
  assert.ok(result.summary.missed >= 8);
  assert.equal(result.summary.late, 0);
});

test("scenario 4: multiple missed payments significantly reduce the score", () => {
  const payments = onTimeDaily("2026-08-01", 30).filter((_, index) => index % 4 !== 0);
  const result = calculateFintrackCreditScore({ loans: [dailyLoan({ startDate: "2026-08-01", payments })], asOf });
  assert.ok(result.summary.missed >= 4);
  assert.ok(result.score < 700);
});

test("scenario 5: split payments completed before due date stay on time", () => {
  const loan = dailyLoan({
    startDate: "2026-08-20",
    payments: [
      { date: "2026-08-21", amount: 500 },
      { date: "2026-08-21", amount: 500 },
      { date: "2026-08-22", amount: 1000 },
      { date: "2026-08-23", amount: 400 },
      { date: "2026-08-23", amount: 600 },
      { date: "2026-08-24", amount: 1000 },
      { date: "2026-08-25", amount: 1000 },
      ...onTimeDaily("2026-08-25", 6),
    ],
  });
  const rows = dailyInstallments(loan, asOf);
  assert.ok(rows.slice(0, 5).every(row => row.status === "on_time"));
  const result = calculateFintrackCreditScore({ loans: [loan], asOf });
  assert.equal(result.available, true);
  assert.equal(result.summary.missed, 0);
});

test("scenario 6: partial payment on a due date stays partial, not a duplicate miss", () => {
  const loan = dailyLoan({
    startDate: "2026-08-20",
    payments: [
      { date: "2026-08-21", amount: 500 },
      { date: "2026-08-22", amount: 1000 },
      { date: "2026-08-23", amount: 1000 },
      { date: "2026-08-24", amount: 1000 },
      ...onTimeDaily("2026-08-24", 7),
    ],
  });
  const first = dailyInstallments(loan, asOf)[0];
  assert.equal(first.dueDate, "2026-08-21");
  assert.equal(first.status, "partial");
  const result = calculateFintrackCreditScore({ loans: [loan], asOf });
  assert.ok(result.summary.missed === 0);
});

test("scenario 7: bankrupt account is a significant negative, not a zero score", () => {
  const result = calculateFintrackCreditScore({
    loans: [dailyLoan({
      payments: onTimeDaily("2026-07-01", 20),
      status: "bankrupt",
      extra: { lossAmount: 40000 },
    })],
    asOf,
  });
  const healthy = calculateFintrackCreditScore({
    loans: [dailyLoan({ payments: onTimeDaily("2026-07-01", 20) })],
    asOf,
  });
  assert.ok(result.available);
  assert.ok(result.score < healthy.score);
  assert.ok(result.score >= 300);
  assert.ok(result.negatives.some(item => /bankrupt/i.test(item)));
});

test("scenario 8: completed accounts contribute positively", () => {
  const completed = dailyLoan({
    payments: onTimeDaily("2026-04-01", 20),
    startDate: "2026-04-01",
    extra: { id: "D-old", collectionAmount: 20000 },
  });
  const active = dailyLoan({
    payments: onTimeDaily("2026-08-20", 11),
    startDate: "2026-08-20",
    extra: { id: "D-new" },
  });
  const withHistory = calculateFintrackCreditScore({ loans: [completed, active], asOf, focusLoanId: "D-new" });
  const without = calculateFintrackCreditScore({ loans: [active], asOf });
  assert.ok(withHistory.summary.completedAccounts >= 1);
  assert.ok(withHistory.score >= without.score);
});

test("scenario 9: new customer has no score", () => {
  const result = calculateFintrackCreditScore({
    loans: [dailyLoan({ startDate: "2026-08-29", payments: [{ date: "2026-08-30", amount: 1000 }] })],
    asOf,
  });
  assert.equal(result.available, false);
  assert.match(result.message, /sufficient payment activity/i);
  assert.equal(hasEnoughHistory([]), false);
});

test("scenario 10: recent on-time behavior improves a poor history", () => {
  const start = "2026-07-02";
  const poorPayments = onTimeDaily(start, 60).filter((_, index) => index % 3 !== 0);
  const improvedPayments = onTimeDaily(start, 60).map((item, index) => (
    index < 30 && index % 3 === 0 ? null : item
  )).filter(Boolean);
  const poor = calculateFintrackCreditScore({
    loans: [dailyLoan({ startDate: start, payments: poorPayments })],
    asOf,
  });
  const improved = calculateFintrackCreditScore({
    loans: [dailyLoan({ startDate: start, payments: improvedPayments })],
    asOf,
  });
  assert.ok(poor.available && improved.available);
  assert.ok(improved.score > poor.score);
});

test("same payment history is deterministic", () => {
  const loans = [dailyLoan({ payments: onTimeDaily("2026-07-01", 15) })];
  const first = calculateFintrackCreditScore({ loans, asOf });
  const second = calculateFintrackCreditScore({ loans, asOf });
  assert.deepEqual(first.score, second.score);
  assert.deepEqual(first.summary, second.summary);
});

test("monthly on-time interest payments produce a score", () => {
  const result = calculateFintrackCreditScore({
    loans: [monthlyLoan({
      payments: [
        { date: "2026-02-15", interest: 10000 },
        { date: "2026-03-15", interest: 10000 },
        { date: "2026-04-15", interest: 10000 },
        { date: "2026-05-15", interest: 10000 },
        { date: "2026-06-15", interest: 10000 },
        { date: "2026-07-15", interest: 10000 },
        { date: "2026-08-15", interest: 10000 },
      ],
    })],
    asOf,
  });
  assert.equal(result.available, true);
  assert.ok(result.score >= 700);
});

test("daily finance: first due is the day after collection start; same-day EOD payments are on time", () => {
  const loan = dailyLoan({
    startDate: "2026-08-28",
    extra: { dailyCollection: 200, collectionAmount: 20000 },
    payments: [
      { date: "2026-08-29", amount: 200 },
      { date: "2026-08-30", amount: 200 },
      { date: "2026-08-31", amount: 200 },
    ],
  });
  const rows = dailyInstallments(loan, "2026-09-01");
  assert.deepEqual(rows.map(row => row.dueDate), ["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"]);
  assert.deepEqual(
    rows.slice(0, 3).map(row => row.status),
    ["on_time", "on_time", "on_time"],
  );
  assert.equal(rows[3].status, "missed");
  const result = calculateFintrackCreditScore({ loans: [loan], asOf: "2026-09-01" });
  assert.equal(result.summary.late, 0);
  assert.equal(result.summary.missed, 1);
  assert.equal(result.summary.onTime, 3);
});

test("daily finance: no installment is due on the collection start date", () => {
  const loan = dailyLoan({ startDate: "2026-08-28", extra: { dailyCollection: 200 } });
  assert.deepEqual(dailyInstallments(loan, "2026-08-28"), []);
  assert.equal(dailyInstallments(loan, "2026-08-29")[0]?.dueDate, "2026-08-29");
});

test("chit installments score late vs on-time", () => {
  const result = calculateFintrackCreditScore({
    chitPayments: [
      { id: "1", due_date: "2026-03-01", paid_date: "2026-03-01", amount_due: 5000, amount_paid: 5000 },
      { id: "2", due_date: "2026-04-01", paid_date: "2026-04-01", amount_due: 5000, amount_paid: 5000 },
      { id: "3", due_date: "2026-05-01", paid_date: "2026-05-10", amount_due: 5000, amount_paid: 5000 },
      { id: "4", due_date: "2026-06-01", paid_date: "", amount_due: 5000, amount_paid: 0 },
    ],
    asOf,
  });
  assert.equal(result.available, true);
  assert.equal(result.summary.onTime, 2);
  assert.equal(result.summary.late, 1);
  assert.equal(result.summary.missed, 1);
});
