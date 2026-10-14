import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/model/accountingModel.js";
import { profitAndLoss } from "../src/features/accounts/model/accountingReports.js";
import {
  applyExpensePreset,
  defaultExpenseFilter,
  expensePeriod,
  expenseReconciliation,
  expenseSummary,
  expenseTransactions,
  expenseTrend,
  expenseTrendInsight,
  filterExpenseRows,
  possibleRepeatExpenses,
} from "../src/features/accounts/model/expenseDashboard.js";
import { accountsPath, accountsViewFromPath, sectionTrail } from "../src/features/accounts/accountsNavigation.js";

const accounts = [
  ...DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code, isActive: true })),
  { id: "5041", code: "5041", name: "Generator diesel", groupType: "expense", accountType: "expense", parentId: "5040" },
];
const parties = [{ id: "landlord", name: "Lakshmi Estates" }, { id: "power", name: "TSSPDCL" }];
const line = (code, debit, credit = 0, extra = {}) => ({ coaId: code, code, debit, credit, ...extra });
let seq = 0;
const voucher = (voucherType, date, lines, extra = {}) => {
  seq += 1;
  return { id: `v${seq}`, voucherNumber: `V-${String(seq).padStart(4, "0")}`, voucherType, date, status: "posted", narration: "", partyId: null, lines, ...extra };
};

const rentApr = voucher("payment", "2026-04-05", [line("5000", 20000, 0, { description: "April rent" }), line("1020", 0, 20000)], { partyId: "landlord" });
const rentSep = voucher("payment", "2026-09-05", [line("5000", 22000, 0, { description: "September rent" }), line("1000", 0, 22000)], { partyId: "landlord" });
const powerOnCredit = voucher("purchase", "2026-09-10", [line("5040", 5000), line("1140", 450), line("2000", 0, 5450, { partyId: "power" })], { partyId: "power" });
const diesel = voucher("payment", "2026-09-12", [line("5041", 1500), line("1010", 0, 1500)]);
const stock = voucher("purchase", "2026-09-15", [line("5110", 80000), line("2000", 0, 80000)]);
const cancelled = voucher("payment", "2026-09-16", [line("5000", 9999), line("1000", 0, 9999)], { status: "cancelled" });
const wrong = voucher("payment", "2026-09-18", [line("5080", 3000), line("1000", 0, 3000)], { status: "reversed" });
const reversal = voucher("journal", "2026-09-19", [line("1000", 3000), line("5080", 0, 3000)], { sourceType: "reversal" });
const reclass = voucher("journal", "2026-09-20", [line("5090", 1200), line("5060", 0, 1200)]);
const officeAug = voucher("payment", "2026-08-02", [line("5060", 4000), line("1000", 0, 4000)]);
const rentLastYear = voucher("payment", "2025-09-05", [line("5000", 18000), line("1020", 0, 18000)], { partyId: "landlord" });
const vouchers = [rentApr, rentSep, powerOnCredit, diesel, stock, cancelled, wrong, reversal, reclass, officeAug, rentLastYear];
const rows = expenseTransactions({ accounts, vouchers, parties });
const TODAY = "2026-10-14";

test("expense periods follow the Indian financial year and the calendar year", () => {
  const fy = expensePeriod(defaultExpenseFilter(TODAY), TODAY);
  assert.deepEqual([fy.from, fy.to, fy.label], ["2026-04-01", "2027-03-31", "FY 2026–27"]);
  assert.deepEqual([fy.previous.from, fy.previous.to], ["2025-04-01", "2026-03-31"]);
  assert.equal(fy.chart.months.length, 12);

  const sep = expensePeriod({ mode: "fy", fyStart: 2026, month: 9 }, TODAY);
  assert.deepEqual([sep.from, sep.to, sep.label, sep.previous.from], ["2026-09-01", "2026-09-30", "September 2026", "2026-08-01"]);
  const jan = expensePeriod({ mode: "fy", fyStart: 2026, month: 1 }, TODAY);
  assert.deepEqual([jan.from, jan.to], ["2027-01-01", "2027-01-31"]);

  const calendar = expensePeriod(applyExpensePreset(defaultExpenseFilter(TODAY), "calendar", TODAY), TODAY);
  assert.deepEqual([calendar.from, calendar.to, calendar.previous.from], ["2026-01-01", "2026-12-31", "2025-01-01"]);

  const quarter = expensePeriod({ mode: "this_quarter" }, TODAY);
  assert.deepEqual([quarter.from, quarter.to, quarter.previous.from, quarter.previous.to], ["2026-10-01", "2026-12-31", "2026-07-01", "2026-09-30"]);
  assert.match(quarter.label, /^Q3 FY 2026–27/);

  const lastMonthInApril = expensePeriod({ mode: "last_month" }, "2026-04-10");
  assert.deepEqual([lastMonthInApril.from, lastMonthInApril.to, lastMonthInApril.chart.startYear], ["2026-03-01", "2026-03-31", 2025]);

  assert.match(expensePeriod({ mode: "custom", from: "2026-09-10", to: "2026-09-01" }, TODAY).error, /start date is after/);
  assert.ok(expensePeriod({ mode: "custom", from: "", to: "2026-09-01" }, TODAY).error);
  const custom = expensePeriod({ mode: "custom", from: "2026-09-01", to: "2026-09-10" }, TODAY);
  assert.deepEqual([custom.previous.from, custom.previous.to], ["2026-08-22", "2026-08-31"]);
});

test("expense rows come from expense ledgers only and reconcile with Profit & Loss", () => {
  const ids = rows.map(row => row.voucherId);
  assert.ok(!ids.includes(stock.id), "stock purchases are not operating expenses");
  assert.ok(!ids.includes(cancelled.id), "cancelled vouchers do not count");
  const power = rows.find(row => row.voucherId === powerOnCredit.id);
  assert.equal(power.amount, 5000, "recoverable input GST stays out of the expense");
  assert.equal(power.paidFrom, "On credit");
  assert.equal(power.partyName, "TSSPDCL");
  assert.equal(rows.find(row => row.voucherId === rentApr.id).paidFrom, "Bank");
  assert.equal(rows.find(row => row.voucherId === rentApr.id).description, "April rent");
  assert.equal(rows.find(row => row.voucherId === wrong.id).status, "reversed");
  assert.equal(rows.find(row => row.voucherId === reversal.id).amount, -3000);
  assert.equal(rows.find(row => row.voucherId === reversal.id).paidFrom, "Cash in Hand");
  assert.deepEqual(rows.filter(row => row.voucherId === reclass.id).map(row => row.amount).sort((a, b) => a - b), [-1200, 1200]);
  assert.equal(rows.find(row => row.voucherId === diesel.id).categoryName, "Electricity", "a child ledger rolls up to its expense parent");

  for (const filter of [{ mode: "fy", fyStart: 2026 }, { mode: "fy", fyStart: 2026, month: 9 }, { mode: "calendar", year: 2025 }]) {
    const period = expensePeriod(filter, TODAY);
    const summary = expenseSummary({ rows, period, today: TODAY });
    const check = expenseReconciliation({ accounts, vouchers, period });
    const pnl = profitAndLoss(accounts, vouchers, { from: period.from, to: period.to });
    assert.equal(check.ledgerTotal, pnl.totalExpense);
    assert.equal(summary.total, check.operating, `${period.label} matches the P&L less stock purchases`);
  }
  const sep = expenseReconciliation({ accounts, vouchers, period: expensePeriod({ mode: "fy", fyStart: 2026, month: 9 }, TODAY) });
  assert.equal(sep.purchases, 80000);
  assert.equal(sep.operating, 28500);
});

test("summary cards, categories and comparisons follow the period and category", () => {
  const sep = expensePeriod({ mode: "fy", fyStart: 2026, month: 9 }, TODAY);
  const summary = expenseSummary({ rows, period: sep, today: TODAY });
  assert.equal(summary.total, 28500);
  assert.equal(summary.previousTotal, 4000);
  assert.equal(summary.change, 612.5);
  assert.equal(summary.count, 6, "distinct vouchers, a reversal counted once");
  assert.equal(summary.average.unit, "day");
  assert.equal(summary.average.change, null, "a finished month is not compared per day");
  assert.equal(summary.top.name, "Rent");
  assert.equal(summary.top.amount, 22000);
  assert.equal(summary.categories.find(row => row.name === "Electricity").amount, 6500);
  assert.equal(summary.categories.find(row => row.name === "Marketing"), undefined, "a reversed entry nets to nothing");

  const rent = expenseSummary({ rows, period: sep, today: TODAY, categoryId: "5000" });
  assert.equal(rent.total, 22000);
  assert.equal(rent.count, 1);
  assert.equal(rent.categories.length, summary.categories.length, "every category stays pickable");
  assert.equal(rent.top.name, "Rent");
  assert.equal(rent.change, null, "no rent in August, so no comparison");

  const electricity = expenseSummary({ rows, period: sep, today: TODAY, categoryId: "5040" });
  assert.deepEqual(electricity.ledgers.map(row => row.name), ["Electricity", "Generator diesel"]);

  const fy = expenseSummary({ rows, period: expensePeriod({ mode: "fy", fyStart: 2026 }, TODAY), today: TODAY, booksStartedOn: "2025-06-01" });
  assert.equal(fy.canCompare, false, "the books started after the previous FY began");
  assert.equal(fy.change, null);
  assert.equal(fy.average.unit, "month");
  assert.equal(fy.average.count, 7);
  assert.equal(fy.average.value, Math.round((52500 / 7) * 100) / 100);

  const invalid = expenseSummary({ rows, period: expensePeriod({ mode: "custom", from: "x", to: "y" }, TODAY), today: TODAY });
  assert.equal(invalid.total, 0);
});

test("trend bars by month, quarter and year with last year alongside", () => {
  const period = expensePeriod({ mode: "fy", fyStart: 2026, month: 9 }, TODAY);
  const months = expenseTrend({ rows, period, today: TODAY });
  assert.equal(months.length, 12);
  assert.deepEqual(months.slice(0, 3).map(row => row.label), ["Apr", "May", "Jun"]);
  const sep = months.find(row => row.longLabel === "September 2026");
  assert.deepEqual([sep.amount, sep.previous, sep.selected], [28500, 18000, true]);
  assert.equal(months.filter(row => row.selected).length, 1);
  assert.ok(months.find(row => row.longLabel === "October 2026").partial);
  assert.ok(months.find(row => row.longLabel === "November 2026").future);

  const quarters = expenseTrend({ rows, period, aggregation: "quarter", today: TODAY });
  assert.deepEqual(quarters.map(row => row.label), ["Q1", "Q2", "Q3", "Q4"]);
  assert.equal(quarters[1].amount, 32500);

  const years = expenseTrend({ rows, period, aggregation: "year", today: TODAY });
  assert.equal(years.length, 5);
  assert.equal(years[4].longLabel, "FY 2026–27");
  assert.equal(years[4].amount, 52500);
  assert.equal(years[3].amount, 18000);
  assert.equal(years[4].previous, null);

  const rentOnly = expenseTrend({ rows, period, today: TODAY, categoryId: "5000" });
  assert.equal(rentOnly.find(row => row.longLabel === "September 2026").amount, 22000);

  const insight = expenseTrendInsight(months);
  assert.equal(insight.month, "September 2026");
  assert.equal(insight.change, 612.5);
});

test("search, sort, payment filter and possible repeats", () => {
  const period = expensePeriod({ mode: "fy", fyStart: 2026 }, TODAY);
  const current = expenseSummary({ rows, period, today: TODAY }).current;
  assert.deepEqual(filterExpenseRows(current, { search: "lakshmi" }).map(row => row.voucherId), [rentSep.id, rentApr.id]);
  assert.equal(filterExpenseRows(current, { sort: "amount_desc" })[0].amount, 22000);
  assert.equal(filterExpenseRows(current, { sort: "date_asc" })[0].voucherId, rentApr.id);
  assert.ok(filterExpenseRows(current, { paidFrom: "On credit" }).every(row => row.paidKind === "credit"));

  const twice = [
    voucher("payment", "2026-09-01", [line("5050", 999), line("1000", 0, 999)]),
    voucher("payment", "2026-09-03", [line("5050", 999), line("1000", 0, 999)]),
    voucher("payment", "2026-09-20", [line("5050", 999), line("1000", 0, 999)]),
  ];
  const repeats = possibleRepeatExpenses(expenseTransactions({ accounts, vouchers: twice, parties }));
  assert.equal(repeats.length, 1);
  assert.deepEqual(repeats[0].rows.map(row => row.date), ["2026-09-01", "2026-09-03"]);
});

test("Expenses has its own Accounts address", () => {
  assert.equal(accountsPath({ section: "expenses" }), "/accounting/expenses");
  assert.equal(accountsViewFromPath("expenses").section, "expenses");
  assert.deepEqual(sectionTrail("expenses"), ["Expenses"]);
});
