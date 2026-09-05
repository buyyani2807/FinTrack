import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  GST_RATES,
  SYSTEM_CODES,
  VOUCHER_STATUS,
  accountingEquationHolds,
  addDaysIso,
  assertBalancedVoucher,
  assertCanDeleteLedger,
  assertCanChangePartyType,
  assertCanDeleteParty,
  assertCoaParent,
  assertGstDocumentMatchesLines,
  buildIntegrationVouchers,
  buildVoucher,
  cancelVoucher,
  contraLines,
  createSubmitLock,
  creditNoteLines,
  dateIsLocked,
  debitNoteLines,
  disbursementLines,
  filterParties,
  formatVoucherNumber,
  gstSplit,
  indianFinancialYear,
  ledgerBalances,
  ledgerHasPostedLines,
  partyHasAccountingUse,
  paymentLines,
  prepareGstAmount,
  previousIndianFinancialYear,
  purchaseLines,
  postVoucher,
  receiptLines,
  reverseVoucher,
  roundMoney,
  saleLines,
  simpleEntryDraft,
  standaloneVisibleAccounts,
  validatePartyForm,
  voucherTotals,
} from "../src/features/accounts/accountingModel.js";
import {
  accountLedger,
  balanceSheet,
  bankVoucherLines,
  cashFlow,
  dashboardMetrics,
  dayBook,
  gstBooksReport,
  invoiceAgingTotals,
  invoiceRegister,
  matchBankLine,
  partyBalances,
  partyLedger,
  partyTotalsFromInvoices,
  profitAndLoss,
  trialBalance,
} from "../src/features/accounts/accountingReports.js";
import { buildAccountsXlsx, renderAccountsPdf } from "../src/features/accounts/accountingExport.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));

const posted = (type, date, lines, extra = {}) => buildVoucher({
  voucherType: type,
  voucherNumber: extra.voucherNumber || formatVoucherNumber(type, extra.n || 1),
  date,
  lines,
  narration: extra.narration || type,
  partyId: extra.partyId || null,
  dueDate: extra.dueDate || null,
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

test("SQL-style reverse keeps original reversed lines in the books so cash nets to zero", () => {
  const original = posted("receipt", "2026-04-03", receiptLines({ accounts, cash: 1000, partyId: "ravi" }), { n: 1, partyId: "ravi" });
  const reversal = reverseVoucher(original, { date: "2026-04-04", sequence: 2, reason: "Correction" });
  const books = [{ ...original, status: VOUCHER_STATUS.reversed }, reversal];
  assert.equal(ledgerBalances(accounts, books).find(row => row.code === SYSTEM_CODES.cash).balance, 0);
  assert.equal(dayBook(books, { from: "2026-04-01", to: "2026-04-30" }).length, 2);
  assert.equal(trialBalance(accounts, books, { from: "2026-04-01", to: "2026-04-30" }).balanced, true);
  assert.equal(balanceSheet(accounts, books, { from: "2026-04-01", to: "2026-04-30" }).balanced, true);
  const sale = posted("sales", "2026-04-05", saleLines({ accounts, amount: 5000, settlement: "credit", partyId: "ravi" }), { n: 1, partyId: "ravi" });
  const saleReversal = reverseVoucher(sale, { date: "2026-04-06", sequence: 2, reason: "Wrong invoice" });
  const arBooks = [{ ...sale, status: VOUCHER_STATUS.reversed }, saleReversal];
  const invoices = invoiceRegister(accounts, arBooks, [{ id: "ravi", name: "Ravi", partyType: "customer" }], {
    kind: "receivable", today: "2026-04-06", from: "2026-04-01", to: "2026-04-30",
  });
  assert.equal(invoices.filter(row => row.voucherType === "sales").length, 1);
  assert.equal(invoices.find(row => row.partyId === "ravi").outstanding, 0);
  assert.equal(partyBalances(accounts, arBooks, [{ id: "ravi", name: "Ravi", partyType: "customer" }], { kind: "receivable" }).length, 0);
  assert.throws(() => cancelVoucher({ ...sale, status: VOUCHER_STATUS.reversed }, { reason: "split pair" }), /cannot be cancelled/);
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

test("unused parties can be deleted and parties with voucher history cannot", () => {
  const unused = { id: "party-new", name: "Fresh Traders", partyType: "customer" };
  const used = { id: "party-used", name: "Ravi Kumar", partyType: "customer" };
  const voucher = posted("sales", "2026-04-01", [
    { coaId: "1200", code: "1200", debit: 1000, credit: 0, partyId: "party-used" },
    { coaId: "4000", code: "4000", debit: 0, credit: 1000 },
  ]);
  voucher.partyId = "party-used";
  assert.equal(partyHasAccountingUse(unused.id, [voucher]), false);
  assertCanDeleteParty(unused, [voucher]);
  assert.throws(() => assertCanDeleteParty(used, [voucher]), /accounting transactions already exist/);
  assertCanChangePartyType(unused, "supplier", [voucher]);
  assert.throws(() => assertCanChangePartyType(used, "supplier", [voucher]), /Party type cannot be changed/);
});

test("party search and type filter work together without resetting either", () => {
  const rows = [
    { id: "1", name: "Ravi Kumar", partyType: "customer", phone: "9991112222", email: "" },
    { id: "2", name: "Ravi Steels", partyType: "supplier", phone: "", email: "ravi@steels.test" },
    { id: "3", name: "Meena", partyType: "customer", phone: "", email: "" },
  ];
  assert.equal(filterParties(rows, { type: "all", search: "" }).length, 3);
  assert.deepEqual(filterParties(rows, { type: "customer", search: "Ravi" }).map(row => row.id), ["1"]);
  assert.deepEqual(filterParties(rows, { type: "supplier", search: "Ravi" }).map(row => row.id), ["2"]);
  assert.equal(filterParties(rows, { type: "customer", search: "zzz" }).length, 0);
  assert.equal(validatePartyForm({ partyType: "customer", name: "" }), "Enter the party name.");
  assert.equal(validatePartyForm({ partyType: "customer", name: "Ravi", email: "bad" }), "Enter a valid email address, or leave it blank.");
  assert.equal(validatePartyForm({ partyType: "customer", name: "Ravi", email: "ravi@test.com" }), "");
  assert.equal(validatePartyForm({ partyType: "customer", name: "Ravi", gstin: "36AAAAA0000A1Z5" }), "GSTIN checksum is not valid.");
  assert.equal(validatePartyForm({ partyType: "customer", name: "Ravi", gstin: "27AAPFU0939F1ZV" }), "");
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

test("cash flow excludes internal cash bank transfers from inflow and outflow", () => {
  const vouchers = [
    posted("journal", "2026-04-01", [
      { coaId: "1000", code: "1000", debit: 5000, credit: 0 },
      { coaId: "3000", code: "3000", debit: 0, credit: 5000 },
    ]),
    posted("contra", "2026-04-02", contraLines({ accounts, fromType: "cash", toType: "bank", amount: 2000 }), { n: 1 }),
    posted("payment", "2026-04-03", paymentLines({ accounts, cash: 500, expenseCode: "5000" }), { n: 1 }),
  ];
  const flow = cashFlow(accounts, vouchers, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(flow.inflow, 5000);
  assert.equal(flow.outflow, 500);
  assert.equal(flow.transfers, 2000);
  assert.equal(flow.net, 4500);
});

test("customer advance is due of zero not an outstanding abs balance", () => {
  const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };
  const receipt = posted("receipt", "2026-04-01", receiptLines({
    accounts, cash: 5000, receivableCode: SYSTEM_CODES.receivable, partyId: "ravi",
  }), { partyId: "ravi" });
  const ledger = partyLedger(accounts, [receipt], ravi);
  assert.equal(ledger.outstanding, 0);
  assert.equal(ledger.due, 0);
  assert.equal(ledger.advance, 5000);
});

test("supplier advance is due of zero not an outstanding abs balance", () => {
  const xyz = { id: "xyz", name: "XYZ", partyType: "supplier" };
  const payment = posted("payment", "2026-04-01", paymentLines({
    accounts, cash: 4000, payableCode: SYSTEM_CODES.payable, partyId: "xyz",
  }), { partyId: "xyz" });
  const ledger = partyLedger(accounts, [payment], xyz);
  assert.equal(ledger.outstanding, 0);
  assert.equal(ledger.due, 0);
  assert.equal(ledger.advance, 4000);
});

test("credit sale uses stored due date when present", () => {
  const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };
  const sale = posted("sales", "2026-04-01", saleLines({
    accounts, amount: 1000, settlement: "credit", partyId: "ravi",
  }), { partyId: "ravi", dueDate: "2026-04-20" });
  const invoices = invoiceRegister(accounts, [sale], [ravi], { kind: "receivable", today: "2026-04-10" });
  assert.equal(invoices[0].dueDate, "2026-04-20");
  const fallback = posted("sales", "2026-04-01", saleLines({
    accounts, amount: 500, settlement: "credit", partyId: "ravi",
  }), { n: 2, partyId: "ravi" });
  const without = invoiceRegister(accounts, [fallback], [ravi], { kind: "receivable", today: "2026-04-10" });
  assert.equal(without[0].dueDate, addDaysIso("2026-04-01", 7));
});

test("guided transfer posts between specific money accounts", () => {
  const extraBank = { ...accounts.find(row => row.code === "1020"), id: "1021", code: "1021", name: "HDFC Bank", isSystem: false };
  const chart = [...accounts, extraBank];
  const lines = contraLines({ accounts: chart, fromAccountId: "1000", toAccountId: "1021", amount: 1500 });
  assert.equal(lines.find(line => line.code === "1021").debit, 1500);
  assert.equal(lines.find(line => line.code === "1000").credit, 1500);
  const draft = simpleEntryDraft({
    kind: "transfer",
    accounts: chart,
    date: "2026-04-02",
    amount: 1500,
    fromAccountId: "1000",
    toAccountId: "1021",
  });
  assert.equal(draft.voucherType, "contra");
  assert.throws(
    () => simpleEntryDraft({ kind: "transfer", accounts: chart, date: "2026-04-02", amount: 100, fromAccountId: "1000", toAccountId: "1000" }),
    /two different accounts/,
  );
});

test("standalone chart hides finance and chit ledgers until integration is on", () => {
  const hidden = standaloneVisibleAccounts(accounts);
  assert.equal(hidden.some(account => account.code === "1110"), false);
  assert.equal(hidden.some(account => account.code === "4200"), false);
  assert.equal(hidden.some(account => account.code === "4300"), true);
  const shown = standaloneVisibleAccounts(accounts, { integrationEnabled: true });
  assert.equal(shown.some(account => account.code === "1110"), true);
});

test("standalone reports hide finance ledgers while integration is off", () => {
  const range = { from: "2026-04-01", to: "2027-03-31" };
  const visible = standaloneVisibleAccounts(accounts);
  const sheet = balanceSheet(visible, [], range);
  const pnl = profitAndLoss(visible, [], range);
  assert.equal(sheet.assets.some(row => row.code === "1110"), false);
  assert.equal(sheet.assets.some(row => row.code === "1130"), false);
  assert.equal(pnl.income.some(row => row.code === "4200"), false);
  assert.equal(pnl.expenses.some(row => row.code === "5020"), false);
  assert.equal(sheet.assets.some(row => row.code === "1000"), true);
  assert.equal(sheet.balanced, true);
  const full = balanceSheet(accounts, [], range);
  assert.equal(full.assets.some(row => row.code === "1110"), true);
});

test("future voucher dates are rejected", () => {
  const lines = [
    { coaId: "1000", debit: 1, credit: 0 },
    { coaId: "3000", debit: 0, credit: 1 },
  ];
  assert.throws(() => buildVoucher({
    voucherType: "journal",
    voucherNumber: "JNL-FUT",
    date: "2099-12-31",
    today: "2026-09-02",
    lines,
  }), /future/);
  assert.throws(() => simpleEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-09-03",
    amount: 10,
    settlement: "paid",
    today: "2026-09-02",
  }), /future/);
  const voucher = buildVoucher({
    voucherType: "journal",
    voucherNumber: "JNL-TODAY",
    date: "2026-09-02",
    today: "2026-09-02",
    lines,
  });
  assert.equal(voucher.date, "2026-09-02");
});

test("accounts excel is a real xlsx zip and pdf is generated", () => {
  const rows = [["Code", "Account", "Amount"], ["1000", "Cash in Hand", 10], ["", "Total", 10]];
  const xlsx = buildAccountsXlsx(rows);
  assert.equal(xlsx[0], 0x50);
  assert.equal(xlsx[1], 0x4b);
  const unzipped = new TextDecoder().decode(xlsx);
  assert.match(unzipped, /Cash in Hand/);
  assert.match(unzipped, /workbook\.xml/);
  const pdf = renderAccountsPdf({ title: "Trial Balance", subtitle: "FY 2026-27", rows });
  assert.match(pdf, /^%PDF-1.4/);
  assert.match(pdf, /%%EOF/);
  assert.match(pdf, /Trial Balance/);
  assert.match(pdf, /Cash in Hand/);
});

const gst18Intra = { enabled: true, rate: 18, intra: true, taxInclusive: false, hsnSac: "9983" };
const gst18Inter = { enabled: true, rate: 18, intra: false, taxInclusive: false, hsnSac: "9983" };

test("GST split covers 0, 5, 12, 18 and 28 for intra and inter supply", () => {
  assert.deepEqual(GST_RATES, [0, 5, 12, 18, 28]);
  for (const rate of GST_RATES) {
    const intra = gstSplit({ taxable: 10000, rate, intra: true });
    const inter = gstSplit({ taxable: 10000, rate, intra: false });
    const tax = roundMoney(10000 * rate / 100);
    assert.equal(intra.taxable, 10000);
    assert.equal(inter.taxable, 10000);
    if (rate === 0) {
      assert.equal(intra.cgst + intra.sgst + intra.igst, 0);
      assert.equal(inter.igst, 0);
      continue;
    }
    assert.equal(intra.supplyType, "intra");
    assert.equal(inter.supplyType, "inter");
    assert.equal(roundMoney(intra.cgst + intra.sgst), tax);
    assert.equal(intra.igst, 0);
    assert.equal(inter.igst, tax);
    assert.equal(inter.cgst + inter.sgst, 0);
    assert.equal(intra.total, roundMoney(10000 + tax));
    assert.equal(inter.total, roundMoney(10000 + tax));
  }
});

test("tax-inclusive GST backs out taxable value", () => {
  const prepared = prepareGstAmount(11800, { enabled: true, rate: 18, intra: true, taxInclusive: true });
  assert.equal(prepared.taxable, 10000);
  assert.equal(prepared.cgst, 900);
  assert.equal(prepared.sgst, 900);
  assert.equal(prepared.total, 11800);
});

test("GST sale stays balanced and credits Sales with taxable value only", () => {
  const lines = saleLines({ accounts, amount: 10000, settlement: "credit", partyId: "ravi", gst: gst18Intra });
  assert.equal(voucherTotals(lines).balanced, true);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.receivable).debit, 11800);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.sales).credit, 10000);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.outputCgst).credit, 900);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.outputSgst).credit, 900);
  const inter = saleLines({ accounts, amount: 10000, settlement: "credit", partyId: "ravi", gst: gst18Inter });
  assert.equal(inter.find(line => line.code === SYSTEM_CODES.outputIgst).credit, 1800);
  assert.equal(inter.find(line => line.code === SYSTEM_CODES.outputCgst), undefined);
});

test("GST purchase books input tax and keeps Purchase at taxable", () => {
  const lines = purchaseLines({ accounts, amount: 10000, settlement: "credit", partyId: "xyz", gst: gst18Intra });
  assert.equal(voucherTotals(lines).balanced, true);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.purchase).debit, 10000);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.inputCgst).debit, 900);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.inputSgst).debit, 900);
  assert.equal(lines.find(line => line.code === SYSTEM_CODES.payable).credit, 11800);
});

test("credit and debit notes reverse the same GST split", () => {
  const cn = creditNoteLines({ accounts, amount: 10000, partyId: "ravi", gst: gst18Intra });
  const dn = debitNoteLines({ accounts, amount: 10000, partyId: "xyz", gst: gst18Inter });
  assert.equal(voucherTotals(cn).balanced, true);
  assert.equal(voucherTotals(dn).balanced, true);
  assert.equal(cn.find(line => line.code === SYSTEM_CODES.sales).debit, 10000);
  assert.equal(cn.find(line => line.code === SYSTEM_CODES.outputCgst).debit, 900);
  assert.equal(cn.find(line => line.code === SYSTEM_CODES.receivable).credit, 11800);
  assert.equal(dn.find(line => line.code === SYSTEM_CODES.purchase).credit, 10000);
  assert.equal(dn.find(line => line.code === SYSTEM_CODES.inputIgst).credit, 1800);
  assert.equal(dn.find(line => line.code === SYSTEM_CODES.payable).debit, 11800);
});

test("P&L uses taxable sales and purchases, not GST-inclusive totals", () => {
  const sale = posted("sales", "2026-04-05", saleLines({ accounts, amount: 10000, settlement: "credit", partyId: "ravi", gst: gst18Intra }), { n: 1, partyId: "ravi" });
  const buy = posted("purchase", "2026-04-06", purchaseLines({ accounts, amount: 5000, settlement: "credit", partyId: "xyz", gst: gst18Intra }), { n: 1, partyId: "xyz" });
  const range = { from: "2026-04-01", to: "2026-04-30" };
  const pnl = profitAndLoss(accounts, [sale, buy], range);
  assert.equal(pnl.income.find(row => row.code === SYSTEM_CODES.sales).amount, 10000);
  assert.equal(pnl.expenses.find(row => row.code === SYSTEM_CODES.purchase).amount, 5000);
  const tb = trialBalance(accounts, [sale, buy], range);
  assert.equal(tb.balanced, true);
  assert.equal(tb.rows.find(row => row.code === SYSTEM_CODES.outputCgst).credit, 900);
  assert.equal(tb.rows.find(row => row.code === SYSTEM_CODES.inputCgst).debit, 450);
});

test("empty GST ledgers stay off the trial balance until tax is posted", () => {
  const tb = trialBalance(accounts, [], { from: "2026-04-01", to: "2027-03-31" });
  assert.equal(tb.rows.find(row => row.code === SYSTEM_CODES.inputCgst), undefined);
  assert.equal(tb.rows.find(row => row.code === SYSTEM_CODES.outputIgst), undefined);
});

test("GST books report nets output tax against eligible ITC and signs notes", () => {
  const saleDraft = simpleEntryDraft({ kind: "sale", accounts, date: "2026-04-08", amount: 10000, partyId: "ravi", settlement: "credit", gst: gst18Intra });
  const buyDraft = simpleEntryDraft({ kind: "purchase", accounts, date: "2026-04-08", amount: 5000, partyId: "xyz", settlement: "credit", gst: gst18Intra });
  const cnDraft = simpleEntryDraft({ kind: "credit_note", accounts, date: "2026-04-09", amount: 1000, partyId: "ravi", gst: gst18Intra });
  const sale = posted("sales", saleDraft.date, saleDraft.lines, { n: 1, partyId: "ravi" });
  const buy = posted("purchase", buyDraft.date, buyDraft.lines, { n: 1, partyId: "xyz" });
  const note = posted("credit_note", cnDraft.date, cnDraft.lines, { n: 1, partyId: "ravi" });
  sale.gstLines = saleDraft.gstLines;
  buy.gstLines = buyDraft.gstLines;
  note.gstLines = cnDraft.gstLines;
  const report = gstBooksReport([sale, buy, note], { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(report.outputTax, 1620);
  assert.equal(report.inputTax, 900);
  assert.equal(report.netPayable, 720);
  assert.equal(report.byRate.find(row => row.rate === 18).taxable, 14000);
  const metrics = dashboardMetrics(accounts, [sale], [], { today: "2026-04-08", from: "2026-04-01", to: "2026-04-30" });
  assert.equal(metrics.todaySales, 10000);
});

test("rate 0 or missing GST keeps the old two-line sale", () => {
  const none = saleLines({ accounts, amount: 10000, settlement: "credit", partyId: "ravi" });
  const zero = saleLines({ accounts, amount: 10000, settlement: "credit", partyId: "ravi", gst: { enabled: true, rate: 0, intra: true } });
  assert.equal(none.length, 2);
  assert.equal(zero.length, 2);
  assert.equal(none.find(line => line.code === SYSTEM_CODES.sales).credit, 10000);
  assert.equal(zero.find(line => line.code === SYSTEM_CODES.receivable).debit, 10000);
});

test("account ledger closing stops at the To date", () => {
  const april = posted("sales", "2026-04-01", saleLines({ accounts, amount: 1000, settlement: "paid", moneyMode: "cash" }), { n: 1 });
  const may = posted("sales", "2026-05-01", saleLines({ accounts, amount: 4000, settlement: "paid", moneyMode: "cash" }), { n: 2 });
  const ledger = accountLedger(accounts, [april, may], "1000", { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(ledger.rows.at(-1).balance, 1000);
  assert.equal(ledger.closing, 1000);
  assert.equal(ledger.opening, 0);
});

test("cash flow opening includes cash movement before the range", () => {
  const capital = posted("journal", "2026-04-01", [
    { coaId: "1000", code: "1000", debit: 10000, credit: 0 },
    { coaId: "3000", code: "3000", debit: 0, credit: 10000 },
  ], { n: 1 });
  const sale = posted("sales", "2026-05-02", saleLines({ accounts, amount: 2000, settlement: "paid", moneyMode: "cash" }), { n: 1 });
  const flow = cashFlow(accounts, [capital, sale], { from: "2026-05-01", to: "2026-05-31" });
  assert.equal(flow.opening, 10000);
  assert.equal(flow.inflow, 2000);
  assert.equal(flow.closing, 12000);
});

test("party ledger opening is the brought-forward balance for a mid-period window", () => {
  const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };
  const sale = posted("sales", "2026-04-01", saleLines({ accounts, amount: 9000, settlement: "credit", partyId: "ravi" }), { n: 1, partyId: "ravi" });
  const receipt = posted("receipt", "2026-05-02", receiptLines({ accounts, cash: 1000, partyId: "ravi" }), { n: 1, partyId: "ravi" });
  const ledger = partyLedger(accounts, [sale, receipt], ravi, { from: "2026-05-01", to: "2026-05-31" });
  assert.equal(ledger.opening, 9000);
  assert.equal(ledger.rows[0].balance, 8000);
  assert.equal(ledger.outstanding, 8000);
  assert.equal(ledger.closing, 8000);
});

test("party outstanding as of To matches invoice outstanding in the same window", () => {
  const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };
  const sale = posted("sales", "2026-04-01", saleLines({ accounts, amount: 10000, settlement: "credit", partyId: "ravi" }), { n: 1, partyId: "ravi" });
  const receipt = posted("receipt", "2026-05-02", receiptLines({ accounts, cash: 4000, partyId: "ravi" }), { n: 1, partyId: "ravi" });
  const books = [sale, receipt];
  const mayParties = partyBalances(accounts, books, [ravi], { kind: "receivable", from: "2026-05-01", to: "2026-05-31" });
  const invoices = invoiceRegister(accounts, books, [ravi], {
    kind: "receivable", today: "2026-05-03", from: "2026-04-01", to: "2026-05-31",
  });
  assert.equal(mayParties.find(row => row.id === "ravi").balance, 6000);
  assert.equal(invoices[0].outstanding, 6000);
  assert.equal(partyTotalsFromInvoices(invoices).find(row => row.id === "ravi").balance, 6000);
  const aprilInvoices = invoiceRegister(accounts, books, [ravi], {
    kind: "receivable", today: "2026-04-30", from: "2026-04-01", to: "2026-04-30",
  });
  assert.equal(aprilInvoices[0].outstanding, 10000);
  assert.equal(partyBalances(accounts, books, [ravi], { kind: "receivable", to: "2026-04-30" })[0].balance, 10000);
});

test("GST document must match posted tax ledgers and reversals copy GST lines", () => {
  const draft = simpleEntryDraft({ kind: "sale", accounts, date: "2026-04-08", amount: 10000, partyId: "ravi", settlement: "credit", gst: gst18Intra });
  assert.throws(
    () => assertGstDocumentMatchesLines(
      [{ code: SYSTEM_CODES.receivable, debit: 10000, credit: 0 }, { code: SYSTEM_CODES.sales, debit: 0, credit: 10000 }],
      draft.gstLines,
    ),
    /GST document does not match tax ledgers/,
  );
  const sale = buildVoucher({
    voucherType: "sales",
    voucherNumber: "SALE-0099",
    date: "2026-04-08",
    lines: draft.lines,
    gstLines: draft.gstLines,
    partyId: "ravi",
  });
  const reversal = reverseVoucher(sale, { date: "2026-04-09", sequence: 100, reason: "Wrong GST invoice" });
  assert.equal(reversal.gstLines.length, 1);
  assert.equal(reversal.gstLines[0].cgst_amount ?? reversal.gstLines[0].cgst, 900);
  const report = gstBooksReport([sale, reversal], { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(report.outputTax, 0);
  assert.equal(report.netPayable, 0);
});

test("journal AR and AP party lines appear on the invoice register", () => {
  const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };
  const xyz = { id: "xyz", name: "XYZ", partyType: "supplier" };
  const accrueAr = posted("journal", "2026-04-01", [
    { coaId: "1100", code: "1100", debit: 8000, credit: 0, partyId: "ravi" },
    { coaId: "4300", code: "4300", debit: 0, credit: 8000 },
  ], { n: 1, partyId: "ravi", dueDate: "2026-04-05" });
  const settleAr = posted("journal", "2026-04-10", [
    { coaId: "1000", code: "1000", debit: 3000, credit: 0 },
    { coaId: "1100", code: "1100", debit: 0, credit: 3000, partyId: "ravi" },
  ], { n: 2, partyId: "ravi" });
  const accrueAp = posted("journal", "2026-04-02", [
    { coaId: "5000", code: "5000", debit: 4000, credit: 0 },
    { coaId: "2000", code: "2000", debit: 0, credit: 4000, partyId: "xyz" },
  ], { n: 3, partyId: "xyz" });
  const receivables = invoiceRegister(accounts, [accrueAr, settleAr], [ravi], {
    kind: "receivable", today: "2026-04-12", from: "2026-04-01", to: "2026-04-30",
  });
  assert.equal(receivables.length, 1);
  assert.equal(receivables[0].amount, 8000);
  assert.equal(receivables[0].paid, 3000);
  assert.equal(receivables[0].outstanding, 5000);
  assert.equal(receivables[0].daysOverdue, 7);
  assert.equal(receivables[0].status, "Overdue");
  const payables = invoiceRegister(accounts, [accrueAp], [xyz], {
    kind: "payable", today: "2026-04-03", from: "2026-04-01", to: "2026-04-30",
  });
  assert.equal(payables[0].outstanding, 4000);
  assert.equal(partyBalances(accounts, [accrueAr, settleAr], [ravi], { kind: "receivable" })[0].balance, 5000);
});

test("days overdue and aging buckets use the due date", () => {
  const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };
  const current = posted("sales", "2026-03-01", saleLines({ accounts, amount: 1000, settlement: "credit", partyId: "ravi" }), { n: 1, partyId: "ravi", dueDate: "2026-04-20" });
  const d20 = posted("sales", "2026-03-01", saleLines({ accounts, amount: 2000, settlement: "credit", partyId: "ravi" }), { n: 2, partyId: "ravi", dueDate: "2026-03-20" });
  const d45 = posted("sales", "2026-02-01", saleLines({ accounts, amount: 3000, settlement: "credit", partyId: "ravi" }), { n: 3, partyId: "ravi", dueDate: "2026-02-23" });
  const d75 = posted("sales", "2026-01-01", saleLines({ accounts, amount: 4000, settlement: "credit", partyId: "ravi" }), { n: 4, partyId: "ravi", dueDate: "2026-01-24" });
  const d100 = posted("sales", "2025-12-01", saleLines({ accounts, amount: 5000, settlement: "credit", partyId: "ravi" }), { n: 5, partyId: "ravi", dueDate: "2025-12-30" });
  const rows = invoiceRegister(accounts, [current, d20, d45, d75, d100], [ravi], {
    kind: "receivable", today: "2026-04-09", from: "2025-12-01", to: "2026-04-30",
  });
  assert.equal(rows.find(row => row.amount === 1000).daysOverdue, 0);
  assert.equal(rows.find(row => row.amount === 2000).daysOverdue, 20);
  assert.equal(rows.find(row => row.amount === 3000).daysOverdue, 45);
  assert.equal(rows.find(row => row.amount === 4000).daysOverdue, 75);
  assert.equal(rows.find(row => row.amount === 5000).daysOverdue, 100);
  const aging = invoiceAgingTotals(rows);
  assert.equal(aging.current, 1000);
  assert.equal(aging.d1_30, 2000);
  assert.equal(aging.d31_60, 3000);
  assert.equal(aging.d61_90, 4000);
  assert.equal(aging.d90, 5000);
  assert.equal(aging.overdue, 14000);
  assert.equal(aging.total, 15000);
});

test("COA parent walk rejects a cycle deeper than one level", () => {
  const chart = [
    { id: "a", groupType: "asset", parentId: null },
    { id: "b", groupType: "asset", parentId: "a" },
    { id: "c", groupType: "asset", parentId: "b" },
  ];
  assert.doesNotThrow(() => assertCoaParent(chart, "c", "b"));
  assert.throws(() => assertCoaParent(chart, "a", "c"), /Circular parent/);
  assert.throws(() => assertCoaParent(chart, "a", "a"), /own parent/);
});
