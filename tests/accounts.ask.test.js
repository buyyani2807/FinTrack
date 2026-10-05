import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/model/accountingModel.js";
import { askAccountsBooks } from "../src/features/accounts/model/accountsAsk.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));
const range = { from: "2026-04-01", to: "2026-04-30" };
const parties = [
  { id: "p1", name: "ABC Traders", partyType: "customer" },
  { id: "s1", name: "City Supplies", partyType: "supplier" },
];

const sale = (id, date, amount, partyId, dueDate) => ({
  id,
  voucherType: "sales",
  voucherNumber: id,
  date,
  dueDate: dueDate || date,
  status: "posted",
  partyId,
  lines: [
    { coaId: "1100", code: "1100", partyId, debit: amount, credit: 0 },
    { coaId: "4300", code: "4300", debit: 0, credit: amount },
  ],
});

const rent = {
  id: "PAY-1",
  voucherType: "payment",
  voucherNumber: "PAY-1",
  date: "2026-04-05",
  status: "posted",
  lines: [
    { coaId: "5000", code: "5000", debit: 8000, credit: 0 },
    { coaId: "1000", code: "1000", debit: 0, credit: 8000 },
  ],
};

const input = (vouchers, extra = {}) => ({
  accounts,
  vouchers,
  parties,
  range,
  today: "2026-04-20",
  ...extra,
});

test("who owes me quotes the receivables register", () => {
  const answer = askAccountsBooks("Who owes me?", input([
    sale("SALE-1", "2026-04-10", 10000, "p1", "2026-04-17"),
  ]));
  assert.equal(answer.matched, true);
  assert.match(answer.summary, /Customers owe ₹10,000/);
  assert.equal(answer.lines[0].label, "ABC Traders");
  assert.match(answer.source, /Receivables register/);
  assert.equal(answer.link, "receivables");
});

test("overdue uses the due date already on the bill", () => {
  const answer = askAccountsBooks("What is overdue?", input([
    sale("SALE-1", "2026-04-01", 4000, "p1", "2026-04-05"),
    sale("SALE-2", "2026-04-18", 9000, "p1", "2026-04-25"),
  ]));
  assert.match(answer.summary, /Overdue receivables are ₹4,000/);
  assert.match(answer.summary, /overdue payables are ₹0/);
  assert.equal(answer.lines.some(line => line.amount === 9000), false);
});

test("rent quotes the profit and loss ledger", () => {
  const answer = askAccountsBooks("Rent this period", input([rent]));
  assert.match(answer.summary, /Rent is ₹8,000/);
  assert.match(answer.source, /5000 Rent/);
  assert.equal(answer.link, "pnl");
});

test("cashbook question quotes cash bank and upi ledgers", () => {
  const answer = askAccountsBooks("How does cash compare to the cashbook?", input([rent]));
  assert.match(answer.summary, /Cash is/);
  assert.match(answer.summary, /Finance cashbook is its own list/);
  assert.equal(answer.link, "cashbook");
  assert.match(answer.source, /Cash, bank and UPI ledgers/);
});

test("a party question quotes that party's bills", () => {
  const answer = askAccountsBooks("What did I sell to ABC Traders?", input([
    sale("SALE-1", "2026-04-10", 2500, "p1", "2026-04-17"),
  ], {
    voucherItemLines: [{ voucherId: "SALE-1", itemName: "Primer", quantity: 2, amount: 2500 }],
  }));
  assert.match(answer.summary, /Sales to ABC Traders/);
  assert.match(answer.summary, /₹2,500/);
  assert.equal(answer.lines[0].label, "SALE-1");
  assert.match(answer.lines[0].detail, /Primer/);
});

test("an outside question invents no amount", () => {
  const answer = askAccountsBooks("What is the weather in Mumbai?", input([
    sale("SALE-1", "2026-04-10", 10000, "p1"),
  ]));
  assert.equal(answer.matched, false);
  assert.equal(answer.lines.length, 0);
  assert.equal(answer.summary.includes("₹"), false);
  assert.equal(answer.summary.includes("10,000"), false);
});
