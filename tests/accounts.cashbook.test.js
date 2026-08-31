import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateOverview,
  dateRangeForFilter,
  filterCashbookEntries,
  ledgerBalance,
  runningBalancesForLedger,
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

test("dateRangeForFilter returns today range", () => {
  const range = dateRangeForFilter("today");
  assert.equal(range.from, range.to);
});
