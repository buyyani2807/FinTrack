import { SYSTEM_CODES, affectsLedgers, indianFinancialYear, isMoneyAccount, isReversalVoucher, isReversed, roundMoney } from "./accountingModel.js";
import { profitAndLoss } from "./accountingReports.js";

// The Expenses page reads the expense ledgers exactly as Profit & Loss does (posted and reversed vouchers, debit
// minus credit), less the stock Purchase ledger, which the P&L turns into cost of goods sold with the stock change.

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = value => String(value).padStart(2, "0");
const isoParts = iso => String(iso).slice(0, 10).split("-").map(Number);
const monthIndex = iso => {
  const [year, month] = isoParts(iso);
  return year * 12 + month - 1;
};
const indexYear = index => Math.floor(index / 12);
const indexMonth = index => (index % 12) + 1;
const monthFrom = index => `${indexYear(index)}-${pad(indexMonth(index))}-01`;
const monthTo = index => {
  const year = indexYear(index);
  const month = indexMonth(index);
  return `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
};
const monthLong = index => `${MONTH_LONG[indexMonth(index) - 1]} ${indexYear(index)}`;
const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const addDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const dayCount = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
export const fyLabel = startYear => `FY ${startYear}–${String(startYear + 1).slice(-2)}`;
const fyMonths = startYear => Array.from({ length: 12 }, (_, offset) => startYear * 12 + 3 + offset);
const calendarMonths = year => Array.from({ length: 12 }, (_, offset) => year * 12 + offset);
const fyOfIndex = index => (indexMonth(index) >= 4 ? indexYear(index) : indexYear(index) - 1);

export const EXPENSE_PRESETS = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "this_fy", label: "This FY" },
  { id: "last_fy", label: "Last FY" },
  { id: "calendar", label: "Calendar year" },
  { id: "custom", label: "Custom" },
];

export const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map(month => ({ id: month, label: MONTH_LONG[month - 1] }));
export const CALENDAR_MONTHS = MONTH_LONG.map((label, index) => ({ id: index + 1, label }));

export function defaultExpenseFilter(today) {
  return { mode: "fy", fyStart: indianFinancialYear(today).startYear, year: isoParts(today)[0], month: 0, from: "", to: "" };
}

export function activeExpensePreset(filter, today) {
  if (filter.mode !== "fy") return filter.mode;
  const current = indianFinancialYear(today).startYear;
  if (filter.fyStart === current) return "this_fy";
  if (filter.fyStart === current - 1) return "last_fy";
  return "";
}

export function applyExpensePreset(filter, preset, today) {
  const current = indianFinancialYear(today).startYear;
  if (preset === "this_fy" || preset === "last_fy") return { ...filter, mode: "fy", fyStart: preset === "this_fy" ? current : current - 1, month: 0 };
  if (preset === "calendar") return { ...filter, mode: "calendar", year: filter.mode === "calendar" ? filter.year : isoParts(today)[0], month: 0 };
  if (preset === "custom") {
    const period = expensePeriod(filter, today);
    return { ...filter, mode: "custom", from: period.from || filter.from || today, to: period.to || filter.to || today };
  }
  return { ...filter, mode: preset };
}

function monthPeriod(index, extra) {
  return {
    from: monthFrom(index),
    to: monthTo(index),
    label: monthLong(index),
    single: true,
    previous: { from: monthFrom(index - 1), to: monthTo(index - 1), label: monthLong(index - 1) },
    ...extra,
  };
}

/**
 * The dates a filter selects, the equivalent earlier period for comparison, and the months the trend chart shows.
 * A month or quarter is charted inside its financial year; a calendar year as January to December.
 */
export function expensePeriod(filter = {}, today) {
  const nowIndex = monthIndex(today);
  const mode = filter.mode || "fy";
  if (mode === "this_month" || mode === "last_month") {
    const index = mode === "this_month" ? nowIndex : nowIndex - 1;
    return monthPeriod(index, { mode, chart: { kind: "fy", startYear: fyOfIndex(index), months: fyMonths(fyOfIndex(index)) } });
  }
  if (mode === "this_quarter") {
    const start = nowIndex - ((indexMonth(nowIndex) - 1) % 3);
    const quarter = Math.floor(((indexMonth(start) + 8) % 12) / 3) + 1;
    const startYear = fyOfIndex(start);
    const span = `${MONTH_SHORT[indexMonth(start) - 1]}–${MONTH_SHORT[indexMonth(start + 2) - 1]} ${indexYear(start + 2)}`;
    return {
      mode,
      from: monthFrom(start),
      to: monthTo(start + 2),
      label: `Q${quarter} ${fyLabel(startYear)} (${span})`,
      single: false,
      previous: { from: monthFrom(start - 3), to: monthTo(start - 1), label: "previous quarter" },
      chart: { kind: "fy", startYear, months: fyMonths(startYear) },
    };
  }
  if (mode === "calendar") {
    const year = Number(filter.year) || isoParts(today)[0];
    const chart = { kind: "calendar", year, months: calendarMonths(year) };
    if (filter.month) return monthPeriod(year * 12 + Number(filter.month) - 1, { mode, chart });
    return {
      mode,
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      label: `Calendar year ${year}`,
      single: false,
      previous: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: `${year - 1}` },
      chart,
    };
  }
  if (mode === "custom") {
    const { from, to } = filter;
    if (!isIsoDate(from) || !isIsoDate(to)) return { mode, error: "Choose both a start date and an end date." };
    if (from > to) return { mode, error: "The start date is after the end date." };
    const days = dayCount(from, to);
    const months = [];
    for (let index = monthIndex(from); index <= monthIndex(to); index += 1) months.push(index);
    return {
      mode,
      from,
      to,
      label: `Custom · ${days} ${days === 1 ? "day" : "days"}`,
      single: monthIndex(from) === monthIndex(to),
      previous: { from: addDays(from, -days), to: addDays(from, -1), label: `the ${days} days before` },
      chart: { kind: "custom", months: months.slice(-36) },
    };
  }
  const startYear = Number(filter.fyStart) || indianFinancialYear(today).startYear;
  const chart = { kind: "fy", startYear, months: fyMonths(startYear) };
  if (filter.month) {
    const month = Number(filter.month);
    return monthPeriod((month >= 4 ? startYear : startYear + 1) * 12 + month - 1, { mode: "fy", chart });
  }
  return {
    mode: "fy",
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
    label: fyLabel(startYear),
    single: false,
    previous: { from: `${startYear - 1}-04-01`, to: `${startYear}-03-31`, label: fyLabel(startYear - 1) },
    chart,
  };
}

const accountKey = account => account.id || account.code;
const lineKey = line => line.coaId || line.code;

/** The category of each expense ledger: its top expense parent, or the ledger itself. Stock purchases are left out. */
export function expenseLedgers(accounts = []) {
  const byKey = new Map((accounts || []).map(account => [accountKey(account), account]));
  const byId = new Map((accounts || []).filter(account => account.id).map(account => [account.id, account]));
  const topOf = account => {
    let top = account;
    const seen = new Set([accountKey(account)]);
    while (top.parentId && byId.get(top.parentId)?.groupType === "expense" && !seen.has(top.parentId)) {
      seen.add(top.parentId);
      top = byId.get(top.parentId);
    }
    return top;
  };
  const ledgers = new Map();
  for (const account of accounts || []) {
    if (account.groupType !== "expense") continue;
    const category = topOf(account);
    ledgers.set(accountKey(account), {
      account,
      category,
      stockPurchase: account.code === SYSTEM_CODES.purchase || category.code === SYSTEM_CODES.purchase,
    });
  }
  return { ledgers, byKey };
}

function paidFrom(voucher, side, ledgers, byKey) {
  const counter = (voucher.lines || []).filter(line => !ledgers.has(lineKey(line)) && Number(line[side] || 0) > 0);
  const money = [];
  const other = [];
  let credit = false;
  for (const line of counter) {
    const account = byKey.get(lineKey(line));
    const name = account?.name || line.name || "Unknown ledger";
    if (isMoneyAccount(account)) money.push(name);
    else if (account?.accountType === "payable") credit = true;
    else other.push(name);
  }
  if (money.length) return { label: [...new Set(money)].join(", "), kind: "money" };
  if (credit) return { label: "On credit", kind: "credit" };
  if (other.length) return { label: [...new Set(other)].join(", "), kind: "other" };
  return { label: "—", kind: "other" };
}

/** One row per voucher and expense ledger, with the amount it adds to that ledger (negative for a credit). */
export function expenseTransactions({ accounts = [], vouchers = [], parties = [] } = {}) {
  const { ledgers, byKey } = expenseLedgers(accounts);
  const partyNames = new Map((parties || []).map(party => [party.id, party.name]));
  const rows = [];
  for (const voucher of vouchers || []) {
    if (!affectsLedgers(voucher)) continue;
    const grouped = new Map();
    for (const line of voucher.lines || []) {
      const key = lineKey(line);
      const ledger = ledgers.get(key);
      if (!ledger || ledger.stockPurchase) continue;
      if (!grouped.has(key)) grouped.set(key, { ledger, lines: [], amount: 0 });
      const entry = grouped.get(key);
      entry.lines.push(line);
      entry.amount = roundMoney(entry.amount + Number(line.debit || 0) - Number(line.credit || 0));
    }
    if (!grouped.size) continue;
    const status = isReversalVoucher(voucher) ? "reversal" : isReversed(voucher) ? "reversed" : "posted";
    for (const [key, { ledger, lines, amount }] of grouped) {
      if (!amount) continue;
      const paid = paidFrom(voucher, amount > 0 ? "credit" : "debit", ledgers, byKey);
      const partyId = lines.find(line => line.partyId)?.partyId || voucher.partyId || (voucher.lines || []).find(line => line.partyId)?.partyId || null;
      rows.push({
        id: `${voucher.id}:${key}`,
        voucherId: voucher.id,
        voucherNumber: voucher.voucherNumber || "",
        voucherType: voucher.voucherType,
        date: voucher.date,
        ledgerId: key,
        ledgerName: ledger.account.name,
        ledgerCode: ledger.account.code || "",
        categoryId: accountKey(ledger.category),
        categoryName: ledger.category.name,
        description: lines.find(line => line.description)?.description || voucher.narration || "",
        partyId,
        partyName: partyId ? partyNames.get(partyId) || "" : "",
        paidFrom: paid.label,
        paidKind: paid.kind,
        amount,
        status,
      });
    }
  }
  return rows.sort((a, b) => `${b.date}${b.voucherNumber}`.localeCompare(`${a.date}${a.voucherNumber}`));
}

const sumAmount = rows => roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
const inRange = (row, range) => Boolean(range) && row.date >= range.from && row.date <= range.to;
const voucherCount = rows => new Set(rows.map(row => row.voucherId)).size;
export const pctChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

function averageFor(total, range, single, today) {
  const end = range.to < today ? range.to : today;
  if (end < range.from) return { value: 0, unit: single ? "day" : "month", count: 0 };
  if (single) {
    const days = dayCount(range.from, end);
    return { value: roundMoney(total / days), unit: "day", count: days };
  }
  const months = monthIndex(end) - monthIndex(range.from) + 1;
  return { value: roundMoney(total / months), unit: "month", count: months };
}

function breakdown(rows, previousRows, idOf, nameOf) {
  const map = new Map();
  const add = (row, field) => {
    const id = idOf(row);
    if (!map.has(id)) map.set(id, { id, name: nameOf(row), amount: 0, previous: 0, count: 0 });
    const entry = map.get(id);
    entry[field] = roundMoney(entry[field] + row.amount);
    if (field === "amount") entry.count += 1;
  };
  for (const row of rows) add(row, "amount");
  for (const row of previousRows) add(row, "previous");
  const list = [...map.values()].filter(entry => entry.amount || entry.previous);
  const positive = roundMoney(list.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0));
  return list
    .map(entry => ({ ...entry, share: positive > 0 ? Math.max(0, entry.amount) / positive : 0, change: pctChange(entry.amount, entry.previous) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

/**
 * Cards and breakdowns for a period. `categoryId`/`ledgerId` narrow everything except the category list itself,
 * which always shows every category so another can be picked. Comparisons are left out when the earlier period
 * has no expenses or starts before the books do.
 */
export function expenseSummary({ rows = [], period, today, categoryId = "", ledgerId = "", booksStartedOn = "" } = {}) {
  const empty = { total: 0, previousTotal: 0, change: null, canCompare: false, average: { value: 0, unit: "month", count: 0 }, count: 0, previousCount: 0, countChange: null, categories: [], ledgers: [], top: null, current: [] };
  if (!period || period.error) return empty;
  const periodRows = rows.filter(row => inRange(row, period));
  const previousPeriodRows = rows.filter(row => inRange(row, period.previous));
  const scope = row => (!categoryId || row.categoryId === categoryId) && (!ledgerId || row.ledgerId === ledgerId);
  const current = periodRows.filter(scope);
  const previous = previousPeriodRows.filter(scope);
  const total = sumAmount(current);
  const previousTotal = sumAmount(previous);
  const canCompare = previousTotal > 0 && (!booksStartedOn || booksStartedOn <= period.previous.from);
  const average = averageFor(total, period, period.single, today);
  const previousAverage = averageFor(previousTotal, period.previous, period.single, today);
  // A finished month against the month before only differs per day by the number of days, so that is not compared.
  const compareAverage = canCompare && !(period.single && period.to < today);
  const categories = breakdown(periodRows, previousPeriodRows, row => row.categoryId, row => row.categoryName);
  const ledgers = categoryId
    ? breakdown(periodRows.filter(row => row.categoryId === categoryId), previousPeriodRows.filter(row => row.categoryId === categoryId), row => row.ledgerId, row => row.ledgerName)
    : [];
  const ranked = categoryId ? ledgers : categories;
  const topEntry = ranked.find(entry => entry.amount > 0) || null;
  return {
    total,
    previousTotal,
    change: canCompare ? pctChange(total, previousTotal) : null,
    canCompare,
    average: { ...average, previous: previousAverage.value, change: compareAverage ? pctChange(average.value, previousAverage.value) : null },
    count: voucherCount(current),
    previousCount: voucherCount(previous),
    countChange: canCompare ? pctChange(voucherCount(current), voucherCount(previous)) : null,
    categories,
    ledgers,
    top: topEntry ? { ...topEntry, share: total > 0 ? topEntry.amount / total : 0 } : null,
    current,
  };
}

const QUARTER_LABELS = { fy: ["Q1 Apr–Jun", "Q2 Jul–Sep", "Q3 Oct–Dec", "Q4 Jan–Mar"], calendar: ["Q1 Jan–Mar", "Q2 Apr–Jun", "Q3 Jul–Sep", "Q4 Oct–Dec"] };

function trendBuckets(period, aggregation) {
  const months = period.chart.months;
  const kind = period.chart.kind;
  if (aggregation === "year") {
    if (kind === "fy") {
      return Array.from({ length: 5 }, (_, offset) => {
        const start = period.chart.startYear - 4 + offset;
        return { key: `fy${start}`, label: `FY ${String(start).slice(-2)}–${String(start + 1).slice(-2)}`, longLabel: fyLabel(start), months: fyMonths(start) };
      });
    }
    const last = indexYear(months[months.length - 1]);
    const first = kind === "calendar" ? last - 4 : indexYear(months[0]);
    return Array.from({ length: last - first + 1 }, (_, offset) => {
      const year = first + offset;
      return { key: `y${year}`, label: String(year), longLabel: `Calendar year ${year}`, months: calendarMonths(year) };
    });
  }
  if (aggregation === "quarter") {
    const groups = new Map();
    for (const index of months) {
      const start = index - ((indexMonth(index) - 1) % 3);
      if (!groups.has(start)) groups.set(start, []);
      groups.get(start).push(index);
    }
    return [...groups.entries()].map(([start, list]) => {
      const fyQuarter = Math.floor(((indexMonth(start) + 8) % 12) / 3);
      const calendarQuarter = Math.floor((indexMonth(start) - 1) / 3);
      const label = kind === "fy" ? QUARTER_LABELS.fy[fyQuarter] : kind === "calendar" ? QUARTER_LABELS.calendar[calendarQuarter] : `Q${calendarQuarter + 1} ${indexYear(start)}`;
      return { key: `q${start}`, label: label.split(" ")[0], longLabel: kind === "custom" ? label : `${label} ${kind === "fy" ? fyLabel(fyOfIndex(start)) : indexYear(start)}`, months: list };
    });
  }
  const spansYears = indexYear(months[0]) !== indexYear(months[months.length - 1]) && kind === "custom";
  return months.map(index => ({
    key: `m${index}`,
    label: spansYears ? `${MONTH_SHORT[indexMonth(index) - 1]} ${String(indexYear(index)).slice(-2)}` : MONTH_SHORT[indexMonth(index) - 1],
    longLabel: monthLong(index),
    months: [index],
  }));
}

/** Bars for the trend chart: each month, quarter or year with the same span a year earlier (not for years). */
export function expenseTrend({ rows = [], period, aggregation = "month", today, categoryId = "", ledgerId = "" } = {}) {
  if (!period || period.error || !period.chart?.months?.length) return [];
  const byMonth = new Map();
  for (const row of rows) {
    if ((categoryId && row.categoryId !== categoryId) || (ledgerId && row.ledgerId !== ledgerId)) continue;
    const index = monthIndex(row.date);
    byMonth.set(index, roundMoney((byMonth.get(index) || 0) + row.amount));
  }
  const total = list => roundMoney(list.reduce((sum, index) => sum + (byMonth.get(index) || 0), 0));
  const todayIndex = monthIndex(today);
  const selected = [monthIndex(period.from), monthIndex(period.to)];
  return trendBuckets(period, aggregation).map(bucket => {
    const first = bucket.months[0];
    const last = bucket.months[bucket.months.length - 1];
    return {
      key: bucket.key,
      label: bucket.label,
      longLabel: bucket.longLabel,
      from: monthFrom(first),
      to: monthTo(last),
      amount: total(bucket.months),
      previous: aggregation === "year" ? null : total(bucket.months.map(index => index - 12)),
      selected: last >= selected[0] && first <= selected[1],
      future: first > todayIndex,
      partial: first <= todayIndex && last >= todayIndex,
      months: bucket.months,
    };
  });
}

/** "September was 12% higher than August": the latest finished month against the month before, when both have expenses. */
export function expenseTrendInsight(trend = [], aggregation = "month") {
  if (aggregation !== "month") return null;
  const done = trend.filter(row => !row.future && !row.partial);
  for (let index = done.length - 1; index > 0; index -= 1) {
    const now = done[index];
    const before = done[index - 1];
    if (now.months[0] - before.months[0] !== 1) return null;
    if (now.amount > 0 && before.amount > 0) {
      const change = pctChange(now.amount, before.amount);
      return { month: now.longLabel, previousMonth: before.longLabel, amount: now.amount, previous: before.amount, change };
    }
    if (now.amount > 0) return null;
  }
  return null;
}

/** Same ledger, same amount, same party (or none), within `days` of each other: worth a look, not a finding. */
export function possibleRepeatExpenses(rows = [], { days = 3, limit = 3 } = {}) {
  const groups = new Map();
  for (const row of rows) {
    if (row.amount <= 0 || row.status !== "posted") continue;
    const key = `${row.ledgerId}|${row.amount}|${row.partyId || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const found = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (let index = 1; index < sorted.length; index += 1) {
      const a = sorted[index - 1];
      const b = sorted[index];
      if (a.voucherId !== b.voucherId && dayCount(a.date, b.date) - 1 <= days) {
        found.push({ ledgerName: a.ledgerName, categoryId: a.categoryId, amount: a.amount, partyName: a.partyName, rows: [a, b] });
        break;
      }
    }
  }
  return found.sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/** The P&L expense ledgers for the period, split into stock purchases and the operating expenses this page shows. */
export function expenseReconciliation({ accounts = [], vouchers = [], period } = {}) {
  if (!period || period.error) return null;
  const { ledgers } = expenseLedgers(accounts);
  const pnl = profitAndLoss(accounts, vouchers, { from: period.from, to: period.to });
  const purchases = roundMoney(pnl.expenses.filter(row => ledgers.get(accountKey(row))?.stockPurchase).reduce((sum, row) => sum + row.amount, 0));
  return { ledgerTotal: pnl.totalExpense, purchases, operating: roundMoney(pnl.totalExpense - purchases) };
}

export function filterExpenseRows(rows = [], { search = "", paidFrom = "", sort = "date_desc" } = {}) {
  const q = String(search || "").trim().toLowerCase();
  const list = rows.filter(row => (!paidFrom || row.paidFrom === paidFrom)
    && (!q || `${row.description} ${row.partyName} ${row.voucherNumber} ${row.ledgerName} ${row.categoryName}`.toLowerCase().includes(q)));
  const [field, direction] = String(sort).split("_");
  const sign = direction === "asc" ? 1 : -1;
  return list.sort((a, b) => {
    const primary = field === "amount" ? a.amount - b.amount : a.date.localeCompare(b.date);
    return primary * sign || `${a.date}${a.voucherNumber}`.localeCompare(`${b.date}${b.voucherNumber}`) * sign;
  });
}

export const EXPENSE_EXPORT_HEADER = ["Date", "Voucher", "Category", "Ledger", "Description", "Paid to", "Paid from", "Status", "Amount"];
const STATUS_LABEL = { posted: "Posted", reversed: "Reversed", reversal: "Reversal" };
export const expenseStatusLabel = status => STATUS_LABEL[status] || status;
export const expenseExportRows = rows => rows.map(row => [row.date, row.voucherNumber, row.categoryName, row.ledgerName, row.description, row.partyName, row.paidFrom, expenseStatusLabel(row.status), row.amount]);
