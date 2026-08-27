import test from "node:test";
import assert from "node:assert/strict";
import {
  chitPaymentAmounts,
  chitPaymentDisplayStatus,
  chitPaymentOutstanding,
  filterPaymentsForMonth,
  memberPaymentsForEnrollment,
  normalizeMemberPayment,
} from "../src/features/chitFund/memberPayments.js";

test("auction and fixed payment rows share expected/paid/balance fields", () => {
  assert.deepEqual(chitPaymentAmounts({ net_amount_due: 4500, amount_paid: 2000 }), {
    expected: 4500, paid: 2000, lateFee: 0, balance: 2500,
  });
  assert.deepEqual(chitPaymentAmounts({ amount_due: 6000, amount_paid: 6000, late_penalty: 50 }), {
    expected: 6000, paid: 6000, lateFee: 50, balance: 0,
  });
});

test("distinguishes paid, pending, overdue, and partially paid installments", () => {
  assert.equal(chitPaymentDisplayStatus({ amount_due: 5000, amount_paid: 5000, due_date: "2026-01-01" }, "2026-08-27"), "paid");
  assert.equal(chitPaymentDisplayStatus({ amount_due: 5000, amount_paid: 2000, due_date: "2026-01-01" }, "2026-08-27"), "partially paid");
  assert.equal(chitPaymentDisplayStatus({ amount_due: 5000, amount_paid: 0, due_date: "2026-01-01" }, "2026-08-27"), "overdue");
  assert.equal(chitPaymentDisplayStatus({ amount_due: 5000, amount_paid: 0, due_date: "2026-09-01" }, "2026-08-27"), "pending");
  assert.equal(chitPaymentDisplayStatus({ amount_due: 5000, amount_paid: 0, status: "waived", due_date: "2026-01-01" }, "2026-08-27"), "waived");
});

test("outstanding totals use stored due and paid amounts only", () => {
  assert.equal(chitPaymentOutstanding([
    { amount_due: 5000, amount_paid: 5000 },
    { net_amount_due: 4500, amount_paid: 1000 },
    { amount_due: 6000, amount_paid: 0 },
  ]), 9500);
});

test("normalizes auction cycle rows into the member history shape", () => {
  const row = normalizeMemberPayment({
    id: "i1",
    cycle_number: 3,
    due_date: "2026-03-25",
    paid_date: "2026-03-26",
    net_amount_due: 4800,
    amount_paid: 4800,
    payment_reference: "UPI123",
    payment_mode: "upi",
    late_penalty: 0,
    status: "paid",
  });
  assert.equal(row.month, 3);
  assert.equal(row.expected, 4800);
  assert.equal(row.reference, "UPI123");
  assert.equal(row.paidDate, "2026-03-26");
});

test("month filters keep only that installment month for members and administrators", () => {
  const rows = [
    { id: "a", enrollment_id: "m1", payment_month: 1, amount_due: 5000 },
    { id: "b", enrollment_id: "m1", cycle_id: "c2", amount_due: 5000 },
    { id: "c", enrollment_id: "m2", payment_month: 1, amount_due: 5000 },
  ];
  const cycles = [{ id: "c2", cycle_number: 2 }];
  assert.deepEqual(filterPaymentsForMonth(rows, 1, cycles).map(row => row.id), ["a", "c"]);
  assert.deepEqual(filterPaymentsForMonth(rows, 2, cycles).map(row => row.id), ["b"]);
  assert.deepEqual(memberPaymentsForEnrollment(rows, "m1").map(row => row.id), ["a", "b"]);
});
