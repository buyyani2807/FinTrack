import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  SYSTEM_CODES,
  VOUCHER_STATUS,
  accountingEquationHolds,
  assertBalancedVoucher,
  buildIntegrationVouchers,
  buildVoucher,
  cancelVoucher,
  contraLines,
  dateIsLocked,
  disbursementLines,
  formatVoucherNumber,
  indianFinancialYear,
  ledgerBalances,
  paymentLines,
  postVoucher,
  receiptLines,
  reverseVoucher,
  roundMoney,
  voucherTotals,
} from "../src/features/accounts/accountingModel.js";
import {
  balanceSheet,
  cashFlow,
  dayBook,
  partyBalances,
  profitAndLoss,
  trialBalance,
} from "../src/features/accounts/accountingReports.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));

const posted = (type, date, lines, extra = {}) => buildVoucher({
  voucherType: type,
  voucherNumber: extra.voucherNumber || formatVoucherNumber(type, extra.n || 1),
  date,
  lines,
  narration: extra.narration || type,
  partyId: extra.partyId || null,
  sourceModule: extra.sourceModule,
  sourceType: extra.sourceType,
  sourceTransactionId: extra.sourceTransactionId,
});

test("Indian financial year runs 1 April to 31 March", () => {
  assert.equal(indianFinancialYear("2026-04-01").from, "2026-04-01");
  assert.equal(indianFinancialYear("2026-04-01").to, "2027-03-31");
  assert.equal(indianFinancialYear("2027-03-31").from, "2026-04-01");
  assert.equal(indianFinancialYear("2026-03-31").from, "2025-04-01");
});

test("voucher numbering uses type prefixes", () => {
  assert.equal(formatVoucherNumber("receipt", 1), "RCPT-000001");
  assert.equal(formatVoucherNumber("payment", 12), "PAY-000012");
  assert.equal(formatVoucherNumber("contra", 3), "CON-000003");
  assert.equal(formatVoucherNumber("journal", 9), "JNL-000009");
});

test("unbalanced voucher cannot be posted", () => {
  assert.throws(
    () => assertBalancedVoucher([{ coaId: "1000", debit: 100, credit: 0 }]),
    /Unbalanced voucher/,
  );
  assert.throws(
    () => buildVoucher({
      voucherType: "journal",
      voucherNumber: "JNL-000001",
      date: "2026-04-01",
      lines: [{ coaId: "1000", debit: 50, credit: 0 }, { coaId: "3000", debit: 0, credit: 40 }],
    }),
    /Unbalanced/,
  );
});

test("receipt is Dr money accounts and Cr receivable, including split cash+UPI", () => {
  const lines = receiptLines({ accounts, cash: 400, upi: 600, receivableCode: SYSTEM_CODES.dailyReceivable, partyId: "p1" });
  const totals = voucherTotals(lines);
  assert.equal(totals.balanced, true);
  assert.equal(totals.debit, 1000);
  assert.equal(lines.filter(line => line.debit > 0).length, 2);
  assert.equal(lines.filter(line => line.credit > 0).length, 1);
  assert.equal(lines.find(line => line.credit === 1000).code, SYSTEM_CODES.dailyReceivable);
  assert.equal(lines.find(line => line.credit === 1000).partyId, "p1");
});

test("finance disbursement uses paid-to-customer amount, not financed amount", () => {
  const lines = disbursementLines({ accounts, cash: 8500, receivableCode: SYSTEM_CODES.dailyReceivable });
  assert.equal(voucherTotals(lines).debit, 8500);
  assert.equal(lines.find(line => line.debit > 0).debit, 8500);
});

test("contra moves cash to bank without income or expense", () => {
  const voucher = posted("contra", "2026-04-02", contraLines({ accounts, fromType: "cash", toType: "bank", amount: 2000 }));
  const pnl = profitAndLoss(accounts, [voucher], { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(pnl.net, 0);
  const cash = ledgerBalances(accounts, [voucher]).find(row => row.code === "1000");
  const bank = ledgerBalances(accounts, [voucher]).find(row => row.code === "1020");
  assert.equal(cash.balance, -2000);
  assert.equal(bank.balance, 2000);
});

test("posted vouchers cannot be overwritten; reverse creates opposite lines", () => {
  const original = posted("receipt", "2026-04-03", receiptLines({ accounts, cash: 1000 }));
  assert.throws(() => postVoucher(original, original, { locks: [] }), /cannot be overwritten/);
  const reversal = reverseVoucher(original, { date: "2026-04-04", sequence: 2, reason: "Correction" });
  assert.equal(reversal.lines.find(line => line.code === "1000").credit, 1000);
  assert.equal(reversal.sourceType, "reversal");
  const cancelled = cancelVoucher(original, { reason: "Entered twice" });
  assert.equal(cancelled.status, VOUCHER_STATUS.cancelled);
  assert.equal(cancelled.cancelReason, "Entered twice");
});

test("locked periods reject new posts", () => {
  const locks = [{ periodFrom: "2026-04-01", periodTo: "2026-04-30", isLocked: true }];
  assert.equal(dateIsLocked("2026-04-15", locks), true);
  assert.throws(
    () => postVoucher(null, posted("journal", "2026-04-15", [
      { coaId: "1000", debit: 1, credit: 0 },
      { coaId: "3000", debit: 0, credit: 1 },
    ]), { locks }),
    /period is locked/,
  );
});

test("trial balance, P&L and balance sheet stay in equation", () => {
  const capital = posted("journal", "2026-04-01", [
    { coaId: "1000", code: "1000", debit: 100000, credit: 0 },
    { coaId: "3000", code: "3000", debit: 0, credit: 100000 },
  ], { n: 1 });
  const loanOut = posted("payment", "2026-04-02", disbursementLines({ accounts, cash: 8500 }), { n: 1 });
  const collection = posted("receipt", "2026-04-03", receiptLines({ accounts, cash: 100, receivableCode: SYSTEM_CODES.dailyReceivable }), { n: 1 });
  const rent = posted("payment", "2026-04-04", paymentLines({ accounts, cash: 2000, expenseCode: "5000" }), { n: 2 });
  const vouchers = [capital, loanOut, collection, rent];
  const tb = trialBalance(accounts, vouchers);
  assert.equal(tb.balanced, true);
  const pnl = profitAndLoss(accounts, vouchers, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(pnl.net, -2000);
  const sheet = balanceSheet(accounts, vouchers, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(sheet.balanced, true);
  assert.equal(sheet.totalAssets, roundMoney(sheet.totalLiabilities + sheet.totalEquity));
  const equation = accountingEquationHolds(accounts, vouchers);
  assert.equal(equation.balanced, true);
});

test("day book lists only posted vouchers in date order", () => {
  const postedVoucher = posted("receipt", "2026-04-10", receiptLines({ accounts, cash: 50 }), { n: 1 });
  const draft = { ...postedVoucher, status: "draft", date: "2026-04-09" };
  const rows = dayBook([draft, postedVoucher], { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].voucherNumber, "RCPT-000001");
});

test("receivables keep a single credit line for split customer payments", () => {
  const voucher = posted("receipt", "2026-04-05", receiptLines({
    accounts, cash: 400, upi: 600, receivableCode: SYSTEM_CODES.monthlyReceivable, partyId: "priya",
  }));
  const ar = partyBalances(accounts, [voucher], [{ id: "priya", name: "Priya", partyType: "customer" }], { kind: "receivable" });
  assert.equal(ar.length, 1);
  assert.equal(ar[0].balance, -1000);
});

test("cash flow follows cash, bank and UPI only", () => {
  const vouchers = [
    posted("journal", "2026-04-01", [
      { coaId: "1000", code: "1000", debit: 5000, credit: 0 },
      { coaId: "3000", code: "3000", debit: 0, credit: 5000 },
    ]),
    posted("payment", "2026-04-02", paymentLines({ accounts, cash: 500, expenseCode: "5000" }), { n: 1 }),
  ];
  const flow = cashFlow(accounts, vouchers, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(flow.inflow, 5000);
  assert.equal(flow.outflow, 500);
  assert.equal(flow.net, 4500);
});

test("integration OFF creates no accounting vouchers from cashbook", () => {
  const cashbook = [{
    sourceType: "finance_payment",
    sourceId: "pay-1",
    entryDate: "2026-04-06",
    description: "Daily collection",
    moneyIn: 1000,
    moneyOut: 0,
    ledgerType: "cash",
  }];
  const created = buildIntegrationVouchers(accounts, cashbook, { enabled: false });
  assert.equal(created.length, 0);
});

test("integration ON posts one receipt for a split collection and never duplicates", () => {
  const cashbook = [
    { sourceType: "finance_payment", sourceId: "pay-2", entryDate: "2026-04-06", description: "Split", moneyIn: 400, moneyOut: 0, ledgerType: "cash" },
    { sourceType: "finance_payment", sourceId: "pay-2", entryDate: "2026-04-06", description: "Split", moneyIn: 600, moneyOut: 0, ledgerType: "upi" },
  ];
  const first = buildIntegrationVouchers(accounts, cashbook, { enabled: true, financeKindBySource: { "pay-2": "daily" } });
  assert.equal(first.length, 1);
  assert.equal(first[0].voucherType, "receipt");
  assert.equal(voucherTotals(first[0].lines).debit, 1000);
  assert.equal(first[0].lines.filter(line => line.credit > 0).length, 1);
  const again = buildIntegrationVouchers(accounts, cashbook, { enabled: true, existing: first });
  assert.equal(again.length, 0);
});

test("integration uses paid-to-customer cashbook amount for disbursements", () => {
  const cashbook = [{
    sourceType: "finance_disbursement",
    sourceId: "loan-1",
    entryDate: "2026-04-01",
    description: "Paid to customer",
    moneyIn: 0,
    moneyOut: 8500,
    ledgerType: "cash",
  }];
  const created = buildIntegrationVouchers(accounts, cashbook, { enabled: true, financeKindBySource: { "loan-1": "daily" } });
  assert.equal(created[0].lines.find(line => line.debit > 0).debit, 8500);
});
