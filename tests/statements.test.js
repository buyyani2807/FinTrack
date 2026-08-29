import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChitMemberStatement,
  buildCustomerStatementBundle,
  buildFinanceAccountStatement,
  relatedFinanceAccounts,
  statementWhatsAppMessage,
} from "../src/features/statements/statementModel.js";

const dailyLoan = {
  id: "loan-daily",
  customerId: "cust-1",
  customerName: "Ravi Kumar",
  phone: "9876543210",
  address: "Hyderabad",
  portalId: "DF-1025",
  kind: "daily",
  startDate: "2026-08-01",
  collectionAmount: 60000,
  disbursedAmount: 50000,
  dailyCollection: 600,
  status: "active",
  transactions: [
    { id: "t1", date: "2026-08-01", amount: 600, mode: "cash", collectorName: "Suresh", cashAmount: 600, upiAmount: 0 },
    { id: "t2", date: "2026-08-02", amount: 600, mode: "upi", collectorName: "Suresh", cashAmount: 0, upiAmount: 600 },
    { id: "t3", date: "2026-08-20", amount: 600, mode: "cash", collectorName: "Suresh", cashAmount: 600, upiAmount: 0 },
  ],
};

const monthlyLoan = {
  id: "loan-monthly",
  customerId: "cust-1",
  customerName: "Ravi Kumar",
  phone: "9876543210",
  portalId: "MF-2045",
  kind: "monthly",
  startDate: "2026-02-05",
  principal: 100000,
  annualRate: 2,
  status: "active",
  rateChanges: [],
  transactions: [
    { id: "m1", date: "2026-03-05", interestAmount: 2000, principalAmount: 8000, penaltyAmount: 0, mode: "upi", collectorName: "Suresh" },
    { id: "m2", date: "2026-04-05", interestAmount: 1840, principalAmount: 8160, penaltyAmount: 0, mode: "cash", collectorName: "Suresh" },
  ],
};

test("relatedFinanceAccounts groups by customerId", () => {
  const related = relatedFinanceAccounts([dailyLoan, monthlyLoan, { ...dailyLoan, id: "other", customerId: "x" }], dailyLoan);
  assert.equal(related.length, 2);
});

test("daily statement uses as-of date and existing balances", () => {
  const statement = buildFinanceAccountStatement(dailyLoan, "2026-08-02");
  assert.equal(statement.summary.financeAmount, 50000);
  assert.equal(statement.summary.totalPayable, 60000);
  assert.equal(statement.summary.totalPaid, 1200);
  assert.equal(statement.summary.outstanding, 58800);
  assert.equal(statement.payments.length, 2);
  assert.equal(statement.payments[1].balanceAfter, 58800);
});

test("monthly statement uses existing payment totals", () => {
  const statement = buildFinanceAccountStatement(monthlyLoan, "2026-08-29");
  assert.equal(statement.summary.loanAmount, 100000);
  assert.equal(statement.summary.principalPaid, 16160);
  assert.equal(statement.summary.outstanding, 83840);
  assert.equal(statement.payments.length, 2);
});

test("customer statement bundle can select one account or all", () => {
  const all = buildCustomerStatementBundle({
    loans: [dailyLoan, monthlyLoan],
    focusLoan: dailyLoan,
    selectedAccountId: "all",
    asOf: "2026-08-29",
  });
  assert.equal(all.accounts.length, 2);
  const one = buildCustomerStatementBundle({
    loans: [dailyLoan, monthlyLoan],
    focusLoan: dailyLoan,
    selectedAccountId: "loan-monthly",
    asOf: "2026-08-29",
  });
  assert.equal(one.accounts.length, 1);
  assert.equal(one.accounts[0].kind, "monthly");
});

test("chit member statement includes scheme, payments, and bid winner", () => {
  const statement = buildChitMemberStatement({
    scheme: {
      name: "1 Lakh Chit",
      chit_type: "auction",
      chit_value: 100000,
      member_count: 20,
      installment_amount: 5000,
      duration_months: 20,
      status: "active",
      start_date: "2026-01-01",
    },
    enrollment: {
      id: "en-1",
      ticket_number: 4,
      chit_members: { full_name: "Ravi Kumar", phone: "9876543210", address: "Hyderabad" },
    },
    payments: [
      { id: "p1", payment_month: 1, due_date: "2026-01-05", paid_date: "2026-01-05", amount_due: 5000, amount_paid: 5000, payment_mode: "cash", status: "paid" },
      { id: "p2", payment_month: 2, due_date: "2026-02-05", paid_date: null, amount_due: 5000, amount_paid: 0, payment_mode: null, status: "due" },
    ],
    cycles: [{
      id: "c8",
      cycle_number: 8,
      winning_enrollment_id: "en-1",
      winning_bid_amount: 95000,
      discount_amount: 5000,
      commission_amount: 3000,
      distributable_amount: 2000,
      dividend_per_member: 100,
      cycle_date: "2026-08-05",
    }],
    bids: [{ enrollment_id: "en-1", cycle_id: "c8", bid_amount: 95000, status: "winner" }],
    asOf: "2026-08-29",
  });
  assert.equal(statement.scheme.name, "1 Lakh Chit");
  assert.equal(statement.summary.monthsPaid, 1);
  assert.equal(statement.summary.outstanding, 5000);
  assert.equal(statement.bid.isWinner, true);
  assert.equal(statement.bid.winningBid, 95000);
});

test("whatsapp statement message includes outstanding", () => {
  const bundle = buildCustomerStatementBundle({
    loans: [dailyLoan],
    focusLoan: dailyLoan,
    selectedAccountId: "all",
    asOf: "2026-08-29",
    settings: { companyName: "Sudheer Finance" },
  });
  const message = statementWhatsAppMessage(bundle);
  assert.match(message, /Ravi Kumar/);
  assert.match(message, /Finance Type: Daily Finance/);
  assert.match(message, /Outstanding:/);
  assert.match(message, /Sudheer Finance/);
});

test("chit statement includes finance type and chit type", () => {
  const statement = buildChitMemberStatement({
    scheme: {
      name: "50Lakhs",
      chit_type: "fixed_predefined_bid",
      chit_value: 5000000,
      member_count: 25,
      installment_amount: 152000,
      duration_months: 25,
      status: "active",
    },
    enrollment: {
      id: "en-1",
      ticket_number: 1,
      chit_members: { full_name: "Aarush", phone: "9000000001" },
    },
    payments: [],
    asOf: "2026-08-29",
  });
  assert.equal(statement.financeType, "Chit Fund");
  assert.equal(statement.scheme.chitTypeLabel, "Fixed Predefined Bid");
});
