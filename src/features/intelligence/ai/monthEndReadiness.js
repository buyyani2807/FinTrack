import { affectsLedgers, dateIsLocked, isReversalVoucher } from "../../accounts/model/accountingModel.js";
import { invoiceRegister } from "../../accounts/model/accountingReports.js";
import { currentStockForItem } from "../../accounts/model/inventoryModel.js";
import { addDaysIso, formatInr, isoDate, n, roundMoney, shiftMonthKey, source } from "./aiCommon.js";

const UNCATEGORISED = /suspense|uncategori[sz]ed|unclassified|to be classified/i;

export function monthRange(key) {
  const from = `${key}-01`;
  const to = addDaysIso(`${shiftMonthKey(key, 1)}-01`, -1);
  return { key, from, to };
}

/** The month most likely being closed: the previous month during the first ten days, otherwise this month. */
export function defaultCloseMonth(asOf) {
  const today = isoDate(asOf);
  const key = today.slice(0, 7);
  return Number(today.slice(8, 10)) <= 10 ? shiftMonthKey(key, -1) : key;
}

function missingInvoiceNumbers(vouchers, range) {
  const groups = new Map();
  for (const voucher of vouchers) {
    if (voucher.voucherType !== "sales" || isReversalVoucher(voucher)) continue;
    const match = String(voucher.voucherNumber || "").match(/^(.*?)(\d+)$/);
    if (!match) continue;
    const [, prefix, digits] = match;
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push({ number: Number(digits), width: digits.length, date: isoDate(voucher.date) });
  }
  const gaps = [];
  for (const [prefix, list] of groups) {
    const numbers = [...new Set(list.map(row => row.number))].sort((a, b) => a - b);
    const inMonth = list.filter(row => row.date >= range.from && row.date <= range.to).map(row => row.number);
    if (!inMonth.length) continue;
    const low = Math.min(...inMonth);
    const high = Math.max(...inMonth);
    const width = list[0].width;
    for (let value = low; value <= high && gaps.length < 50; value += 1) {
      if (!numbers.includes(value)) gaps.push(`${prefix}${String(value).padStart(width, "0")}`);
    }
  }
  return gaps;
}

/**
 * Month-end checklist. Reads only; it never closes or locks the period, edits vouchers, reconciles lines,
 * or posts entries. `resolvedKeys` are checklist items a person has already marked as reviewed.
 */
export function buildMonthEndReadiness({
  month,
  asOf,
  accounts = [],
  vouchers = [],
  parties = [],
  items = [],
  stockMovements = [],
  locks = [],
  statements = [],
  anomalies = [],
  gstWarnings = [],
  resolvedKeys = new Set(),
} = {}) {
  const range = monthRange(month || defaultCloseMonth(asOf));
  const inMonth = (vouchers || []).filter(voucher => affectsLedgers(voucher) && isoDate(voucher.date) >= range.from && isoDate(voucher.date) <= range.to);
  const accountByKey = new Map((accounts || []).flatMap(account => [[account.id, account], [account.code, account]]));

  const bankLines = (statements || []).flatMap(statement => (statement.lines || []).filter(line => isoDate(line.lineDate) >= range.from && isoDate(line.lineDate) <= range.to));
  const reconciled = bankLines.filter(line => line.matchStatus === "matched" || line.matchStatus === "ignored").length;
  const bankPct = bankLines.length ? Math.round(reconciled / bankLines.length * 1000) / 10 : null;
  const unreconciledPayments = bankLines.filter(line => line.direction === "out" && line.matchStatus !== "matched" && line.matchStatus !== "ignored");

  const uncategorised = inMonth.filter(voucher => (voucher.lines || []).some(line => {
    const account = accountByKey.get(line.coaId) || accountByKey.get(line.code);
    return UNCATEGORISED.test(account?.name || line.name || "");
  }));
  const monthAnomalies = (anomalies || []).filter(alert => /possible_duplicate/.test(alert.pattern || ""));
  const gaps = missingInvoiceNumbers((vouchers || []).filter(affectsLedgers), range);
  const overduePayables = invoiceRegister(accounts, vouchers, parties, { kind: "payable", today: range.to, outstandingOnly: true }).filter(row => n(row.daysOverdue) > 0);
  const gstIssues = (gstWarnings || []).filter(warning => warning.severity === "critical" || warning.severity === "high");
  const negativeStock = (items || []).filter(item => item.itemType !== "service").map(item => ({ item, stock: currentStockForItem(item, stockMovements) })).filter(row => row.stock != null && row.stock < 0);
  const locked = dateIsLocked(range.from, locks) && dateIsLocked(range.to, locks);

  const checks = [
    {
      key: "bank_reconciliation",
      label: "Bank reconciliation",
      count: bankLines.length - reconciled,
      severity: "high",
      value: bankPct == null ? "No statement lines" : `${bankPct}% reconciled`,
      detail: bankLines.length ? `${reconciled} of ${bankLines.length} statement lines matched or ignored.` : "Import the month's bank statement to check reconciliation.",
      link: source("bank", "Resolve issues"),
      weight: 3,
      score: bankPct == null ? 0.5 : bankPct / 100,
    },
    {
      key: "unreconciled_payments",
      label: "Unreconciled payments",
      count: unreconciledPayments.length,
      severity: "high",
      value: formatInr(unreconciledPayments.reduce((sum, line) => sum + n(line.amount), 0)),
      detail: "Money-out bank lines not yet matched to a payment or expense.",
      link: source("bank", "Resolve issues"),
      weight: 2,
    },
    {
      key: "uncategorised",
      label: "Uncategorised transactions",
      count: uncategorised.length,
      severity: "medium",
      value: `${uncategorised.length} voucher(s)`,
      detail: "Vouchers posted to a suspense or uncategorised ledger.",
      link: source("vouchers", "Resolve issues"),
      weight: 1,
    },
    {
      key: "duplicates",
      label: "Duplicate candidates",
      count: monthAnomalies.length,
      severity: "critical",
      value: `${monthAnomalies.length} pair(s)`,
      detail: "Same type, party, and amount within three days.",
      link: source("ai", "Resolve issues", { tab: "anomalies" }),
      weight: 2,
    },
    {
      key: "missing_invoices",
      label: "Missing invoices",
      count: gaps.length,
      severity: "high",
      value: gaps.length ? gaps.slice(0, 5).join(", ") + (gaps.length > 5 ? "…" : "") : "No gaps",
      detail: "Gaps in the sales invoice number sequence for this month.",
      link: source("vouchers", "Resolve issues"),
      weight: 1,
    },
    {
      key: "outstanding_expenses",
      label: "Outstanding expenses",
      count: overduePayables.length,
      severity: "medium",
      value: formatInr(overduePayables.reduce((sum, row) => sum + n(row.outstanding), 0)),
      detail: `Supplier bills overdue as of ${range.to}.`,
      link: source("payables", "Resolve issues"),
      weight: 1,
    },
    {
      key: "gst_issues",
      label: "GST issues",
      count: gstIssues.length,
      severity: "critical",
      value: `${gstIssues.length} high-priority warning(s)`,
      detail: "Critical or high GST review warnings for this period.",
      link: source("ai", "Resolve issues", { tab: "gst" }),
      weight: 2,
    },
    {
      key: "negative_inventory",
      label: "Negative inventory",
      count: negativeStock.length,
      severity: "critical",
      value: negativeStock.slice(0, 3).map(row => `${row.item.name} (${roundMoney(row.stock)})`).join(", ") || "None",
      detail: "Items whose recorded stock is below zero.",
      link: source("inventory", "Resolve issues"),
      weight: 2,
    },
  ].map(check => {
    const resolved = check.count > 0 && resolvedKeys.has(`${range.key}:${check.key}`);
    const ok = check.count === 0 || resolved;
    return { ...check, ok, resolved, status: check.count === 0 ? "Ready" : resolved ? "Reviewed" : "Requires review" };
  });

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks.reduce((sum, check) => sum + check.weight * (check.score != null && !check.resolved ? check.score : check.ok ? 1 : 0), 0);
  const issues = checks.filter(check => check.count > 0);
  return {
    month: range.key,
    period: range,
    locked,
    readinessPct: Math.round(earned / totalWeight * 100),
    totalIssues: issues.length,
    critical: issues.filter(check => check.severity === "critical" && !check.resolved).length,
    high: issues.filter(check => check.severity === "high" && !check.resolved).length,
    resolved: issues.filter(check => check.resolved).length,
    remaining: issues.filter(check => !check.resolved).length,
    checks,
    note: "Readiness is advisory. FinTrack does not close or lock the period, change vouchers, reconcile, or post entries from this screen.",
    advisory: true,
    writeAction: "none",
  };
}
