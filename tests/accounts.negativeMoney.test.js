import test from "node:test";
import assert from "node:assert/strict";
import { explainNegativeMoneyBalances } from "../src/features/accounts/model/accountingReports.js";

const accounts = [
  { id: "cash", code: "1000", name: "Cash in Hand", accountType: "cash", groupType: "asset", openingBalance: 0 },
  { id: "bank", code: "1020", name: "Bank", accountType: "bank", groupType: "asset", openingBalance: 0 },
  { id: "upi", code: "1010", name: "UPI", accountType: "upi", groupType: "asset", openingBalance: 0 },
  { id: "sales", code: "4300", name: "Sales", accountType: "income", groupType: "income" },
  { id: "rent", code: "5000", name: "Rent", accountType: "expense", groupType: "expense" },
];
const voucher = (id, date, lines, over = {}) => ({
  id, date, voucherNumber: id, voucherType: "payment", status: "posted", narration: id, lines, ...over,
});

test("a bank ledger below zero is explained by its own arithmetic", () => {
  const vouchers = [
    voucher("PAY-1", "2026-10-05", [{ coaId: "rent", debit: 60000, credit: 0 }, { coaId: "bank", debit: 0, credit: 60000 }]),
    voucher("PAY-2", "2026-10-20", [{ coaId: "rent", debit: 30000, credit: 0 }, { coaId: "bank", debit: 0, credit: 30000 }]),
    voucher("REC-1", "2026-10-25", [{ coaId: "bank", debit: 11100, credit: 0 }, { coaId: "sales", debit: 0, credit: 11100 }]),
    // Cash stays positive, so it should be offered as the ledger the receipts may have gone to.
    voucher("REC-2", "2026-10-26", [{ coaId: "cash", debit: 500000, credit: 0 }, { coaId: "sales", debit: 0, credit: 500000 }], { voucherType: "receipt" }),
  ];
  const rows = explainNegativeMoneyBalances(accounts, vouchers, { from: "2026-04-01", to: "2027-03-31" });
  assert.equal(rows.length, 1, "only the negative ledger is explained");
  const bank = rows[0];
  assert.equal(bank.name, "Bank");
  // 0 + 11,100 - 90,000 = -78,900, the figure the Overview tile shows bare.
  assert.equal(bank.opening, 0);
  assert.equal(bank.moneyIn, 11100);
  assert.equal(bank.moneyOut, 90000);
  assert.equal(bank.balance, -78900);
  assert.equal(bank.opening + bank.moneyIn - bank.moneyOut, bank.balance);
  assert.equal(bank.hasOpening, false);
  assert.match(bank.reasons.join(" "), /No opening balance is recorded for Bank/);
  assert.match(bank.reasons.join(" "), /Cash in Hand/);
  // Largest payments out, biggest first, so the owner knows where to look.
  assert.deepEqual(bank.largestOut.map(row => [row.voucherNumber, row.amount]), [["PAY-1", 60000], ["PAY-2", 30000]]);
});

test("a recorded opening balance is carried into the explanation", () => {
  const withOpening = accounts.map(a => (a.id === "bank" ? { ...a, openingBalance: 20000, openingSide: "debit" } : a));
  const vouchers = [voucher("PAY-1", "2026-10-05", [{ coaId: "rent", debit: 50000, credit: 0 }, { coaId: "bank", debit: 0, credit: 50000 }])];
  const rows = explainNegativeMoneyBalances(withOpening, vouchers, { from: "2026-04-01", to: "2027-03-31" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].opening, 20000);
  assert.equal(rows[0].moneyOut, 50000);
  assert.equal(rows[0].balance, -30000);
  assert.equal(rows[0].hasOpening, true);
  assert.equal(rows[0].reasons.some(r => /No opening balance/.test(r)), false);
});

test("ledgers at or above zero are left alone, and non-money ledgers are never explained", () => {
  const vouchers = [
    voucher("REC-1", "2026-10-01", [{ coaId: "bank", debit: 5000, credit: 0 }, { coaId: "sales", debit: 0, credit: 5000 }]),
    // An expense ledger with a credit balance is not a money ledger and is not our business here.
    voucher("ADJ-1", "2026-10-02", [{ coaId: "bank", debit: 1000, credit: 0 }, { coaId: "rent", debit: 0, credit: 1000 }]),
  ];
  assert.deepEqual(explainNegativeMoneyBalances(accounts, vouchers, { from: "2026-04-01", to: "2027-03-31" }), []);
});

test("vouchers outside the period do not change the explanation", () => {
  const vouchers = [
    voucher("PAY-OLD", "2025-06-01", [{ coaId: "rent", debit: 900000, credit: 0 }, { coaId: "bank", debit: 0, credit: 900000 }]),
    voucher("PAY-1", "2026-10-05", [{ coaId: "rent", debit: 40000, credit: 0 }, { coaId: "bank", debit: 0, credit: 40000 }]),
  ];
  const rows = explainNegativeMoneyBalances(accounts, vouchers, { from: "2026-04-01", to: "2027-03-31" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].moneyOut, 40000);
  assert.deepEqual(rows[0].largestOut.map(r => r.voucherNumber), ["PAY-1"]);
});
