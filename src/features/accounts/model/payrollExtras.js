import { roundMoney } from "./accountingModel.js";
import {
  advanceOutstanding,
  lossOfPay,
  monthLabel,
  monthStart,
  payTypeOf,
  rupeesInWords,
} from "./payroll.js";

export const ADVANCE_KINDS = [
  { id: "advance", label: "Salary advance" },
  { id: "loan", label: "Staff loan" },
];

export const GRATUITY_CEILING = 2000000;

const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ---------- Advances and loans ---------- */

export function assertAdvanceDraft(draft, today) {
  if (!draft?.partyId) return "Choose an employee.";
  if (!ADVANCE_KINDS.some(kind => kind.id === draft.kind)) return "Choose advance or loan.";
  if (!draft.givenOn) return "Choose the date the money was given.";
  if (today && draft.givenOn > today) return "The date cannot be after today.";
  const amount = number(draft.amount);
  if (!(amount > 0)) return "Enter the amount given.";
  const emi = number(draft.emi);
  if (emi < 0) return "The monthly recovery cannot be negative.";
  if (emi > amount) return "The monthly recovery is more than the amount given.";
  if (draft.kind === "loan" && !(emi > 0)) return "Enter how much to recover each month.";
  if (draft.postToBooks !== false && !draft.payAccountId) return "Choose the account the money was paid from.";
  return "";
}

export function advanceSummary(advances) {
  const open = (advances || []).filter(row => row.status === "open");
  return {
    open: open.length,
    outstanding: roundMoney(open.reduce((sum, row) => sum + advanceOutstanding(row), 0)),
    given: roundMoney(open.reduce((sum, row) => sum + number(row.amount), 0)),
  };
}

export function monthsToRecover(advance) {
  const emi = number(advance?.emi);
  const left = advanceOutstanding(advance);
  if (!(left > 0)) return 0;
  return emi > 0 ? Math.ceil(left / emi) : 1;
}

export function advanceVoucherLines({ advanceAccount, payAccount, amount, partyId, description }) {
  const value = roundMoney(amount);
  if (!advanceAccount) throw new Error("Add the Staff advances ledger first.");
  if (!payAccount || !["cash", "bank", "upi"].includes(payAccount.accountType)) throw new Error("An advance is paid from cash, bank, or UPI.");
  if (!(value > 0)) throw new Error("Enter the amount given.");
  return [
    { coaId: advanceAccount.id, code: advanceAccount.code, partyId, debit: value, credit: 0, description },
    { coaId: payAccount.id, code: payAccount.code, debit: 0, credit: value, description },
  ];
}

/* ---------- Leave balances ---------- */

const LEAVE_QUOTA_FIELD = { paid: "paidLeaveQuota", sick: "sickLeaveQuota" };

// Leave allowed in a calendar year, less the leave already recorded in that year.
export function leaveBalance({ profile, used, partyId }) {
  const balance = {};
  for (const [type, field] of Object.entries(LEAVE_QUOTA_FIELD)) {
    const quota = Math.max(0, number(profile?.[field]));
    const taken = (used || [])
      .filter(row => row.partyId === partyId && row.leaveType === type)
      .reduce((sum, row) => sum + number(row.days), 0);
    balance[type] = { quota, used: taken, left: quota > 0 ? quota - taken : null };
  }
  return balance;
}

// Warn, never block: the owner may still grant leave beyond the balance.
export function leaveOverBalance({ balance, leaveType, days }) {
  const row = balance?.[leaveType];
  if (!row || row.left === null) return "";
  if (days <= row.left) return "";
  const left = Math.max(0, row.left);
  return `Only ${left} ${left === 1 ? "day" : "days"} of this leave ${left === 1 ? "is" : "are"} left this year.`;
}

/* ---------- Salary revisions ---------- */

// The pay that applies to a month: the latest revision that had started by the 1st.
export function profileForMonth(profile, revisions, month) {
  if (!profile) return profile;
  const start = monthStart(month);
  const mine = (revisions || [])
    .filter(row => row.partyId === profile.partyId && row.effectiveFrom <= start)
    .sort((a, b) => (a.effectiveFrom === b.effectiveFrom
      ? String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
      : a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const revision = mine[mine.length - 1];
  if (!revision) return profile;
  return {
    ...profile,
    payType: revision.payType || "monthly",
    basic: number(revision.basic),
    hra: number(revision.hra),
    allowance: number(revision.allowance),
    rate: number(revision.rate),
  };
}

export function revisionAmount(revision) {
  if (payTypeOf(revision) !== "monthly") return roundMoney(revision?.rate);
  return roundMoney(number(revision?.basic) + number(revision?.hra) + number(revision?.allowance));
}

export function revisionChange(revision, previous) {
  if (!previous) return null;
  if (payTypeOf(revision) !== payTypeOf(previous)) return null;
  const before = revisionAmount(previous);
  const after = revisionAmount(revision);
  if (!(before > 0)) return null;
  return { amount: roundMoney(after - before), percent: Math.round(((after - before) / before) * 1000) / 10 };
}

/* ---------- Final settlement ---------- */

const dayNumber = iso => {
  const time = Date.parse(`${String(iso || "").slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? Math.round(time / 86400000) : null;
};

export function serviceLength(joinedOn, lastDay) {
  const from = dayNumber(joinedOn);
  const to = dayNumber(lastDay);
  if (from === null || to === null || to < from) return { days: 0, years: 0, months: 0 };
  const [fy, fm, fd] = joinedOn.slice(0, 10).split("-").map(Number);
  const end = new Date((to + 1) * 86400000);
  let months = (end.getUTCFullYear() - fy) * 12 + (end.getUTCMonth() + 1 - fm);
  if (end.getUTCDate() < fd) months -= 1;
  months = Math.max(0, months);
  return { days: to - from + 1, years: Math.floor(months / 12), months: months % 12 };
}

// Gratuity estimate: 15 days of wages for each year of service, on a 26-day month.
// Wages are basic pay, and never less than half of the monthly salary.
// Five years of service are needed, or one year for a fixed-term employee, who is paid pro rata.
export function gratuityEstimate({ basic, monthlySalary, joinedOn, lastDay, fixedTerm = false }) {
  const service = serviceLength(joinedOn, lastDay);
  const wages = roundMoney(Math.max(number(basic), number(monthlySalary) / 2));
  const none = reason => ({ eligible: false, reason, years: 0, wages, amount: 0, service });
  if (!joinedOn || !lastDay) return none("Add the joining date and the last working day.");
  if (!(wages > 0)) return none("Gratuity needs a monthly salary on record.");
  if (fixedTerm) {
    if (service.years < 1) return none("A fixed-term employee needs one year of service.");
    const years = Math.round((service.years + service.months / 12) * 100) / 100;
    return { eligible: true, reason: "", years, wages, amount: Math.min(GRATUITY_CEILING, roundMoney(wages * 15 / 26 * years)), service };
  }
  if (service.years < 5) return none("Gratuity needs five years of service.");
  const years = service.years + (service.months > 6 ? 1 : 0);
  return { eligible: true, reason: "", years, wages, amount: Math.min(GRATUITY_CEILING, roundMoney(wages * 15 / 26 * years)), service };
}

export function settlementTotals(draft) {
  const unpaidSalary = Math.max(0, roundMoney(draft?.unpaidSalary));
  const leaveDays = Math.max(0, number(draft?.leaveDays));
  const perDay = Math.max(0, roundMoney(draft?.perDay));
  const leaveEncashment = roundMoney(leaveDays * perDay);
  const gratuity = Math.max(0, roundMoney(draft?.gratuity));
  const otherPay = Math.max(0, roundMoney(draft?.otherPay));
  const advanceRecovery = Math.max(0, roundMoney(draft?.advanceRecovery));
  const otherDeduction = Math.max(0, roundMoney(draft?.otherDeduction));
  const payable = roundMoney(unpaidSalary + leaveEncashment + gratuity + otherPay);
  const held = roundMoney(advanceRecovery + otherDeduction);
  const error = held > payable ? "Recoveries are more than the amount due. Collect the rest from the employee separately." : "";
  return {
    unpaidSalary,
    leaveDays,
    perDay,
    leaveEncashment,
    gratuity,
    otherPay,
    advanceRecovery,
    otherDeduction,
    payable,
    held,
    net: error ? 0 : roundMoney(payable - held),
    error,
  };
}

export function settlementVoucherLines({ salaryAccount, gratuityAccount, advanceAccount, deductionAccount, payAccount, totals, partyId, description }) {
  if (totals.error) throw new Error(totals.error);
  if (!salaryAccount) throw new Error("Add a Salary ledger before posting the settlement.");
  const lines = [];
  const salaryPart = roundMoney(totals.unpaidSalary + totals.leaveEncashment + totals.otherPay);
  if (salaryPart > 0) lines.push({ coaId: salaryAccount.id, code: salaryAccount.code, partyId, debit: salaryPart, credit: 0, description });
  if (totals.gratuity > 0) {
    const ledger = gratuityAccount || salaryAccount;
    lines.push({ coaId: ledger.id, code: ledger.code, partyId, debit: totals.gratuity, credit: 0, description: `${description} · Gratuity` });
  }
  if (totals.advanceRecovery > 0) {
    if (!advanceAccount) throw new Error("Add the Staff advances ledger before recovering an advance.");
    lines.push({ coaId: advanceAccount.id, code: advanceAccount.code, partyId, debit: 0, credit: totals.advanceRecovery, description });
  }
  if (totals.otherDeduction > 0) {
    if (!deductionAccount) throw new Error("Add the Salary deductions payable ledger before posting deductions.");
    lines.push({ coaId: deductionAccount.id, code: deductionAccount.code, debit: 0, credit: totals.otherDeduction, description });
  }
  if (totals.net > 0) {
    if (!payAccount || !["cash", "bank", "upi"].includes(payAccount.accountType)) throw new Error("Choose the account the settlement is paid from.");
    lines.push({ coaId: payAccount.id, code: payAccount.code, debit: 0, credit: totals.net, description });
  }
  const debit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0));
  if (!lines.length || debit !== credit) throw new Error("Settlement lines do not balance.");
  return lines;
}

/* ---------- Bank payment file ---------- */

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function assertBankDetails(staff) {
  const account = String(staff?.bankAccount || "").replace(/\s+/g, "");
  const ifsc = String(staff?.bankIfsc || "").trim().toUpperCase();
  if (!account && !ifsc) return "";
  if (!/^[0-9]{6,18}$/.test(account)) return "The account number is 6 to 18 digits.";
  if (!IFSC_PATTERN.test(ifsc)) return "The IFSC is 11 characters, like HDFC0001234.";
  return "";
}

// One row per employee paid by bank transfer. Banks take this layout, or a close one,
// for a bulk NEFT or IMPS upload. Anyone without bank details is listed so they can be paid by hand.
export function bankPaymentFile({ rows, staff, month, companyName = "" }) {
  const header = ["Beneficiary name", "Account number", "IFSC", "Amount", "Narration"];
  const lines = [];
  const missing = [];
  let total = 0;
  const narration = `Salary ${monthLabel(month)}${companyName ? ` ${companyName}` : ""}`.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 30).trim();
  for (const row of rows || []) {
    if (row.inRun === false || row.error || !(number(row.net) > 0)) continue;
    const details = (staff || []).find(item => item.partyId === row.partyId);
    const account = String(details?.bankAccount || "").replace(/\s+/g, "");
    const ifsc = String(details?.bankIfsc || "").trim().toUpperCase();
    if (!account || !IFSC_PATTERN.test(ifsc)) {
      missing.push(row.name || "Employee");
      continue;
    }
    const amount = roundMoney(row.net);
    total = roundMoney(total + amount);
    // A leading apostrophe-free text cell: the tab keeps spreadsheets from turning a long account number into 1.23E+15.
    lines.push([String(details.bankHolder || row.name || "").trim(), `\t${account}`, ifsc, amount.toFixed(2), narration]);
  }
  return { rows: [header, ...lines], count: lines.length, total, missing };
}

/* ---------- Payslip ---------- */

const rupee = value => `Rs. ${roundMoney(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function payslipEarnings(slip) {
  const lines = [];
  if (payTypeOf(slip) === "daily") {
    lines.push({ label: `Daily wage · ${number(slip.workedDays)} days at ${roundMoney(slip.rate)}`, amount: roundMoney(slip.gross) });
  } else if (payTypeOf(slip) === "hourly") {
    lines.push({ label: `Hourly wage · ${number(slip.hours)} hours at ${roundMoney(slip.rate)}`, amount: roundMoney(slip.gross) });
  } else {
    lines.push({ label: "Basic", amount: roundMoney(slip.basic) });
    lines.push({ label: "House rent allowance", amount: roundMoney(slip.hra) });
    lines.push({ label: "Other allowance", amount: roundMoney(slip.allowance) });
  }
  if (number(slip.overtime) > 0) lines.push({ label: number(slip.overtimeHours) > 0 ? `Overtime · ${number(slip.overtimeHours)} hours` : "Overtime", amount: roundMoney(slip.overtime) });
  if (number(slip.bonus) > 0) lines.push({ label: "Bonus", amount: roundMoney(slip.bonus) });
  if (number(slip.incentive) > 0) lines.push({ label: "Incentive", amount: roundMoney(slip.incentive) });
  return lines;
}

export function payslipDeductions(slip) {
  const parts = slip?.deductions || {};
  const lines = [
    { label: "Loss of pay", amount: lossOfPay(slip) },
    { label: "Provident fund", amount: roundMoney(parts.pf) },
    { label: "ESI", amount: roundMoney(parts.esi) },
    { label: "Professional tax", amount: roundMoney(parts.professionalTax) },
    { label: "Tax deducted", amount: roundMoney(parts.tds) },
    { label: "Other deduction", amount: roundMoney(parts.otherDeduction) },
  ];
  if (number(slip?.advanceRecovery) > 0) lines.push({ label: "Advance or loan recovery", amount: roundMoney(slip.advanceRecovery) });
  return lines;
}

export function payslipTotals(slip) {
  const earnings = roundMoney(payslipEarnings(slip).reduce((sum, row) => sum + row.amount, 0));
  const deductions = roundMoney(payslipDeductions(slip).reduce((sum, row) => sum + row.amount, 0));
  return { earnings, deductions, net: roundMoney(slip?.net) };
}

// Rows for the shared table PDF. Plain "Rs." because the PDF's built-in font has no rupee sign.
export function payslipPdfRows({ slip, payDate = "" }) {
  const totals = payslipTotals(slip);
  const rows = [["Item", "Amount"]];
  rows.push(["Employee", slip.name || "Employee"]);
  if (payDate) rows.push(["Pay date", payDate]);
  rows.push(["Paid days", `${number(slip.paidDays)} of ${number(slip.basis)}`]);
  rows.push(["Earnings"]);
  for (const row of payslipEarnings(slip)) rows.push([row.label.replace(/·/g, "-"), rupee(row.amount)]);
  rows.push(["Total earnings", rupee(totals.earnings)]);
  rows.push(["Deductions"]);
  for (const row of payslipDeductions(slip)) if (row.amount > 0) rows.push([row.label, rupee(row.amount)]);
  rows.push(["Total deductions", rupee(totals.deductions)]);
  rows.push(["Net pay", rupee(totals.net)]);
  rows.push([rupeesInWords(totals.net)]);
  return rows;
}

export function payslipMessage({ slip, month, companyName = "" }) {
  const totals = payslipTotals(slip);
  const lines = [
    `${companyName || "Payslip"} · ${monthLabel(month)}`,
    `${slip.name || "Employee"}`,
    `Paid days: ${number(slip.paidDays)} of ${number(slip.basis)}`,
    `Earnings: ₹${totals.earnings.toLocaleString("en-IN")}`,
    `Deductions: ₹${totals.deductions.toLocaleString("en-IN")}`,
    `Net pay: ₹${totals.net.toLocaleString("en-IN")}`,
  ];
  return lines.join("\n");
}

export function payslipFileName({ slip, month }) {
  const person = String(slip?.name || "employee").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "employee";
  return `payslip-${String(month || "").slice(0, 7)}-${person}.pdf`;
}

/* ---------- Punches ---------- */

export function punchHours(inAt, outAt) {
  const start = Date.parse(inAt || "");
  const end = Date.parse(outAt || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(24, Math.round(((end - start) / 3600000) * 100) / 100);
}

export function mapLink(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return "";
  return `https://www.google.com/maps?q=${a.toFixed(6)},${b.toFixed(6)}`;
}

export function staffPortalInvite({ name, staffId, pin, url, companyName = "" }) {
  return [
    `Hello ${name || ""}`.trim() + ",",
    `${companyName || "Your employer"} has set up your staff login.`,
    `Open: ${url}`,
    `Staff ID: ${staffId}`,
    `PIN: ${pin}`,
    "Use it to mark attendance, see payslips, and ask for leave. Do not share the PIN.",
  ].join("\n");
}
