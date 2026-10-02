/** Owner daily brief: who to collect from, what to pay, what to reorder and what to file today. */

import { addDaysIso, affectsLedgers, isReversalVoucher, roundMoney } from "./accountingModel.js";
import { dueLabel } from "./gstCalendar.js";
import { emptyItemLine } from "./inventoryModel.js";

const inr = value => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

function groupByParty(rows, today) {
  const byParty = new Map();
  for (const row of rows || []) {
    if (!(Number(row.outstanding) > 0) || !row.partyId) continue;
    const entry = byParty.get(row.partyId) || {
      partyId: row.partyId,
      partyName: row.partyName,
      phone: row.partyPhone || "",
      outstanding: 0,
      overdue: 0,
      dueToday: 0,
      dueSoon: 0,
      invoices: 0,
      maxDaysOverdue: 0,
      earliestDue: "",
    };
    entry.outstanding = roundMoney(entry.outstanding + Number(row.outstanding));
    entry.invoices += 1;
    if (row.dueDate < today) entry.overdue = roundMoney(entry.overdue + Number(row.outstanding));
    else if (row.dueDate === today) entry.dueToday = roundMoney(entry.dueToday + Number(row.outstanding));
    else entry.dueSoon = roundMoney(entry.dueSoon + Number(row.outstanding));
    entry.maxDaysOverdue = Math.max(entry.maxDaysOverdue, Number(row.daysOverdue || 0));
    if (!entry.earliestDue || row.dueDate < entry.earliestDue) entry.earliestDue = row.dueDate;
    byParty.set(row.partyId, entry);
  }
  return [...byParty.values()];
}

export function collectList(receivables, today) {
  return groupByParty(receivables, today)
    .filter(entry => entry.overdue > 0 || entry.dueToday > 0)
    .map(entry => ({ ...entry, due: roundMoney(entry.overdue + entry.dueToday) }))
    .sort((a, b) => b.overdue - a.overdue || b.due - a.due || a.partyName.localeCompare(b.partyName));
}

export function payList(payables, today, { horizonDays = 7 } = {}) {
  const horizon = addDaysIso(today, horizonDays);
  const due = (payables || []).filter(row => Number(row.outstanding) > 0 && row.dueDate <= horizon);
  return groupByParty(due, today)
    .map(entry => ({ ...entry, due: entry.outstanding, overdueFlag: entry.overdue > 0 }))
    .sort((a, b) => a.earliestDue.localeCompare(b.earliestDue) || b.due - a.due);
}

/** Latest purchase rate and supplier per item, from posted purchase vouchers. */
export function lastPurchaseByItem(voucherItemLines, vouchers) {
  const purchases = new Map(
    (vouchers || [])
      .filter(voucher => voucher.voucherType === "purchase" && affectsLedgers(voucher) && !isReversalVoucher(voucher) && voucher.status !== "reversed")
      .map(voucher => [voucher.id, voucher]),
  );
  const latest = new Map();
  for (const line of voucherItemLines || []) {
    const voucher = purchases.get(line.voucherId);
    if (!voucher || !line.itemId) continue;
    const previous = latest.get(line.itemId);
    if (previous && `${previous.date}${previous.voucherNumber}` >= `${voucher.date}${voucher.voucherNumber}`) continue;
    latest.set(line.itemId, {
      date: voucher.date,
      voucherNumber: voucher.voucherNumber,
      partyId: voucher.partyId || (voucher.lines || []).find(entry => entry.partyId)?.partyId || null,
      rate: Number(line.rate || 0),
    });
  }
  return latest;
}

export function reorderList({ items = [], stockByItem = {}, pendingPurchaseRows = [], lastPurchase = new Map(), parties = [] } = {}) {
  const onOrder = new Map();
  for (const row of pendingPurchaseRows || []) {
    if (!row.itemId) continue;
    onOrder.set(row.itemId, roundMoney((onOrder.get(row.itemId) || 0) + Number(row.pending || 0)));
  }
  const partyName = new Map((parties || []).map(party => [party.id, party.name]));
  const rows = [];
  for (const item of items || []) {
    if (item.isActive === false || item.itemType === "service") continue;
    const reorderLevel = Number(item.reorderLevel || 0);
    if (!(reorderLevel > 0)) continue;
    const stock = Number(stockByItem[item.id] ?? 0);
    if (stock >= reorderLevel) continue;
    const ordered = onOrder.get(item.id) || 0;
    const suggested = Math.max(0, Math.ceil(reorderLevel * 2 - stock - ordered));
    const last = lastPurchase.get(item.id) || null;
    const rate = last?.rate || Number(item.purchasePrice || 0);
    rows.push({
      itemId: item.id,
      itemName: item.name,
      sku: item.sku || "",
      unit: item.unit || "Nos",
      hsnSac: item.hsnSac || "",
      gstRate: Number(item.gstRate || 0),
      stock,
      reorderLevel,
      onOrder: ordered,
      suggested,
      covered: suggested === 0,
      rate,
      value: roundMoney(suggested * rate),
      supplierId: last?.partyId || null,
      supplierName: last?.partyId ? partyName.get(last.partyId) || "" : "",
      shortBy: roundMoney(reorderLevel - stock),
    });
  }
  return rows.sort((a, b) => Number(a.covered) - Number(b.covered) || (a.stock / a.reorderLevel) - (b.stock / b.reorderLevel) || a.itemName.localeCompare(b.itemName));
}

/** Group reorder rows by last supplier so one purchase order can be raised per supplier. */
export function reorderBySupplier(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (row.covered) continue;
    const key = row.supplierId || "";
    const group = groups.get(key) || { supplierId: row.supplierId, supplierName: row.supplierName || "", rows: [], value: 0 };
    group.rows.push(row);
    group.value = roundMoney(group.value + row.value);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => Number(!a.supplierId) - Number(!b.supplierId) || b.value - a.value);
}

/** Purchase-order form lines for reorder rows (suggested quantity at the last purchase rate). */
export function reorderPurchaseOrderLines(rows) {
  return (rows || []).filter(row => row.suggested > 0).map(row => ({
    ...emptyItemLine(),
    itemId: row.itemId,
    itemName: row.itemName,
    itemSku: row.sku || "",
    itemType: "product",
    unit: row.unit || "Nos",
    quantity: String(row.suggested),
    rate: row.rate ? String(row.rate) : "",
    rateTouched: Boolean(row.rate),
    gstRate: String(row.gstRate ?? 0),
    hsnSac: row.hsnSac || "",
  }));
}

export function fileList({ gstSchedule = null, unmatchedBankLines = 0, periodToLock = null } = {}) {
  const rows = [];
  for (const item of gstSchedule?.pending || []) {
    rows.push({ kind: "gst", key: `${item.code}:${item.period}`, title: `${item.label} · ${item.periodLabel}`, detail: dueLabel(item), dueDate: item.dueDate, status: item.status, item });
  }
  if (!rows.length && gstSchedule?.next) {
    const item = gstSchedule.next;
    rows.push({ kind: "gst", key: `${item.code}:${item.period}`, title: `${item.label} · ${item.periodLabel}`, detail: dueLabel(item), dueDate: item.dueDate, status: "upcoming", item, upcoming: true });
  }
  if (unmatchedBankLines > 0) {
    rows.push({ kind: "bank", key: "bank", title: `${unmatchedBankLines} bank line${unmatchedBankLines === 1 ? "" : "s"} to match`, detail: "Reconcile before your CA closes the month", status: "due_soon" });
  }
  if (periodToLock) {
    rows.push({ kind: "lock", key: "lock", title: `Lock ${periodToLock.label}`, detail: "Returns filed — lock the month so it can't change", status: "upcoming", period: periodToLock });
  }
  return rows;
}

export function buildOwnerDailyBrief({
  today,
  receivables = [],
  payables = [],
  items = [],
  stockByItem = {},
  pendingPurchaseRows = [],
  voucherItemLines = [],
  vouchers = [],
  parties = [],
  gstSchedule = null,
  unmatchedBankLines = 0,
  periodToLock = null,
} = {}) {
  const collect = collectList(receivables, today);
  const pay = payList(payables, today);
  const reorder = reorderList({ items, stockByItem, pendingPurchaseRows, lastPurchase: lastPurchaseByItem(voucherItemLines, vouchers), parties });
  const file = fileList({ gstSchedule, unmatchedBankLines, periodToLock });
  const totals = {
    collect: roundMoney(collect.reduce((sum, row) => sum + row.due, 0)),
    collectOverdue: roundMoney(collect.reduce((sum, row) => sum + row.overdue, 0)),
    pay: roundMoney(pay.reduce((sum, row) => sum + row.due, 0)),
    payOverdue: roundMoney(pay.reduce((sum, row) => sum + row.overdue, 0)),
    reorder: reorder.filter(row => !row.covered).length,
    reorderValue: roundMoney(reorder.reduce((sum, row) => sum + row.value, 0)),
    fileUrgent: file.filter(row => row.status === "overdue" || row.status === "due_soon").length,
  };
  const actionCount = collect.length + pay.length + totals.reorder + file.filter(row => !row.upcoming).length;
  return { today, collect, pay, reorder, file, totals, actionCount, allClear: actionCount === 0 };
}

export function ownerBriefShareText(brief, { companyName = "" } = {}) {
  const lines = [`Daily brief${companyName ? ` — ${companyName}` : ""} (${brief.today})`, ""];
  lines.push(`Collect ${inr(brief.totals.collect)} from ${brief.collect.length} customer${brief.collect.length === 1 ? "" : "s"}`);
  for (const row of brief.collect.slice(0, 5)) lines.push(`  • ${row.partyName}: ${inr(row.due)}${row.maxDaysOverdue ? ` (${row.maxDaysOverdue}d late)` : " (due today)"}`);
  lines.push(`Pay ${inr(brief.totals.pay)} to ${brief.pay.length} supplier${brief.pay.length === 1 ? "" : "s"} this week`);
  for (const row of brief.pay.slice(0, 5)) lines.push(`  • ${row.partyName}: ${inr(row.due)} by ${row.earliestDue}`);
  const toOrder = brief.reorder.filter(row => !row.covered);
  lines.push(`Reorder ${toOrder.length} item${toOrder.length === 1 ? "" : "s"}${brief.totals.reorderValue ? ` (~${inr(brief.totals.reorderValue)})` : ""}`);
  for (const row of toOrder.slice(0, 5)) lines.push(`  • ${row.itemName}: ${row.suggested} ${row.unit} (stock ${row.stock})`);
  if (brief.file.length) {
    lines.push("File");
    for (const row of brief.file.slice(0, 5)) lines.push(`  • ${row.title}: ${row.detail}`);
  }
  return lines.join("\n");
}
