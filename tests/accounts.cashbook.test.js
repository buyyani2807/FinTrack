import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateOverview,
  cashbookSourceKind,
  dateRangeForFilter,
  filterCashbookEntries,
  ledgerBalance,
  runningBalancesForLedger,
  sourceOriginLabel,
  todayIso,
} from "../src/features/accounts/cashbookModel.js";

const ledgers = [
  { id: "cash", accountType: "cash", name: "Cash", isDefault: true },
  { id: "upi", accountType: "upi", name: "UPI", isDefault: true },
];

const entries = [
  { id: "1", ledgerAccountId: "cash", entryDate: "2026-08-28", entryTime: "09:00", moneyIn: 100000, moneyOut: 0, category: "Opening Balance", description: "Opening", transactionType: "opening_balance" },
  { id: "2", ledgerAccountId: "cash", entryDate: "2026-08-28", entryTime: "10:00", moneyIn: 1000, moneyOut: 0, category: "Finance Collection", description: "Ravi", transactionType: "money_in", sourceType: "finance_payment" },
  { id: "3", ledgerAccountId: "cash", entryDate: "2026-08-28", entryTime: "11:00", moneyIn: 0, moneyOut: 8500, category: "Disbursement", description: "Paid to customer", transactionType: "money_out", sourceType: "finance_disbursement" },
  { id: "4", ledgerAccountId: "upi", entryDate: "2026-08-28", entryTime: "12:00", moneyIn: 2500, moneyOut: 0, category: "Finance Collection", description: "Split UPI", transactionType: "money_in", sourceType: "finance_payment", sourceLineKey: "upi" },
];

test("ledgerBalance sums in and out for one account", () => {
  assert.equal(ledgerBalance(entries, "cash"), 92500);
  assert.equal(ledgerBalance(entries, "upi"), 2500);
});

test("aggregateOverview totals cash, upi and period movement", () => {
  const range = { from: "2026-08-28", to: "2026-08-28" };
  const overview = aggregateOverview(ledgers, entries, range);
  assert.equal(overview.cash, 92500);
  assert.equal(overview.upi, 2500);
  assert.equal(overview.total, 95000);
  assert.equal(overview.moneyIn, 103500);
  assert.equal(overview.moneyOut, 8500);
});

test("period money-in and money-out omit internal transfers", () => {
  const range = { from: "2026-08-28", to: "2026-08-28" };
  const withTransfers = [
    ...entries,
    { id: "5", ledgerAccountId: "cash", entryDate: "2026-08-28", entryTime: "13:00", moneyIn: 0, moneyOut: 4000, category: "Transfer", transactionType: "transfer_out" },
    { id: "6", ledgerAccountId: "upi", entryDate: "2026-08-28", entryTime: "13:00", moneyIn: 4000, moneyOut: 0, category: "Transfer", transactionType: "transfer_in" },
  ];
  const overview = aggregateOverview(ledgers, withTransfers, range);
  assert.equal(overview.moneyIn, 103500);
  assert.equal(overview.moneyOut, 8500);
  assert.equal(overview.cash, 88500);
  assert.equal(overview.upi, 6500);
});

test("runningBalancesForLedger calculates closing balance chronologically", () => {
  const rows = runningBalancesForLedger(entries, "cash");
  assert.equal(rows[0].balance, 92500);
  assert.equal(rows.at(-1).balance, 100000);
});

test("filterCashbookEntries supports split-payment search without duplication", () => {
  const filtered = filterCashbookEntries(entries, { search: "split", accountId: "all", direction: "all", category: "all" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].moneyIn, 2500);
});

test("cashbookSourceKind classifies daily, monthly, and chit entries", () => {
  const loanById = {
    d1: { id: "d1", kind: "daily" },
    m1: { id: "m1", kind: "monthly" },
  };
  assert.equal(cashbookSourceKind({ sourceType: "finance_payment", financeAccountId: "d1" }, loanById), "daily");
  assert.equal(cashbookSourceKind({ sourceType: "finance_disbursement", financeAccountId: "m1" }, loanById), "monthly");
  assert.equal(cashbookSourceKind({ sourceType: "chit_auction" }, loanById), "chit");
  assert.equal(cashbookSourceKind({ sourceType: "chit_fixed_lift" }, loanById), "chit");
  assert.equal(cashbookSourceKind({
    sourceType: "finance_payment",
    category: "Finance Collection",
    description: "Meena · Monthly collection",
  }), "monthly");
  assert.equal(cashbookSourceKind({
    sourceType: "finance_disbursement",
    description: "Ravi · Paid to customer",
  }), "daily");
});

test("filterCashbookEntries combines money in/out with daily, monthly, and chit sources", () => {
  const mixed = [
    { id: "d-in", ledgerAccountId: "cash", moneyIn: 1000, moneyOut: 0, sourceType: "finance_payment", financeAccountId: "d1", transactionType: "money_in", description: "Daily collection" },
    { id: "d-out", ledgerAccountId: "cash", moneyIn: 0, moneyOut: 8000, sourceType: "finance_disbursement", financeAccountId: "d1", transactionType: "money_out", description: "Paid to customer" },
    { id: "m-in", ledgerAccountId: "cash", moneyIn: 2500, moneyOut: 0, sourceType: "finance_payment", financeAccountId: "m1", transactionType: "money_in", description: "Monthly collection" },
    { id: "m-out", ledgerAccountId: "cash", moneyIn: 0, moneyOut: 50000, sourceType: "finance_disbursement", financeAccountId: "m1", transactionType: "money_out", description: "Principal financed" },
    { id: "c-in", ledgerAccountId: "cash", moneyIn: 3000, moneyOut: 0, sourceType: "chit_fixed", transactionType: "money_in", description: "Chit installment" },
    { id: "c-out", ledgerAccountId: "cash", moneyIn: 0, moneyOut: 40000, sourceType: "chit_fixed_lift", transactionType: "money_out", description: "Chit payout" },
    { id: "manual", ledgerAccountId: "cash", moneyIn: 100, moneyOut: 0, sourceType: "manual", transactionType: "money_in", description: "Other income" },
  ];
  const loanById = { d1: { id: "d1", kind: "daily" }, m1: { id: "m1", kind: "monthly" } };
  const dailyIn = filterCashbookEntries(mixed, { source: "daily", direction: "in", loanById });
  const monthlyOut = filterCashbookEntries(mixed, { source: "monthly", direction: "out", loanById });
  const chitAll = filterCashbookEntries(mixed, { source: "chit", loanById });
  assert.deepEqual(dailyIn.map(row => row.id), ["d-in"]);
  assert.deepEqual(monthlyOut.map(row => row.id), ["m-out"]);
  assert.deepEqual(chitAll.map(row => row.id), ["c-in", "c-out"]);
  assert.equal(sourceOriginLabel(mixed[0], loanById), "Daily Finance collection");
  assert.equal(sourceOriginLabel(mixed[3], loanById), "Monthly Finance disbursement");
});

test("dateRangeForFilter returns today range", () => {
  const range = dateRangeForFilter("today");
  assert.equal(range.from, range.to);
});

test("cashbook today and period filters use Asia/Kolkata, not UTC", () => {
  const lateUtc = new Date("2026-08-31T20:30:00.000Z");
  assert.equal(todayIso(lateUtc), "2026-09-01");
  assert.deepEqual(dateRangeForFilter("today", undefined, undefined, lateUtc), { from: "2026-09-01", to: "2026-09-01" });
  assert.deepEqual(dateRangeForFilter("yesterday", undefined, undefined, lateUtc), { from: "2026-08-31", to: "2026-08-31" });
  assert.deepEqual(dateRangeForFilter("month", undefined, undefined, lateUtc), { from: "2026-09-01", to: "2026-09-01" });
  assert.equal(dateRangeForFilter("week", undefined, undefined, lateUtc).from, "2026-08-30");
});
