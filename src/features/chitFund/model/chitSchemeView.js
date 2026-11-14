// Presentation helpers that give every Chit type the same scheme, member and payment views.
// Display only: nothing here calculates or changes a lift, dividend, commission or balance.
// Every figure comes from the stored scheme rows.
import { CHIT_TYPES } from "./fixedChit.js";
import { chitPaymentAmounts, chitPaymentIsDue, chitPaymentOutstanding } from "./memberPayments.js";
import { cycleNumberInRange, nextOpenChitMonth, winsForEnrollment } from "./liveBidding.js";

export const CHIT_RECEIPT_SOURCE = { auction: "chit_auction", fixed: "chit_fixed", predefined: "chit_predefined" };

export function chitSchemeKind(scheme = {}) {
  if (scheme.chit_type === CHIT_TYPES.FIXED) return "fixed";
  if (scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID) return "predefined";
  return "auction";
}

// Member's monthly payment, as configured on the scheme. Fixed calls it a contribution (it rises after the
// member lifts); Predefined Bid schedules an EMI per month, so the starting EMI is shown.
export function chitInstallmentFigure(scheme = {}) {
  const kind = chitSchemeKind(scheme);
  if (kind === "predefined") return { label: "Starting EMI", amount: scheme.predefined_starting_emi ?? null };
  if (kind === "fixed") return { label: "Monthly contribution", amount: scheme.installment_amount ?? null };
  return { label: "Monthly installment", amount: scheme.installment_amount ?? null };
}

// Where the month-by-month lifts live. Auction lifts are decided by a bid; the others follow a fixed schedule.
export const CHIT_LIFTS_TAB_LABEL = {
  auction: "Bids & lifts",
  fixed: "Lift schedule",
  predefined: "Lift schedule",
};

/**
 * One row per scheme month with the stored lift, whatever the chit type.
 * status: "lifted" once the month is finalized, otherwise "pending".
 * amount: what the member receives (Auction: stored lift amount; Fixed: lift amount; Predefined: net receivable).
 */
export function chitLiftTimeline(scheme = {}, details = {}) {
  const kind = chitSchemeKind(scheme);
  if (kind === "fixed") {
    return (details.fixedLifts || []).map(row => ({
      id: row.id,
      month: Number(row.month_number),
      enrollmentId: row.status === "completed" ? row.enrollment_id : null,
      amount: Number(row.status === "completed" ? (row.amount_paid_to_member ?? row.lift_amount) : row.lift_amount),
      date: row.lift_date || "",
      status: row.status === "completed" ? "lifted" : "pending",
      raw: row,
    })).sort((a, b) => a.month - b.month);
  }
  if (kind === "predefined") {
    return (details.predefinedSchedule || []).map(row => ({
      id: row.id,
      month: Number(row.month_number),
      enrollmentId: row.status === "completed" ? row.enrollment_id : null,
      amount: Number(row.net_receivable),
      bidAmount: Number(row.bid_amount),
      date: row.assigned_date || "",
      status: row.status === "completed" ? "lifted" : "pending",
      raw: row,
    })).sort((a, b) => a.month - b.month);
  }
  const duration = Number(scheme.duration_months) || 0;
  const recorded = (details.cycles || [])
    .filter(cycle => cycleNumberInRange(cycle.cycle_number, duration))
    .map(cycle => ({
      id: cycle.id,
      month: Number(cycle.cycle_number),
      enrollmentId: cycle.winning_enrollment_id || null,
      amount: Number(cycle.winning_bid_amount),
      discount: Number(cycle.discount_amount),
      date: cycle.cycle_date || "",
      status: "lifted",
      raw: cycle,
    }));
  const byMonth = new Map(recorded.map(row => [row.month, row]));
  const rows = [];
  for (let month = 1; month <= duration; month += 1) {
    rows.push(byMonth.get(month) || { id: `month-${month}`, month, enrollmentId: null, amount: null, date: "", status: "pending", raw: null });
  }
  return rows;
}

/** Months lifted, the most recent lift, and the next month waiting for a lift. */
export function chitSchemeProgress(scheme = {}, details = {}) {
  const timeline = chitLiftTimeline(scheme, details);
  const lifted = timeline.filter(row => row.status === "lifted");
  const latest = lifted.at(-1) || null;
  const kind = chitSchemeKind(scheme);
  const nextMonth = kind === "auction"
    ? nextOpenChitMonth(details.cycles || [], scheme.duration_months)
    : timeline.find(row => row.status === "pending")?.month ?? null;
  const next = nextMonth ? timeline.find(row => row.month === nextMonth) || { month: nextMonth, amount: null } : null;
  return {
    duration: Number(scheme.duration_months) || timeline.length,
    liftedCount: lifted.length,
    latest,
    next: next ? { month: next.month, scheduledAmount: kind === "auction" ? null : next.amount, bidAmount: next.bidAmount ?? null, raw: next.raw || null } : null,
  };
}

/** The scheme's member payment rows (Auction installments, Fixed or Predefined payments) with their month attached. */
export function chitSchemePayments(scheme = {}, details = {}) {
  const kind = chitSchemeKind(scheme);
  if (kind === "fixed") return (details.fixedPayments || []).map(row => ({ ...row, month: Number(row.payment_month) }));
  if (kind === "predefined") return (details.predefinedPayments || []).map(row => ({ ...row, month: Number(row.payment_month) }));
  const cycleMonth = new Map((details.cycles || []).map(cycle => [cycle.id, Number(cycle.cycle_number)]));
  return (details.installments || []).map(row => ({ ...row, month: Number(row.payment_month) || cycleMonth.get(row.cycle_id) || 0 }));
}

/**
 * Month the Payments tab opens on, the same rule for every type:
 * the latest month whose due date has arrived; before any month is due, the first month with payment rows.
 */
export function defaultChitPaymentMonth(rows = [], asOfDate = "") {
  const months = [...new Set(rows.map(row => Number(row.month)).filter(month => month > 0))].sort((a, b) => a - b);
  if (!months.length) return 1;
  const due = months.filter(month => rows.some(row => Number(row.month) === month && chitPaymentIsDue(row, asOfDate) && row.due_date));
  return due.length ? due.at(-1) : months[0];
}

/** Lift and balance summary for one member, the same shape for every type. */
export function chitMemberSummary(scheme = {}, details = {}, enrollment = {}, asOfDate = "") {
  const kind = chitSchemeKind(scheme);
  const payments = chitSchemePayments(scheme, details).filter(row => row.enrollment_id === enrollment.id);
  const outstanding = chitPaymentOutstanding(payments, asOfDate);
  const scheduled = payments.reduce((sum, row) => sum + chitPaymentAmounts(row).balance, 0);
  let lift = null;
  if (kind === "auction") {
    const win = winsForEnrollment(details.cycles || [], details.bids || [], enrollment.id, scheme.chit_value)[0];
    if (win) lift = { month: win.month, amount: win.payoutAmount, date: win.bidDate || "" };
  } else {
    const row = chitLiftTimeline(scheme, details).find(item => item.status === "lifted" && item.enrollmentId === enrollment.id);
    if (row) lift = { month: row.month, amount: row.amount, date: row.date };
  }
  return { lift, outstanding, scheduledBalance: Math.round(scheduled * 100) / 100, paymentCount: payments.length };
}

/** "overdue" → "Overdue", "partially paid" → "Partially paid". The status itself is not changed. */
export function chitStatusText(status) {
  const text = String(status || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}
