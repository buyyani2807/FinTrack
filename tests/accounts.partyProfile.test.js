import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  SYSTEM_CODES,
  paymentLines,
  purchaseLines,
  receiptLines,
  saleLines,
} from "../src/features/accounts/model/accountingModel.js";
import { invoiceRegister } from "../src/features/accounts/model/accountingReports.js";
import { isEmployeeParty, partyHasTradeProfile, partyProfile } from "../src/features/accounts/model/partyProfile.js";
import { accountsPath, accountsViewFromPath } from "../src/features/accounts/accountsNavigation.js";
import { calculateFintrackCreditScore, invoiceInstallments } from "../src/features/creditScore/creditScoreModel.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code, isSystem: true, isActive: true }));
const ravi = { id: "ravi", name: "Ravi", partyType: "customer", creditLimit: 100000, creditDays: 15 };

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

const creditSale = (n, date, dueDate, amount) => posted(
  "sales",
  date,
  saleLines({ accounts, amount, settlement: "credit", partyId: "ravi" }),
  { n, partyId: "ravi", dueDate },
);
const receipt = (n, date, amount, invoice) => posted(
  "receipt",
  date,
  receiptLines({ accounts, cash: amount, receivableCode: SYSTEM_CODES.receivable, partyId: "ravi" }),
  { n, partyId: "ravi", settlements: invoice ? [{ invoiceVoucherId: invoice.id, amount }] : [] },
);

test("invoice register records when each credit invoice was fully paid", () => {
  const sale = creditSale(1, "2026-04-01", "2026-04-15", 30000);
  const part = receipt(1, "2026-04-05", 10000, sale);
  const rest = receipt(2, "2026-04-20", 20000, null);
  const cash = posted("sales", "2026-04-02", saleLines({ accounts, amount: 5000, settlement: "paid", moneyMode: "cash" }), { n: 2, partyId: "ravi" });

  const mid = invoiceRegister(accounts, [sale, part], [ravi], { kind: "receivable", today: "2026-04-06" });
  assert.equal(mid[0].settledOn, "");
  assert.equal(mid[0].lastPaidOn, "2026-04-05");

  const rows = invoiceRegister(accounts, [sale, cash, part, rest], [ravi], { kind: "receivable", today: "2026-04-21" });
  const credit = rows.find(row => row.id === sale.id);
  assert.equal(credit.onCredit, true);
  assert.equal(credit.settledOn, "2026-04-20", "the FIFO receipt that cleared the balance sets the paid date");
  const cashRow = rows.find(row => row.id === cash.id);
  assert.equal(cashRow.onCredit, false);
  assert.equal(cashRow.settledOn, "2026-04-02");
});

test("party profile shows open invoices, credit limit used, and payment habits", () => {
  const s1 = creditSale(1, "2026-04-01", "2026-04-10", 20000);
  const s2 = creditSale(2, "2026-05-01", "2026-05-10", 20000);
  const s3 = creditSale(3, "2026-06-01", "2026-06-10", 40000);
  const books = [s1, s2, s3, receipt(1, "2026-04-08", 20000, s1), receipt(2, "2026-05-30", 20000, s2)];
  const profile = partyProfile({ accounts, vouchers: books, parties: [ravi], party: ravi, today: "2026-06-30" });

  assert.equal(profile.kind, "receivable");
  assert.equal(profile.both, false, "no purchases from Ravi, so only the sales side");
  assert.equal(profile.payable, null);
  assert.equal(profile.limitUsed, 40);
  const side = profile.primary;
  assert.equal(side.outstanding, 40000);
  assert.equal(side.overdue, 40000);
  assert.equal(side.open.length, 1);
  assert.equal(side.maxDaysOverdue, 20);
  assert.equal(side.paidCount, 2);
  assert.equal(side.onTimeRate, 50);
  assert.equal(side.lateCount, 1);
  assert.equal(side.avgDaysLate, 20);
  assert.equal(side.avgDaysToPay, 18, "7 days and 29 days average to 18");
  assert.equal(side.billed, 80000);
  assert.equal(side.lastPayment.date, "2026-05-30");
  assert.equal(side.lastPayment.amount, 20000);
});

test("a party you sell to and buy from shows both sides and the net", () => {
  const sale = creditSale(1, "2026-06-01", "2026-06-15", 50000);
  const purchase = posted(
    "purchase",
    "2026-06-05",
    purchaseLines({ accounts, amount: 30000, settlement: "credit", partyId: "ravi" }),
    { n: 1, partyId: "ravi", dueDate: "2026-07-05" },
  );
  const paid = posted(
    "payment",
    "2026-06-20",
    paymentLines({ accounts, cash: 10000, payableCode: SYSTEM_CODES.payable, partyId: "ravi" }),
    { n: 1, partyId: "ravi", settlements: [{ invoiceVoucherId: purchase.id, amount: 10000 }] },
  );
  const books = [sale, purchase, paid];
  const profile = partyProfile({ accounts, vouchers: books, parties: [ravi], party: ravi, today: "2026-06-30" });

  assert.equal(profile.both, true);
  assert.deepEqual(profile.sides.map(side => side.kind), ["receivable", "payable"], "the customer side comes first for a customer");
  assert.equal(profile.receivable.outstanding, 50000);
  assert.equal(profile.receivable.overdue, 50000);
  assert.equal(profile.payable.outstanding, 20000);
  assert.equal(profile.payable.lastPayment.amount, 10000);
  assert.equal(profile.net, 30000, "they owe 50,000 and you owe 20,000");

  const supplierView = partyProfile({ accounts, vouchers: books, parties: [ravi], party: { ...ravi, partyType: "supplier" }, today: "2026-06-30" });
  assert.deepEqual(supplierView.sides.map(side => side.kind), ["payable", "receivable"]);
  assert.equal(supplierView.net, 30000);
});

test("credit score from invoices rewards on-time payers and marks overdue invoices as missed", () => {
  const onTime = [1, 2, 3, 4].map(month => {
    const sale = creditSale(month, `2026-0${month}-01`, `2026-0${month}-15`, 10000);
    return [sale, receipt(month, `2026-0${month}-10`, 10000, sale)];
  }).flat();
  const good = calculateFintrackCreditScore({
    invoices: invoiceRegister(accounts, onTime, [ravi], { kind: "receivable", today: "2026-06-01" }),
    asOf: "2026-06-01",
  });
  assert.equal(good.available, true);
  assert.equal(good.summary.onTime, 4);
  assert.ok(good.score >= 750, `expected Excellent, got ${good.score}`);

  const unpaid = [1, 2, 3, 4].map(month => creditSale(month, `2026-0${month}-01`, `2026-0${month}-15`, 10000));
  const bad = calculateFintrackCreditScore({
    invoices: invoiceRegister(accounts, unpaid, [ravi], { kind: "receivable", today: "2026-06-01" }),
    asOf: "2026-06-01",
  });
  assert.equal(bad.summary.missed, 4);
  assert.equal(bad.band, "high_risk");
});

test("a part-paid invoice that is not yet due does not count against the customer", () => {
  const rows = invoiceInstallments([
    { id: "a", amount: 10000, paid: 4000, invoiceDate: "2026-06-01", dueDate: "2026-06-30", settledOn: "", lastPaidOn: "2026-06-05" },
    { id: "b", amount: 10000, paid: 0, invoiceDate: "2026-04-01", dueDate: "2026-04-15", settledOn: "2026-05-20", lastPaidOn: "2026-05-20" },
  ], "2026-06-10");
  assert.equal(rows.find(row => row.accountId === "a").status, "pending");
  const late = rows.find(row => row.accountId === "b");
  assert.equal(late.status, "late");
  assert.equal(late.daysLate, 35);

  const before = invoiceInstallments([
    { id: "b", amount: 10000, paid: 10000, invoiceDate: "2026-04-01", dueDate: "2026-04-15", settledOn: "2026-05-20", lastPaidOn: "2026-05-20" },
  ], "2026-04-30");
  assert.equal(before[0].status, "missed", "a month-end before the payment sees the invoice unpaid");
});

test("an employee has no customer or supplier profile", () => {
  assert.equal(isEmployeeParty({ id: "amogha", partyType: "employee" }), true);
  assert.equal(partyHasTradeProfile({ id: "amogha", partyType: "employee" }), false);
  assert.equal(partyHasTradeProfile({ id: "ravi", partyType: "customer" }), true);
  assert.equal(partyHasTradeProfile({ id: "mill", partyType: "supplier" }), true);
});

test("party profile has its own address", () => {
  assert.equal(accountsPath({ section: "party", sub: "ravi" }), "/accounting/parties/profile/ravi");
  assert.equal(accountsPath({ section: "party" }), "/accounting/parties/ledger");
  assert.deepEqual(accountsViewFromPath("parties", "profile", "ravi"), { section: "party", reportTab: "daybook", sub: "ravi" });
  assert.equal(accountsViewFromPath("parties", "profile", undefined).section, "parties");
  assert.equal(accountsPath({ section: "routes", sub: "today" }), "/accounting/parties/routes/today");
});
