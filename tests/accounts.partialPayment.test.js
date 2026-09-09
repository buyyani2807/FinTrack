import test from "node:test";
import assert from "node:assert/strict";
import {
  SYSTEM_CODES,
  moneyByMode,
  assertMoneyModeSplit,
  partyHasAccountingUse,
  receiptLines,
  roundMoney,
  saleLines,
  salePaymentSummary,
  simpleEntryDraft,
  voucherTotals,
} from "../src/features/accounts/accountingModel.js";
import {
  balanceSheet,
  invoiceRegister,
  invoiceStatus,
  partyBalances,
  partyLedger,
  profitAndLoss,
  trialBalance,
} from "../src/features/accounts/accountingReports.js";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/accountingModel.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code, isSystem: true, isActive: true }));
const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };

const posted = (voucherType, date, lines, { n = 1, partyId = null, dueDate = null, settlements = null } = {}) => ({
  id: `${voucherType}-${n}-${date}`,
  voucherType,
  voucherNumber: `${voucherType.toUpperCase().slice(0, 4)}-${String(n).padStart(6, "0")}`,
  date,
  dueDate,
  partyId,
  status: "posted",
  narration: "",
  lines: lines.map(line => ({ ...line, coaId: line.coaId || line.code })),
  settlements: settlements || [],
});

test("sale payment summary never shrinks invoice when cash is partial", () => {
  const summary = salePaymentSummary({ invoiceTotal: 300000, amountReceived: 200000 });
  assert.equal(summary.invoiceTotal, 300000);
  assert.equal(summary.amountReceived, 200000);
  assert.equal(summary.outstanding, 100000);
  assert.equal(summary.paymentStatus, "Partially Paid");
  assert.equal(salePaymentSummary({ invoiceTotal: 300000, amountReceived: 0 }).paymentStatus, "Unpaid");
  assert.equal(salePaymentSummary({ invoiceTotal: 300000, amountReceived: 300000 }).paymentStatus, "Paid");
  assert.throws(() => salePaymentSummary({ invoiceTotal: 300000, amountReceived: 300001 }), /cannot exceed/);
  assert.throws(() => salePaymentSummary({ invoiceTotal: 100, amountReceived: -1 }), /negative/);
});

test("invoice status: Paid / Partially Paid / Unpaid / Overdue", () => {
  assert.equal(invoiceStatus({ outstanding: 0, paid: 300000, today: "2026-04-10", dueDate: "2026-04-15" }), "Paid");
  assert.equal(invoiceStatus({ outstanding: 100000, paid: 200000, today: "2026-04-10", dueDate: "2026-04-15" }), "Partially Paid");
  assert.equal(invoiceStatus({ outstanding: 300000, paid: 0, today: "2026-04-10", dueDate: "2026-04-15" }), "Unpaid");
  assert.equal(invoiceStatus({ outstanding: 100000, paid: 200000, today: "2026-04-20", dueDate: "2026-04-15" }), "Overdue");
  assert.equal(invoiceStatus({ outstanding: 300000, paid: 0, today: "2026-04-15", dueDate: "2026-04-15" }), "Due");
});

test("₹3L credit sale + ₹2L receipt keeps full sales and ₹1L AR", () => {
  const sale = posted(
    "sales",
    "2026-04-01",
    saleLines({ accounts, amount: 300000, settlement: "credit", partyId: "ravi" }),
    { n: 1, partyId: "ravi", dueDate: "2026-04-15" },
  );
  const receipt = posted(
    "receipt",
    "2026-04-01",
    receiptLines({ accounts, cash: 200000, receivableCode: SYSTEM_CODES.receivable, partyId: "ravi" }),
    { n: 1, partyId: "ravi", settlements: [{ invoiceVoucherId: sale.id, amount: 200000 }] },
  );
  const books = [sale, receipt];

  assert.equal(voucherTotals(sale.lines).debit, 300000);
  assert.equal(voucherTotals(sale.lines).credit, 300000);
  assert.ok(sale.lines.some(line => line.code === SYSTEM_CODES.sales && Number(line.credit) === 300000));
  assert.ok(sale.lines.some(line => line.code === SYSTEM_CODES.receivable && Number(line.debit) === 300000));
  assert.ok(receipt.lines.some(line => line.code === SYSTEM_CODES.cash && Number(line.debit) === 200000));

  const invoices = invoiceRegister(accounts, books, [ravi], {
    kind: "receivable", today: "2026-04-02", from: "2026-04-01", to: "2026-04-30",
  });
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].amount, 300000);
  assert.equal(invoices[0].paid, 200000);
  assert.equal(invoices[0].outstanding, 100000);
  assert.equal(invoices[0].status, "Partially Paid");
  assert.equal(roundMoney(invoices[0].amount), roundMoney(invoices[0].paid + invoices[0].outstanding));

  const ledger = partyLedger(accounts, books, ravi, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(ledger.outstanding, 100000);
  assert.equal(ledger.rows.find(row => row.voucherType === "sales")?.debit, 300000);
  assert.equal(ledger.rows.find(row => row.voucherType === "receipt")?.credit, 200000);

  const ar = partyBalances(accounts, books, [ravi], { kind: "receivable" });
  assert.equal(ar[0].balance, 100000);

  const pnl = profitAndLoss(accounts, books, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(pnl.totalIncome, 300000);
  assert.equal(pnl.net, 300000);

  const sheet = balanceSheet(accounts, books, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(sheet.balanced, true);
  assert.equal(trialBalance(accounts, books).balanced, true);
  assert.equal(ledgerBalancesCash(books), 200000);
});

function ledgerBalancesCash(books) {
  const cash = accounts.find(row => row.code === SYSTEM_CODES.cash);
  let balance = 0;
  for (const voucher of books) {
    for (const line of voucher.lines) {
      if (line.coaId === cash.id || line.code === cash.code) {
        balance = roundMoney(balance + Number(line.debit || 0) - Number(line.credit || 0));
      }
    }
  }
  return balance;
}

test("multiple partial receipts then paid", () => {
  const sale = posted(
    "sales",
    "2026-04-01",
    saleLines({ accounts, amount: 300000, settlement: "credit", partyId: "ravi" }),
    { n: 1, partyId: "ravi", dueDate: "2026-05-01" },
  );
  const r1 = posted(
    "receipt",
    "2026-04-05",
    receiptLines({ accounts, cash: 100000, receivableCode: SYSTEM_CODES.receivable, partyId: "ravi" }),
    { n: 1, partyId: "ravi", settlements: [{ invoiceVoucherId: sale.id, amount: 100000 }] },
  );
  const r2 = posted(
    "receipt",
    "2026-04-20",
    receiptLines({ accounts, upi: 200000, receivableCode: SYSTEM_CODES.receivable, partyId: "ravi" }),
    { n: 2, partyId: "ravi", settlements: [{ invoiceVoucherId: sale.id, amount: 200000 }] },
  );
  const mid = invoiceRegister(accounts, [sale, r1], [ravi], { kind: "receivable", today: "2026-04-06", from: "2026-04-01", to: "2026-04-30" });
  assert.equal(mid[0].status, "Partially Paid");
  assert.equal(mid[0].outstanding, 200000);
  const done = invoiceRegister(accounts, [sale, r1, r2], [ravi], { kind: "receivable", today: "2026-04-21", from: "2026-04-01", to: "2026-04-30" });
  assert.equal(done[0].status, "Paid");
  assert.equal(done[0].outstanding, 0);
  assert.equal(partyLedger(accounts, [sale, r1, r2], ravi).outstanding, 0);
});

test("zero received stays unpaid; full cash sale stays paid with no AR", () => {
  const unpaid = posted(
    "sales",
    "2026-04-01",
    saleLines({ accounts, amount: 300000, settlement: "credit", partyId: "ravi" }),
    { n: 1, partyId: "ravi", dueDate: "2026-04-20" },
  );
  const rows = invoiceRegister(accounts, [unpaid], [ravi], { kind: "receivable", today: "2026-04-02", from: "2026-04-01", to: "2026-04-30" });
  assert.equal(rows[0].status, "Unpaid");
  assert.equal(rows[0].outstanding, 300000);

  const cashSale = posted(
    "sales",
    "2026-04-01",
    saleLines({ accounts, amount: 300000, settlement: "paid", moneyMode: "cash" }),
    { n: 2 },
  );
  const cashRows = invoiceRegister(accounts, [cashSale], [ravi], { kind: "receivable", today: "2026-04-02", from: "2026-04-01", to: "2026-04-30" });
  assert.equal(cashRows[0].status, "Paid");
  assert.equal(cashRows[0].outstanding, 0);
  assert.equal(partyBalances(accounts, [cashSale], [ravi], { kind: "receivable" }).length, 0);
});

test("Cash + UPI split equals amount received", () => {
  assert.deepEqual(assertMoneyModeSplit("cash_upi", 200000, { cash: 50000, upi: 150000 }), {
    cash: 50000, upi: 150000, bank: 0,
  });
  assert.throws(() => assertMoneyModeSplit("cash_upi", 200000, { cash: 50000, upi: 50000 }), /must equal/);
  assert.deepEqual(moneyByMode("cash_upi", 100, {}), { cash: 100, upi: 0, bank: 0 });
});

test("credit sale draft + receipt draft model the UI path without shrinking sales", () => {
  const saleDraft = simpleEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-04-01",
    amount: 300000,
    partyId: "ravi",
    settlement: "credit",
    dueDate: "2026-04-15",
  });
  assert.equal(voucherTotals(saleDraft.lines).debit, 300000);
  assert.ok(saleDraft.lines.some(line => line.code === SYSTEM_CODES.sales && line.credit === 300000));
  const receiptDraft = simpleEntryDraft({
    kind: "receipt",
    accounts,
    date: "2026-04-01",
    amount: 200000,
    partyId: "ravi",
    moneyMode: "cash",
  });
  assert.equal(voucherTotals(receiptDraft.lines).debit, 200000);
  assert.ok(receiptDraft.lines.some(line => line.code === SYSTEM_CODES.receivable && line.credit === 200000));
  assert.equal(partyHasAccountingUse("ravi", [
    { ...saleDraft, id: "s1", status: "posted", voucherNumber: "SALE-1" },
  ]), true);
});
