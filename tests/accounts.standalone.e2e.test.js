import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  SYSTEM_CODES,
  VOUCHER_STATUS,
  accountingEquationHolds,
  assertBalancedVoucher,
  buildVoucher,
  cancelVoucher,
  contraLines,
  dateIsLocked,
  formatVoucherNumber,
  indianFinancialYear,
  ledgerBalances,
  paymentLines,
  postVoucher,
  purchaseLines,
  receiptLines,
  reverseVoucher,
  roundMoney,
  saleLines,
  simpleEntryDraft,
  voucherTotals,
} from "../src/features/accounts/accountingModel.js";
import {
  accountLedger,
  balanceSheet,
  cashFlow,
  dashboardMetrics,
  dayBook,
  invoiceRegister,
  partyBalances,
  partyLedger,
  profitAndLoss,
  trialBalance,
} from "../src/features/accounts/accountingReports.js";

const chart = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));
const fy = indianFinancialYear("2026-04-01");
const parties = [
  { id: "ravi", name: "Ravi Kumar", partyType: "customer" },
  { id: "abc", name: "ABC Enterprises", partyType: "customer" },
  { id: "xyz", name: "XYZ Supplies", partyType: "supplier" },
  { id: "mart", name: "Office Mart", partyType: "supplier" },
];

const seq = { receipt: 0, payment: 0, contra: 0, journal: 0, sales: 0, purchase: 0, credit_note: 0, debit_note: 0 };
const nextNo = type => {
  seq[type] += 1;
  return formatVoucherNumber(type, seq[type]);
};

const post = (type, date, lines, extra = {}) => buildVoucher({
  voucherType: type,
  voucherNumber: extra.voucherNumber || nextNo(type),
  date,
  lines,
  narration: extra.narration || type,
  partyId: extra.partyId || null,
});

const bal = (vouchers, code) => ledgerBalances(chart, vouchers, fy).find(row => row.code === code)?.balance || 0;
const party = (vouchers, id, kind) => partyBalances(chart, vouchers, parties, { kind, ...fy }).find(row => row.id === id)?.balance || 0;

const tally = (vouchers, code) => {
  let debit = 0;
  let credit = 0;
  for (const voucher of vouchers) {
    if (voucher.status && voucher.status !== "posted") continue;
    for (const line of voucher.lines || []) {
      if ((line.coaId || line.code) !== code && line.code !== code) continue;
      debit = roundMoney(debit + Number(line.debit || 0));
      credit = roundMoney(credit + Number(line.credit || 0));
    }
  }
  return { debit, credit, net: roundMoney(debit - credit) };
};

test("FY for ABC Traders is 1 Apr 2026 to 31 Mar 2027", () => {
  assert.equal(fy.from, "2026-04-01");
  assert.equal(fy.to, "2027-03-31");
  assert.equal(fy.label.includes("2026"), true);
});

test("ABC Traders standalone books stay in equation through the full operating cycle", () => {
  const books = [];

  books.push(post("journal", "2026-04-01", [
    { coaId: "1000", code: "1000", debit: 100000, credit: 0 },
    { coaId: "1020", code: "1020", debit: 500000, credit: 0 },
    { coaId: "3000", code: "3000", debit: 0, credit: 600000 },
  ], { narration: "Opening capital" }));
  assert.equal(tally(books, "1000").net, 100000);
  assert.equal(tally(books, "1020").net, 500000);
  assert.equal(tally(books, "3000").credit, 600000);
  assert.equal(trialBalance(chart, books, fy).balanced, true);
  assert.equal(balanceSheet(chart, books, fy).balanced, true);

  books.push(post("receipt", "2026-04-02", receiptLines({ accounts: chart, cash: 10000, partyId: "ravi" }), { partyId: "ravi", narration: "Receipt from Ravi" }));
  books.push(post("receipt", "2026-04-03", receiptLines({ accounts: chart, upi: 7000, partyId: "abc" }), { partyId: "abc", narration: "UPI receipt ABC Enterprises" }));
  books.push(post("payment", "2026-04-04", paymentLines({ accounts: chart, bank: 8000, payableCode: SYSTEM_CODES.payable, partyId: "xyz" }), { partyId: "xyz", narration: "Supplier payment XYZ" }));
  books.push(post("contra", "2026-04-05", contraLines({ accounts: chart, fromType: "cash", toType: "bank", amount: 25000 }), { narration: "Cash to HDFC Bank" }));
  const pnlBeforeJournal = profitAndLoss(chart, books, fy).net;
  assert.equal(pnlBeforeJournal, 0);

  books.push(post("journal", "2026-04-06", [
    { coaId: "5040", code: "5040", debit: 5000, credit: 0, description: "Electricity accrued" },
    { coaId: "2000", code: "2000", debit: 0, credit: 5000, partyId: "mart", description: "Electricity payable" },
  ], { partyId: "mart", narration: "Accrue electricity" }));
  assert.equal(profitAndLoss(chart, books, fy).net, -5000);

  books.push(post("journal", "2026-04-06", [
    { coaId: "5000", code: "5000", debit: 2000, credit: 0 },
    { coaId: "5010", code: "5010", debit: 3000, credit: 0 },
    { coaId: "1020", code: "1020", debit: 0, credit: 4000 },
    { coaId: "1000", code: "1000", debit: 0, credit: 1000 },
  ], { narration: "Split expense journal" }));
  assert.equal(voucherTotals(books.at(-1).lines).balanced, true);

  books.push(post("sales", "2026-04-07", saleLines({ accounts: chart, amount: 20000, settlement: "paid", moneyMode: "cash" }), { narration: "Cash sale" }));
  books.push(post("sales", "2026-04-08", saleLines({ accounts: chart, amount: 50000, settlement: "credit", partyId: "abc" }), { partyId: "abc", narration: "Credit sale ABC Enterprises" }));
  books.push(post("purchase", "2026-04-09", purchaseLines({ accounts: chart, amount: 15000, settlement: "paid", moneyMode: "cash" }), { narration: "Cash purchase" }));
  books.push(post("purchase", "2026-04-10", purchaseLines({ accounts: chart, amount: 30000, settlement: "credit", partyId: "xyz" }), { partyId: "xyz", narration: "Credit purchase XYZ" }));
  books.push(post("receipt", "2026-04-11", receiptLines({ accounts: chart, cash: 20000, partyId: "abc" }), { partyId: "abc", narration: "Partial collection ABC" }));
  books.push(post("payment", "2026-04-12", paymentLines({ accounts: chart, bank: 10000, payableCode: SYSTEM_CODES.payable, partyId: "xyz" }), { partyId: "xyz", narration: "Partial payment XYZ" }));

  books.push(post("payment", "2026-04-13", simpleEntryDraft({ kind: "expense", accounts: chart, date: "2026-04-13", amount: 30000, moneyMode: "cash", expenseCode: "5000" }).lines, { narration: "Rent" }));
  books.push(post("payment", "2026-04-14", simpleEntryDraft({ kind: "expense", accounts: chart, date: "2026-04-14", amount: 5000, moneyMode: "bank", expenseCode: "5040" }).lines, { narration: "Electricity" }));
  books.push(post("payment", "2026-04-15", simpleEntryDraft({ kind: "expense", accounts: chart, date: "2026-04-15", amount: 50000, moneyMode: "bank", expenseCode: "5010" }).lines, { narration: "Salary" }));
  books.push(post("payment", "2026-04-16", simpleEntryDraft({ kind: "expense", accounts: chart, date: "2026-04-16", amount: 3000, moneyMode: "cash", expenseCode: "5030" }).lines, { narration: "Fuel" }));
  books.push(post("payment", "2026-04-17", simpleEntryDraft({ kind: "expense", accounts: chart, date: "2026-04-17", amount: 500, moneyMode: "bank", expenseCode: "5100" }).lines, { narration: "Bank charges" }));

  books.push(post("credit_note", "2026-04-18", [
    { coaId: "4300", code: "4300", debit: 4000, credit: 0 },
    { coaId: "1100", code: "1100", debit: 0, credit: 4000, partyId: "abc" },
  ], { partyId: "abc", narration: "Credit note ABC" }));
  books.push(post("debit_note", "2026-04-19", [
    { coaId: "2000", code: "2000", debit: 2000, credit: 0, partyId: "xyz" },
    { coaId: "5110", code: "5110", debit: 0, credit: 2000 },
  ], { partyId: "xyz", narration: "Debit note XYZ" }));

  const cash = tally(books, "1000");
  const bank = tally(books, "1020");
  const upi = tally(books, "1010");
  const ar = tally(books, "1100");
  const ap = tally(books, "2000");
  const sales = tally(books, "4300");
  const purchase = tally(books, "5110");
  const income = tally(books, "4300").credit - tally(books, "4300").debit;
  const expenseCodes = ["5000", "5010", "5030", "5040", "5100", "5110", "5065"];
  const expense = roundMoney(expenseCodes.reduce((sum, code) => sum + tally(books, code).net, 0));

  assert.equal(cash.net, 76000);
  assert.equal(bank.net, 447500);
  assert.equal(upi.net, 7000);
  assert.equal(ar.net, 9000);
  assert.equal(ap.credit - ap.debit, 15000);
  assert.equal(roundMoney(income), 66000);
  assert.equal(purchase.net, 43000);

  const tb = trialBalance(chart, books, fy);
  assert.equal(tb.balanced, true);
  assert.equal(tb.totalDebit, tb.totalCredit);
  const sheet = balanceSheet(chart, books, fy);
  assert.equal(sheet.balanced, true);
  assert.equal(sheet.totalAssets, roundMoney(sheet.totalLiabilities + sheet.totalEquity));
  assert.equal(accountingEquationHolds(chart, books, fy).balanced, true);

  const pnl = profitAndLoss(chart, books, fy);
  assert.equal(roundMoney(pnl.totalIncome), roundMoney(income));
  assert.equal(roundMoney(pnl.totalExpense), expense);
  assert.equal(roundMoney(pnl.net), roundMoney(income - expense));
  assert.equal(roundMoney(bal(books, "1000")), cash.net);
  assert.equal(roundMoney(bal(books, "1020")), bank.net);
  assert.equal(roundMoney(bal(books, "1010")), upi.net);
  assert.equal(roundMoney(party(books, "abc", "receivable")), 19000);
  assert.equal(roundMoney(party(books, "ravi", "receivable")), -10000);
  assert.equal(roundMoney(party(books, "xyz", "payable")), 10000);

  const abcInvoices = invoiceRegister(chart, books, parties, { kind: "receivable", today: "2026-04-20", ...fy, partyId: "abc" });
  const creditSale = abcInvoices.find(row => row.amount === 50000);
  assert.ok(creditSale);
  assert.equal(creditSale.paid, 31000);
  assert.equal(creditSale.outstanding, 19000);

  const xyzInvoices = invoiceRegister(chart, books, parties, { kind: "payable", today: "2026-04-20", ...fy, partyId: "xyz" });
  const creditPurchase = xyzInvoices.find(row => row.amount === 30000);
  assert.ok(creditPurchase);
  assert.equal(creditPurchase.outstanding, 10000);

  const abcLedger = partyLedger(chart, books, parties[1], fy);
  assert.equal(abcLedger.outstanding, 19000);

  const cashLedger = accountLedger(chart, books, "1000", fy);
  assert.equal(cashLedger.rows.at(-1).balance, cash.net);

  const booksDay = dayBook(books, fy);
  assert.equal(booksDay.length, books.length);
  assert.ok(booksDay.every(row => row.debit === row.credit));

  const flow = cashFlow(chart, books, fy);
  assert.equal(flow.net, roundMoney(flow.inflow - flow.outflow));
  assert.equal(dashSafe(chart, books), true);
});

function dashSafe(accounts, vouchers) {
  return dashboardMetrics(accounts, vouchers, parties, { today: "2026-04-19", ...fy }).equationHolds;
}

test("unbalanced, zero, negative, and missing-account drafts are rejected", () => {
  assert.throws(() => assertBalancedVoucher([{ coaId: "1000", debit: 10, credit: 0 }]), /Unbalanced/);
  assert.throws(() => simpleEntryDraft({ kind: "sale", accounts: chart, date: "2026-04-01", amount: 0, settlement: "paid" }), /greater than zero/);
  assert.throws(() => simpleEntryDraft({ kind: "sale", accounts: chart, date: "2026-04-01", amount: 100, settlement: "credit" }), /Choose the customer/);
  assert.throws(() => simpleEntryDraft({ kind: "purchase", accounts: chart, date: "2026-04-01", amount: 100, settlement: "credit" }), /Choose the supplier/);
  assert.throws(() => simpleEntryDraft({ kind: "receipt", accounts: chart, date: "2026-04-01", amount: 100, moneyMode: "cash" }), /Choose the customer/);
  assert.throws(() => simpleEntryDraft({ kind: "transfer", accounts: chart, date: "2026-04-01", amount: 100, fromType: "cash", toType: "cash" }), /two different accounts/);
  assert.throws(() => buildVoucher({
    voucherType: "journal",
    voucherNumber: "JNL-9",
    date: "2026-04-01",
    lines: [{ coaId: "1000", debit: -1, credit: 0 }, { coaId: "3000", debit: 0, credit: 1 }],
  }), /negative|Unbalanced/);
});

test("decimals stay in equation at paise precision", () => {
  const vouchers = [
    post("journal", "2026-04-01", [
      { coaId: "1000", code: "1000", debit: 100.5, credit: 0 },
      { coaId: "3000", code: "3000", debit: 0, credit: 100.5 },
    ]),
    post("sales", "2026-04-02", saleLines({ accounts: chart, amount: 1999.99, settlement: "paid", moneyMode: "upi" })),
    post("payment", "2026-04-03", paymentLines({ accounts: chart, cash: 0.01, expenseCode: "5100" })),
  ];
  const tb = trialBalance(chart, vouchers, fy);
  assert.equal(tb.balanced, true);
  assert.equal(balanceSheet(chart, vouchers, fy).balanced, true);
  assert.equal(roundMoney(bal(vouchers, "1000")), 100.49);
  assert.equal(roundMoney(bal(vouchers, "1010")), 1999.99);
});

test("locked periods reject posts; cancel removes a voucher from the books", () => {
  const locks = [{ periodFrom: "2026-04-01", periodTo: "2026-04-30", isLocked: true }];
  assert.equal(dateIsLocked("2026-04-15", locks), true);
  const voucher = post("receipt", "2026-04-15", receiptLines({ accounts: chart, cash: 50 }));
  assert.throws(() => postVoucher(null, voucher, { locks }), /period is locked/);
  const cancelled = cancelVoucher(voucher, { reason: "Duplicate" });
  assert.equal(cancelled.status, VOUCHER_STATUS.cancelled);
  assert.equal(dayBook([cancelled], fy).length, 0);
  assert.equal(trialBalance(chart, [cancelled], fy).balanced, true);
  assert.equal(bal([cancelled], "1000"), 0);
});

test("JS reversal nets to zero when the original stays posted", () => {
  const original = post("receipt", "2026-04-03", receiptLines({ accounts: chart, cash: 1000, partyId: "ravi" }), { partyId: "ravi" });
  const reversal = reverseVoucher(original, { date: "2026-04-04", sequence: 99, reason: "Correction" });
  const books = [original, reversal];
  assert.equal(bal(books, "1000"), 0);
  assert.equal(trialBalance(chart, books, fy).balanced, true);
  assert.equal(balanceSheet(chart, books, fy).balanced, true);
});

test("SQL-style reversal that marks the original reversed still nets to zero", () => {
  const original = post("receipt", "2026-04-03", receiptLines({ accounts: chart, cash: 1000, partyId: "ravi" }), { partyId: "ravi" });
  const reversal = reverseVoucher(original, { date: "2026-04-04", sequence: 99, reason: "Correction" });
  const sqlStyle = [{ ...original, status: "reversed" }, reversal];
  assert.equal(bal(sqlStyle, "1000"), 0);
  assert.equal(roundMoney(party(sqlStyle, "ravi", "receivable")), 0);
  assert.equal(dayBook(sqlStyle, fy).length, 2);
  assert.equal(trialBalance(chart, sqlStyle, fy).balanced, true);
  assert.equal(balanceSheet(chart, sqlStyle, fy).balanced, true);
  assert.throws(() => cancelVoucher(sqlStyle[0], { reason: "undo" }), /cannot be cancelled/);
});

test("500 generic sales keep trial balance and the accounting equation", () => {
  const start = Date.now();
  const vouchers = [post("journal", "2026-04-01", [
    { coaId: "1000", code: "1000", debit: 1000000, credit: 0 },
    { coaId: "3000", code: "3000", debit: 0, credit: 1000000 },
  ])];
  for (let i = 0; i < 500; i += 1) {
    vouchers.push(post("sales", "2026-04-02", saleLines({
      accounts: chart,
      amount: 10.25,
      settlement: i % 2 ? "credit" : "paid",
      moneyMode: "cash",
      partyId: i % 2 ? "ravi" : null,
    }), { partyId: i % 2 ? "ravi" : null }));
  }
  const elapsed = Date.now() - start;
  const tb = trialBalance(chart, vouchers, fy);
  assert.equal(tb.balanced, true);
  assert.equal(balanceSheet(chart, vouchers, fy).balanced, true);
  assert.equal(dayBook(vouchers, fy).length, 501);
  assert.ok(elapsed < 2000, `volume posting took ${elapsed}ms`);
});

test("opening debit and credit sides both feed trial balance", () => {
  const seeded = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({
    ...row,
    id: row.code,
    openingBalance: row.code === "1000" ? 250 : row.code === "3000" ? 250 : 0,
    openingSide: row.code === "1000" ? "debit" : row.code === "3000" ? "credit" : "debit",
  }));
  const tb = trialBalance(seeded, [], fy);
  assert.equal(tb.balanced, true);
  assert.equal(tb.rows.find(row => row.code === "1000").debit, 250);
  assert.equal(tb.rows.find(row => row.code === "3000").credit, 250);
  assert.equal(balanceSheet(seeded, [], fy).balanced, true);
});
