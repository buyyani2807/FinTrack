import { formatInr } from "../../../lib/formatMoney.js";
import { compactCreditScore } from "../../creditScore/creditScoreModel.js";
import { addDays, collectedOn, dailyFirstDueDate, loanStatus, missedMonths } from "./loanState.js";

const RISKY_BANDS = new Set(["high_risk", "attention"]);

const creditBand = (loan, asOf) => {
  try {
    const score = compactCreditScore({ loans: [loan], asOf, focusLoanId: loan.id });
    return score?.available ? score.band : null;
  } catch {
    return null;
  }
};

function dailyPattern(loan, asOf, lookback = 30) {
  const firstDue = dailyFirstDueDate(loan.startDate) || loan.startDate || asOf;
  let due = 0;
  let paid = 0;
  let recentMissed = 0;
  for (let i = 1; i <= lookback; i += 1) {
    const date = addDays(asOf, -i);
    if (date < firstDue) continue;
    due += 1;
    if (collectedOn(loan, date)) paid += 1;
    else if (i <= 7) recentMissed += 1;
  }
  return { due, paid, recentMissed };
}

function monthlyLags(loan) {
  const dueDay = Number(String(loan.startDate || "").slice(8, 10)) || 1;
  return (loan.transactions || [])
    .map(transaction => {
      const date = String(transaction.date || "");
      if (!date) return null;
      const lag = Number(date.slice(8, 10)) - dueDay;
      return lag < -15 ? lag + 30 : lag;
    })
    .filter(value => value != null)
    .slice(-6);
}

/**
 * Adds risk, recommended action, contact channel, assigned agent, and the verified payment pattern to a
 * ranked collection row. Advisory only: it never changes the loan, credit score, status, or agent.
 */
export function enrichCollectionPriority(row, loan, { asOf, kind = "daily", isOwner = true } = {}) {
  if (!loan) return { ...row, risk: "low", recommendedAction: "Review the account.", channel: "Visit", assignedAgent: "", paymentPattern: null, sourceRecords: [] };
  const overdue = loanStatus(loan) === "overdue";
  const band = creditBand(loan, asOf);
  let risk;
  let paymentPattern = null;
  let daysOverdue;
  if (kind === "monthly") {
    const missed = missedMonths(loan);
    daysOverdue = missed * 30;
    risk = missed >= 2 || (overdue && RISKY_BANDS.has(band)) ? "high" : missed >= 1 || overdue ? "medium" : "low";
    const lags = monthlyLags(loan);
    if (lags.length >= 2) {
      const sorted = [...lags].sort((a, b) => a - b);
      const low = Math.max(0, sorted[0]);
      const high = Math.max(0, sorted[sorted.length - 1]);
      paymentPattern = high === 0 ? "Historically pays on or before the due day." : `Historically pays ${low}–${high} days after the due day.`;
    }
  } else {
    const pattern = dailyPattern(loan, asOf);
    daysOverdue = pattern.recentMissed;
    risk = pattern.recentMissed >= 3 || (overdue && RISKY_BANDS.has(band)) ? "high" : pattern.recentMissed >= 1 || overdue ? "medium" : "low";
    if (pattern.due >= 7) paymentPattern = `Paid on ${pattern.paid} of the last ${pattern.due} due days.`;
  }
  const hasPhone = Boolean(loan.phone);
  const channel = hasPhone ? (risk === "high" ? "Phone call" : "WhatsApp") : "Visit";
  const recommendedAction = risk === "high"
    ? `${hasPhone ? "Call" : "Visit"} ${row.name} today.`
    : risk === "medium" ? `${hasPhone ? "Send a WhatsApp reminder" : "Visit"} today.` : "Collect on the usual route.";
  const assignedAgent = loan.collectionAgentId
    ? (isOwner ? "Assigned collection agent" : "Assigned to you")
    : "Not assigned";
  return {
    ...row,
    risk,
    daysOverdue,
    recommendedAction,
    channel,
    assignedAgent,
    paymentPattern,
    reason: row.why?.join(" · ") || "",
    sourceRecords: (loan.transactions || []).slice(-3).map(transaction => ({ date: transaction.date, amount: Number(transaction.amount || 0) })),
    summary: `${row.name}: ${formatInr(row.outstanding || 0)} outstanding · ${risk} risk`,
    advisory: true,
    writeAction: "none",
  };
}
