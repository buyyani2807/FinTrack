import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceExceptions,
  buildPayLine,
  payrollRows,
  payrollSummary,
  payrollVoucherLines,
  planRecoveries,
  resolveDay,
  STAFF_ADVANCE_CODE,
} from "../src/features/accounts/model/payroll.js";
import {
  advanceSummary,
  advanceVoucherLines,
  assertAdvanceDraft,
  assertBankDetails,
  bankPaymentFile,
  gratuityEstimate,
  leaveBalance,
  leaveOverBalance,
  monthsToRecover,
  payslipDeductions,
  payslipEarnings,
  payslipPdfRows,
  payslipTotals,
  profileForMonth,
  punchHours,
  revisionChange,
  serviceLength,
  settlementTotals,
  settlementVoucherLines,
} from "../src/features/accounts/model/payrollExtras.js";

const month = "2026-09-01";
const monthly = { partyId: "anita", payType: "monthly", basic: 18000, hra: 6000, allowance: 0, dayBasis: 30, overtimeRate: 100, pf: 1800, esi: 0, professionalTax: 200, tds: 0, otherDeduction: 0 };

test("overtime, bonus and incentive add to the month's pay and loss of pay stays separate", () => {
  const line = buildPayLine({
    partyId: "anita",
    month,
    profile: monthly,
    days: [
      { partyId: "anita", workDate: "2026-09-02", status: "absent" },
      { partyId: "anita", workDate: "2026-09-03", status: "present", overtimeHours: 2.5 },
    ],
    leaves: [],
    extras: { bonus: 1000, incentive: 500 },
  });
  assert.equal(line.gross, 24000);
  assert.equal(line.baseEarned, 23200);
  assert.equal(line.overtime, 250);
  assert.equal(line.earned, 24950);
  assert.equal(line.net, 22950);
  const typed = buildPayLine({ partyId: "anita", month, profile: monthly, days: [], leaves: [], extras: { overtimeAmount: 700 } });
  assert.equal(typed.overtime, 700);
  assert.equal(typed.earned, 24700);
});

test("a daily-wage worker is paid for days worked and paid leave, not weekly offs", () => {
  const profile = { partyId: "ravi", payType: "daily", rate: 600, dayBasis: 0 };
  const days = [
    { partyId: "ravi", workDate: "2026-09-01", status: "absent" },
    { partyId: "ravi", workDate: "2026-09-02", status: "half" },
  ];
  const leaves = [{ partyId: "ravi", leaveType: "paid", fromDate: "2026-09-03", toDate: "2026-09-03" }];
  const line = buildPayLine({ partyId: "ravi", month, profile, days, leaves });
  // September 2026: 30 days, 4 Sundays. 26 working days less one absent and half of another.
  assert.equal(line.workedDays, 24.5);
  assert.equal(line.gross, 14700);
  assert.equal(line.lopDays, 0);
  assert.equal(line.net, 14700);
});

test("an hourly worker is paid for the hours on the attendance sheet", () => {
  const profile = { partyId: "meena", payType: "hourly", rate: 80, overtimeRate: 120 };
  const days = [
    { partyId: "meena", workDate: "2026-09-01", status: "present", hours: 8, overtimeHours: 1 },
    { partyId: "meena", workDate: "2026-09-02", status: "present", hours: 6.5 },
    { partyId: "meena", workDate: "2026-09-03", status: "absent", hours: 8 },
  ];
  const line = buildPayLine({ partyId: "meena", month, profile, days, leaves: [] });
  assert.equal(line.hours, 14.5);
  assert.equal(line.gross, 1160);
  assert.equal(line.overtime, 120);
  assert.equal(line.earned, 1280);
});

test("a company holiday is a paid day off unless the day is marked", () => {
  const holidays = [{ date: "2026-09-15", name: "Festival" }];
  assert.equal(resolveDay({ partyId: "anita", date: "2026-09-15", weekday: 2, days: [], leaves: [], holidays }).status, "holiday");
  const daily = buildPayLine({ partyId: "ravi", month, profile: { partyId: "ravi", payType: "daily", rate: 500 }, days: [], leaves: [], holidays });
  assert.equal(daily.workedDays, 25);
  const worked = [{ partyId: "ravi", workDate: "2026-09-15", status: "present" }];
  assert.equal(buildPayLine({ partyId: "ravi", month, profile: { partyId: "ravi", payType: "daily", rate: 500 }, days: worked, leaves: [], holidays }).workedDays, 26);
  const saved = attendanceExceptions({ partyId: "ravi", month, marks: { "2026-09-15": "holiday", "2026-09-16": "present" }, leaves: [], holidays, hours: { "2026-09-16": { hours: 7 } } });
  assert.deepEqual(saved, [{ date: "2026-09-16", status: "present", hours: 7 }]);
});

test("advance recovery takes the instalment, oldest first, and never more than the pay left", () => {
  const advances = [
    { id: "b", partyId: "anita", kind: "advance", givenOn: "2026-09-10", amount: 3000, emi: 0, recovered: 0, status: "open" },
    { id: "a", partyId: "anita", kind: "loan", givenOn: "2026-06-01", amount: 30000, emi: 5000, recovered: 10000, status: "open" },
    { id: "c", partyId: "anita", kind: "advance", givenOn: "2026-10-02", amount: 900, emi: 0, recovered: 0, status: "open" },
    { id: "d", partyId: "other", kind: "advance", givenOn: "2026-09-01", amount: 900, emi: 0, recovered: 0, status: "open" },
  ];
  const plan = planRecoveries({ advances, partyId: "anita", month, available: 22000 });
  assert.deepEqual(plan.map(row => [row.advanceId, row.amount]), [["a", 5000], ["b", 3000]]);
  const tight = planRecoveries({ advances, partyId: "anita", month, available: 6000 });
  assert.deepEqual(tight.map(row => row.amount), [5000, 1000]);
  const typed = planRecoveries({ advances, partyId: "anita", month, available: 22000, overrides: { a: 0, b: 99999 } });
  assert.deepEqual(typed.map(row => row.amount), [0, 3000]);

  const line = buildPayLine({ partyId: "anita", month, profile: monthly, days: [], leaves: [], advances });
  assert.equal(line.advanceRecovery, 8000);
  assert.equal(line.net, 24000 - 2000 - 8000);
  assert.equal(monthsToRecover(advances[1]), 4);
  assert.deepEqual(advanceSummary(advances), { open: 4, outstanding: 24800, given: 34800 });
});

test("the salary voucher credits the staff advances ledger for the recovery", () => {
  const accounts = [
    { id: "sal", code: "5010", accountType: "expense" },
    { id: "ded", code: "2220", accountType: "other" },
    { id: "adv", code: STAFF_ADVANCE_CODE, accountType: "other" },
    { id: "bank", code: "1020", accountType: "bank" },
  ];
  const lines = payrollVoucherLines({ accounts, payAccountId: "bank", earned: 24000, deductionTotal: 2000, advanceRecovery: 8000, partyId: "anita", description: "Salary" });
  assert.deepEqual(lines.map(line => [line.coaId, line.debit, line.credit]), [["sal", 24000, 0], ["ded", 0, 2000], ["adv", 0, 8000], ["bank", 0, 14000]]);
  assert.throws(() => payrollVoucherLines({ accounts: accounts.filter(a => a.id !== "adv"), payAccountId: "bank", earned: 24000, deductionTotal: 0, advanceRecovery: 100, partyId: "anita", description: "Salary" }), /Staff advances/);
  const given = advanceVoucherLines({ advanceAccount: accounts[2], payAccount: accounts[3], amount: 5000, partyId: "anita", description: "Advance" });
  assert.deepEqual(given.map(line => [line.coaId, line.debit, line.credit]), [["adv", 5000, 0], ["bank", 0, 5000]]);
});

test("an advance needs an employee, an amount, and a monthly recovery for a loan", () => {
  const base = { partyId: "anita", kind: "advance", givenOn: "2026-09-10", amount: 3000, emi: 0, payAccountId: "bank" };
  assert.equal(assertAdvanceDraft(base, "2026-09-12"), "");
  assert.match(assertAdvanceDraft({ ...base, givenOn: "2026-09-20" }, "2026-09-12"), /after today/);
  assert.match(assertAdvanceDraft({ ...base, kind: "loan" }, "2026-09-12"), /each month/);
  assert.match(assertAdvanceDraft({ ...base, emi: 4000 }, "2026-09-12"), /more than the amount/);
  assert.match(assertAdvanceDraft({ ...base, payAccountId: "" }, "2026-09-12"), /paid from/);
  assert.equal(assertAdvanceDraft({ ...base, payAccountId: "", postToBooks: false }, "2026-09-12"), "");
});

test("pay rows and the summary carry the recovery and count wages by what was earned", () => {
  const rows = payrollRows({
    employees: [{ id: "anita", name: "Anita" }, { id: "ravi", name: "Ravi" }],
    month,
    profiles: [monthly, { partyId: "ravi", payType: "daily", rate: 600 }],
    days: [],
    leaves: [],
    advances: [{ id: "a", partyId: "anita", kind: "advance", givenOn: "2026-09-05", amount: 1000, emi: 0, recovered: 0, status: "open" }],
    extrasByParty: { ravi: { bonus: 400 } },
  });
  assert.equal(rows[0].advanceRecovery, 1000);
  assert.equal(rows[1].monthly, 600);
  assert.equal(rows[1].net, 600 * 26 + 400);
  const summary = payrollSummary(rows);
  assert.equal(summary.monthly, 24000 + 15600);
  assert.equal(summary.monthDeductions, 2000 + 1000);
  assert.equal(summary.unset, 0);
});

test("leave balance is the yearly allowance less leave taken, and going over only warns", () => {
  const balance = leaveBalance({
    profile: { paidLeaveQuota: 12, sickLeaveQuota: 0 },
    partyId: "anita",
    used: [{ partyId: "anita", leaveType: "paid", days: 10.5 }, { partyId: "ravi", leaveType: "paid", days: 3 }],
  });
  assert.deepEqual(balance.paid, { quota: 12, used: 10.5, left: 1.5 });
  assert.equal(balance.sick.left, null);
  assert.equal(leaveOverBalance({ balance, leaveType: "paid", days: 1 }), "");
  assert.match(leaveOverBalance({ balance, leaveType: "paid", days: 3 }), /Only 1.5 days/);
  assert.equal(leaveOverBalance({ balance, leaveType: "sick", days: 30 }), "");
});

test("a month uses the salary revision that had started by the 1st", () => {
  const revisions = [
    { partyId: "anita", effectiveFrom: "2000-01-01", payType: "monthly", basic: 15000, hra: 5000, allowance: 0, rate: 0, createdAt: "1" },
    { partyId: "anita", effectiveFrom: "2026-10-01", payType: "monthly", basic: 18000, hra: 6000, allowance: 0, rate: 0, createdAt: "2" },
  ];
  assert.equal(profileForMonth(monthly, revisions, "2026-09-01").basic, 15000);
  assert.equal(profileForMonth(monthly, revisions, "2026-10-01").basic, 18000);
  assert.equal(profileForMonth(monthly, [], "2026-09-01"), monthly);
  assert.equal(profileForMonth(monthly, revisions, "2026-09-01").pf, 1800);
  assert.deepEqual(revisionChange(revisions[1], revisions[0]), { amount: 4000, percent: 20 });
});

test("gratuity needs five years, or one year pro rata for a fixed term, on at least half the salary", () => {
  assert.deepEqual(serviceLength("2020-04-01", "2026-11-15"), { days: 2420, years: 6, months: 7 });
  const due = gratuityEstimate({ basic: 13000, monthlySalary: 24000, joinedOn: "2020-04-01", lastDay: "2026-11-15" });
  assert.equal(due.years, 7);
  assert.equal(due.amount, 52500);
  const half = gratuityEstimate({ basic: 8000, monthlySalary: 24000, joinedOn: "2020-04-01", lastDay: "2026-04-30" });
  assert.equal(half.wages, 12000);
  assert.equal(half.years, 6);
  assert.equal(gratuityEstimate({ basic: 13000, monthlySalary: 24000, joinedOn: "2023-04-01", lastDay: "2026-11-15" }).eligible, false);
  const fixed = gratuityEstimate({ basic: 13000, monthlySalary: 24000, joinedOn: "2025-05-16", lastDay: "2026-11-15", fixedTerm: true });
  assert.equal(fixed.eligible, true);
  assert.equal(fixed.years, 1.5);
  assert.equal(fixed.amount, 11250);
  assert.equal(gratuityEstimate({ basic: 900000, monthlySalary: 900000, joinedOn: "2000-01-01", lastDay: "2026-01-01" }).amount, 2000000);
});

test("a final settlement nets what is due against advances and posts a balanced voucher", () => {
  const totals = settlementTotals({ unpaidSalary: 12000, leaveDays: 4, perDay: 800, gratuity: 52500, advanceRecovery: 5000, otherDeduction: 700 });
  assert.equal(totals.leaveEncashment, 3200);
  assert.equal(totals.payable, 67700);
  assert.equal(totals.net, 62000);
  const lines = settlementVoucherLines({
    salaryAccount: { id: "sal", code: "5010" },
    gratuityAccount: { id: "grat", code: "5015" },
    advanceAccount: { id: "adv", code: "1210" },
    deductionAccount: { id: "ded", code: "2220" },
    payAccount: { id: "bank", code: "1020", accountType: "bank" },
    totals,
    partyId: "anita",
    description: "Final settlement",
  });
  assert.deepEqual(lines.map(line => [line.coaId, line.debit, line.credit]), [["sal", 15200, 0], ["grat", 52500, 0], ["adv", 0, 5000], ["ded", 0, 700], ["bank", 0, 62000]]);
  assert.match(settlementTotals({ unpaidSalary: 1000, advanceRecovery: 5000 }).error, /more than the amount due/);
});

test("the bank file lists who can be paid by transfer and who is missing details", () => {
  assert.equal(assertBankDetails({ bankAccount: "", bankIfsc: "" }), "");
  assert.match(assertBankDetails({ bankAccount: "12AB", bankIfsc: "HDFC0001234" }), /account number/);
  assert.match(assertBankDetails({ bankAccount: "123456789", bankIfsc: "HDFC1001234" }), /IFSC/);
  const file = bankPaymentFile({
    month,
    companyName: "Sri Stores & Co.",
    rows: [
      { partyId: "anita", name: "Anita", net: 22000 },
      { partyId: "ravi", name: "Ravi", net: 15600 },
      { partyId: "late", name: "Late", net: 500, inRun: false },
      { partyId: "zero", name: "Zero", net: 0 },
    ],
    staff: [{ partyId: "anita", bankHolder: "Anita K", bankAccount: "0012 3456 7890", bankIfsc: "hdfc0001234" }],
  });
  assert.equal(file.count, 1);
  assert.equal(file.total, 22000);
  assert.deepEqual(file.missing, ["Ravi"]);
  assert.deepEqual(file.rows[1], ["Anita K", "\t001234567890", "HDFC0001234", "22000.00", "Salary September 2026 Sri Stor"]);
});

test("the payslip lists every earning and deduction and they add up to net pay", () => {
  const line = buildPayLine({
    partyId: "anita",
    month,
    profile: monthly,
    days: [{ partyId: "anita", workDate: "2026-09-02", status: "absent" }],
    leaves: [],
    extras: { bonus: 1000 },
    advances: [{ id: "a", partyId: "anita", kind: "advance", givenOn: "2026-09-05", amount: 1000, emi: 0, recovered: 0, status: "open" }],
  });
  const slip = { ...line, name: "Anita", basic: 18000, hra: 6000, allowance: 0 };
  assert.deepEqual(payslipEarnings(slip).map(row => row.label), ["Basic", "House rent allowance", "Other allowance", "Bonus"]);
  assert.equal(payslipDeductions(slip).find(row => row.label === "Loss of pay").amount, 800);
  const totals = payslipTotals(slip);
  assert.equal(totals.earnings - totals.deductions, totals.net);
  const rows = payslipPdfRows({ slip, payDate: "30 Sep 2026" });
  assert.deepEqual(rows[0], ["Item", "Amount"]);
  assert.ok(rows.some(row => row[0] === "Net pay" && row[1] === "Rs. 21,200.00"));
  const old = { name: "Old", gross: 24000, earned: 23200, deductions: { pf: 1800 }, deductionTotal: 1800, net: 21400, basic: 18000, hra: 6000, allowance: 0 };
  assert.equal(payslipTotals(old).earnings - payslipTotals(old).deductions, 21400);
});

test("punch hours are the time between punch in and punch out", () => {
  assert.equal(punchHours("2026-09-01T03:30:00Z", "2026-09-01T12:00:00Z"), 8.5);
  assert.equal(punchHours("2026-09-01T03:30:00Z", ""), 0);
  assert.equal(punchHours("2026-09-01T12:00:00Z", "2026-09-01T03:30:00Z"), 0);
});
