/**
 * FinTrack Credit Score — internal repayment assessment.
 * Not a CIBIL / Experian / Equifax / CRIF / bureau score.
 *
 * Weights (0–1) can be adjusted later without rewriting allocation logic.
 */
export const SCORE_MIN = 300;
export const SCORE_MAX = 900;
export const MIN_DAILY_OBSERVATIONS = 5;
export const MIN_CYCLE_OBSERVATIONS = 2;

export const SCORE_WEIGHTS = {
  timeliness: 0.40,
  consistency: 0.25,
  missed: 0.15,
  late: 0.10,
  overdue: 0.05,
  completed: 0.05,
};

export const SCORE_BANDS = [
  { id: "excellent", label: "Excellent", min: 750, max: 900 },
  { id: "good", label: "Good", min: 700, max: 749 },
  { id: "fair", label: "Fair", min: 650, max: 699 },
  { id: "attention", label: "Needs Attention", min: 600, max: 649 },
  { id: "high_risk", label: "High Risk", min: 300, max: 599 },
];

const iso = value => String(value || "").slice(0, 10);
const moneyRound = value => Math.round((Number(value) || 0) * 100) / 100;

export const todayIso = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

export const addDays = (start, count) => {
  const date = new Date(`${iso(start)}T12:00:00`);
  date.setDate(date.getDate() + Number(count || 0));
  return date.toISOString().slice(0, 10);
};

export const addMonths = (start, count) => {
  const date = new Date(`${iso(start)}T12:00:00`);
  const day = date.getDate();
  date.setMonth(date.getMonth() + Number(count || 0), 1);
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  return date.toISOString().slice(0, 10);
};

export const daysBetween = (from, to) => {
  const start = new Date(`${iso(from)}T12:00:00`);
  const end = new Date(`${iso(to)}T12:00:00`);
  return Math.round((end - start) / 86400000);
};

export const monthEnd = date => {
  const value = new Date(`${iso(date)}T12:00:00`);
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).toISOString().slice(0, 10);
};

export const monthLabel = date => {
  const [year, month] = iso(date).split("-");
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(month) - 1]} ${year}`;
};

export const scoreBand = score => SCORE_BANDS.find(band => score >= band.min && score <= band.max) || SCORE_BANDS.at(-1);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const rateAt = (loan, date) => {
  const changes = [...(loan.rateChanges || [])].sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
  return Number(changes.filter(change => iso(change.effectiveDate) <= iso(date)).at(-1)?.annualRate ?? loan.annualRate ?? 0);
};

const monthlyInterest = (balance, ratePercent) => Math.round(Number(balance || 0) * Number(ratePercent || 0) / 100);

const financePaymentCredit = (loan, transaction) => {
  if (loan.kind === "monthly") return moneyRound(transaction.interestAmount);
  return moneyRound(transaction.amount ?? transaction.totalAmount ?? 0);
};

const monthlyPrincipalBefore = (loan, before) =>
  (loan.transactions || [])
    .filter(item => !before || iso(item.date) < iso(before))
    .reduce((sum, item) => sum + Number(item.principalAmount || 0), 0);

const monthlyBalanceBefore = (loan, before) => Math.max(0, Number(loan.principal || 0) - monthlyPrincipalBefore(loan, before));

const loanPaidTotal = loan => (loan.transactions || []).reduce((sum, item) => {
  if (loan.kind === "monthly") {
    return sum + Number(item.interestAmount || 0) + Number(item.principalAmount || 0) + Number(item.penaltyAmount || 0);
  }
  return sum + Number(item.amount || 0);
}, 0);

const loanOutstanding = loan => {
  if (loan.status === "bankrupt") return 0;
  if (loan.kind === "monthly") return monthlyBalanceBefore(loan);
  return Math.max(0, Number(loan.collectionAmount || 0) - loanPaidTotal(loan));
};

export const derivedFinanceStatus = (loan, asOf) => {
  if (loan.status === "bankrupt" || loan.status === "closed") return loan.status;
  if (loanOutstanding(loan) <= 0) return "completed";
  if (loan.kind === "daily") {
    return daysBetween(loan.startDate, asOf) >= 100 && loanOutstanding(loan) > 0 ? "overdue" : "active";
  }
  return "active";
};

function classifyInstallment(dueDate, expected, paid, lastPayDate, asOf) {
  const due = iso(dueDate);
  const paidAmount = moneyRound(paid);
  const need = moneyRound(expected);
  if (need <= 0) return null;
  if (paidAmount + 0.009 >= need) {
    const finish = iso(lastPayDate || due);
    const lateDays = Math.max(0, daysBetween(due, finish));
    return {
      dueDate: due,
      expected: need,
      paid: paidAmount,
      completedOn: finish,
      daysLate: lateDays,
      status: lateDays === 0 ? "on_time" : "late",
    };
  }
  if (due > iso(asOf)) {
    return paidAmount > 0
      ? { dueDate: due, expected: need, paid: paidAmount, completedOn: lastPayDate || "", daysLate: 0, status: "partial" }
      : { dueDate: due, expected: need, paid: 0, completedOn: "", daysLate: 0, status: "pending" };
  }
  if (paidAmount > 0) {
    return {
      dueDate: due,
      expected: need,
      paid: paidAmount,
      completedOn: lastPayDate || "",
      daysLate: Math.max(0, daysBetween(due, asOf)),
      status: "partial",
    };
  }
  return {
    dueDate: due,
    expected: need,
    paid: 0,
    completedOn: "",
    daysLate: Math.max(0, daysBetween(due, asOf)),
    status: "missed",
  };
}

function allocatePayments(installments, payments, asOf) {
  const pool = payments
    .filter(item => item.amount > 0 && iso(item.date) && iso(item.date) <= iso(asOf))
    .sort((a, b) => iso(a.date).localeCompare(iso(b.date)) || String(a.id || "").localeCompare(String(b.id || "")))
    .map(item => ({ ...item, left: moneyRound(item.amount) }));

  return installments.map(item => {
    let paid = 0;
    let lastPayDate = "";
    for (const payment of pool) {
      if (payment.left <= 0 || paid + 0.009 >= item.expected) continue;
      const take = Math.min(payment.left, moneyRound(item.expected - paid));
      payment.left = moneyRound(payment.left - take);
      paid = moneyRound(paid + take);
      lastPayDate = iso(payment.date);
    }
    return classifyInstallment(item.dueDate, item.expected, paid, lastPayDate, asOf);
  }).filter(Boolean);
}

function dailyHorizon(loan, asOf) {
  const start = iso(loan.startDate);
  const elapsed = Math.min(100, Math.max(0, daysBetween(start, asOf) + 1));
  const daily = Number(loan.dailyCollection || 0);
  const collected = loanPaidTotal(loan);
  const target = Number(loan.collectionAmount || 0);
  if (daily > 0 && (target > 0 && collected + 0.009 >= target || loan.status === "completed" || loan.status === "closed")) {
    const lastPaid = [...(loan.transactions || [])].map(item => iso(item.date)).filter(Boolean).sort().at(-1);
    const payoffDays = lastPaid ? daysBetween(start, lastPaid) + 1 : elapsed;
    return Math.min(elapsed, Math.max(1, payoffDays));
  }
  return elapsed;
}

export function dailyInstallments(loan, asOf) {
  const start = iso(loan.startDate);
  if (!start || !loan.dailyCollection) return [];
  const elapsed = dailyHorizon(loan, asOf);
  const dues = [];
  for (let index = 0; index < elapsed; index += 1) {
    dues.push({ dueDate: addDays(start, index), expected: Number(loan.dailyCollection) });
  }
  const payments = (loan.transactions || []).map(item => ({
    id: item.id,
    date: item.date,
    amount: financePaymentCredit(loan, item),
  }));
  return allocatePayments(dues, payments, asOf).map(row => ({ ...row, source: "daily", accountId: loan.id }));
}

export function monthlyInstallments(loan, asOf) {
  const start = iso(loan.startDate);
  if (!start || !loan.principal) return [];
  const dues = [];
  for (let number = 1; number < 240; number += 1) {
    const dueDate = addMonths(start, number);
    if (dueDate > iso(asOf)) break;
    const balance = monthlyBalanceBefore(loan, dueDate);
    if (!balance) break;
    dues.push({ dueDate, expected: monthlyInterest(balance, rateAt(loan, dueDate)) });
  }
  const payments = (loan.transactions || []).map(item => ({
    id: item.id,
    date: item.date,
    amount: financePaymentCredit(loan, item),
  }));
  return allocatePayments(dues, payments, asOf).map(row => ({ ...row, source: "monthly", accountId: loan.id }));
}

export function chitInstallments(rows = [], asOf) {
  return (rows || []).map(row => {
    if (row.status === "waived" || row.storedStatus === "waived") return null;
    const expected = Number(row.net_amount_due ?? row.amount_due ?? row.expected ?? 0);
    const paid = Number(row.amount_paid ?? row.paid ?? 0);
    const dueDate = iso(row.due_date || row.dueDate);
    if (!dueDate || expected <= 0) return null;
    const paidDate = iso(row.paid_date || row.paidDate);
    return {
      ...classifyInstallment(dueDate, expected, paid, paidDate, asOf),
      source: "chit",
      accountId: row.enrollment_id || row.id,
    };
  }).filter(Boolean);
}

export function financeInstallments(loan, asOf) {
  if (loan.kind === "monthly") return monthlyInstallments(loan, asOf);
  return dailyInstallments(loan, asOf);
}

const scoredRows = rows => rows.filter(row => row.status !== "pending");

export function hasEnoughHistory(rows) {
  const due = scoredRows(rows);
  if (due.length >= MIN_DAILY_OBSERVATIONS) return true;
  const cycleDue = due.filter(row => row.source !== "daily");
  return cycleDue.length >= MIN_CYCLE_OBSERVATIONS;
}

function timelinessPoints(row) {
  if (row.status === "on_time") return 100;
  if (row.status === "partial") return 32;
  if (row.status === "missed") return 0;
  if (row.daysLate <= 2) return 88;
  if (row.daysLate <= 7) return 68;
  if (row.daysLate <= 30) return 42;
  return 18;
}

function recencyWeight(row, asOf) {
  const age = Math.max(0, daysBetween(row.dueDate, asOf));
  return age <= 30 ? 1.6 : age <= 90 ? 1.2 : 1;
}

function factorTimeliness(rows, asOf) {
  const due = scoredRows(rows);
  if (!due.length) return 0;
  let weighted = 0;
  let weights = 0;
  due.forEach(row => {
    const weight = recencyWeight(row, asOf);
    weighted += timelinessPoints(row) * weight;
    weights += weight;
  });
  return weights ? weighted / weights : 0;
}

function factorConsistency(rows) {
  const due = scoredRows(rows);
  if (!due.length) return 0;
  const settled = due.filter(row => row.status === "on_time" || row.status === "late").length;
  return (settled / due.length) * 100;
}

function factorMissed(rows) {
  const due = scoredRows(rows);
  if (!due.length) return 100;
  return clamp(100 - (due.filter(row => row.status === "missed").length / due.length) * 140, 0, 100);
}

function factorLate(rows) {
  const due = scoredRows(rows);
  if (!due.length) return 100;
  const late = due.filter(row => row.status === "late");
  const avgDays = late.length ? late.reduce((sum, row) => sum + row.daysLate, 0) / late.length : 0;
  return clamp(100 - (late.length / due.length) * 80 - avgDays * 1.2, 0, 100);
}

function factorOverdue(rows, context) {
  if (context.bankruptAccounts > 0) return 8;
  if (context.overdueAmount <= 0) return 100;
  const typical = scoredRows(rows).reduce((sum, row) => sum + row.expected, 0) / Math.max(1, scoredRows(rows).length);
  const units = typical > 0 ? context.overdueAmount / typical : 2;
  return clamp(55 - units * 18, 0, 70);
}

function factorCompleted(context) {
  const completedBoost = Math.min(100, context.completedAccounts * 34);
  const bankruptHit = context.bankruptAccounts * 55;
  return clamp(completedBoost - bankruptHit, 0, 100);
}

function composeScore(factors, context) {
  const weighted = Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => sum + factors[key] * weight, 0);
  const bankruptDrag = context.bankruptAccounts > 0 ? 14 : 0;
  const normalized = clamp(weighted - bankruptDrag, 0, 100);
  return Math.round(SCORE_MIN + (SCORE_MAX - SCORE_MIN) * (normalized / 100));
}

function summarize(rows, loans, asOf) {
  const due = scoredRows(rows);
  const onTime = due.filter(row => row.status === "on_time").length;
  const late = due.filter(row => row.status === "late").length;
  const partial = due.filter(row => row.status === "partial").length;
  const missed = due.filter(row => row.status === "missed").length;
  const overdueAmount = due
    .filter(row => row.status === "partial" || row.status === "missed")
    .reduce((sum, row) => sum + Math.max(0, row.expected - row.paid), 0);
  const statuses = (loans || []).map(loan => derivedFinanceStatus(loan, asOf));
  return {
    scheduled: due.length,
    onTime,
    late,
    partial,
    missed,
    onTimeRate: due.length ? Math.round((onTime / due.length) * 100) : 0,
    overdueAmount: moneyRound(overdueAmount),
    completedAccounts: statuses.filter(status => status === "completed" || status === "closed").length,
    activeAccounts: statuses.filter(status => status === "active" || status === "overdue").length,
    bankruptAccounts: (loans || []).filter(loan => loan.status === "bankrupt").length,
  };
}

function explain(result) {
  const positives = [];
  const negatives = [];
  if (result.summary.onTimeRate >= 80) positives.push(`${result.summary.onTimeRate}% payments made on time`);
  else if (result.summary.onTimeRate >= 60) positives.push(`${result.summary.onTimeRate}% on-time rate`);
  if (result.summary.completedAccounts > 0) {
    positives.push(`${result.summary.completedAccounts} successfully completed account${result.summary.completedAccounts === 1 ? "" : "s"}`);
  }
  const recentMissed = result.recent.some(item => item.status === "missed");
  if (!recentMissed && result.summary.missed === 0) positives.push("No missed payments");
  else if (!recentMissed) positives.push("No missed payment in recent activity");
  if (result.summary.overdueAmount <= 0) positives.push("No current overdue amount");
  else if (result.summary.overdueAmount < 2000) positives.push("Current overdue amount is low");

  if (result.summary.late > 0) negatives.push(`${result.summary.late} late payment${result.summary.late === 1 ? "" : "s"}`);
  if (result.summary.missed > 0) negatives.push(`${result.summary.missed} missed payment${result.summary.missed === 1 ? "" : "s"}`);
  if (result.summary.partial > 0) negatives.push(`${result.summary.partial} open partial payment${result.summary.partial === 1 ? "" : "s"}`);
  if (result.summary.overdueAmount > 0) {
    negatives.push(`₹${result.summary.overdueAmount.toLocaleString("en-IN")} currently overdue`);
  }
  if (result.summary.bankruptAccounts > 0) {
    negatives.push(`${result.summary.bankruptAccounts} bankrupt account${result.summary.bankruptAccounts === 1 ? "" : "s"}`);
  }
  if (!positives.length) positives.push("Limited positive repayment signals so far");
  return { positives, negatives };
}

function recentBehavior(rows, asOf) {
  return [...scoredRows(rows)]
    .sort((a, b) => iso(b.dueDate).localeCompare(iso(a.dueDate)))
    .slice(0, 8)
    .map(row => {
      const tone = row.status === "on_time" ? "good" : row.status === "late" || row.status === "partial" ? "warn" : "bad";
      const mark = tone === "good" ? "✓" : tone === "warn" ? "⚠" : "✕";
      let label = "On Time";
      if (row.status === "late") label = row.daysLate === 1 ? "1 Day Late" : `${row.daysLate} Days Late`;
      if (row.status === "partial") label = "Partial";
      if (row.status === "missed") label = "Missed";
      return {
        date: row.dueDate,
        amount: row.expected,
        status: row.status,
        label: `${mark} ${row.dueDate} — ₹${Math.round(row.expected).toLocaleString("en-IN")} — ${label}`,
        tone,
      };
    });
}

function trendFromHistory(history, currentScore) {
  if (!history.length) return { trend: "stable", trendLabel: "Stable" };
  const previous = history[0].score;
  const delta = currentScore - previous;
  if (delta >= 8) return { trend: "improving", trendLabel: "Improving" };
  if (delta <= -8) return { trend: "declining", trendLabel: "Declining" };
  return { trend: "stable", trendLabel: "Stable" };
}

function buildResult(rows, loans, asOf) {
  const due = scoredRows(rows);
  if (!hasEnoughHistory(rows)) {
    return {
      available: false,
      reason: "insufficient",
      title: "Not enough payment history",
      message: "Credit score will be calculated after sufficient payment activity.",
      summary: summarize(rows, loans, asOf),
    };
  }
  const summary = summarize(rows, loans, asOf);
  const factors = {
    timeliness: factorTimeliness(rows, asOf),
    consistency: factorConsistency(rows),
    missed: factorMissed(rows),
    late: factorLate(rows),
    overdue: factorOverdue(rows, summary),
    completed: factorCompleted(summary),
  };
  const score = composeScore(factors, summary);
  const band = scoreBand(score);
  const recent = recentBehavior(rows, asOf);
  const result = {
    available: true,
    score,
    rating: band.label,
    band: band.id,
    summary,
    factors: [
      { id: "timeliness", label: "Payment timeliness", weight: SCORE_WEIGHTS.timeliness, score: Math.round(factors.timeliness) },
      { id: "consistency", label: "Payment consistency", weight: SCORE_WEIGHTS.consistency, score: Math.round(factors.consistency) },
      { id: "missed", label: "Missed payments", weight: SCORE_WEIGHTS.missed, score: Math.round(factors.missed) },
      { id: "late", label: "Late payments", weight: SCORE_WEIGHTS.late, score: Math.round(factors.late) },
      { id: "overdue", label: "Outstanding / overdue", weight: SCORE_WEIGHTS.overdue, score: Math.round(factors.overdue) },
      { id: "completed", label: "Completed repayment history", weight: SCORE_WEIGHTS.completed, score: Math.round(factors.completed) },
    ],
    recent,
    asOf,
  };
  const explained = explain(result);
  return { ...result, ...explained };
}

function collectRows(loans, chitPayments, asOf) {
  const financeRows = (loans || []).flatMap(loan => financeInstallments(loan, asOf));
  const chitRows = chitInstallments(chitPayments, asOf);
  return [...financeRows, ...chitRows];
}

export function calculateFintrackCreditScore({
  loans = [],
  chitPayments = [],
  asOf: asOfInput,
  focusLoanId,
} = {}) {
  const asOf = iso(asOfInput) || todayIso();
  const rows = collectRows(loans, chitPayments, asOf);
  const current = buildResult(rows, loans, asOf);
  if (!current.available) return current;

  const history = [];
  for (let offset = 1; offset <= 6; offset += 1) {
    const cursor = addMonths(`${asOf.slice(0, 8)}01`, -offset);
    const end = monthEnd(cursor);
    if (end >= asOf) continue;
    const pastRows = collectRows(loans, chitPayments, end);
    const past = buildResult(pastRows, loans, end);
    if (past.available) history.push({ month: end, label: monthLabel(end), score: past.score, rating: past.rating });
  }

  const { trend, trendLabel } = trendFromHistory(history, current.score);
  let accountScore = null;
  if (focusLoanId) {
    const focusLoan = loans.find(loan => loan.id === focusLoanId);
    if (focusLoan) {
      const focus = buildResult(financeInstallments(focusLoan, asOf), [focusLoan], asOf);
      if (focus.available) {
        accountScore = { score: focus.score, rating: focus.rating, band: focus.band, kind: focusLoan.kind };
      }
    }
  }

  return { ...current, history, trend, trendLabel, accountScore };
}

export function compactCreditScore(input) {
  const result = calculateFintrackCreditScore(input);
  if (!result.available) return { available: false, label: "N/A" };
  return {
    available: true,
    score: result.score,
    rating: result.rating,
    band: result.band,
    label: `${result.score} ${result.rating}`,
  };
}
