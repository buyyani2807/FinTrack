import { findAccount, roundMoney, SYSTEM_CODES } from "./accountingModel.js";

export const PAYROLL_DISCLAIMER = "Deductions are the amounts you enter. MyFinTracker does not calculate provident fund, ESI, professional tax, or income tax, and nothing is filed.";

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

export const PAY_TYPES = [
  { id: "monthly", label: "Monthly salary" },
  { id: "daily", label: "Daily wage" },
  { id: "hourly", label: "Hourly wage" },
];

// Ledger for money given to staff ahead of pay. Created the first time an advance is recorded.
export const STAFF_ADVANCE_CODE = "1210";
export const GRATUITY_CODE = "5015";

const PAY_TYPE_IDS = new Set(PAY_TYPES.map(row => row.id));

export function payTypeOf(profile) {
  return PAY_TYPE_IDS.has(profile?.payType) ? profile.payType : "monthly";
}

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

export function payrollMonthChoices({ today, booksStartedOn = "", selected = "" } = {}) {
  const anchor = monthStart(String(today || "").slice(0, 10));
  if (!anchor) return [];
  const [year, month] = anchor.split("-").map(Number);
  const latest = new Date(Date.UTC(year, month, 1));
  let earliest = new Date(Date.UTC(year, month - 24, 1));
  const books = monthStart(booksStartedOn);
  if (books) {
    const [bookYear, bookMonth] = books.split("-").map(Number);
    const opened = new Date(Date.UTC(bookYear, bookMonth - 1, 1));
    if (opened > earliest && opened <= latest) earliest = opened;
  }
  const choices = [];
  for (let cursor = latest; cursor >= earliest; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1))) {
    const value = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    choices.push({ value, label: monthLabel(`${value}-01`) });
  }
  const picked = String(selected || "").slice(0, 7);
  if (picked && !choices.some(row => row.value === picked)) {
    choices.push({ value: picked, label: monthLabel(`${picked}-01`) || picked });
    choices.sort((a, b) => (a.value < b.value ? 1 : -1));
  }
  return choices;
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

// Pay cannot be dated after today. Use the month end once that day has arrived.
export function defaultPayDate(monthIso, today) {
  const end = monthEnd(monthIso);
  const day = String(today || "").slice(0, 10);
  if (!end) return day;
  if (!day) return end;
  return end > day ? day : end;
}

// A stored line was actually part of the pay run: a salary, an earned amount, or a voucher.
// Someone with no salary and no voucher was not paid, even if the line was saved.
export function salaryRecorded(line) {
  if (!line) return false;
  if (line.voucherId) return true;
  if (Number(line.earned) > 0) return true;
  if (Number(line.gross) > 0) return true;
  return Number(line.basic || 0) + Number(line.hra || 0) + Number(line.allowance || 0) > 0;
}

export function defaultStatus(weekday) {
  return weekday === 0 ? "week_off" : "present";
}

export function leaveCovering(leaves, partyId, date) {
  return (leaves || []).find(row => row.partyId === partyId && row.fromDate <= date && row.toDate >= date) || null;
}

export function isHoliday(holidays, date) {
  return (holidays || []).some(row => row.date === date);
}

// A company holiday is a paid day off until someone marks the day differently.
export function defaultDayStatus(weekday, date, holidays) {
  return isHoliday(holidays, date) ? "holiday" : defaultStatus(weekday);
}

const dayHours = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(24, number) : 0;
};

export function resolveDay({ partyId, date, weekday, days, leaves, holidays }) {
  const leave = leaveCovering(leaves, partyId, date);
  if (leave) return { status: "leave", leaveType: leave.leaveType, source: "leave", hours: 0, overtimeHours: 0 };
  const marked = (days || []).find(row => row.partyId === partyId && row.workDate === date);
  if (marked && STATUS_IDS.has(marked.status)) {
    return {
      status: marked.status,
      leaveType: null,
      source: "marked",
      hours: dayHours(marked.hours),
      overtimeHours: dayHours(marked.overtimeHours),
    };
  }
  return { status: defaultDayStatus(weekday, date, holidays), leaveType: null, source: "default", hours: 0, overtimeHours: 0 };
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
    payType: "monthly",
    rate: 0,
    overtimeRate: 0,
    paidLeaveQuota: 0,
    sickLeaveQuota: 0,
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

const RUPEE_SMALL = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const RUPEE_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigitWords = value => {
  const number = Number(value) || 0;
  if (number < 20) return RUPEE_SMALL[number];
  const ten = RUPEE_TENS[Math.floor(number / 10)];
  const one = number % 10;
  return one ? `${ten} ${RUPEE_SMALL[one]}` : ten;
};

const threeDigitWords = value => {
  const number = Number(value) || 0;
  const hundred = Math.floor(number / 100);
  const rest = number % 100;
  return [hundred ? `${RUPEE_SMALL[hundred]} Hundred` : "", rest ? twoDigitWords(rest) : ""].filter(Boolean).join(" ");
};

export function rupeesInWords(amount) {
  const value = Math.abs(Number(amount) || 0);
  const rupees = Math.floor(value + 1e-6);
  const paise = Math.round((value - rupees) * 100);
  if (!rupees && !paise) return "Rupees Zero Only";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  const parts = [];
  if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (rest) parts.push(threeDigitWords(rest));
  const words = parts.join(" ");
  const body = paise ? `${words ? `${words} and ` : ""}${twoDigitWords(paise)} Paise` : words;
  return `Rupees ${body} Only`;
}

export function deductionTotal(parts) {
  const row = deductionParts(parts);
  return roundMoney(row.pf + row.esi + row.professionalTax + row.tds + row.otherDeduction);
}

const positive = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? roundMoney(number) : 0;
};

// One-off pay for a single month. overtimeAmount stays null until someone types an amount,
// so the hours on the attendance sheet decide it.
export function payExtras(source) {
  const typed = source?.overtimeAmount;
  const overtimeAmount = typed === null || typed === undefined || typed === "" ? null : positive(typed);
  return { bonus: positive(source?.bonus), incentive: positive(source?.incentive), overtimeAmount };
}

export function advanceOutstanding(advance) {
  return roundMoney(Math.max(0, Number(advance?.amount || 0) - Number(advance?.recovered || 0)));
}

// What comes out of this month's pay for money already given to the employee.
// A loan recovers its instalment. An advance with no instalment recovers in full.
// Recovery never takes pay below zero: what does not fit stays outstanding for next month.
export function planRecoveries({ advances, partyId, month, available, overrides }) {
  const end = monthEnd(month);
  let left = roundMoney(Math.max(0, Number(available) || 0));
  const open = (advances || [])
    .filter(row => row.partyId === partyId && row.status === "open" && row.givenOn <= end && advanceOutstanding(row) > 0)
    .sort((a, b) => (a.givenOn === b.givenOn ? String(a.id).localeCompare(String(b.id)) : a.givenOn < b.givenOn ? -1 : 1));
  const plan = [];
  for (const advance of open) {
    const outstanding = advanceOutstanding(advance);
    const typed = overrides?.[advance.id];
    const wanted = typed === undefined || typed === null || typed === ""
      ? (Number(advance.emi) > 0 ? Math.min(Number(advance.emi), outstanding) : outstanding)
      : Math.min(positive(typed), outstanding);
    const amount = roundMoney(Math.min(wanted, left));
    left = roundMoney(left - amount);
    plan.push({ advanceId: advance.id, kind: advance.kind || "advance", outstanding, amount });
  }
  return plan;
}

export function buildPayLine({ partyId, month, profile, days, leaves, deductions, holidays, extras, advances, recoveryOverrides }) {
  const dates = monthDates(month);
  const payType = payTypeOf(profile);
  const rate = positive(profile?.rate);
  let halves = 0;
  let paidHalves = 0;
  let workedHalves = 0;
  let hours = 0;
  let overtimeHours = 0;
  for (const day of dates) {
    const resolved = resolveDay({ partyId, date: day.date, weekday: day.weekday, days, leaves, holidays });
    const lost = lopUnits(resolved);
    halves += lost;
    paidHalves += resolved.status === "half" ? 1 : lost > 0 ? 0 : 2;
    if (resolved.status === "present") workedHalves += 2;
    else if (resolved.status === "half") workedHalves += 1;
    else if (resolved.status === "leave" && resolved.leaveType !== "unpaid") workedHalves += 2;
    if (resolved.status === "present" || resolved.status === "half") hours += resolved.hours;
    overtimeHours += resolved.overtimeHours;
  }
  hours = Math.round(hours * 100) / 100;
  overtimeHours = Math.round(overtimeHours * 100) / 100;
  const workedDays = workedHalves / 2;
  let basis = Number(profile?.dayBasis) > 0 ? Number(profile.dayBasis) : dates.length;
  let lopDays = halves / 2;
  let paidDays = paidHalves / 2;
  let gross;
  let baseEarned;
  if (payType === "daily") {
    // Paid for the days worked and for paid leave. Weekly offs and holidays are not paid.
    gross = roundMoney(rate * workedDays);
    baseEarned = gross;
    basis = dates.length;
    lopDays = 0;
    paidDays = workedDays;
  } else if (payType === "hourly") {
    gross = roundMoney(rate * hours);
    baseEarned = gross;
    basis = dates.length;
    lopDays = 0;
    paidDays = workedDays;
  } else {
    gross = monthlyGross(profile);
    const lossAmount = basis > 0 ? roundMoney(gross * lopDays / basis) : 0;
    baseEarned = roundMoney(Math.max(0, gross - lossAmount));
  }
  const extra = payExtras(extras);
  const overtime = extra.overtimeAmount === null
    ? roundMoney(positive(profile?.overtimeRate) * overtimeHours)
    : extra.overtimeAmount;
  const earned = roundMoney(baseEarned + overtime + extra.bonus + extra.incentive);
  const parts = deductionParts(deductions || profile);
  const held = deductionTotal(parts);
  const recoveries = held > earned ? [] : planRecoveries({
    advances,
    partyId,
    month,
    available: earned - held,
    overrides: recoveryOverrides,
  }).filter(row => row.amount > 0);
  const advanceRecovery = roundMoney(recoveries.reduce((sum, row) => sum + row.amount, 0));
  const error = held > earned ? "Deductions are more than the salary earned." : "";
  const net = error ? 0 : roundMoney(earned - held - advanceRecovery);
  return {
    partyId,
    payType,
    rate,
    paidDays,
    lopDays,
    workedDays,
    hours,
    overtimeHours,
    basis,
    gross,
    baseEarned,
    overtime,
    bonus: extra.bonus,
    incentive: extra.incentive,
    extras: extra,
    earned,
    deductions: parts,
    deductionTotal: held,
    recoveries,
    advanceRecovery,
    net,
    error,
    voucherId: null,
  };
}

// The pay on record: a monthly salary, or the rate for someone paid by the day or the hour.
const recordedMonthly = (profile, saved) => {
  if (profile && payTypeOf(profile) !== "monthly") return positive(profile.rate);
  if (profile) return monthlyGross(profile);
  if (saved?.payType && saved.payType !== "monthly") return positive(saved.rate);
  return roundMoney(Number(saved?.basic || 0) + Number(saved?.hra || 0) + Number(saved?.allowance || 0));
};

export function payrollRows({ employees, month, profiles, days, leaves, overrides = {}, run = null, holidays = [], advances = [], extrasByParty = {} }) {
  const posted = run?.status === "posted";
  const stored = run?.lines || [];
  const people = [...(employees || [])];
  if (posted) {
    const ids = new Set(people.map(person => person.id));
    for (const line of stored) {
      if (line.partyId && !ids.has(line.partyId)) people.push({ id: line.partyId, name: line.name || "Employee" });
    }
  }
  return people.map(person => {
    const profile = (profiles || []).find(row => row.partyId === person.id) || null;
    const saved = stored.find(line => line.partyId === person.id) || null;
    const monthly = recordedMonthly(profile, saved);
    if (posted && saved && salaryRecorded(saved)) {
      const unfinished = Number(saved.earned) > 0 && saved.sourceId && !saved.voucherId;
      if (!unfinished) {
        return {
          ...saved,
          payType: saved.payType || "monthly",
          deductions: deductionParts(saved.deductions),
          name: person.name || saved.name || "Employee",
          error: "",
          monthly,
          inRun: true,
        };
      }
      return {
        ...saved,
        deductions: deductionParts(saved.deductions),
        name: person.name || saved.name || "Employee",
        error: "",
        monthly,
        inRun: false,
        voucherId: null,
        sourceId: saved.sourceId || null,
      };
    }
    const source = profile || emptyProfile(person.id);
    const typed = posted ? null : (extrasByParty[person.id] || saved?.extras || null);
    const line = buildPayLine({
      partyId: person.id,
      month,
      profile: source,
      days,
      leaves,
      holidays,
      advances,
      extras: typed,
      recoveryOverrides: typed?.recoveries || null,
      deductions: posted ? source : (overrides[person.id] || saved?.deductions || source),
    });
    return {
      ...line,
      name: person.name,
      monthly,
      inRun: !posted,
      voucherId: posted ? null : (saved?.voucherId || null),
      sourceId: posted ? null : (saved?.sourceId || null),
    };
  });
}

// Pay lost to absence. Lines saved before overtime and bonus existed have no baseEarned.
export function lossOfPay(row) {
  const base = row?.baseEarned === undefined || row?.baseEarned === null ? row?.earned : row.baseEarned;
  return roundMoney(Math.max(0, Number(row?.gross || 0) - Number(base || 0)));
}

export function payrollSummary(rows) {
  const list = rows || [];
  let monthly = 0;
  let monthNet = 0;
  let monthDeductions = 0;
  let recorded = 0;
  let inMonth = 0;
  for (const row of list) {
    const gross = Number(row.monthly || 0);
    // A daily or hourly rate is not a month's pay: count what the attendance earned instead.
    const waged = row.payType && row.payType !== "monthly";
    monthly = roundMoney(monthly + (waged ? Number(row.gross || 0) : gross));
    if (gross > 0) recorded += 1;
    if (row.inRun === false) continue;
    inMonth += 1;
    monthNet = roundMoney(monthNet + Number(row.net || 0));
    const loss = lossOfPay(row);
    monthDeductions = roundMoney(monthDeductions + Number(row.deductionTotal || 0) + Number(row.advanceRecovery || 0) + loss);
  }
  return {
    employees: list.length,
    recorded,
    unset: list.length - recorded,
    monthly,
    monthNet,
    monthDeductions,
    inMonth,
    later: list.length - inMonth,
  };
}

export function payrollRegisterExport(rows) {
  return [
    ["Employee", "Monthly salary", "Paid days", "Loss of pay days", "This month", "Deductions", "In this pay"],
    ...(rows || []).map(row => [
      row.name || "Employee",
      Number(row.monthly || 0),
      Number(row.paidDays || 0),
      Number(row.lopDays || 0),
      Number(row.net || 0),
      Number(row.deductionTotal || 0),
      row.inRun === false ? "Not posted" : "Yes",
    ]),
  ];
}

export function payState({ posted, inRun, monthly, error }) {
  if (error) return "check";
  if (posted && inRun) return "posted";
  if (posted && !inRun) return "later";
  if (!(Number(monthly) > 0)) return "unset";
  return "ready";
}

export function payrollVoucherLines({ accounts, payAccountId, earned, deductionTotal: held, advanceRecovery = 0, partyId, description }) {
  const salary = findAccount(accounts, { code: SYSTEM_CODES.salary });
  if (!salary) throw new Error("Add a Salary ledger before posting pay.");
  const gross = roundMoney(earned);
  const deductions = roundMoney(held);
  const recovered = roundMoney(advanceRecovery);
  const net = roundMoney(gross - deductions - recovered);
  if (gross < 0 || deductions < 0 || recovered < 0 || net < 0) throw new Error("Deductions are more than the salary earned.");
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
  if (recovered > 0) {
    const advances = findAccount(accounts, { code: STAFF_ADVANCE_CODE });
    if (!advances) throw new Error("Add the Staff advances ledger before recovering an advance.");
    lines.push({
      coaId: advances.id,
      code: advances.code,
      partyId,
      debit: 0,
      credit: recovered,
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

export function attendanceMarks({ partyId, month, days, leaves, holidays }) {
  const marks = {};
  for (const day of monthDates(month)) {
    const resolved = resolveDay({ partyId, date: day.date, weekday: day.weekday, days, leaves, holidays });
    if (resolved.source !== "leave") marks[day.date] = resolved.status;
  }
  return marks;
}

// Hours typed on the attendance sheet, by date.
export function attendanceHours({ partyId, month, days }) {
  const start = monthStart(month);
  const end = monthEnd(month);
  const hours = {};
  for (const row of days || []) {
    if (row.partyId !== partyId || row.workDate < start || row.workDate > end) continue;
    const worked = dayHours(row.hours);
    const overtime = dayHours(row.overtimeHours);
    if (worked > 0 || overtime > 0) hours[row.workDate] = { hours: worked, overtimeHours: overtime };
  }
  return hours;
}

// Only the days that differ from the default are stored, plus any day with hours on it.
export function attendanceExceptions({ partyId, month, marks, leaves, holidays, hours }) {
  const rows = [];
  for (const day of monthDates(month)) {
    if (leaveCovering(leaves, partyId, day.date)) continue;
    const usual = defaultDayStatus(day.weekday, day.date, holidays);
    const status = marks?.[day.date] || usual;
    if (!STATUS_IDS.has(status)) continue;
    const worked = dayHours(hours?.[day.date]?.hours);
    const overtime = dayHours(hours?.[day.date]?.overtimeHours);
    if (status !== usual || worked > 0 || overtime > 0) {
      const row = { date: day.date, status };
      if (worked > 0) row.hours = worked;
      if (overtime > 0) row.overtimeHours = overtime;
      rows.push(row);
    }
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
