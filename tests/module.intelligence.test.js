import test from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, loanBalance, today } from "../src/features/finance/loanState.js";
import { buildDailyFinanceFacts, buildMonthlyFinanceFacts, interpretDailyFinanceFacts, interpretMonthlyFinanceFacts } from "../src/features/finance/financeIntelligence.js";
import { buildChitFacts, interpretChitFacts } from "../src/features/chitFund/chitIntelligence.js";
import { CHIT_TYPES } from "../src/features/chitFund/fixedChit.js";

const asOf = today();

const dailyLoan = ({ name = "Ravi Kumar", paidToday = false, missed = 0, extraPaid = 0 } = {}) => {
  const transactions = [];
  if (paidToday) transactions.push({ id: "t-today", date: asOf, amount: 100 });
  for (let i = 1; i <= extraPaid; i += 1) {
    transactions.push({ id: `t-${i}`, date: addDays(asOf, -8 - i), amount: 100 });
  }
  for (let i = missed + 1; i <= 7; i += 1) {
    transactions.push({ id: `m-${i}`, date: addDays(asOf, -i), amount: 100 });
  }
  return {
    id: `D-${name}`,
    customerName: name,
    kind: "daily",
    status: "active",
    startDate: addDays(asOf, -20),
    collectionAmount: 10000,
    dailyCollection: 100,
    transactions,
  };
};

const monthlyLoan = ({ name = "Priya", paidThisMonth = 0, paidLastMonth = 0, startMonthsAgo = 4 } = {}) => ({
  id: `M-${name}`,
  customerName: name,
  kind: "monthly",
  status: "active",
  startDate: addMonths(asOf, -startMonthsAgo),
  principal: 100000,
  annualRate: 3,
  penaltyRate: 0,
  rateChanges: [],
  transactions: [
    paidThisMonth ? { id: "cur", date: asOf, interestAmount: paidThisMonth, principalAmount: 0, penaltyAmount: 0 } : null,
    paidLastMonth ? { id: "prev", date: addDays(`${asOf.slice(0, 7)}-01`, -1), interestAmount: paidLastMonth, principalAmount: 0, penaltyAmount: 0 } : null,
  ].filter(Boolean),
});

test("daily facts reuse existing daily collection amounts and do not invent a collection rate without expected dues", () => {
  const pending = dailyLoan({ name: "Ravi Kumar", paidToday: false, missed: 3 });
  const collected = dailyLoan({ name: "Suresh", paidToday: true, missed: 0 });
  const facts = buildDailyFinanceFacts([pending, collected], { asOf, isOwner: true });
  assert.equal(facts.module, "daily");
  assert.equal(facts.expectedToday, 200);
  assert.equal(facts.collectedToday, 100);
  assert.equal(facts.pendingToday, 100);
  assert.equal(facts.collectionRate, 50);
  assert.equal(facts.pendingCount, 1);
  assert.equal(loanBalance(pending), 10000 - 400);
  const report = interpretDailyFinanceFacts(facts);
  assert.match(report.kicker, /daily/i);
  assert.match(report.summary, /₹/);
  assert.ok(report.attention.some(line => /Ravi Kumar|not completed today's collection/i.test(line)));
  assert.ok(!report.summary.toLowerCase().includes("scheme"));
});

test("monthly insights do not fabricate a month-over-month trend without previous collections", () => {
  const loan = monthlyLoan({ name: "Priya", paidThisMonth: 3000, paidLastMonth: 0 });
  const facts = buildMonthlyFinanceFacts([loan], { asOf, isOwner: true });
  assert.equal(facts.module, "monthly");
  assert.equal(facts.collectedThisMonth, 3000);
  assert.equal(facts.hasPreviousMonth, false);
  assert.equal(facts.monthChange, null);
  const report = interpretMonthlyFinanceFacts(facts);
  assert.match(report.kicker, /monthly/i);
  assert.match(report.details[0].insights.join(" "), /Not enough historical data/);
  assert.ok(!report.details[0].insights.some(line => /higher than last month/i.test(line)));
  assert.ok(!report.summary.toLowerCase().includes("today's expected collection"));
});

test("monthly comparison appears only when previous-month collections exist", () => {
  const loan = monthlyLoan({ name: "Arun", paidThisMonth: 3300, paidLastMonth: 3000 });
  const facts = buildMonthlyFinanceFacts([loan], { asOf, isOwner: true });
  assert.equal(facts.hasPreviousMonth, true);
  assert.equal(facts.monthChange, 10);
  const report = interpretMonthlyFinanceFacts(facts);
  assert.match(report.details[0].insights.join(" "), /10% higher than last month/);
});

test("daily and monthly reports stay module-specific", () => {
  const daily = interpretDailyFinanceFacts(buildDailyFinanceFacts([dailyLoan({ paidToday: false })], { asOf }));
  const monthly = interpretMonthlyFinanceFacts(buildMonthlyFinanceFacts([monthlyLoan({ paidThisMonth: 1000 })], { asOf }));
  assert.match(daily.kicker, /daily/i);
  assert.match(monthly.kicker, /monthly/i);
  assert.notEqual(daily.kicker, monthly.kicker);
  assert.ok(daily.performance.some(item => item.label.toLowerCase().includes("today")));
  assert.ok(monthly.performance.some(item => item.label.toLowerCase().includes("month")));
});

test("chit insights keep auction bid trends off fixed schemes and do not invent installment totals", () => {
  const facts = buildChitFacts({
    asOf,
    schemes: [
      { id: "s-fixed", name: "Temple Fixed", chit_type: CHIT_TYPES.FIXED, status: "active", chit_value: 100000, installment_amount: 5000, duration_months: 20, start_date: addMonths(asOf, -2), member_count: 20, commission_percent: 5, fixed_commission_amount: 5000 },
      { id: "s-auction", name: "Town Auction", chit_type: CHIT_TYPES.AUCTION, status: "active", chit_value: 100000, installment_amount: 5000, duration_months: 20, start_date: addMonths(asOf, -3), member_count: 20, commission_percent: 5 },
    ],
    enrollments: [
      { id: "e1", scheme_id: "s-fixed", status: "active", chit_members: { full_name: "Meena" } },
      { id: "e2", scheme_id: "s-auction", status: "active", chit_members: { full_name: "Kumar" } },
    ],
    cycles: [
      { id: "c1", scheme_id: "s-auction", cycle_number: 1, winning_bid_amount: 80000, winning_enrollment_id: "e2" },
      { id: "c2", scheme_id: "s-auction", cycle_number: 2, winning_bid_amount: 78000, winning_enrollment_id: "e2" },
    ],
    fixedLifts: [
      { id: "l1", scheme_id: "s-fixed", month_number: 3, status: "pending", enrollment_id: "e1", lift_amount: 55000 },
    ],
    predefinedSchedule: [],
    upcomingRows: [],
  });
  assert.equal(facts.activeSchemeCount, 2);
  assert.equal(facts.memberCount, 2);
  assert.equal(facts.auctionInsights[0].trend, null);
  assert.equal(facts.fixedInsights[0].recipient, "Meena");
  assert.equal(facts.fixedInsights[0].liftAmount, 55000);
  const report = interpretChitFacts(facts);
  assert.match(report.kicker, /chit/i);
  assert.match(report.details.find(item => item.id === "auction").insights.join(" "), /Not enough recorded bids/);
  assert.match(report.details.find(item => item.id === "fixed").insights.join(" "), /Temple Fixed/);
  assert.ok(!report.details.find(item => item.id === "fixed").insights.join(" ").toLowerCase().includes("winning bid"));
  assert.equal(facts.pendingAmount, 0);
});

test("agent-scoped daily facts stay on assigned customers only", () => {
  const assigned = dailyLoan({ name: "Assigned", paidToday: false });
  assigned.collectionAgentId = "agent-1";
  const facts = buildDailyFinanceFacts([assigned], { asOf, isOwner: false });
  const report = interpretDailyFinanceFacts(facts);
  assert.equal(facts.scopedToAssigned, true);
  assert.ok(report.attention[0].includes("assigned"));
});
