import { roundMoney } from "./calculations.js";

export const CHIT_PAYMENT_STATUSES = {
  PAID: "paid",
  PARTIAL: "partially paid",
  PENDING: "pending",
  OVERDUE: "overdue",
  WAIVED: "waived",
};

export function chitPaymentAmounts(row = {}) {
  const expected = Number(row.net_amount_due ?? row.amount_due ?? row.expected ?? 0);
  const paid = Number(row.amount_paid ?? row.paid ?? 0);
  const lateFee = Number(row.late_penalty ?? row.lateFee ?? 0);
  return {
    expected,
    paid,
    lateFee,
    balance: Math.max(0, roundMoney(expected - paid)),
  };
}

export function chitPaymentDisplayStatus(row = {}, asOfDate = "") {
  if (row.status === "waived" || row.storedStatus === "waived") return CHIT_PAYMENT_STATUSES.WAIVED;
  const { expected, paid } = chitPaymentAmounts(row);
  if (expected > 0 && paid + 0.001 >= expected) return CHIT_PAYMENT_STATUSES.PAID;
  if (paid > 0) return CHIT_PAYMENT_STATUSES.PARTIAL;
  const dueDate = String(row.due_date || row.dueDate || "").slice(0, 10);
  const today = String(asOfDate || "").slice(0, 10);
  if (dueDate && today && dueDate < today) return CHIT_PAYMENT_STATUSES.OVERDUE;
  return CHIT_PAYMENT_STATUSES.PENDING;
}

export function chitPaymentOutstanding(rows = []) {
  return roundMoney(rows.reduce((sum, row) => sum + chitPaymentAmounts(row).balance, 0));
}

export function normalizeMemberPayment(row = {}) {
  const amounts = chitPaymentAmounts(row);
  return {
    id: row.id,
    month: Number(row.payment_month || row.cycle_number || row.month || 0),
    dueDate: row.due_date || row.dueDate || "",
    paidDate: row.paid_date || row.paidDate || "",
    reference: row.payment_reference || row.reference || "",
    mode: row.payment_mode || row.mode || "",
    notes: row.notes || "",
    storedStatus: row.status || "",
    ...amounts,
  };
}

export function filterPaymentsForMonth(rows = [], month, cycles = []) {
  const selected = Number(month);
  if (!selected) return rows;
  return rows.filter(row => {
    const cycleMonth = cycles.find(item => item.id === row.cycle_id)?.cycle_number;
    return Number(row.payment_month || row.cycle_number || cycleMonth || 0) === selected;
  });
}

export function memberPaymentsForEnrollment(rows = [], enrollmentId) {
  return (rows || []).filter(row => row.enrollment_id === enrollmentId);
}

export function portalPaymentRows(state = {}) {
  if (Array.isArray(state.installments) && state.installments.length) return state.installments;
  if (Array.isArray(state.payments) && state.payments.length) return state.payments;
  if (Array.isArray(state.fixedPayments) && state.fixedPayments.length) return state.fixedPayments;
  if (Array.isArray(state.predefinedPayments) && state.predefinedPayments.length) return state.predefinedPayments;
  return [];
}
