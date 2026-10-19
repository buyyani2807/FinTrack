import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/model/accountingModel.js";
import { NAV_TREE, accountsPath, accountsViewFromPath, navItemIsActive, sectionTrail } from "../src/features/accounts/accountsNavigation.js";
import {
  attendanceExceptions,
  buildPayLine,
  defaultStatus,
  leavesOverlap,
  monthDates,
  payState,
  payrollMonthChoices,
  payrollRows,
  payrollSummary,
  payrollVoucherLines,
  rupeesInWords,
} from "../src/features/accounts/model/payroll.js";

const profile = {
  partyId: "anita",
  basic: 18000,
  hra: 6000,
  allowance: 0,
  dayBasis: 30,
  pf: 1800,
  esi: 0,
  professionalTax: 200,
  tds: 0,
  otherDeduction: 0,
};
const month = "2026-09-01";

test("net pay is written in rupees the way a payslip states it", () => {
  assert.equal(rupeesInWords(0), "Rupees Zero Only");
  assert.equal(rupeesInWords(25000), "Rupees Twenty Five Thousand Only");
  assert.equal(rupeesInWords(21200), "Rupees Twenty One Thousand Two Hundred Only");
  assert.equal(rupeesInWords(100000), "Rupees One Lakh Only");
  assert.equal(rupeesInWords(10000000), "Rupees One Crore Only");
});

test("a full month with only Sunday off pays the full salary", () => {
  const line = buildPayLine({ partyId: "anita", month, profile: { ...profile, pf: 0, professionalTax: 0 }, days: [], leaves: [] });
  assert.equal(line.lopDays, 0);
  assert.equal(line.paidDays, 30);
  assert.equal(line.earned, 24000);
  assert.equal(line.net, 24000);
  assert.equal(defaultStatus(0), "week_off");
  assert.equal(monthDates(month).filter(day => day.weekday === 0).length, 4);
});

test("one absent day and the entered deductions reduce net pay", () => {
  const line = buildPayLine({
    partyId: "anita",
    month,
    profile,
    days: [{ partyId: "anita", workDate: "2026-09-02", status: "absent" }],
    leaves: [{ partyId: "anita", leaveType: "paid", fromDate: "2026-09-10", toDate: "2026-09-11" }],
  });
  assert.equal(line.lopDays, 1);
  assert.equal(line.earned, 23200);
  assert.equal(line.deductionTotal, 2000);
  assert.equal(line.net, 21200);
  assert.equal(line.error, "");
});

test("unpaid leave and a half day reduce pay, and paid leave does not", () => {
  const unpaid = buildPayLine({
    partyId: "anita",
    month,
    profile: { ...profile, dayBasis: 0, pf: 0, professionalTax: 0 },
    days: [],
    leaves: [{ partyId: "anita", leaveType: "unpaid", fromDate: "2026-09-03", toDate: "2026-09-03" }],
  });
  assert.equal(unpaid.basis, 30);
  assert.equal(unpaid.lopDays, 1);
  assert.equal(unpaid.earned, 23200);

  const half = buildPayLine({
    partyId: "anita",
    month,
    profile: { ...profile, basic: 20000, hra: 6000, dayBasis: 26, pf: 0, professionalTax: 0 },
    days: [{ partyId: "anita", workDate: "2026-09-04", status: "half" }],
    leaves: [],
  });
  assert.equal(half.lopDays, 0.5);
  assert.equal(half.earned, 25500);
});

test("deductions above the salary earned are refused", () => {
  const line = buildPayLine({
    partyId: "anita",
    month,
    profile: { ...profile, basic: 1000, hra: 0, pf: 2000, professionalTax: 0 },
    days: [],
    leaves: [],
  });
  assert.equal(line.error, "Deductions are more than the salary earned.");
  assert.equal(line.net, 0);
});

test("leave overlap and attendance exceptions skip the default and leave days", () => {
  const existing = [{ id: "a", partyId: "anita", fromDate: "2026-09-10", toDate: "2026-09-11" }];
  assert.equal(leavesOverlap(existing, { partyId: "anita", fromDate: "2026-09-11", toDate: "2026-09-12" }), true);
  assert.equal(leavesOverlap(existing, { id: "a", partyId: "anita", fromDate: "2026-09-10", toDate: "2026-09-11" }), false);
  const marks = Object.fromEntries(monthDates(month).map(day => [day.date, day.date === "2026-09-02" ? "absent" : defaultStatus(day.weekday)]));
  const exceptions = attendanceExceptions({
    partyId: "anita",
    month,
    marks,
    leaves: [{ partyId: "anita", fromDate: "2026-09-02", toDate: "2026-09-02" }],
  });
  assert.deepEqual(exceptions, []);
});

test("a draft keeps the salary voucher id already stored on the line", () => {
  const rows = payrollRows({
    employees: [{ id: "anita", name: "Anita Rao" }],
    month,
    profiles: [profile],
    days: [],
    leaves: [],
    run: { status: "draft", lines: [{ partyId: "anita", sourceId: "11111111-1111-4111-8111-111111111111", voucherId: "22222222-2222-4222-8222-222222222222" }] },
  });
  assert.equal(rows[0].sourceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(rows[0].voucherId, "22222222-2222-4222-8222-222222222222");
});

test("the month menu lists history from when the books opened, newest first", () => {
  const choices = payrollMonthChoices({ today: "2026-10-19", booksStartedOn: "2026-09-08" });
  assert.deepEqual(choices.map(row => row.label), ["November 2026", "October 2026", "September 2026"]);
  const year = payrollMonthChoices({ today: "2026-10-19" });
  assert.equal(year[0].value, "2026-11");
  assert.equal(year.at(-1).value, "2024-11");
  const older = payrollMonthChoices({ today: "2026-10-19", booksStartedOn: "2026-09-08", selected: "2020-01" });
  assert.equal(older.at(-1).value, "2020-01");
});

test("a posted month shows the stored lines", () => {
  const rows = payrollRows({
    employees: [{ id: "anita", name: "Anita Rao" }],
    month,
    profiles: [],
    days: [],
    leaves: [],
    run: { status: "posted", lines: [{ partyId: "anita", earned: 100, net: 100, basic: 100, hra: 0, allowance: 0, deductions: { pf: 0, esi: 0, professionalTax: 0, tds: 0, otherDeduction: 0 }, deductionTotal: 0, paidDays: 1, lopDays: 0 }] },
  });
  assert.equal(rows[0].name, "Anita Rao");
  assert.equal(rows[0].earned, 100);
  assert.equal(rows[0].inRun, true);
  assert.equal(rows[0].monthly, 100);
});

test("a posted month still lists employees added after it was posted", () => {
  const rows = payrollRows({
    employees: [
      { id: "anita", name: "Anita Rao" },
      { id: "new", name: "New Hire" },
    ],
    month,
    profiles: [{ partyId: "new", basic: 20000, hra: 0, allowance: 0 }],
    days: [],
    leaves: [],
    run: {
      status: "posted",
      lines: [{ partyId: "anita", name: "Anita Rao", earned: 100, net: 100, basic: 100, hra: 0, allowance: 0, deductions: {}, deductionTotal: 0, paidDays: 1, lopDays: 0, gross: 100 }],
    },
  });
  assert.equal(rows.map(row => row.name).join(","), "Anita Rao,New Hire");
  const hire = rows[1];
  assert.equal(hire.inRun, false);
  assert.equal(hire.monthly, 20000);
  assert.equal(payState({ posted: true, inRun: hire.inRun, monthly: hire.monthly, error: hire.error }), "later");
  const summary = payrollSummary(rows);
  assert.equal(summary.employees, 2);
  assert.equal(summary.recorded, 2);
  assert.equal(summary.monthly, 20100);
  assert.equal(summary.monthNet, 100);
  assert.equal(summary.later, 1);
  assert.equal(payState({ posted: false, inRun: true, monthly: 0, error: "" }), "unset");
});

test("a posted month keeps a person who is no longer an active employee", () => {
  const rows = payrollRows({
    employees: [],
    month,
    profiles: [],
    days: [],
    leaves: [],
    run: { status: "posted", lines: [{ partyId: "gone", name: "Former", earned: 50, net: 50, deductions: {}, deductionTotal: 0 }] },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Former");
  assert.equal(rows[0].inRun, true);
});

test("salary voucher debits salary and credits net pay plus deductions", () => {
  const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code, isActive: true }));
  const lines = payrollVoucherLines({
    accounts,
    payAccountId: "1020",
    earned: 23200,
    deductionTotal: 2000,
    partyId: "anita",
    description: "Salary for September 2026 · Anita Rao",
  });
  assert.equal(lines.find(line => line.code === "5010").debit, 23200);
  assert.equal(lines.find(line => line.code === "2220").credit, 2000);
  assert.equal(lines.find(line => line.code === "1020").credit, 21200);
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  assert.equal(debit, credit);
});

test("payroll sits beside expenses", () => {
  const payroll = NAV_TREE.find(item => item.id === "payroll");
  const expenses = NAV_TREE.findIndex(item => item.id === "expenses");
  assert.equal(NAV_TREE[expenses + 1].id, "payroll");
  assert.equal(navItemIsActive(payroll, "attendance"), true);
  assert.equal(accountsPath({ section: "payroll" }), "/accounting/payroll");
  assert.equal(accountsPath({ section: "attendance" }), "/accounting/attendance");
  assert.equal(accountsViewFromPath("leave").section, "leave");
  assert.deepEqual(sectionTrail("payroll"), ["Payroll", "Pay"]);
  assert.deepEqual(sectionTrail("leave"), ["Payroll", "Leave"]);
});
