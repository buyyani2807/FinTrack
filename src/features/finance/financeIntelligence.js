import { formatInr } from "../../lib/formatMoney.js";
import { paymentValue } from "../receipts/receiptModel.js";
import { buildMonthlyUpcoming } from "../receipts/upcomingPayments.js";
import { compactCreditScore } from "../creditScore/creditScoreModel.js";
import { addDays, collectedOn, loanBalance, loanStatus, missedMonths, monthlyInterestPending } from "./loanState.js";

const money = value => formatInr(value);
const monthKey = iso => String(iso || "").slice(0, 7);
const inMonth = (iso, key) => monthKey(iso) === key;
const collectionRate = (collected, expected) => {
  if (!(Number(expected) > 0)) return null;
  return Math.round(Number(collected) / Number(expected) * 1000) / 10;
};

const collectableDaily = loans => (loans || []).filter(loan => loan.kind === "daily" && loan.status === "active" && loanBalance(loan) > 0);
const collectableMonthly = loans => (loans || []).filter(loan => loan.kind === "monthly" && ["active", "overdue"].includes(loanStatus(loan)) && loanBalance(loan) > 0);

const receivedOn = (loan, date) => (loan.transactions || [])
  .filter(transaction => transaction.date === date)
  .reduce((sum, transaction) => sum + paymentValue(loan, transaction), 0);

const receivedInMonth = (loan, key) => (loan.transactions || [])
  .filter(transaction => inMonth(transaction.date, key))
  .reduce((sum, transaction) => sum + paymentValue(loan, transaction), 0);

const missedRecentDailyDays = (loan, asOf, lookback = 7) => {
  let missed = 0;
  for (let i = 1; i <= lookback; i += 1) {
    const date = addDays(asOf, -i);
    if (date < loan.startDate) continue;
    if (!collectedOn(loan, date)) missed += 1;
  }
  return missed;
};

const scoreForLoan = (loan, asOf) => {
  try {
    return compactCreditScore({ loans: [loan], asOf, focusLoanId: loan.id });
  } catch {
    return { available: false, label: "N/A" };
  }
};

export function buildDailyFinanceFacts(loans = [], { asOf, isOwner = true } = {}) {
  const today = asOf;
  const rows = collectableDaily(loans);
  const expectedToday = rows.reduce((sum, loan) => sum + Number(loan.dailyCollection || 0), 0);
  const collectedToday = rows.reduce((sum, loan) => sum + receivedOn(loan, today), 0);
  const pendingToday = Math.max(0, expectedToday - collectedToday);
  const collectedCount = rows.filter(loan => collectedOn(loan, today)).length;
  const pendingCustomers = rows.filter(loan => !collectedOn(loan, today)).map(loan => {
    const outstanding = loanBalance(loan);
    const missedDays = missedRecentDailyDays(loan, today);
    const status = loanStatus(loan);
    return {
      id: loan.id,
      name: loan.customerName,
      dueToday: Number(loan.dailyCollection || 0),
      outstanding,
      missedDays,
      overdue: status === "overdue",
      status,
    };
  });
  const overdueCustomers = rows.filter(loan => loanStatus(loan) === "overdue");
  const repeatedMisses = pendingCustomers.filter(row => row.missedDays >= 3);
  const highOutstanding = [...pendingCustomers].sort((a, b) => b.outstanding - a.outstanding).filter(row => row.outstanding > 0).slice(0, 5);
  const priorities = [...pendingCustomers]
    .map(row => ({
      ...row,
      rank: (row.overdue ? 100 : 0) + row.missedDays * 12 + Math.min(40, Math.round(row.outstanding / Math.max(1, row.dueToday))),
    }))
    .sort((a, b) => b.rank - a.rank || b.outstanding - a.outstanding)
    .slice(0, 5)
    .map(row => {
      const credit = scoreForLoan(rows.find(loan => loan.id === row.id), today);
      const why = [
        row.dueToday > 0 ? `${money(row.dueToday)} due today` : null,
        row.overdue ? "account is overdue" : null,
        row.missedDays >= 2 ? `${row.missedDays} missed collections in the last 7 days` : null,
        row.outstanding > 0 ? `${money(row.outstanding)} outstanding` : null,
        credit.available && (credit.band === "high_risk" || credit.band === "attention")
          ? `FinTrack credit score ${credit.label}`
          : null,
      ].filter(Boolean);
      return { id: row.id, name: row.name, dueToday: row.dueToday, outstanding: row.outstanding, why };
    });
  const assigned = rows.filter(loan => loan.collectionAgentId);
  const agentAssigned = assigned.length;
  const agentCollected = assigned.filter(loan => collectedOn(loan, today)).length;
  return {
    module: "daily",
    asOf: today,
    isOwner,
    scopedToAssigned: !isOwner,
    activeCount: rows.length,
    expectedToday,
    collectedToday,
    pendingToday,
    collectionRate: collectionRate(collectedToday, expectedToday),
    collectedCount,
    pendingCount: pendingCustomers.length,
    overdueCount: overdueCustomers.length,
    repeatedMissCount: repeatedMisses.length,
    outstandingTotal: rows.reduce((sum, loan) => sum + loanBalance(loan), 0),
    pendingCustomers: pendingCustomers.slice(0, 20),
    highOutstanding,
    priorities,
    agentAssigned,
    agentCollected,
    agentRate: collectionRate(agentCollected, agentAssigned),
  };
}

export function interpretDailyFinanceFacts(facts) {
  const rateText = facts.collectionRate == null ? "No expected collection is recorded for today." : `${facts.collectionRate}% of today's expected collection has been completed.`;
  const summary = facts.activeCount
    ? `Today: ${money(facts.collectedToday)} collected of ${money(facts.expectedToday)} expected.`
    : "No active Daily Finance collections to interpret today.";
  const attention = [
    facts.pendingCount ? `${facts.pendingCount} customer${facts.pendingCount === 1 ? " has" : "s have"} not completed today's collection.` : null,
    facts.repeatedMissCount ? `${facts.repeatedMissCount} customer${facts.repeatedMissCount === 1 ? " has" : "s have"} missed multiple recent daily collections.` : null,
    facts.overdueCount ? `${facts.overdueCount} daily account${facts.overdueCount === 1 ? " is" : "s are"} overdue.` : null,
    facts.highOutstanding[0] ? `${facts.highOutstanding[0].name} has ${money(facts.highOutstanding[0].outstanding)} outstanding.` : null,
  ].filter(Boolean);
  const actions = [
    facts.pendingCount ? `Prioritize the ${facts.pendingCount} customer${facts.pendingCount === 1 ? "" : "s"} still pending for today's collection.` : null,
    facts.repeatedMissCount ? `Follow up with the ${facts.repeatedMissCount} customer${facts.repeatedMissCount === 1 ? "" : "s"} with repeated missed daily payments.` : null,
    facts.pendingToday > 0 ? `Review ${money(facts.pendingToday)} still pending for today.` : null,
    !facts.pendingCount && facts.activeCount ? "Today's daily collections are complete for the accounts in view." : null,
  ].filter(Boolean);
  if (facts.scopedToAssigned) {
    attention.unshift("Insights are limited to customers assigned to you.");
  }
  if (!facts.isOwner && facts.agentAssigned) {
    actions.push(`You have collected from ${facts.agentCollected} of ${facts.agentAssigned} assigned daily customers today.`);
  }
  return {
    kicker: "AI daily finance insights",
    note: `Interpretation of verified Daily Finance figures · ${facts.asOf}`,
    summary,
    attention: attention.slice(0, 4),
    performance: [
      { label: "Expected today", value: money(facts.expectedToday), kind: "verified" },
      { label: "Collected", value: money(facts.collectedToday), kind: "verified" },
      { label: "Pending", value: money(facts.pendingToday), kind: "verified" },
      { label: "Collection rate", value: facts.collectionRate == null ? "—" : `${facts.collectionRate}%`, kind: "verified" },
    ],
    actions: actions.slice(0, 4),
    priorities: facts.priorities,
    details: [
      {
        id: "today",
        title: "Today's collection status",
        verified: [
          { label: "Expected", value: money(facts.expectedToday) },
          { label: "Collected", value: money(facts.collectedToday) },
          { label: "Pending", value: money(facts.pendingToday) },
          { label: "Customers collected", value: `${facts.collectedCount} / ${facts.activeCount}` },
        ],
        insights: [rateText],
      },
      {
        id: "attention",
        title: "Customers requiring attention",
        verified: [
          { label: "Not collected today", value: String(facts.pendingCount) },
          { label: "Repeated missed payments", value: String(facts.repeatedMissCount) },
          { label: "Overdue accounts", value: String(facts.overdueCount) },
        ],
        insights: attention.filter(item => !item.startsWith("Insights are limited")),
        link: "customers",
        linkLabel: "View customers",
      },
      {
        id: "priorities",
        title: "Collection priorities",
        verified: facts.priorities.slice(0, 3).map(row => ({ label: row.name, value: money(row.dueToday) })),
        insights: facts.priorities.map(row => `${row.name} — ${row.why.join("; ")}.`),
      },
    ],
    disclaimer: "Verified amounts come from Daily Finance collection logic. Insights are advisory and do not record payments, change credit scores, or close accounts.",
  };
}

export function buildMonthlyFinanceFacts(loans = [], { asOf, isOwner = true } = {}) {
  const today = asOf;
  const currentMonth = monthKey(today);
  const previousMonth = monthKey(addDays(`${currentMonth}-01`, -1));
  const rows = collectableMonthly(loans);
  const upcoming = buildMonthlyUpcoming(rows, today);
  const upcomingThisMonth = upcoming.filter(item => inMonth(item.dueDate, currentMonth));
  const upcomingThisWeek = upcoming.filter(item => item.daysRemaining != null && item.daysRemaining <= 7);
  const collectedThisMonth = rows.reduce((sum, loan) => sum + receivedInMonth(loan, currentMonth), 0);
  const collectedPreviousMonth = rows.reduce((sum, loan) => sum + receivedInMonth(loan, previousMonth), 0);
  const pendingThisMonth = upcomingThisMonth.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expectedThisMonth = collectedThisMonth + pendingThisMonth;
  const overdue = rows.filter(loan => loanStatus(loan) === "overdue" || monthlyInterestPending(loan) > 0);
  const missedRepeat = rows.map(loan => ({ loan, missed: missedMonths(loan) })).filter(row => row.missed >= 2);
  const consistent = rows.filter(loan => missedMonths(loan) === 0 && loanStatus(loan) === "active");
  const delayedUpcoming = upcomingThisWeek.filter(item => {
    const loan = rows.find(row => row.id === item.sourceId);
    return loan && missedMonths(loan) > 0;
  });
  const outstandingTotal = rows.reduce((sum, loan) => sum + loanBalance(loan), 0);
  const monthChange = collectedPreviousMonth > 0
    ? Math.round((collectedThisMonth - collectedPreviousMonth) / collectedPreviousMonth * 1000) / 10
    : null;
  const priorities = overdue
    .map(loan => {
      const next = upcoming.find(item => item.sourceId === loan.id);
      const missed = missedMonths(loan);
      const outstanding = loanBalance(loan);
      const credit = scoreForLoan(loan, today);
      const why = [
        next ? `${money(next.amount)} due ${next.dueDate}` : null,
        missed ? `${missed} missed monthly payment${missed === 1 ? "" : "s"}` : "interest is pending",
        outstanding > 0 ? `${money(outstanding)} outstanding` : null,
        credit.available && (credit.band === "high_risk" || credit.band === "attention")
          ? `FinTrack credit score ${credit.label}`
          : null,
      ].filter(Boolean);
      return { id: loan.id, name: loan.customerName, dueToday: next?.amount || 0, outstanding, why, missed };
    })
    .sort((a, b) => b.missed - a.missed || b.outstanding - a.outstanding)
    .slice(0, 5);
  return {
    module: "monthly",
    asOf: today,
    isOwner,
    scopedToAssigned: !isOwner,
    currentMonth,
    previousMonth,
    activeCount: rows.length,
    expectedThisMonth,
    collectedThisMonth,
    pendingThisMonth,
    collectionRate: collectionRate(collectedThisMonth, expectedThisMonth),
    collectedPreviousMonth,
    monthChange,
    hasPreviousMonth: collectedPreviousMonth > 0,
    overdueCount: overdue.length,
    missedRepeatCount: missedRepeat.length,
    consistentCount: consistent.length,
    delayedUpcomingCount: delayedUpcoming.length,
    outstandingTotal,
    outstandingCustomers: rows.filter(loan => loanBalance(loan) > 0).length,
    upcomingThisWeekCount: upcomingThisWeek.length,
    priorities,
  };
}

export function interpretMonthlyFinanceFacts(facts) {
  const rateText = facts.collectionRate == null
    ? "Not enough current-month dues are recorded to compute a collection rate."
    : `${facts.collectionRate}% of this month's expected collection has been completed.`;
  const trend = facts.hasPreviousMonth
    ? `Monthly collections are ${Math.abs(facts.monthChange)}% ${facts.monthChange >= 0 ? "higher" : "lower"} than last month.`
    : "Not enough historical data to compare with last month.";
  const summary = facts.activeCount
    ? `This month: ${money(facts.collectedThisMonth)} collected of ${money(facts.expectedThisMonth)} expected.`
    : "No active Monthly Finance accounts to interpret.";
  const attention = [
    facts.overdueCount ? `${facts.overdueCount} customer${facts.overdueCount === 1 ? " has" : "s have"} pending or overdue monthly interest.` : null,
    facts.delayedUpcomingCount ? `${facts.delayedUpcomingCount} customer${facts.delayedUpcomingCount === 1 ? "" : "s"} with payments due this week previously delayed payments.` : null,
    facts.missedRepeatCount ? `${facts.missedRepeatCount} customer${facts.missedRepeatCount === 1 ? " has" : "s have"} missed more than one monthly cycle.` : null,
    facts.outstandingTotal > 0 ? `${money(facts.outstandingTotal)} remains outstanding across ${facts.outstandingCustomers} customers.` : null,
  ].filter(Boolean);
  const actions = [
    facts.pendingThisMonth > 0 ? `Review ${money(facts.pendingThisMonth)} still pending this month.` : null,
    facts.overdueCount ? `Follow up with the ${facts.overdueCount} overdue monthly customer${facts.overdueCount === 1 ? "" : "s"}.` : null,
    facts.delayedUpcomingCount ? "Prioritize customers due this week who have delayed before." : null,
    !facts.overdueCount && facts.activeCount ? "No overdue monthly interest is currently flagged." : null,
  ].filter(Boolean);
  if (facts.scopedToAssigned) attention.unshift("Insights are limited to customers assigned to you.");
  return {
    kicker: "AI monthly finance insights",
    note: `Interpretation of verified Monthly Finance figures · ${facts.asOf}`,
    summary,
    attention: attention.slice(0, 4),
    performance: [
      { label: "Expected this month", value: money(facts.expectedThisMonth), kind: "verified" },
      { label: "Collected", value: money(facts.collectedThisMonth), kind: "verified" },
      { label: "Pending", value: money(facts.pendingThisMonth), kind: "verified" },
      { label: "Collection rate", value: facts.collectionRate == null ? "—" : `${facts.collectionRate}%`, kind: "verified" },
    ],
    actions: actions.slice(0, 4),
    priorities: facts.priorities,
    details: [
      {
        id: "month",
        title: "Monthly collection performance",
        verified: [
          { label: "Expected", value: money(facts.expectedThisMonth) },
          { label: "Collected", value: money(facts.collectedThisMonth) },
          { label: "Pending", value: money(facts.pendingThisMonth) },
        ],
        insights: [rateText, trend],
      },
      {
        id: "risk",
        title: "Upcoming collection risk",
        verified: [
          { label: "Due this week", value: String(facts.upcomingThisWeekCount) },
          { label: "Previously delayed", value: String(facts.delayedUpcomingCount) },
        ],
        insights: [
          facts.delayedUpcomingCount
            ? `${facts.delayedUpcomingCount} customers with payments due this week have previously delayed payments.`
            : "No previously delayed customers are due this week.",
        ],
        link: "customers",
        linkLabel: "View customers",
      },
      {
        id: "behavior",
        title: "Monthly customer insights",
        verified: [
          { label: "Consistent payers", value: String(facts.consistentCount) },
          { label: "Repeated misses", value: String(facts.missedRepeatCount) },
          { label: "Outstanding", value: money(facts.outstandingTotal) },
        ],
        insights: [
          `${facts.consistentCount} customer${facts.consistentCount === 1 ? " has" : "s have"} maintained on-time monthly interest so far.`,
          facts.missedRepeatCount ? `${facts.missedRepeatCount} customer${facts.missedRepeatCount === 1 ? " has" : "s have"} missed more than one monthly cycle.` : "No repeated monthly misses are currently recorded.",
        ],
      },
    ],
    disclaimer: "Verified amounts come from Monthly Finance balances, dues, and upcoming payment logic. Insights are advisory and do not change payments or credit scores.",
  };
}

export function buildFinanceIntelligence(kind, loans = [], options = {}) {
  if (kind === "monthly") {
    const facts = buildMonthlyFinanceFacts(loans, options);
    return { facts, report: interpretMonthlyFinanceFacts(facts) };
  }
  const facts = buildDailyFinanceFacts(loans, options);
  return { facts, report: interpretDailyFinanceFacts(facts) };
}
