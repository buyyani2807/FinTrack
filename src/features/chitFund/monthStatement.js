const asNumber = value => Number(value || 0);
const roundMoney = value => Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;

const memberName = enrollment => enrollment?.chit_members?.full_name || "Member";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const monthLabel = (startDate, monthNumber) => {
  const base = new Date(`${String(startDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return `Month ${monthNumber}`;
  base.setMonth(base.getMonth() + (Number(monthNumber) - 1));
  return `${MONTH_LABELS[base.getMonth()]} ${String(base.getFullYear()).slice(-2)}`;
};

export const currentSchemeMonth = (scheme, now = new Date()) => {
  const start = new Date(`${String(scheme?.start_date).slice(0, 10)}T00:00:00`);
  const duration = Number(scheme?.duration_months) || 1;
  if (Number.isNaN(start.getTime())) return 1;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric" }).formatToParts(now);
  const calendar = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const elapsed = (calendar.year - start.getFullYear()) * 12 + (calendar.month - (start.getMonth() + 1)) + 1;
  return Math.min(duration, Math.max(1, elapsed));
};

const formatStamp = date => {
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
};

function collectionRow(enrollment, due, paid) {
  const amountDue = roundMoney(due);
  const amountPaid = roundMoney(paid);
  const pending = roundMoney(Math.max(0, amountDue - amountPaid));
  return {
    ticket: enrollment?.ticket_number || "",
    name: memberName(enrollment),
    enrollmentId: enrollment?.id,
    due: amountDue,
    paid: amountPaid,
    pending,
    status: pending > 0 ? "Pending" : "Paid",
  };
}

export function buildChitMonthStatement({ scheme, details = {}, monthNumber, generatedAt = new Date() }) {
  const month = Number(monthNumber);
  const enrollments = [...(details.enrollments || [])].sort((a, b) => (a.ticket_number || 0) - (b.ticket_number || 0));
  const type = scheme.chit_type || "auction";
  const cycle = (details.cycles || []).find(item => Number(item.cycle_number) === month);
  const lift = (details.fixedLifts || []).find(item => Number(item.month_number) === month);
  const predefined = (details.predefinedSchedule || []).find(item => Number(item.month_number) === month);

  const collections = enrollments.map(enrollment => {
    if (type === "fixed") {
      const payment = (details.fixedPayments || []).find(item => item.enrollment_id === enrollment.id && Number(item.payment_month) === month);
      return collectionRow(enrollment, payment?.amount_due ?? scheme.installment_amount, payment?.amount_paid || 0);
    }
    if (type === "fixed_predefined_bid") {
      const payment = (details.predefinedPayments || []).find(item => item.enrollment_id === enrollment.id && Number(item.payment_month) === month);
      return collectionRow(enrollment, payment?.amount_due ?? predefined?.emi ?? 0, payment?.amount_paid || 0);
    }
    const installment = (details.installments || []).find(item => item.enrollment_id === enrollment.id && item.cycle_id === cycle?.id);
    return collectionRow(enrollment, installment?.net_amount_due ?? scheme.installment_amount, installment?.amount_paid || 0);
  });

  const expected = roundMoney(collections.reduce((sum, row) => sum + row.due, 0));
  const collected = roundMoney(collections.reduce((sum, row) => sum + row.paid, 0));
  const pending = roundMoney(Math.max(0, expected - collected));
  const progress = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  const olderDues = enrollments.map(enrollment => {
    let older = 0;
    if (type === "fixed") {
      older = (details.fixedPayments || [])
        .filter(item => item.enrollment_id === enrollment.id && Number(item.payment_month) < month)
        .reduce((sum, item) => sum + Math.max(0, asNumber(item.amount_due) - asNumber(item.amount_paid)), 0);
    } else if (type === "fixed_predefined_bid") {
      older = (details.predefinedPayments || [])
        .filter(item => item.enrollment_id === enrollment.id && Number(item.payment_month) < month)
        .reduce((sum, item) => sum + Math.max(0, asNumber(item.amount_due) - asNumber(item.amount_paid)), 0);
    } else {
      const previousCycles = new Set((details.cycles || []).filter(item => Number(item.cycle_number) < month).map(item => item.id));
      older = (details.installments || [])
        .filter(item => item.enrollment_id === enrollment.id && previousCycles.has(item.cycle_id))
        .reduce((sum, item) => sum + Math.max(0, asNumber(item.net_amount_due) - asNumber(item.amount_paid)), 0);
    }
    const current = collections.find(row => row.enrollmentId === enrollment.id);
    const thisMonth = current?.pending || 0;
    const totalOwed = roundMoney(thisMonth + older);
    return { name: memberName(enrollment), thisMonth, older: roundMoney(older), totalOwed };
  }).filter(row => row.totalOwed > 0);

  let prize = null;
  if (type === "fixed" && lift?.status === "completed") {
    const winner = enrollments.find(item => item.id === lift.enrollment_id);
    prize = {
      winner: memberName(winner),
      prize: roundMoney(lift.lift_amount),
      commission: roundMoney(lift.manager_commission),
      netPayout: roundMoney(lift.amount_paid_to_member ?? lift.lift_amount),
      status: "Complete",
    };
  } else if (type === "fixed_predefined_bid" && predefined?.status === "completed") {
    const winner = enrollments.find(item => item.id === predefined.enrollment_id);
    prize = {
      winner: memberName(winner),
      prize: roundMoney(predefined.bid_amount),
      commission: roundMoney(predefined.manager_commission),
      netPayout: roundMoney(predefined.net_receivable),
      status: "Complete",
    };
  } else if (cycle?.winning_enrollment_id) {
    const winner = enrollments.find(item => item.id === cycle.winning_enrollment_id);
    prize = {
      winner: memberName(winner),
      prize: roundMoney(scheme.chit_value),
      commission: roundMoney(cycle.commission_amount),
      netPayout: roundMoney(asNumber(scheme.chit_value) - asNumber(cycle.commission_amount)),
      status: "Complete",
    };
  }

  return {
    title: "MONTH STATEMENT",
    generatedAt: formatStamp(generatedAt),
    schemeName: scheme.name,
    monthLabel: monthLabel(scheme.start_date, month),
    monthNumber: month,
    expected,
    collected,
    pending,
    progress,
    prize,
    collections,
    outstanding: olderDues,
    outstandingTotal: roundMoney(olderDues.reduce((sum, row) => sum + row.totalOwed, 0)),
  };
}

export const moneyInr = value => `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
