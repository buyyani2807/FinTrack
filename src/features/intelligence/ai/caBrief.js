import { isPosted, isReversalVoucher } from "../../accounts/model/accountingModel.js";
import { profitAndLoss, trialBalance } from "../../accounts/model/accountingReports.js";
import { assertAdvisoryText, daysBetween, formatInr, isoDate } from "./aiCommon.js";
import { buildAnomalyAlerts } from "./anomalyDetection.js";
import { buildGstWarnings } from "./gstAssistant.js";
import { buildMonthEndReadiness, defaultCloseMonth, monthRange } from "./monthEndReadiness.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAIN_TYPES = [
  ["sales", "Sales"],
  ["purchase", "Purchases"],
  ["receipt", "Receipts"],
  ["payment", "Payments"],
];
const OTHER_TYPES = [
  ["journal", "Journals"],
  ["contra", "Transfers"],
  ["credit_note", "Credit notes"],
  ["debit_note", "Debit notes"],
];

export const CA_BRIEF_DISCLAIMER = "Prepared from posted records in this company. This is not an audit opinion. Nothing has been filed, and no record was changed to produce it.";

const monthTitle = key => {
  const [year, month] = String(key || "").split("-");
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : String(key || "");
};

const formatDay = iso => {
  const [year, month, day] = isoDate(iso).split("-");
  const name = MONTHS_SHORT[Number(month) - 1];
  return name && day ? `${Number(day)} ${name} ${year}` : isoDate(iso);
};

const countLabel = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

function postedInMonth(vouchers, range) {
  return (vouchers || []).filter(voucher => isPosted(voucher) && !isReversalVoucher(voucher) && isoDate(voucher.date) >= range.from && isoDate(voucher.date) <= range.to);
}

function questionFor(check, title, gstTitles) {
  switch (check.key) {
    case "bank_reconciliation":
      return check.value === "No statement lines"
        ? `Ask the owner for the ${title} bank statement. No statement lines are in the books.`
        : `Ask the owner which of the ${countLabel(check.count, "unmatched bank line", "unmatched bank lines")} belong to ${title}. ${check.value}.`;
    case "unreconciled_payments":
      return `Ask what the ${countLabel(check.count, "unmatched money-out line", "unmatched money-out lines")} ${check.count === 1 ? "was" : "were"} for. ${check.count === 1 ? "It totals" : "They total"} ${check.value}.`;
    case "uncategorised":
      return `Ask which ledger should replace the suspense or uncategorised ledger on ${countLabel(check.count, "voucher", "vouchers")}.`;
    case "duplicates":
      return `Ask whether the ${countLabel(check.count, "similar pair", "similar pairs")} ${check.count === 1 ? "is" : "are"} one payment recorded twice or two separate payments.`;
    case "missing_invoices":
      return `Ask why these sales invoice numbers are missing: ${check.value}.`;
    case "outstanding_expenses":
      return `Ask which overdue supplier bills will be paid, and which are disputed. They total ${check.value}.`;
    case "gst_issues":
      return gstTitles.length
        ? `Ask the owner to confirm these GST warnings before anyone prepares the return: ${gstTitles.join("; ")}.`
        : `Ask the owner to confirm the ${countLabel(check.count, "GST warning", "GST warnings")} before anyone prepares the return.`;
    case "negative_inventory":
      return `Ask how recorded stock went below zero: ${check.value}.`;
    default:
      return `Ask the owner about ${check.label}: ${check.detail}`;
  }
}

function briefText(brief) {
  const lines = [
    "Brief for the CA",
    brief.companyName,
    brief.gstin ? `GSTIN ${brief.gstin}` : null,
    brief.monthTitle,
    `Prepared ${brief.preparedOn}`,
    brief.locked ? "This month is locked." : "This month is open. Locking it is a separate step.",
    "",
    brief.disclaimer,
    "",
    "What changed",
    ...brief.changed.map(row => `${row.label}: ${row.value}`),
    "",
    "What does not match",
    ...(brief.mismatches.length
      ? brief.mismatches.map(row => `${row.title}. ${row.detail}`)
      : ["Nothing in these checks is still open."]),
    "",
    "Questions for the owner",
    ...brief.questions.map((question, index) => `${index + 1}. ${question}`),
  ];
  return lines.filter(line => line != null).join("\n");
}

/**
 * One page for the company's CA: what changed in the month, what still does not match, and what to ask
 * the owner. Reads the same checks as month-end readiness. It does not file, post, lock, or send anything.
 */
export function buildCaBrief({
  company = {},
  month,
  asOf,
  accounts = [],
  vouchers = [],
  parties = [],
  items = [],
  stockMovements = [],
  locks = [],
  statements = [],
  voucherItemLines = [],
  resolvedKeys = new Set(),
  readiness: givenReadiness,
  gstWarnings: givenGstWarnings,
  anomalies: givenAnomalies,
} = {}) {
  const key = month || defaultCloseMonth(asOf);
  const range = monthRange(key);
  const title = monthTitle(key);
  const end = isoDate(asOf);
  const monthEnd = range.to < end ? range.to : end;
  const gstReview = givenGstWarnings ? null : buildGstWarnings({
    vouchers, parties, company, voucherItemLines, from: range.from, to: range.to,
  });
  const gstWarnings = givenGstWarnings || gstReview?.warnings || [];
  const anomalies = givenAnomalies || buildAnomalyAlerts({
    accounts, vouchers, parties, stockMovements, items, asOf: monthEnd,
    lookbackDays: Math.max(1, daysBetween(range.from, monthEnd) || 0),
  });
  const readiness = givenReadiness || buildMonthEndReadiness({
    month: key, asOf, accounts, vouchers, parties, items, stockMovements, locks, statements, resolvedKeys, anomalies, gstWarnings,
  });
  const pnl = profitAndLoss(accounts, vouchers, range);
  const books = trialBalance(accounts, vouchers, { to: range.to });
  const counts = {};
  for (const voucher of postedInMonth(vouchers, range)) counts[voucher.voucherType] = (counts[voucher.voucherType] || 0) + 1;

  const changed = [
    ...MAIN_TYPES.map(([type, label]) => ({ label, value: String(counts[type] || 0) })),
    ...OTHER_TYPES.filter(([type]) => counts[type]).map(([type, label]) => ({ label, value: String(counts[type]) })),
    { label: "Income", value: formatInr(pnl.totalIncome) },
    { label: "Expenses", value: formatInr(pnl.totalExpense) },
    { label: "Result", value: pnl.net > 0 ? `Profit ${formatInr(pnl.net)}` : pnl.net < 0 ? `Loss ${formatInr(Math.abs(pnl.net))}` : "Nil" },
    { label: "Trial balance", value: books.balanced ? "Agrees" : `Differs by ${formatInr(Math.abs(books.totalDebit - books.totalCredit))}` },
  ];

  const gstTitles = gstWarnings
    .filter(warning => warning.severity === "critical" || warning.severity === "high")
    .slice(0, 3)
    .map(warning => warning.title)
    .filter(Boolean);
  const mismatches = [];
  const questions = [];
  if (!books.balanced) {
    const diff = formatInr(Math.abs(books.totalDebit - books.totalCredit));
    mismatches.push({ title: "Trial balance", detail: `Debits ${formatInr(books.totalDebit)} and credits ${formatInr(books.totalCredit)} do not agree. The difference is ${diff}.`, severity: "critical" });
    questions.push(`Ask why debits and credits differ by ${diff}.`);
  }
  for (const check of readiness.checks) {
    const noStatement = check.key === "bank_reconciliation" && check.value === "No statement lines";
    if (!noStatement && (check.count === 0 || check.resolved)) continue;
    const detail = check.key === "gst_issues" && gstTitles.length ? gstTitles.join("; ") + "." : check.detail;
    mismatches.push({ title: check.label, detail, severity: check.severity });
    questions.push(questionFor({ ...check, detail }, title, gstTitles));
  }
  if (!questions.length) questions.push("Nothing in these checks needs a question.");

  const brief = {
    companyName: String(company?.name || "This company").trim() || "This company",
    gstin: String(company?.gstin || "").trim(),
    month: readiness.month,
    monthTitle: title,
    period: range,
    preparedOn: formatDay(end || range.to),
    locked: readiness.locked,
    disclaimer: CA_BRIEF_DISCLAIMER,
    changed,
    mismatches,
    questions,
    readinessPct: readiness.readinessPct,
    advisory: true,
    writeAction: "none",
  };
  brief.text = assertAdvisoryText(briefText(brief));
  return brief;
}
