import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  SYSTEM_CODES,
  buildVoucher,
  paymentLines,
  receiptLines,
} from "../src/features/accounts/model/accountingModel.js";
import { bankVoucherLines, defaultBankStatementLines, matchBankLine } from "../src/features/accounts/model/accountingReports.js";
import { suggestBankEntry, suggestExpense } from "../src/features/accounts/model/bookSuggestions.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));
const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };

const posted = (type, date, lines, extra = {}) => buildVoucher({
  voucherType: type,
  voucherNumber: extra.voucherNumber,
  date,
  lines,
  narration: extra.narration || type,
  partyId: extra.partyId || null,
});

test("Rent for October suggests the latest posted rent amount", () => {
  const april = posted("payment", "2026-04-07", paymentLines({ accounts, cash: 5000, expenseCode: "5000" }), { voucherNumber: "PMT-000001", narration: "Rent for April" });
  const september = posted("payment", "2026-09-07", paymentLines({ accounts, cash: 6000, expenseCode: "5000" }), { voucherNumber: "PMT-000002", narration: "Rent for September" });
  const salary = posted("payment", "2026-09-30", paymentLines({ accounts, cash: 8000, expenseCode: "5010" }), { voucherNumber: "PMT-000003", narration: "Salary" });
  const suggestion = suggestExpense("Rent for October", [april, september, salary], accounts);
  assert.equal(suggestion.expenseCode, "5000");
  assert.equal(suggestion.expenseName, "Rent");
  assert.equal(suggestion.amount, 6000);
  assert.equal(suggestExpense("October", [april], accounts), null);
  assert.equal(suggestExpense("", [april], accounts), null);
});

test("a bank line that names the party suggests that books line", () => {
  const voucher = posted("receipt", "2026-01-02", receiptLines({ accounts, bank: 1000, partyId: "ravi" }).map((line, index) => ({ ...line, id: `line-${index}` })), {
    voucherNumber: "RCT-000001",
    partyId: "ravi",
    narration: "Receipt from Ravi",
  });
  const voucherLines = bankVoucherLines(accounts, [voucher], SYSTEM_CODES.bank, [ravi]);
  const suggested = matchBankLine(
    { amount: 1000, lineDate: "2026-03-20", description: "NEFT RAVI", direction: "in", matchStatus: "unmatched" },
    voucherLines,
  );
  assert.equal(suggested.matchStatus, "suggested");
  assert.match(suggested.matchHint, /party/);
  assert.equal(suggested.entrySuggestion, undefined);
});

test("a party name inside another word does not count as a match", () => {
  const voucher = posted("payment", "2026-01-02", paymentLines({ accounts, bank: 1000, expenseCode: "5010" }).map((line, index) => ({ ...line, id: `line-${index}` })), {
    voucherNumber: "PMT-000009",
    partyId: "sai",
    narration: "Salary",
  });
  const voucherLines = bankVoucherLines(accounts, [voucher], SYSTEM_CODES.bank, [{ id: "sai", name: "Sai", partyType: "customer" }]);
  const suggested = matchBankLine(
    { amount: 1000, lineDate: "2026-01-02", description: "Salary payment", direction: "out", matchStatus: "unmatched" },
    voucherLines,
  );
  assert.equal(suggested.matchStatus, "suggested");
  assert.doesNotMatch(suggested.matchHint, /party/);
});

test("statement text suggests an open invoice, a party, or the expense ledger", () => {
  const invoice = suggestBankEntry(
    { amount: 2500, description: "IMPS SALE-000012", direction: "in", matchStatus: "unmatched" },
    {
      parties: [ravi],
      openInvoices: [{ partyId: "ravi", partyName: "Ravi", partyType: "customer", reference: "SALE-000012", outstanding: 2500, voucherType: "sales" }],
      accounts,
    },
  );
  assert.equal(invoice.kind, "receipt");
  assert.equal(invoice.partyId, "ravi");
  assert.equal(invoice.reference, "SALE-000012");

  const party = suggestBankEntry(
    { amount: 1000, description: "NEFT RAVI KUMAR", direction: "in", matchStatus: "unmatched" },
    { parties: [ravi, { id: "long", name: "Ravi Kumar", partyType: "customer" }], accounts },
  );
  assert.equal(party.partyId, "long");
  assert.equal(party.kind, "receipt");

  const rent = defaultBankStatementLines(
    [{ id: "s1", amount: 5000, lineDate: "2026-10-06", description: "RENT FOR OCTOBER", direction: "out", matchStatus: "unmatched" }],
    [],
    { accounts, parties: [], openInvoices: [] },
  );
  assert.equal(rent[0].matchStatus, "unmatched");
  assert.equal(rent[0].entrySuggestion.kind, "expense");
  assert.equal(rent[0].entrySuggestion.expenseCode, "5000");
  assert.equal(suggestBankEntry({ description: "RENT", direction: "in", matchStatus: "unmatched" }, { accounts }), null);
  assert.equal(suggestBankEntry({ description: "OFFICE", direction: "out", matchStatus: "unmatched" }, { accounts }), null);
  assert.equal(suggestBankEntry({ description: "OFFICE SUPPLIES", direction: "out", matchStatus: "unmatched" }, { accounts }).expenseCode, "5060");
});
