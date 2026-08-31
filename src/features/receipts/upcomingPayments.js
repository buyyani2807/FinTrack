import { CHIT_TYPES } from "../chitFund/fixedChit.js";
import { chitPaymentAmounts, chitPaymentDisplayStatus } from "../chitFund/memberPayments.js";
import { chitTypeLabel } from "../chitFund/memberPortal.js";
import { currentSchemeMonth } from "../chitFund/monthStatement.js";
import { formatReceiptDate, nextMonthlyPayment } from "./receiptModel.js";
import { formatInr } from "../../lib/formatMoney.js";

const PAYMENT_KIND_TO_CHIT_TYPE = {
  auction: CHIT_TYPES.AUCTION,
  fixed: CHIT_TYPES.FIXED,
  fixed_predefined_bid: CHIT_TYPES.FIXED_PREDEFINED_BID,
};

function schemeDueDate(startDate, monthNumber) {
  const base = new Date(`${String(startDate || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setMonth(base.getMonth() + (Number(monthNumber) - 1));
  return base.toISOString().slice(0, 10);
}

function wrapSchemePayment(payment, paymentKind, scheme, enrollment, extra = {}) {
  const chitType = scheme.chit_type || PAYMENT_KIND_TO_CHIT_TYPE[paymentKind] || CHIT_TYPES.AUCTION;
  return {
    ...payment,
    ...extra,
    paymentKind,
    syntheticReminder: Boolean(payment.syntheticReminder),
    chit_enrollments: {
      chit_members: enrollment?.chit_members || { full_name: "", phone: "" },
      chit_schemes: {
        name: scheme.name,
        duration_months: scheme.duration_months,
        chit_type: chitType,
      },
    },
  };
}

export function flattenSchemePaymentsForReminders(scheme, data = {}, asOf = "") {
  const today = asOf || new Date().toISOString().slice(0, 10);
  const chitType = scheme.chit_type || CHIT_TYPES.AUCTION;
  const enrollments = (data.enrollments || []).filter(item => item.status === "active");
  const rows = [];
  const seen = new Set();
  const pushUnique = payment => {
    const key = payment.id || `${payment.enrollment_id}:${payment.payment_month || payment.cycle_number}:${payment.due_date}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(payment);
  };

  if (chitType === CHIT_TYPES.AUCTION) {
    const cycleById = Object.fromEntries((data.cycles || []).map(item => [item.id, item]));
    (data.installments || []).forEach(item => {
      const enrollment = enrollments.find(row => row.id === item.enrollment_id);
      pushUnique(wrapSchemePayment(item, "auction", scheme, enrollment, {
        cycle_number: cycleById[item.cycle_id]?.cycle_number,
      }));
    });
    return rows;
  }

  if (chitType === CHIT_TYPES.FIXED) {
    const payments = data.fixedPayments || [];
    const completedLifts = (data.fixedLifts || []).filter(item => item.status === "completed");
    const amountFor = (enrollmentId, monthNumber) => {
      const memberLift = completedLifts.find(item => item.enrollment_id === enrollmentId);
      if (memberLift && Number(memberLift.month_number) < Number(monthNumber)) {
        return Number(memberLift.monthly_payment || 0);
      }
      return Number(scheme.installment_amount || 0);
    };

    payments.forEach(item => {
      const enrollment = enrollments.find(row => row.id === item.enrollment_id);
      pushUnique(wrapSchemePayment(item, "fixed", scheme, enrollment));
    });

    if (scheme.status === "active") {
      const month = currentSchemeMonth(scheme, new Date(`${today}T12:00:00`));
      const dueDate = schemeDueDate(scheme.start_date, month);
      enrollments.forEach(enrollment => {
        const exists = payments.some(item => item.enrollment_id === enrollment.id && Number(item.payment_month) === month);
        if (exists || !dueDate) return;
        const amount = amountFor(enrollment.id, month);
        if (amount <= 0) return;
        pushUnique(wrapSchemePayment({
          id: `fixed-synthetic-${scheme.id}-${enrollment.id}-${month}`,
          enrollment_id: enrollment.id,
          payment_month: month,
          due_date: dueDate,
          amount_due: amount,
          amount_paid: 0,
          status: "due",
          syntheticReminder: true,
        }, "fixed", scheme, enrollment));
      });
    }
    return rows;
  }

  if (chitType === CHIT_TYPES.FIXED_PREDEFINED_BID) {
    const payments = data.predefinedPayments || [];
    const schedule = data.predefinedSchedule || [];
    payments.forEach(item => {
      const enrollment = enrollments.find(row => row.id === item.enrollment_id);
      pushUnique(wrapSchemePayment(item, "fixed_predefined_bid", scheme, enrollment));
    });

    if (scheme.status === "active") {
      const month = currentSchemeMonth(scheme, new Date(`${today}T12:00:00`));
      const scheduleMonth = schedule.find(item => Number(item.month_number) === month);
      const dueDate = schemeDueDate(scheme.start_date, month);
      const amount = Number(scheduleMonth?.emi || 0);
      if (amount > 0 && dueDate) {
        enrollments.forEach(enrollment => {
          const exists = payments.some(item => item.enrollment_id === enrollment.id && Number(item.payment_month) === month);
          if (exists) return;
          pushUnique(wrapSchemePayment({
            id: `predefined-synthetic-${scheme.id}-${enrollment.id}-${month}`,
            enrollment_id: enrollment.id,
            payment_month: month,
            due_date: dueDate,
            amount_due: amount,
            amount_paid: 0,
            status: "due",
            syntheticReminder: true,
          }, "fixed_predefined_bid", scheme, enrollment));
        });
      }
    }
    return rows;
  }

  return rows;
}

export function buildMonthlyUpcoming(loans = [], asOf = "") {
  return loans
    .filter(loan => loan.kind === "monthly" && loan.status === "active")
    .map(loan => {
      const next = nextMonthlyPayment(loan, asOf);
      if (!next) return null;
      return {
        type: "monthly",
        sourceId: loan.id,
        customerName: loan.customerName,
        phone: loan.phone,
        accountId: loan.portalId || loan.id,
        amount: next.amount,
        dueDate: next.dueDate,
        daysRemaining: next.daysRemaining,
        outstanding: next.outstanding,
        cycleKey: next.cycleKey,
        collectionAgentId: loan.collectionAgentId || "",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function buildChitUpcomingRows(rows = [], asOf = "") {
  const today = asOf || new Date().toISOString().slice(0, 10);
  return rows
    .map(row => {
      const amounts = chitPaymentAmounts(row);
      const status = chitPaymentDisplayStatus(row, today);
      if (status === "paid" || status === "waived" || amounts.balance <= 0) return null;
      const dueDate = String(row.due_date || row.dueDate || "").slice(0, 10);
      if (!dueDate) return null;
      const daysRemaining = Math.max(0, Math.floor((new Date(`${dueDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000));
      const member = row.chit_enrollments?.chit_members || row.chit_enrollments?.member || row.member || {};
      const scheme = row.chit_enrollments?.chit_schemes || row.scheme || {};
      const chitType = scheme.chit_type || row.chit_type || PAYMENT_KIND_TO_CHIT_TYPE[row.paymentKind] || "";
      return {
        type: "chit",
        sourceId: row.syntheticReminder ? row.enrollment_id : row.id,
        customerName: member.full_name || row.memberName || "Member",
        phone: member.phone || row.phone || "",
        accountId: row.enrollment_id || row.id,
        schemeName: scheme.name || row.schemeName || "Chit Fund",
        chitType,
        chitTypeLabel: chitTypeLabel(chitType),
        amount: amounts.balance,
        dueDate,
        daysRemaining,
        monthNumber: Number(row.payment_month || row.cycle_number || row.month_number || 0),
        totalMonths: Number(scheme.duration_months || row.totalMonths || 0),
        cycleKey: row.syntheticReminder ? `${row.payment_month || 0}:${dueDate}` : dueDate,
        enrollmentId: row.enrollment_id,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function filterUpcomingPayments(items = [], filter = "all") {
  if (filter === "monthly") return items.filter(item => item.type === "monthly");
  if (filter === "chit") return items.filter(item => item.type === "chit");
  if (filter === "today") return items.filter(item => item.daysRemaining === 0);
  if (filter === "tomorrow") return items.filter(item => item.daysRemaining === 1);
  if (filter === "3days") return items.filter(item => item.daysRemaining <= 3);
  if (filter === "7days") return items.filter(item => item.daysRemaining <= 7);
  return items;
}

export function reminderStatusLabel(daysBefore, sent = false) {
  const label = daysBefore === 0 ? "Due date reminder" : `${daysBefore}-day reminder`;
  return sent ? `✓ ${label} sent` : `○ ${label} pending`;
}

export function buildReminderReceipt(item, settings = {}) {
  return {
    customerName: item.customerName,
    customerPhone: item.phone,
    accountId: item.accountId,
    amount: item.amount,
    dueDate: item.dueDate,
    daysRemaining: item.daysRemaining,
    schemeName: item.schemeName || "",
    chitType: item.chitTypeLabel || chitTypeLabel(item.chitType) || "",
    chitFields: item.type === "chit" ? { month: item.monthNumber, totalMonths: item.totalMonths } : null,
    companyName: settings.companyName || "FinTrack",
    money: formatInr,
  };
}

export function formatDueLabel(item) {
  if (item.daysRemaining === 0) return "Due today";
  if (item.daysRemaining === 1) return "Due tomorrow";
  return `Due in ${item.daysRemaining} days`;
}

export function formatDueDate(item) {
  return formatReceiptDate(item.dueDate);
}
