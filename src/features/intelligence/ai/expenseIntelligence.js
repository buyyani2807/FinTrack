import { affectsLedgers, isReversalVoucher } from "../../accounts/model/accountingModel.js";
import {
  addDaysIso,
  advisory,
  average,
  bySeverity,
  confidenceFor,
  daysBetween,
  formatInr,
  isoDate,
  monthKeyOf,
  n,
  pctChange,
  roundMoney,
  severityFromPct,
  shiftMonthKey,
  source,
} from "./aiCommon.js";

const EXPENSE_GROUPS = new Set(["expense"]);
const activeVoucher = voucher => affectsLedgers(voucher) && voucher.status !== "reversed" && !isReversalVoucher(voucher);

const monthStart = key => `${key}-01`;
const monthEnd = key => addDaysIso(monthStart(shiftMonthKey(key, 1)), -1);

/** The same day-range inside another month, clamped to that month's length. */
function windowFor(key, dayOfMonth) {
  const from = monthStart(key);
  const end = monthEnd(key);
  const to = addDaysIso(from, dayOfMonth - 1);
  return { from, to: to > end ? end : to, key };
}

const inWindow = (date, window) => date >= window.from && date <= window.to;

function expenseLines(accounts = [], vouchers = []) {
  const byKey = new Map();
  for (const account of accounts || []) {
    if (!EXPENSE_GROUPS.has(account.groupType)) continue;
    if (account.id) byKey.set(account.id, account);
    if (account.code) byKey.set(account.code, account);
  }
  const rows = [];
  for (const voucher of vouchers || []) {
    if (!affectsLedgers(voucher)) continue;
    for (const line of voucher.lines || []) {
      const account = byKey.get(line.coaId) || byKey.get(line.code);
      if (!account) continue;
      rows.push({
        voucherId: voucher.id,
        voucherNumber: voucher.voucherNumber,
        date: isoDate(voucher.date),
        accountId: account.id || account.code,
        accountName: account.name || account.code,
        amount: n(line.debit) - n(line.credit),
      });
    }
  }
  return rows;
}

function windowTotals(rows, window) {
  const scoped = rows.filter(row => inWindow(row.date, window));
  return {
    amount: roundMoney(scoped.reduce((sum, row) => sum + row.amount, 0)),
    count: new Set(scoped.map(row => row.voucherId)).size,
  };
}

const labelChange = pct => {
  if (pct == null) return "No trend";
  if (Math.abs(pct) >= 50) return "Unusual change";
  if (pct > 0) return "Increased";
  return "Decreased";
};

/**
 * Compares month-to-date spending per expense ledger with the same days of the previous month, the
 * average of the previous three months, and the same period last year. A ledger with no prior history
 * returns no trend.
 */
export function buildExpenseComparisons({ accounts = [], vouchers = [], asOf, minAmount = 1000, minPct = 20 } = {}) {
  const today = isoDate(asOf);
  const currentKey = monthKeyOf(today);
  const day = Number(today.slice(8, 10)) || 1;
  const current = windowFor(currentKey, day);
  const previous = windowFor(shiftMonthKey(currentKey, -1), day);
  const priorThree = [1, 2, 3].map(offset => windowFor(shiftMonthKey(currentKey, -offset), day));
  const lastYear = windowFor(shiftMonthKey(currentKey, -12), day);
  const rows = expenseLines(accounts, vouchers);
  const earliest = rows.reduce((min, row) => (!min || row.date < min ? row.date : min), "");
  const historyDays = earliest ? daysBetween(earliest, today) : 0;

  const ledgers = new Map();
  for (const row of rows) {
    if (!ledgers.has(row.accountId)) ledgers.set(row.accountId, { accountId: row.accountId, accountName: row.accountName, rows: [] });
    ledgers.get(row.accountId).rows.push(row);
  }

  const insights = [];
  const insufficient = [];
  for (const ledger of ledgers.values()) {
    const now = windowTotals(ledger.rows, current);
    if (!(now.amount > 0)) continue;
    const prev = windowTotals(ledger.rows, previous);
    const threeTotals = priorThree.map(window => windowTotals(ledger.rows, window));
    const monthsWithHistory = threeTotals.filter(total => total.count > 0).length;
    const year = windowTotals(ledger.rows, lastYear);
    const threeAvg = roundMoney(average(threeTotals.map(total => total.amount)));
    const threeAvgCount = average(threeTotals.map(total => total.count));

    const comparisons = [
      prev.count ? { id: "previous_month", label: "Previous month (same days)", period: `${previous.from} to ${previous.to}`, amount: prev.amount } : null,
      monthsWithHistory >= 2 ? { id: "three_month_average", label: "3-month average (same days)", period: `${priorThree[2].from} to ${priorThree[0].to}`, amount: threeAvg } : null,
      year.count ? { id: "same_period_last_year", label: "Same period last year", period: `${lastYear.from} to ${lastYear.to}`, amount: year.amount } : null,
    ].filter(Boolean).map(item => ({
      ...item,
      difference: roundMoney(now.amount - item.amount),
      changePct: pctChange(now.amount, item.amount),
    }));

    if (!comparisons.length) {
      insufficient.push({ accountId: ledger.accountId, accountName: ledger.accountName, currentAmount: now.amount });
      continue;
    }
    const primary = comparisons.find(item => item.id === "three_month_average") || comparisons[0];
    const notable = comparisons.filter(item => item.changePct != null && item.changePct >= minPct && item.difference >= minAmount);
    if (!notable.length) continue;
    const strongest = notable.reduce((best, item) => (item.changePct > best.changePct ? item : best), notable[0]);
    const frequencyChange = threeAvgCount > 0 ? pctChange(now.count, threeAvgCount) : null;
    const severity = strongest.changePct >= 100 && strongest.difference >= minAmount * 10 ? "high" : severityFromPct(strongest.changePct);
    insights.push(advisory({
      id: `expense-ledger-${ledger.accountId}`,
      kind: "ledger",
      category: ledger.accountName,
      title: `${ledger.accountName}: ${labelChange(strongest.changePct)} ${Math.abs(strongest.changePct)}% vs ${strongest.label.toLowerCase()}`,
      status: severity === "high" ? "Requires review" : labelChange(strongest.changePct),
      currentAmount: now.amount,
      comparisonAmount: primary.amount,
      difference: roundMoney(now.amount - primary.amount),
      changePct: pctChange(now.amount, primary.amount),
      period: `${current.from} to ${current.to}`,
      comparisons,
      entries: now.count,
      usualEntries: roundMoney(threeAvgCount),
      frequencyChangePct: frequencyChange,
      severity,
      ...confidenceFor(monthsWithHistory + (year.count ? 1 : 0), { high: 4, medium: 2 }),
      explanation: `${formatInr(now.amount)} was booked to ${ledger.accountName} from ${current.from} to ${current.to}, compared with ${formatInr(strongest.amount)} for the ${strongest.label.toLowerCase()}.${frequencyChange != null && Math.abs(frequencyChange) >= 30 ? ` Entries: ${now.count} vs about ${roundMoney(threeAvgCount)} usually.` : ""}`,
      recommendedAction: "Review the ledger entries for this period and confirm they are expected.",
      source: source("ledger", "Open ledger", { ledgerId: ledger.accountId }),
    }));
  }

  return {
    asOf: today,
    period: { from: current.from, to: current.to },
    historyDays,
    insufficientHistory: !rows.length || historyDays < 28,
    insights: insights.sort(bySeverity),
    insufficient,
  };
}

const purchaseVoucherTypes = new Set(["purchase"]);

/**
 * Supplier unit-price changes from posted purchase item lines. The latest purchase rate of an item from a
 * supplier is compared with that supplier's average over the previous 30, 60, and 90 days, and with what
 * other suppliers charged for the same item in the last 90 days.
 */
export function buildSupplierPriceInsights({ vouchers = [], voucherItemLines = [], parties = [], asOf, minPct = 10 } = {}) {
  const today = isoDate(asOf);
  const voucherById = new Map((vouchers || []).filter(activeVoucher).map(voucher => [voucher.id, voucher]));
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const purchases = [];
  for (const line of voucherItemLines || []) {
    const voucher = voucherById.get(line.voucherId);
    if (!voucher || !purchaseVoucherTypes.has(voucher.voucherType) || !voucher.partyId) continue;
    const quantity = n(line.quantity);
    const rate = n(line.rate) || (quantity ? n(line.taxableAmount || line.amount) / quantity : 0);
    if (!(rate > 0) || !line.itemId) continue;
    purchases.push({
      voucherId: voucher.id,
      voucherNumber: voucher.voucherNumber,
      date: isoDate(voucher.date),
      supplierId: voucher.partyId,
      itemId: line.itemId,
      itemName: line.itemName || "Item",
      rate,
    });
  }

  const groups = new Map();
  for (const row of purchases) {
    const key = `${row.supplierId}:${row.itemId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const insights = [];
  const insufficient = [];
  for (const rows of groups.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.voucherNumber).localeCompare(String(b.voucherNumber)));
    const latest = rows.at(-1);
    if (daysBetween(latest.date, today) > 30) continue;
    const prior = rows.slice(0, -1);
    const supplierName = partyById.get(latest.supplierId)?.name || "Supplier";
    const windows = [30, 60, 90].map(days => {
      const from = addDaysIso(latest.date, -days);
      const scoped = prior.filter(row => row.date >= from && row.date < latest.date);
      if (!scoped.length) return { days, averageRate: null, samples: 0, changePct: null };
      const avgRate = roundMoney(average(scoped.map(row => row.rate)));
      return { days, averageRate: avgRate, samples: scoped.length, changePct: pctChange(latest.rate, avgRate) };
    });
    const others = purchases.filter(row => row.itemId === latest.itemId && row.supplierId !== latest.supplierId && daysBetween(row.date, latest.date) <= 90 && row.date <= latest.date);
    const marketRate = others.length ? roundMoney(average(others.map(row => row.rate))) : null;
    const vsOthersPct = marketRate ? pctChange(latest.rate, marketRate) : null;
    const usable = windows.filter(window => window.changePct != null);
    if (!usable.length && vsOthersPct == null) {
      insufficient.push({ supplierId: latest.supplierId, supplierName, itemName: latest.itemName });
      continue;
    }
    const best = usable.length ? usable.reduce((top, window) => (window.changePct > top.changePct ? window : top), usable[0]) : null;
    const rising = (best && best.changePct >= minPct) || (vsOthersPct != null && vsOthersPct >= minPct);
    if (!rising) continue;
    const comparisonRate = best?.averageRate ?? marketRate;
    const changePct = best?.changePct ?? vsOthersPct;
    const samples = usable.reduce((sum, window) => Math.max(sum, window.samples), 0) + others.length;
    insights.push(advisory({
      id: `supplier-price-${latest.supplierId}-${latest.itemId}`,
      kind: "supplier_price",
      category: `${supplierName} · ${latest.itemName}`,
      supplierId: latest.supplierId,
      supplierName,
      itemName: latest.itemName,
      title: `Possible price increase: ${latest.itemName} from ${supplierName}`,
      status: "Possible price increase",
      currentAmount: roundMoney(latest.rate),
      comparisonAmount: comparisonRate,
      difference: roundMoney(latest.rate - comparisonRate),
      changePct,
      period: best ? `${best.days} days before ${latest.date}` : `90 days before ${latest.date}`,
      windows,
      otherSuppliersRate: marketRate,
      vsOtherSuppliersPct: vsOthersPct,
      severity: severityFromPct(changePct, { medium: 10, high: 25 }),
      ...confidenceFor(samples, { high: 5, medium: 2 }),
      explanation: `Latest rate ${formatInr(latest.rate)} on ${latest.date} (${latest.voucherNumber || "purchase"})${best ? ` vs ${formatInr(best.averageRate)} average over the previous ${best.days} days` : ""}${marketRate ? `; other suppliers averaged ${formatInr(marketRate)}` : ""}.`,
      recommendedAction: "Confirm the rate with the supplier quotation before the next order.",
      source: source("vouchers", "Open purchase", { voucherId: latest.voucherId }),
    }));
  }
  return { insights: insights.sort(bySeverity), insufficient };
}

/** Supplier purchase totals and frequency this month vs the previous three months. */
export function buildSupplierSpendInsights({ vouchers = [], parties = [], asOf, minAmount = 1000, minPct = 30 } = {}) {
  const today = isoDate(asOf);
  const currentKey = monthKeyOf(today);
  const day = Number(today.slice(8, 10)) || 1;
  const current = windowFor(currentKey, day);
  const prior = [1, 2, 3].map(offset => windowFor(shiftMonthKey(currentKey, -offset), day));
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const purchases = (vouchers || []).filter(voucher => activeVoucher(voucher) && voucher.voucherType === "purchase" && voucher.partyId);
  const amountOf = voucher => roundMoney((voucher.lines || []).reduce((sum, line) => sum + n(line.credit), 0));
  const bySupplier = new Map();
  for (const voucher of purchases) {
    if (!bySupplier.has(voucher.partyId)) bySupplier.set(voucher.partyId, []);
    bySupplier.get(voucher.partyId).push({ date: isoDate(voucher.date), amount: amountOf(voucher), voucherId: voucher.id });
  }
  const insights = [];
  for (const [supplierId, rows] of bySupplier) {
    const total = window => rows.filter(row => inWindow(row.date, window));
    const now = total(current);
    if (!now.length) continue;
    const history = prior.map(total);
    if (history.filter(list => list.length).length < 2) continue;
    const nowAmount = roundMoney(now.reduce((sum, row) => sum + row.amount, 0));
    const avgAmount = roundMoney(average(history.map(list => list.reduce((sum, row) => sum + row.amount, 0))));
    const avgCount = average(history.map(list => list.length));
    const changePct = pctChange(nowAmount, avgAmount);
    if (changePct == null || changePct < minPct || nowAmount - avgAmount < minAmount) continue;
    const name = partyById.get(supplierId)?.name || "Supplier";
    insights.push(advisory({
      id: `supplier-spend-${supplierId}`,
      kind: "supplier_spend",
      category: name,
      title: `${name}: purchases ${labelChange(changePct).toLowerCase()} ${Math.abs(changePct)}%`,
      status: labelChange(changePct),
      currentAmount: nowAmount,
      comparisonAmount: avgAmount,
      difference: roundMoney(nowAmount - avgAmount),
      changePct,
      period: `${current.from} to ${current.to}`,
      entries: now.length,
      usualEntries: roundMoney(avgCount),
      severity: severityFromPct(changePct, { medium: 30, high: 75 }),
      ...confidenceFor(history.filter(list => list.length).length, { high: 3, medium: 2 }),
      explanation: `${now.length} purchase bill(s) worth ${formatInr(nowAmount)} so far this month vs a 3-month average of ${formatInr(avgAmount)} (${roundMoney(avgCount)} bills) for the same days.`,
      recommendedAction: "Review the supplier's recent bills and quantities.",
      source: source("payables", "Open payables", { partyId: supplierId }),
    }));
  }
  return insights.sort(bySeverity);
}
