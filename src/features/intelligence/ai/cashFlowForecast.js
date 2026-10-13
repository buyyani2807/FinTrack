import { affectsLedgers, isMoneyAccount, ledgerBalances } from "../../accounts/model/accountingModel.js";
import { invoiceRegister } from "../../accounts/model/accountingReports.js";
import { addDaysIso, advisory, daysBetween, formatInr, isoDate, n, roundMoney, source } from "./aiCommon.js";
import { lagProfile, partySettlementLags } from "./paymentHistory.js";

export const FORECAST_HORIZONS = [0, 7, 30, 60];
const HISTORY_DAYS = 90;
const DOUBTFUL_AFTER_DAYS = 90;
const RECURRING_INFLOW_TYPES = new Set(["sales"]);
const RECURRING_OUTFLOW_TYPES = new Set(["expense"]);

function moneyMovements(accounts, vouchers, { from, to }) {
  const moneyIds = new Set((accounts || []).filter(isMoneyAccount).flatMap(account => [account.id, account.code].filter(Boolean)));
  const rows = [];
  for (const voucher of vouchers || []) {
    if (!affectsLedgers(voucher)) continue;
    const date = isoDate(voucher.date);
    if (date < from || date > to) continue;
    const lines = (voucher.lines || []).filter(line => moneyIds.has(line.coaId) || moneyIds.has(line.code));
    if (!lines.length) continue;
    const allMoney = (voucher.lines || []).every(line => moneyIds.has(line.coaId) || moneyIds.has(line.code));
    if (allMoney) continue;
    const inflow = lines.reduce((sum, line) => sum + n(line.debit), 0);
    const outflow = lines.reduce((sum, line) => sum + n(line.credit), 0);
    rows.push({ date, voucherType: voucher.voucherType, inflow, outflow });
  }
  return rows;
}

/**
 * Cash-flow forecast for today, 7, 30, and 60 days. Verified facts (current money balances, open invoices
 * and bills, recent actual movement) are kept separate from predicted figures. External expected
 * collections (for example Chit Fund or Finance dues) can be supplied as dated rows.
 */
export function buildCashFlowForecast({ accounts = [], vouchers = [], parties = [], asOf, externalInflows = [] } = {}) {
  const today = isoDate(asOf);
  const balances = ledgerBalances(accounts, vouchers, { to: today }).filter(isMoneyAccount);
  const currentBalance = roundMoney(balances.reduce((sum, row) => sum + n(row.balance), 0));
  const historyFrom = addDaysIso(today, -HISTORY_DAYS);
  const history = moneyMovements(accounts, vouchers, { from: historyFrom, to: today });
  const earliestVoucher = (vouchers || []).filter(affectsLedgers).reduce((min, voucher) => (!min || voucher.date < min ? voucher.date : min), "");
  const historySpan = earliestVoucher ? Math.min(HISTORY_DAYS, daysBetween(earliestVoucher, today) || 0) : 0;
  const insufficientHistory = historySpan < 30;
  const spanDays = Math.max(1, historySpan);

  const recurringInflowDaily = insufficientHistory ? 0 : history.filter(row => RECURRING_INFLOW_TYPES.has(row.voucherType)).reduce((sum, row) => sum + row.inflow, 0) / spanDays;
  const recurringOutflowDaily = insufficientHistory ? 0 : history.filter(row => RECURRING_OUTFLOW_TYPES.has(row.voucherType)).reduce((sum, row) => sum + row.outflow, 0) / spanDays;

  const lags = partySettlementLags(vouchers, { settleType: "receipt" });
  const receivables = invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today, outstandingOnly: true });
  const payables = invoiceRegister(accounts, vouchers, parties, { kind: "payable", today, outstandingOnly: true });

  const doubtful = [];
  const inflowItems = [];
  for (const row of receivables) {
    const overdue = n(row.daysOverdue);
    if (overdue > DOUBTFUL_AFTER_DAYS) {
      doubtful.push(row);
      continue;
    }
    const profile = lagProfile(lags.get(row.partyId) || []);
    const expected = addDaysIso(row.dueDate, Math.max(0, profile.typicalLag ?? 0));
    const date = expected < today ? addDaysIso(today, 7) : expected;
    inflowItems.push({
      id: `ar-${row.id}`,
      date,
      amount: roundMoney(row.outstanding),
      label: `${row.partyName} · ${row.reference}`,
      basis: profile.typicalLag != null ? `usually pays ${profile.typicalLag} day(s) after due date` : overdue > 0 ? "overdue; assumed within 7 days" : "due date",
      source: source("receivables", "Open receivables", { partyId: row.partyId }),
    });
  }
  for (const row of externalInflows || []) {
    const date = isoDate(row.date);
    if (!date || !(n(row.amount) > 0)) continue;
    inflowItems.push({
      id: `ext-${row.id || `${row.source}-${date}-${row.amount}`}`,
      date: date < today ? today : date,
      amount: roundMoney(row.amount),
      label: row.label || "Expected collection",
      basis: row.basis || "scheduled due date",
      source: row.link || null,
      external: row.source || "external",
    });
  }
  const outflowItems = payables.map(row => ({
    id: `ap-${row.id}`,
    date: row.dueDate < today ? addDaysIso(today, 7) : row.dueDate,
    amount: roundMoney(row.outstanding),
    label: `${row.partyName} · ${row.reference}`,
    basis: row.dueDate < today ? "overdue; assumed paid within 7 days" : "due date",
    source: source("payables", "Open payables", { partyId: row.partyId }),
  }));

  const horizons = FORECAST_HORIZONS.map(days => {
    const until = addDaysIso(today, days);
    const scheduledIn = inflowItems.filter(item => item.date <= until);
    const scheduledOut = outflowItems.filter(item => item.date <= until);
    const recurringIn = roundMoney(recurringInflowDaily * days);
    const recurringOut = roundMoney(recurringOutflowDaily * days);
    const inflows = roundMoney(scheduledIn.reduce((sum, item) => sum + item.amount, 0) + recurringIn);
    const outflows = roundMoney(scheduledOut.reduce((sum, item) => sum + item.amount, 0) + recurringOut);
    return {
      days,
      label: days === 0 ? "Today" : `${days} days`,
      until,
      inflows,
      outflows,
      recurringInflows: recurringIn,
      recurringOutflows: recurringOut,
      projectedBalance: roundMoney(currentBalance + inflows - outflows),
      change: roundMoney(inflows - outflows),
    };
  });

  const within10 = roundMoney(inflowItems.filter(item => item.date <= addDaysIso(today, 10)).reduce((sum, item) => sum + item.amount, 0));
  const h30 = horizons.find(row => row.days === 30);
  const due30Out = outflowItems.filter(item => item.date <= h30.until).reduce((sum, item) => sum + item.amount, 0);
  const sentences = [];
  if (insufficientHistory) sentences.push("Insufficient history for recurring patterns; only saved invoices and bills are projected.");
  if (h30.change < 0) {
    sentences.push(`Cash may fall by ${formatInr(Math.abs(h30.change))} over the next 30 days${due30Out > 0 ? `, mainly because ${formatInr(due30Out)} of supplier bills fall due` : ""}.`);
  } else if (h30.change > 0) {
    sentences.push(`Cash may rise by ${formatInr(h30.change)} over the next 30 days if expected collections arrive.`);
  } else {
    sentences.push("No net change is expected over the next 30 days from saved records.");
  }
  if (within10 > 0) sentences.push(`${formatInr(within10)} of receivables expected within 10 days.`);
  if (doubtful.length) sentences.push(`${formatInr(doubtful.reduce((sum, row) => sum + n(row.outstanding), 0))} overdue more than ${DOUBTFUL_AFTER_DAYS} days is excluded as uncertain.`);

  const drivers = [...inflowItems.map(item => ({ ...item, direction: "in" })), ...outflowItems.map(item => ({ ...item, direction: "out" }))]
    .filter(item => item.date <= addDaysIso(today, 60))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const actualFrom = addDaysIso(today, -30);
  const actual = history.filter(row => row.date >= actualFrom);
  const samples = history.length + receivables.length + payables.length;
  const confidence = insufficientHistory ? "low" : samples >= 30 && historySpan >= 60 ? "medium" : "low";

  return advisory({
    id: "cashflow-forecast",
    title: "Cash-flow forecast",
    asOf: today,
    currentBalance,
    balances: balances.map(row => ({ id: row.id, name: row.name, balance: roundMoney(row.balance) })),
    horizons,
    receivablesWithin10Days: within10,
    explanation: sentences.join(" "),
    assumptions: [
      "Open invoices are expected on their due date, shifted by the customer's usual settlement delay when at least two past settlements exist.",
      "Overdue invoices and bills without history are assumed to settle within 7 days.",
      `Invoices overdue more than ${DOUBTFUL_AFTER_DAYS} days are excluded.`,
      insufficientHistory ? "Recurring cash sales and expenses are not projected because history is shorter than 30 days." : `Recurring cash sales and expenses are projected at their average daily rate over the last ${historySpan} days.`,
      "New sales, purchases, loans, and owner withdrawals are not predicted.",
      "This is a projection, not a guarantee.",
    ],
    drivers,
    doubtful: doubtful.map(row => ({ id: row.id, label: `${row.partyName} · ${row.reference}`, amount: roundMoney(row.outstanding), daysOverdue: row.daysOverdue })),
    actualLast30Days: {
      inflows: roundMoney(actual.reduce((sum, row) => sum + row.inflow, 0)),
      outflows: roundMoney(actual.reduce((sum, row) => sum + row.outflow, 0)),
      from: actualFrom,
      to: today,
    },
    insufficientHistory,
    confidence,
    confidencePct: confidence === "medium" ? 60 : 35,
    severity: horizons.some(row => row.projectedBalance < 0) ? "high" : h30.change < 0 ? "medium" : "low",
    source: source("reports", "Open cash flow report", { reportTab: "cashflow" }),
  });
}
