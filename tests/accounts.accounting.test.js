import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  SYSTEM_CODES,
  VOUCHER_STATUS,
  accountingEquationHolds,
  assertBalancedVoucher,
  assertCanDeleteLedger,
  buildIntegrationVouchers,
  buildVoucher,
  cancelVoucher,
  contraLines,
  createSubmitLock,
  dateIsLocked,
  disbursementLines,
  formatVoucherNumber,
  indianFinancialYear,
  ledgerBalances,
  ledgerHasPostedLines,
  paymentLines,
  previousIndianFinancialYear,
  purchaseLines,
  postVoucher,
  receiptLines,
  reverseVoucher,
  roundMoney,
  saleLines,
  simpleEntryDraft,
  voucherTotals,
} from "../src/features/accounts/accountingModel.js";
import {
  balanceSheet,
  bankVoucherLines,
  cashFlow,
  dashboardMetrics,
  dayBook,
  invoiceRegister,
  matchBankLine,
  partyBalances,
  partyLedger,
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

test("cash sale debits money and credits Sales without Daily Finance", () => {
  const lines = saleLines({ accounts, amount: 10000, settlement: "paid", moneyMode: "cash" });
  assert.equal(voucherTotals(lines).balanced, true);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.cash).debit, 10000);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.sales).credit, 10000);
});

test("credit sale debits Accounts Receivable for an accounts-only customer", () => {
  const lines = saleLines({ accounts, amount: 25000, settlement: "credit", partyId: "ravi" });
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.receivable).debit, 25000);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.receivable).partyId, "ravi");
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.sales).credit, 25000);
});

test("credit purchase credits Accounts Payable for an accounts-only supplier", () => {
  const lines = purchaseLines({ accounts, amount: 15000, settlement: "credit", partyId: "xyz" });
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.purchase).debit, 15000);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.payable).credit, 15000);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.payable).partyId, "xyz");
});

test("expense draft posts a payment voucher without a manual journal", () => {
  const draft = simpleEntryDraft({ kind: "expense", accounts, date: "2026-04-06", amount: 20000, moneyMode: "cash", expenseCode: "5000" });
  assert.equal(draft.voucherType, "payment");
  assert.equal(draft.lines.find(line => line.code === "5000").debit, 20000);
  assert.equal(draft.lines.find(line => line.code === SYSTEM_CODES.cash).credit, 20000);
});

test("UPI is a first-class receipt mode", () => {
  const draft = simpleEntryDraft({ kind: "receipt", accounts, date: "2026-04-08", amount: 5000, moneyMode: "upi", partyId: "ravi" });
  assert.equal(draft.lines.find(line => line.code === SYSTEM_CODES.upi).debit, 5000);
  assert.equal(draft.lines.find(line => line.code === SYSTEM_CODES.receivable).credit, 5000);
});

test("guided credit note reduces sales and receivable for a customer", () => {
  const draft = simpleEntryDraft({ kind: "credit_note", accounts, date: "2026-04-10", amount: 4000, partyId: "ravi" });
  assert.equal(draft.voucherType, "credit_note");
  assert.equal(draft.lines.find(line => line.code === SYSTEM_CODES.sales).debit, 4000);
  assert.equal(draft.lines.find(line => line.code === SYSTEM_CODES.receivable).credit, 4000);
  assert.equal(draft.lines.find(line => line.code === SYSTEM_CODES.receivable).partyId, "ravi");
  assert.throws(() => simpleEntryDraft({ kind: "credit_note", accounts, date: "2026-04-10", amount: 4000 }), /customer/);
});

test("guided debit note reduces purchase and payable for a supplier", () => {
  const draft = simpleEntryDraft({ kind: "debit_note", accounts, date: "2026-04-10", amount: 2000, partyId: "xyz" });
  assert.equal(draft.voucherType, "debit_note");
  assert.equal(draft.lines.find(line => line.code === SYSTEM_CODES.payable).debit, 2000);
  assert.equal(draft.lines.find(line => line.code === SYSTEM_CODES.purchase).credit, 2000);
  assert.throws(() => simpleEntryDraft({ kind: "debit_note", accounts, date: "2026-04-10", amount: 2000 }), /supplier/);
});

test("unused ledgers can be deleted and used or system ledgers cannot", () => {
  const unused = { id: "5065", code: "5065", isSystem: false };
  const system = accounts.find(row => row.code === "1000");
  const voucher = posted("journal", "2026-04-01", [
    { coaId: "1000", code: "1000", debit: 10, credit: 0 },
    { coaId: "3000", code: "3000", debit: 0, credit: 10 },
  ]);
  assert.equal(ledgerHasPostedLines(unused, [voucher]), false);
  assertCanDeleteLedger(unused, [voucher]);
  assert.throws(() => assertCanDeleteLedger(system, []), /System accounts/);
  assert.throws(() => assertCanDeleteLedger(system, [voucher]), /System accounts|transactions/);
});

test("double submit lock skips the second click while the first is in flight", async () => {
  const lock = createSubmitLock();
  let started = 0;
  let finished = 0;
  const first = lock.run(async () => {
    started += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    finished += 1;
    return "ok";
  });
  const second = await lock.run(async () => { started += 1; });
  assert.equal(second.skipped, true);
  const firstResult = await first;
  assert.equal(firstResult.skipped, false);
  assert.equal(firstResult.result, "ok");
  assert.equal(started, 1);
  assert.equal(finished, 1);
});

test("report date range excludes later vouchers from trial balance", () => {
  const april = posted("sales", "2026-04-02", saleLines({ accounts, amount: 1000, settlement: "paid", moneyMode: "cash" }), { n: 1 });
  const may = posted("sales", "2026-05-02", saleLines({ accounts, amount: 5000, settlement: "paid", moneyMode: "cash" }), { n: 2 });
  const aprilTb = trialBalance(accounts, [april, may], { from: "2026-04-01", to: "2026-04-30" });
  const mayTb = trialBalance(accounts, [april, may], { from: "2026-05-01", to: "2026-05-31" });
  assert.equal(aprilTb.rows.find(row => row.code === SYSTEM_CODES.sales).credit, 1000);
  assert.equal(mayTb.rows.find(row => row.code === SYSTEM_CODES.sales).credit, 5000);
});

test("previous Indian FY is the year before the current FY", () => {
  const previous = previousIndianFinancialYear("2026-09-02");
  assert.equal(previous.from, "2025-04-01");
  assert.equal(previous.to, "2026-03-31");
});

test("opening debit and credit sides both feed trial balance without a journal", () => {
  const seeded = accounts.map(row => ({
    ...row,
    openingBalance: row.code === "1000" ? 250 : row.code === "3000" ? 250 : 0,
    openingSide: row.code === "1000" ? "debit" : row.code === "3000" ? "credit" : "debit",
  }));
  const tb = trialBalance(seeded, [], { from: "2026-04-01", to: "2027-03-31" });
  assert.equal(tb.balanced, true);
  assert.equal(tb.rows.find(row => row.code === "1000").debit, 250);
  assert.equal(tb.rows.find(row => row.code === "3000").credit, 250);
});

test("bank statement matching does not change ledger balances", () => {
  const voucher = posted("receipt", "2026-04-03", receiptLines({ accounts, bank: 1000 }), { n: 1 });
  voucher.lines = voucher.lines.map((line, index) => ({ ...line, id: `line-${index}` }));
  const before = ledgerBalances(accounts, [voucher]).find(row => row.code === SYSTEM_CODES.bank).balance;
  const suggested = matchBankLine(
    { amount: 1000, lineDate: "2026-04-03", matchStatus: "unmatched" },
    bankVoucherLines(accounts, [voucher], SYSTEM_CODES.bank).map(line => ({ ...line, date: "2026-04-03" })),
  );
  assert.equal(suggested.matchStatus, "suggested");
  const after = ledgerBalances(accounts, [voucher]).find(row => row.code === SYSTEM_CODES.bank).balance;
  assert.equal(after, before);
});

test("ABC Traders generic books stay in equation without finance modules", () => {
  const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };
  const xyz = { id: "xyz", name: "XYZ", partyType: "supplier" };
  const capital = posted("journal", "2026-04-01", [
    { coaId: "1000", code: "1000", debit: 100000, credit: 0 },
    { coaId: "3000", code: "3000", debit: 0, credit: 100000 },
  ], { n: 1 });
  const cashSale = posted("sales", "2026-04-02", saleLines({ accounts, amount: 10000, settlement: "paid", moneyMode: "cash" }), { n: 1 });
  const creditSale = posted("sales", "2026-04-03", saleLines({ accounts, amount: 25000, settlement: "credit", partyId: "ravi" }), { n: 2, partyId: "ravi" });
  const customerPay = posted("receipt", "2026-04-04", receiptLines({ accounts, cash: 10000, receivableCode: SYSTEM_CODES.receivable, partyId: "ravi" }), { n: 1, partyId: "ravi" });
  const creditPurchase = posted("purchase", "2026-04-05", purchaseLines({ accounts, amount: 15000, settlement: "credit", partyId: "xyz" }), { n: 1, partyId: "xyz" });
  const supplierPay = posted("payment", "2026-04-06", paymentLines({ accounts, cash: 5000, payableCode: SYSTEM_CODES.payable, partyId: "xyz" }), { n: 1, partyId: "xyz" });
  const rent = posted("payment", "2026-04-07", paymentLines({ accounts, cash: 20000, expenseCode: "5000" }), { n: 2 });
  const transfer = posted("contra", "2026-04-08", contraLines({ accounts, fromType: "cash", toType: "bank", amount: 30000 }), { n: 1 });
  const upiReceipt = posted("receipt", "2026-04-09", receiptLines({ accounts, upi: 5000, receivableCode: SYSTEM_CODES.receivable, partyId: "ravi" }), { n: 2, partyId: "ravi" });
  const vouchers = [capital, cashSale, creditSale, customerPay, creditPurchase, supplierPay, rent, transfer, upiReceipt];
  const range = { from: "2026-04-01", to: "2026-04-30" };
  const tb = trialBalance(accounts, vouchers, range);
  assert.equal(tb.balanced, true);
  assert.equal(tb.totalDebit, tb.totalCredit);
  const pnl = profitAndLoss(accounts, vouchers, range);
  assert.equal(pnl.net, 0);
  assert.ok(pnl.income.some(row => row.code === SYSTEM_CODES.sales && row.amount === 35000));
  assert.ok(pnl.expenses.some(row => row.code === SYSTEM_CODES.purchase && row.amount === 15000));
  assert.ok(pnl.expenses.some(row => row.code === "5000" && row.amount === 20000));
  const sheet = balanceSheet(accounts, vouchers, range);
  assert.equal(sheet.balanced, true);
  assert.equal(sheet.totalAssets, roundMoney(sheet.totalLiabilities + sheet.totalEquity));
  const balances = ledgerBalances(accounts, vouchers, range);
  assert.equal(balances.find(row => row.code === SYSTEM_CODES.cash).balance, 65000);
  assert.equal(balances.find(row => row.code === SYSTEM_CODES.bank).balance, 30000);
  assert.equal(balances.find(row => row.code === SYSTEM_CODES.upi).balance, 5000);
  const ar = partyBalances(accounts, vouchers, [ravi, xyz], { kind: "receivable", ...range });
  const ap = partyBalances(accounts, vouchers, [ravi, xyz], { kind: "payable", ...range });
  assert.equal(ar.find(row => row.id === "ravi").balance, 10000);
  assert.equal(ap.find(row => row.id === "xyz").balance, 10000);
  const invoices = invoiceRegister(accounts, vouchers, [ravi, xyz], { kind: "receivable", today: "2026-04-09", ...range });
  const creditInvoice = invoices.find(row => row.partyId === "ravi");
  assert.equal(creditInvoice.amount, 25000);
  assert.equal(creditInvoice.paid, 15000);
  assert.equal(creditInvoice.outstanding, 10000);
  const payables = invoiceRegister(accounts, vouchers, [ravi, xyz], { kind: "payable", today: "2026-04-09", ...range });
  assert.equal(payables.find(row => row.partyId === "xyz").outstanding, 10000);
  const raviLedger = partyLedger(accounts, vouchers, ravi, range);
  assert.equal(raviLedger.outstanding, 10000);
  const dash = dashboardMetrics(accounts, vouchers, [ravi, xyz], { today: "2026-04-09", ...range });
  assert.equal(dash.cash, 65000);
  assert.equal(dash.bank, 30000);
  assert.equal(dash.upi, 5000);
  assert.equal(dash.todayReceipts, 5000);
  assert.equal(dash.equationHolds, true);
});
