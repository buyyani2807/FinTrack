import { findAccount, roundMoney, SYSTEM_CODES } from "./accountingModel.js";

export const PAYROLL_DISCLAIMER = "Deductions are the amounts you enter. FinTrack does not calculate provident fund, ESI, professional tax, or income tax, and nothing is filed.";

export const DAY_STATUSES = [
  { id: "present", label: "Present" },
  { id: "half", label: "Half day" },
  { id: "absent", label: "Absent" },
  { id: "week_off", label: "Weekly off" },
  { id: "holiday", label: "Holiday" },
];

export const LEAVE_TYPES = [
  { id: "paid", label: "Paid leave" },
  { id: "sick", label: "Sick leave" },
  { id: "unpaid", label: "Unpaid leave" },
];

export const DAY_BASIS = [
  { id: 0, label: "Days in the month" },
  { id: 26, label: "26 days" },
  { id: 30, label: "30 days" },
];

const STATUS_IDS = new Set(DAY_STATUSES.map(row => row.id));
const LEAVE_IDS = new Set(LEAVE_TYPES.map(row => row.id));

export function monthStart(iso) {
  const [year, month] = String(iso || "").split("-").map(Number);
  if (!year || !month) return "";
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function daysInMonth(iso) {
  const start = monthStart(iso);
  const [year, month] = start.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDates(iso) {
  const start = monthStart(iso);
  const [year, month] = start.split("-").map(Number);
  const count = daysInMonth(start);
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { date, weekday, day };
  });
}

export function monthLabel(iso) {
  const start = monthStart(iso);
  const [year, month] = start.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function monthEnd(iso) {
  const dates = monthDates(iso);
  return dates[dates.length - 1]?.date || "";
}

export function defaultStatus(weekday) {
  return weekday === 0 ? "week_off" : "present";
}

export function leaveCovering(leaves, partyId, date) {
  return (leaves || []).find(row => row.partyId === partyId && row.fromDate <= date && row.toDate >= date) || null;
}

export function resolveDay({ partyId, date, weekday, days, leaves }) {
  const leave = leaveCovering(leaves, partyId, date);
  if (leave) return { status: "leave", leaveType: leave.leaveType, source: "leave" };
  const marked = (days || []).find(row => row.partyId === partyId && row.workDate === date);
  if (marked && STATUS_IDS.has(marked.status)) return { status: marked.status, leaveType: null, source: "marked" };
  return { status: defaultStatus(weekday), leaveType: null, source: "default" };
}

export function lopUnits(resolved) {
  if (resolved.status === "half") return 1;
  if (resolved.status === "absent") return 2;
  if (resolved.status === "leave" && resolved.leaveType === "unpaid") return 2;
  return 0;
}

export function emptyProfile(partyId) {
  return {
    partyId,
    basic: 0,
    hra: 0,
    allowance: 0,
    dayBasis: 0,
    pf: 0,
    esi: 0,
    professionalTax: 0,
    tds: 0,
    otherDeduction: 0,
  };
}

export function monthlyGross(profile) {
  return roundMoney(Number(profile?.basic || 0) + Number(profile?.hra || 0) + Number(profile?.allowance || 0));
}

export function deductionParts(source) {
  return {
    pf: roundMoney(source?.pf || 0),
    esi: roundMoney(source?.esi || 0),
    professionalTax: roundMoney(source?.professionalTax || 0),
    tds: roundMoney(source?.tds || 0),
    otherDeduction: roundMoney(source?.otherDeduction || 0),
  };
}

export function deductionTotal(parts) {
  const row = deductionParts(parts);
  return roundMoney(row.pf + row.esi + row.professionalTax + row.tds + row.otherDeduction);
}

export function buildPayLine({ partyId, month, profile, days, leaves, deductions }) {
  const dates = monthDates(month);
  const basis = Number(profile?.dayBasis) > 0 ? Number(profile.dayBasis) : dates.length;
  let halves = 0;
  let paidHalves = 0;
  for (const day of dates) {
    const resolved = resolveDay({ partyId, date: day.date, weekday: day.weekday, days, leaves });
    const lost = lopUnits(resolved);
    halves += lost;
    paidHalves += resolved.status === "half" ? 1 : lost > 0 ? 0 : 2;
  }
  const lopDays = halves / 2;
  const paidDays = paidHalves / 2;
  const gross = monthlyGross(profile);
  const lossAmount = basis > 0 ? roundMoney(gross * lopDays / basis) : 0;
  const earned = roundMoney(Math.max(0, gross - lossAmount));
  const parts = deductionParts(deductions || profile);
  const held = deductionTotal(parts);
  const error = held > earned ? "Deductions are more than the salary earned." : "";
  const net = error ? 0 : roundMoney(earned - held);
  return {
    partyId,
    paidDays,
    lopDays,
    basis,
    gross,
    earned,
    deductions: parts,
    deductionTotal: held,
    net,
    error,
    voucherId: null,
  };
}

export function payrollRows({ employees, month, profiles, days, leaves, overrides = {}, run = null }) {
  if (run?.status === "posted") {
    return (run.lines || []).map(line => ({
      ...line,
      deductions: deductionParts(line.deductions),
      name: employees.find(person => person.id === line.partyId)?.name || line.name || "Employee",
      error: "",
    }));
  }
  return (employees || []).map(person => {
    const profile = (profiles || []).find(row => row.partyId === person.id) || emptyProfile(person.id);
    const saved = (run?.lines || []).find(line => line.partyId === person.id);
    const line = buildPayLine({
      partyId: person.id,
      month,
      profile,
      days,
      leaves,
      deductions: overrides[person.id] || saved?.deductions || profile,
    });
    return {
      ...line,
      name: person.name,
      voucherId: saved?.voucherId || null,
      sourceId: saved?.sourceId || null,
    };
  });
}

export function payrollVoucherLines({ accounts, payAccountId, earned, deductionTotal: held, partyId, description }) {
  const salary = findAccount(accounts, { code: SYSTEM_CODES.salary });
  if (!salary) throw new Error("Add a Salary ledger before posting pay.");
  const gross = roundMoney(earned);
  const deductions = roundMoney(held);
  const net = roundMoney(gross - deductions);
  if (gross < 0 || deductions < 0 || net < 0) throw new Error("Deductions are more than the salary earned.");
  const lines = [{
    coaId: salary.id,
    code: salary.code,
    partyId,
    debit: gross,
    credit: 0,
    description,
  }];
  if (deductions > 0) {
    const payable = findAccount(accounts, { code: SYSTEM_CODES.salaryDeductions });
    if (!payable) throw new Error("Add the Salary deductions payable ledger before posting deductions.");
    lines.push({
      coaId: payable.id,
      code: payable.code,
      debit: 0,
      credit: deductions,
      description,
    });
  }
  if (net > 0) {
    const paidFrom = (accounts || []).find(account => account.id === payAccountId);
    if (!paidFrom) throw new Error("Choose the account the salary is paid from.");
    if (!["cash", "bank", "upi"].includes(paidFrom.accountType)) throw new Error("Salary is paid from cash, bank, or UPI.");
    lines.push({
      coaId: paidFrom.id,
      code: paidFrom.code,
      debit: 0,
      credit: net,
      description,
    });
  }
  const debit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debit !== credit) throw new Error("Salary lines do not balance.");
  return lines;
}

export function leavesOverlap(existing, draft) {
  return (existing || []).some(row => row.partyId === draft.partyId
    && row.id !== draft.id
    && row.fromDate <= draft.toDate
    && row.toDate >= draft.fromDate);
}

export function inclusiveDays(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

export function attendanceMarks({ partyId, month, days, leaves }) {
  const marks = {};
  for (const day of monthDates(month)) {
    const resolved = resolveDay({ partyId, date: day.date, weekday: day.weekday, days, leaves });
    if (resolved.source !== "leave") marks[day.date] = resolved.status;
  }
  return marks;
}

export function attendanceExceptions({ partyId, month, marks, leaves }) {
  const rows = [];
  for (const day of monthDates(month)) {
    if (leaveCovering(leaves, partyId, day.date)) continue;
    const status = marks?.[day.date] || defaultStatus(day.weekday);
    if (!STATUS_IDS.has(status)) continue;
    if (status !== defaultStatus(day.weekday)) rows.push({ date: day.date, status });
  }
  return rows;
}

export function calendarLead(month) {
  const first = monthDates(month)[0];
  return first ? (first.weekday + 6) % 7 : 0;
}

export function leaveTypeLabel(id) {
  return LEAVE_TYPES.find(row => row.id === id)?.label || "Leave";
}

export function assertLeaveDraft(draft) {
  if (!draft?.partyId) return "Choose an employee.";
  if (!LEAVE_IDS.has(draft.leaveType)) return "Choose a leave type.";
  if (!draft.fromDate || !draft.toDate) return "Choose the dates.";
  if (draft.toDate < draft.fromDate) return "Leave ends before it starts.";
  if (inclusiveDays(draft.fromDate, draft.toDate) > 366) return "Leave is longer than a year.";
  return "";
}

export function moneyAccounts(accounts) {
  return (accounts || []).filter(account => ["cash", "bank", "upi"].includes(account.accountType) && account.isActive !== false);
}
