import { addDaysIso, roundMoney } from "./accountingModel.js";
import { formatInr } from "../../lib/formatMoney.js";
import { cashFlow, dashboardMetrics, gstBooksReport, invoiceRegister, profitAndLoss } from "./accountingReports.js";

const money = value => formatInr(value);
const pct = (current, previous) => {
  if (!Number.isFinite(Number(previous)) || Number(previous) === 0) return null;
  return roundMoney(((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100);
};
const daysBetween = (from, to) => {
  const start = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(to).slice(0, 10)}T00:00:00`);
  return Math.round((end - start) / 86400000);
};
const inWindow = (iso, from, to) => iso && iso >= from && iso <= to;
const trendWords = change => {
  if (change == null) return null;
  if (change > 0) return `up ${Math.abs(change)}%`;
  if (change < 0) return `down ${Math.abs(change)}%`;
  return "unchanged";
};

export function previousComparisonRange({ from, to, fy, lastFy } = {}) {
  if (fy?.from && fy?.to && from === fy.from && to === fy.to && lastFy?.from && lastFy?.to) {
    return { from: lastFy.from, to: lastFy.to, label: lastFy.label || `${lastFy.from} to ${lastFy.to}` };
  }
  const span = Math.max(1, daysBetween(from, to) + 1);
  const prevTo = addDaysIso(from, -1);
  const prevFrom = addDaysIso(prevTo, -(span - 1));
  return { from: prevFrom, to: prevTo, label: `${prevFrom} to ${prevTo}` };
}

const agingFromInvoices = (rows = []) => {
  let current = 0;
  let overdue = 0;
  const byParty = new Map();
  for (const row of rows) {
    const amount = Number(row.outstanding || 0);
    if (amount <= 0) continue;
    if (row.status === "Overdue") overdue += amount;
    else current += amount;
    const name = row.partyName || "Unassigned";
    byParty.set(name, roundMoney((byParty.get(name) || 0) + amount));
  }
  const largest = [...byParty.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    current: roundMoney(current),
    overdue: roundMoney(overdue),
    total: roundMoney(current + overdue),
    largestParty: largest ? { name: largest[0], amount: largest[1] } : null,
  };
};

const dueWithinDays = (rows, today, days) => {
  const until = addDaysIso(today, days);
  return roundMoney((rows || []).reduce((sum, row) => {
    if (Number(row.outstanding || 0) <= 0) return sum;
    if (!inWindow(row.dueDate, today, until)) return sum;
    return sum + Number(row.outstanding || 0);
  }, 0));
};

const postedInRange = (vouchers, from, to) =>
  (vouchers || []).filter(row => row.status === "posted" && inWindow(row.date, from, to));

const median = values => {
  const rows = [...values].sort((a, b) => a - b);
  if (!rows.length) return 0;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : roundMoney((rows[mid - 1] + rows[mid]) / 2);
};

export function buildAccountsFacts({
  accounts = [],
  vouchers = [],
  parties = [],
  range = {},
  previousRange = {},
  today,
  companyId,
  companyName,
} = {}) {
  const currentRange = { from: range.from, to: range.to };
  const priorRange = { from: previousRange.from, to: previousRange.to };
  const currentPosted = postedInRange(vouchers, currentRange.from, currentRange.to);
  const priorPosted = postedInRange(vouchers, priorRange.from, priorRange.to);
  const metrics = dashboardMetrics(accounts, vouchers, parties, { today, ...currentRange });
  const priorMetrics = dashboardMetrics(accounts, vouchers, parties, { today: priorRange.to || today, ...priorRange });
  const pnl = profitAndLoss(accounts, vouchers, currentRange);
  const priorPnl = profitAndLoss(accounts, vouchers, priorRange);
  const flow = cashFlow(accounts, vouchers, currentRange);
  const priorFlow = cashFlow(accounts, vouchers, priorRange);
  const arRows = invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today, ...currentRange, outstandingOnly: true });
  const apRows = invoiceRegister(accounts, vouchers, parties, { kind: "payable", today, ...currentRange, outstandingOnly: true });
  const priorArRows = invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: priorRange.to || today, ...priorRange, outstandingOnly: true });
  const priorApRows = invoiceRegister(accounts, vouchers, parties, { kind: "payable", today: priorRange.to || today, ...priorRange, outstandingOnly: true });
  const ar = agingFromInvoices(arRows);
  const ap = agingFromInvoices(apRows);
  const gst = gstBooksReport(vouchers, currentRange);
  const priorGst = gstBooksReport(vouchers, priorRange);
  const expenses = [...(pnl.expenses || [])].filter(row => row.amount > 0).sort((a, b) => b.amount - a.amount);
  const priorExpenseById = Object.fromEntries((priorPnl.expenses || []).map(row => [row.id || row.code || row.name, row.amount]));
  const expenseMoves = expenses.slice(0, 8).map(row => {
    const key = row.id || row.code || row.name;
    return { name: row.name, amount: row.amount, change: pct(row.amount, priorExpenseById[key]) };
  });
  const amounts = currentPosted.map(row => voucherTotalsSafe(row));
  return {
    companyId: companyId || null,
    companyName: companyName || "",
    range: currentRange,
    previousRange: { ...priorRange, label: previousRange.label || `${priorRange.from} to ${priorRange.to}` },
    hasCurrentActivity: currentPosted.length > 0,
    hasPriorActivity: priorPosted.length > 0,
    currentCount: currentPosted.length,
    priorCount: priorPosted.length,
    income: pnl.totalIncome,
    expenses: pnl.totalExpense,
    profit: pnl.net,
    priorIncome: priorPnl.totalIncome,
    priorExpenses: priorPnl.totalExpense,
    priorProfit: priorPnl.net,
    cash: metrics.cash,
    bank: metrics.bank,
    upi: metrics.upi,
    cashClosing: flow.closing,
    inflow: flow.inflow,
    outflow: flow.outflow,
    priorInflow: priorFlow.inflow,
    priorOutflow: priorFlow.outflow,
    receivables: ar.total,
    receivablesCurrent: ar.current,
    receivablesOverdue: ar.overdue,
    receivablesLargest: ar.largestParty,
    priorReceivables: agingFromInvoices(priorArRows).total,
    payables: ap.total,
    payablesCurrent: ap.current,
    payablesOverdue: ap.overdue,
    payablesLargest: ap.largestParty,
    payablesDue15: dueWithinDays(apRows, today, 15),
    priorPayables: agingFromInvoices(priorApRows).total,
    expenseMoves,
    gstOutput: gst.outputTax,
    gstInput: gst.inputTax,
    gstNet: gst.netPayable,
    priorGstOutput: priorGst.outputTax,
    priorGstInput: priorGst.inputTax,
    posted: currentPosted.map(row => ({
      id: row.id,
      date: row.date,
      partyId: row.partyId || null,
      amount: voucherTotalsSafe(row),
      type: row.voucherType,
      number: row.voucherNumber,
    })),
    typicalAmount: median(amounts),
  };
}

const voucherTotalsSafe = voucher => roundMoney((voucher.lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0));

export function interpretAccountsFacts(facts) {
  if (!facts) return emptyIntelligence("Financial insights are temporarily unavailable.");
  if (!facts.hasCurrentActivity) {
    return emptyIntelligence("AI trend analysis will become available once additional historical data is recorded.");
  }

  const incomeChange = facts.hasPriorActivity ? pct(facts.income, facts.priorIncome) : null;
  const expenseChange = facts.hasPriorActivity ? pct(facts.expenses, facts.priorExpenses) : null;
  const profitChange = facts.hasPriorActivity ? pct(facts.profit, facts.priorProfit) : null;
  const arChange = facts.hasPriorActivity ? pct(facts.receivables, facts.priorReceivables) : null;
  const apChange = facts.hasPriorActivity ? pct(facts.payables, facts.priorPayables) : null;
  const inflowChange = facts.hasPriorActivity ? pct(facts.inflow, facts.priorInflow) : null;
  const outflowChange = facts.hasPriorActivity ? pct(facts.outflow, facts.priorOutflow) : null;
  const gstOutChange = facts.hasPriorActivity ? pct(facts.gstOutput, facts.priorGstOutput) : null;
  const gstInChange = facts.hasPriorActivity ? pct(facts.gstInput, facts.priorGstInput) : null;
  const compare = facts.previousRange?.label || "the previous period";
  const historyNote = facts.hasPriorActivity ? null : "Not enough historical data to generate a reliable comparison.";

  const watch = [];
  const actions = [];
  if (arChange != null && arChange >= 10) watch.push(`Receivables ${trendWords(arChange)} versus ${compare}.`);
  if (expenseChange != null && expenseChange >= 10) watch.push(`Operating expenses ${trendWords(expenseChange)} versus ${compare}.`);
  if (facts.receivablesOverdue > 0) {
    watch.push(`Overdue receivables are ${money(facts.receivablesOverdue)}.`);
    actions.push("Follow up on overdue receivables.");
  }
  if (facts.payablesDue15 > 0) actions.push("Plan for payable obligations due in the next 15 days.");
  if (expenseChange != null && expenseChange >= 15) actions.push("Review the recent increase in operating expenses.");
  if (facts.outflow > facts.inflow) actions.push("Monitor cash availability against upcoming payables.");

  const brief = [
    facts.hasPriorActivity && incomeChange != null
      ? `Revenue is ${trendWords(incomeChange)} compared with ${compare}, while expenses ${expenseChange == null ? "do not have a reliable comparison" : `are ${trendWords(expenseChange)}`}.`
      : historyNote,
    `Receivables currently stand at ${money(facts.receivables)}${facts.receivablesOverdue ? `, with ${money(facts.receivablesOverdue)} overdue` : ""}.`,
    facts.payablesDue15 > 0
      ? `Payables of ${money(facts.payablesDue15)} are due in the next 15 days.`
      : `Payables currently stand at ${money(facts.payables)}.`,
  ].filter(Boolean);

  const categories = {
    profitability: {
      title: "Profitability",
      verified: [
        { label: "Income", value: money(facts.income) },
        { label: "Expenses", value: money(facts.expenses) },
        { label: "Net profit", value: money(facts.profit) },
      ],
      insights: [
        profitChange == null
          ? historyNote
          : `Net profit is ${trendWords(profitChange)} compared with ${compare}.`,
      ].filter(Boolean),
    },
    cash: {
      title: "Cash flow",
      verified: [
        { label: "Cash", value: money(facts.cash) },
        { label: "Bank", value: money(facts.bank) },
        { label: "Incoming", value: money(facts.inflow) },
        { label: "Outgoing", value: money(facts.outflow) },
      ],
      insights: [
        facts.outflow > facts.inflow
          ? "Cash outflows exceeded inflows in the selected period. Review recommended against recorded receivables and payables."
          : "Inflows covered outflows in the selected period.",
        inflowChange == null && outflowChange == null ? historyNote : null,
      ].filter(Boolean),
      link: null,
    },
    receivables: {
      title: "Receivables",
      verified: [
        { label: "Outstanding", value: money(facts.receivables) },
        { label: "Current", value: money(facts.receivablesCurrent) },
        { label: "Overdue", value: money(facts.receivablesOverdue) },
      ],
      insights: [
        arChange == null ? historyNote : `Receivables are ${trendWords(arChange)} compared with ${compare}.`,
        facts.receivablesLargest
          ? `Largest outstanding party: ${facts.receivablesLargest.name} (${money(facts.receivablesLargest.amount)}).`
          : "No outstanding customer invoices in this period.",
      ].filter(Boolean),
      link: "receivables",
    },
    payables: {
      title: "Payables",
      verified: [
        { label: "Outstanding", value: money(facts.payables) },
        { label: "Overdue", value: money(facts.payablesOverdue) },
        { label: "Due in 15 days", value: money(facts.payablesDue15) },
      ],
      insights: [
        apChange == null ? historyNote : `Payables are ${trendWords(apChange)} compared with ${compare}.`,
        facts.payablesLargest
          ? `Largest outstanding supplier: ${facts.payablesLargest.name} (${money(facts.payablesLargest.amount)}).`
          : "No outstanding supplier bills in this period.",
      ].filter(Boolean),
      link: "payables",
    },
    expenses: {
      title: "Expenses",
      verified: expensesVerified(facts),
      insights: expenseInsights(facts, compare, historyNote),
    },
    gst: {
      title: "GST",
      verified: [
        { label: "Output GST", value: money(facts.gstOutput) },
        { label: "Input GST", value: money(facts.gstInput) },
        { label: "Net GST", value: money(facts.gstNet) },
      ],
      insights: [
        facts.gstOutput === 0 && facts.gstInput === 0
          ? "No GST lines are recorded for this period."
          : gstOutChange == null
            ? historyNote
            : `Output GST is ${trendWords(gstOutChange)} compared with ${compare}, while input GST ${gstInChange == null ? "does not have a reliable comparison" : `is ${trendWords(gstInChange)}`}.`,
      ].filter(Boolean),
      link: "gst",
    },
  };

  return {
    ok: true,
    companyId: facts.companyId,
    companyName: facts.companyName,
    comparisonLabel: compare,
    brief,
    watch,
    actions: actions.length ? actions : ["Keep recording vouchers so trend analysis can refine."],
    categories,
    anomalies: detectAnomalies(facts),
    recommendations: unique([
      ...actions,
      facts.receivablesOverdue > 0 ? "Review overdue receivables exceeding the due date." : null,
      facts.typicalAmount > 0 ? "Review unusual transactions before period close." : null,
    ]),
    generatedAt: new Date().toISOString(),
  };
}

const expensesVerified = facts => (facts.expenseMoves || []).slice(0, 3).map(row => ({
  label: row.name,
  value: money(row.amount),
}));

const expenseInsights = (facts, compare, historyNote) => {
  const spikes = (facts.expenseMoves || []).filter(row => row.change != null && row.change >= 20);
  if (!facts.hasPriorActivity) return [historyNote];
  if (!spikes.length) return ["No unusual expense category movement versus the comparison period."];
  return spikes.slice(0, 3).map(row => `${row.name} ${trendWords(row.change)} compared with ${compare}.`);
};

const detectAnomalies = facts => {
  const rows = [];
  const typical = Number(facts.typicalAmount || 0);
  for (const voucher of facts.posted || []) {
    if (typical > 0 && voucher.amount >= typical * 3 && voucher.amount >= 10000) {
      rows.push({
        title: "Possible anomaly · large transaction",
        detail: `${voucher.number} of ${money(voucher.amount)} is substantially higher than the typical posted amount (${money(typical)}). Review recommended.`,
      });
    }
  }
  const seen = new Map();
  for (const voucher of facts.posted || []) {
    if (!voucher.partyId || !voucher.amount) continue;
    const key = `${voucher.date}|${voucher.partyId}|${voucher.amount}|${voucher.type}`;
    if (seen.has(key)) {
      rows.push({
        title: "Possible anomaly · similar entries",
        detail: `${voucher.number} and ${seen.get(key)} have the same party, date, type and amount. Review recommended.`,
      });
    } else {
      seen.set(key, voucher.number);
    }
  }
  if (facts.receivablesLargest && facts.receivables && facts.receivablesLargest.amount >= facts.receivables * 0.5 && facts.receivables >= 10000) {
    rows.push({
      title: "Unusual activity detected · receivables concentration",
      detail: `${facts.receivablesLargest.name} holds ${money(facts.receivablesLargest.amount)} of outstanding receivables. Review recommended.`,
    });
  }
  return rows.slice(0, 6);
};

const unique = rows => [...new Set((rows || []).filter(Boolean))];

const emptyIntelligence = message => ({
  ok: true,
  insufficient: true,
  brief: [message],
  watch: [],
  actions: [],
  categories: {},
  anomalies: [],
  recommendations: [],
  comparisonLabel: "",
});

export function buildAccountsIntelligence(input) {
  return interpretAccountsFacts(buildAccountsFacts(input));
}
