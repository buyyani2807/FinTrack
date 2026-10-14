import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHART_OF_ACCOUNTS, buildVoucher, formatVoucherNumber } from "../src/features/accounts/model/accountingModel.js";
import { expenseBreakdown, monthlyIncomeExpense } from "../src/features/accounts/model/accountsCharts.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));
let seq = 0;
const entry = (type, date, debitCode, creditCode, amount) => {
  seq += 1;
  return buildVoucher({
    voucherType: type,
    voucherNumber: formatVoucherNumber(type, seq),
    date,
    narration: type,
    lines: [
      { coaId: debitCode, code: debitCode, debit: amount, credit: 0 },
      { coaId: creditCode, code: creditCode, debit: 0, credit: amount },
    ],
  });
};

test("monthly income and expenses cover each calendar month up to the end date", () => {
  const vouchers = [
    entry("sales", "2026-07-10", "1000", "4300", 50000),
    entry("payment", "2026-07-15", "5000", "1000", 12000),
    entry("sales", "2026-08-05", "1000", "4300", 30000),
    entry("payment", "2026-08-20", "5040", "1000", 4000),
    entry("purchase", "2026-08-21", "5110", "1000", 20000),
    entry("sales", "2026-09-25", "1000", "4300", 9000),
  ];
  const rows = monthlyIncomeExpense({ accounts, vouchers, endDate: "2026-09-20", months: 3 });
  assert.deepEqual(rows.map(row => row.label), ["Jul 26", "Aug 26", "Sep 26"]);
  assert.deepEqual(rows.map(row => [row.income, row.expenses, row.net]), [
    [50000, 12000, 38000],
    [30000, 24000, 6000],
    [0, 0, 0],
  ]);
});

test("monthly rows cross the year boundary", () => {
  const rows = monthlyIncomeExpense({ accounts, vouchers: [], endDate: "2027-02-10", months: 4 });
  assert.deepEqual(rows.map(row => row.month), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("spending breakdown leaves out stock purchases and folds the tail into Other", () => {
  const breakdown = expenseBreakdown([
    { code: "5110", name: "Purchase", amount: 90000 },
    { code: "5000", name: "Rent", amount: 12000 },
    { code: "5010", name: "Salary", amount: 20000 },
    { code: "5030", name: "Fuel", amount: 3000 },
    { code: "5040", name: "Electricity", amount: 4000 },
    { code: "5100", name: "Bank Charges", amount: 500 },
    { code: "5060", name: "Office Supplies", amount: 500 },
    { code: "5080", name: "Marketing", amount: 0 },
  ], { top: 4 });
  assert.equal(breakdown.purchases, 90000);
  assert.equal(breakdown.total, 40000);
  assert.deepEqual(breakdown.slices.map(slice => [slice.name, slice.amount]), [
    ["Salary", 20000], ["Rent", 12000], ["Electricity", 4000], ["Fuel", 3000], ["Other", 1000],
  ]);
  assert.equal(breakdown.slices[0].share, 0.5);
});
