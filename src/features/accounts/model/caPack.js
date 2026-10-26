import { dateIsLocked } from "./accountingModel.js";
import { profitAndLoss, trialBalance } from "./accountingReports.js";
import { profitResult } from "../accountsFormat.js";
import { itemProfitability } from "./itemProfitability.js";
import { periodStockValues } from "./inventoryValuation.js";
import { CA_BRIEF_DISCLAIMER } from "../../intelligence/ai/caBrief.js";
import { buildGstWarnings } from "../../intelligence/ai/gstAssistant.js";
import { assertAdvisoryText, formatInr, isoDate, source } from "../../intelligence/ai/aiCommon.js";
import { defaultCloseMonth, monthRange } from "../../intelligence/ai/monthEndReadiness.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

const inMonth = (date, range) => {
  const day = isoDate(date);
  return day >= range.from && day <= range.to;
};

const mark = (rows, reviewedKeys) => rows.map(row => ({ ...row, reviewed: reviewedKeys.has(row.key) }));

/**
 * One month's hand-over for the CA. Reads the books already loaded. Marking a row reviewed is stored
 * separately and does not remove the row, post an entry, file a return, or lock the month.
 */
export function buildCaPack({
  company = {},
  month,
  asOf,
  accounts = [],
  vouchers = [],
  parties = [],
  items = [],
  stockMovements = [],
  voucherItemLines = [],
  costLines = null,
  statements = [],
  locks = [],
  reviewedKeys = new Set(),
} = {}) {
  const key = month || defaultCloseMonth(asOf);
  const range = monthRange(key);
  const end = isoDate(asOf) || range.to;
  const stock = periodStockValues({
    items,
    movements: stockMovements,
    voucherItemLines: costLines || voucherItemLines,
    from: range.from,
    to: range.to,
  });
  const pnl = profitAndLoss(accounts, vouchers, range, { stock });
  const books = trialBalance(accounts, vouchers, { to: range.to });
  const result = profitResult(pnl.net);
  const difference = Math.abs(books.totalDebit - books.totalCredit);
  const gstWarnings = buildGstWarnings({
    vouchers, parties, company, voucherItemLines, from: range.from, to: range.to,
  }).warnings || [];
  const gst = mark(gstWarnings.map(warning => ({
    id: warning.id,
    key: `${key}:gst:${warning.id}`,
    kind: "gst",
    title: warning.title,
    detail: warning.explanation,
    record: warning.record || "",
    voucherId: warning.source?.voucherId || null,
    source: warning.source,
  })), reviewedKeys);

  const statementLines = (statements || []).flatMap(statement => (statement.lines || [])
    .filter(line => inMonth(line.lineDate, range))
    .map(line => ({ ...line, accountName: statement.accountName || "" })));
  const bank = mark(statementLines
    .filter(line => line.matchStatus !== "matched" && line.matchStatus !== "ignored")
    .map(line => ({
      id: line.id,
      key: `${key}:bank:${line.id}`,
      kind: "bank",
      title: line.description || line.reference || "Bank line",
      detail: line.accountName,
      date: isoDate(line.lineDate),
      amount: Number(line.amount || 0),
      direction: line.direction === "in" ? "In" : "Out",
      lineId: line.id,
      source: source("bank", "Open banking"),
    })), reviewedKeys);

  const profit = itemProfitability({
    items,
    movements: stockMovements,
    voucherItemLines,
    costLines: costLines || voucherItemLines,
    vouchers,
    parties,
    from: range.from,
    to: range.to,
  });
  const stockRows = mark(profit.rows.filter(row => row.needsReview).map(row => ({
    id: row.itemId,
    key: `${key}:stock:${row.itemId}`,
    kind: "stock",
    title: row.name,
    detail: row.warnings.map(warning => warning.message).join(" "),
    itemId: row.itemId,
    source: source("reports", "Open item", { reportTab: "item_profit", itemId: row.itemId }),
  })), reviewedKeys);

  const pack = {
    companyName: String(company?.name || "This company").trim() || "This company",
    gstin: String(company?.gstin || "").trim(),
    month: key,
    monthTitle: monthTitle(key),
    period: range,
    preparedOn: formatDay(end),
    locked: dateIsLocked(range.from, locks) && dateIsLocked(range.to, locks),
    disclaimer: CA_BRIEF_DISCLAIMER,
    books: {
      balanced: books.balanced,
      difference,
      income: pnl.totalIncome,
      expenses: pnl.totalExpense,
      openingStock: pnl.openingStock,
      closingStock: pnl.closingStock,
      resultLabel: result.label,
      resultAmount: result.amount,
      loss: result.loss,
    },
    gst,
    gstNote: gst.length ? "" : "No invoice in this month failed a GST check.",
    bank,
    bankNote: !statementLines.length
      ? "No bank statement lines in this month."
      : bank.length ? "" : "Every statement line in this month is matched.",
    stock: stockRows,
    stockNote: stockRows.length ? "" : "No stock row needs review.",
    writeAction: "none",
  };
  pack.text = assertAdvisoryText(packText(pack));
  return pack;
}

const lineFor = row => {
  const reviewed = row.reviewed ? " Reviewed." : "";
  if (row.kind === "bank") return `${row.date} ${row.detail ? `${row.detail} · ` : ""}${row.title} ${row.direction} ${formatInr(row.amount)}.${reviewed}`;
  return `${row.record ? `${row.record} · ` : ""}${row.title}. ${row.detail}${reviewed}`;
};

function packText(pack) {
  const books = pack.books;
  const lines = [
    "For the CA",
    pack.companyName,
    pack.gstin ? `GSTIN ${pack.gstin}` : null,
    pack.monthTitle,
    `Prepared ${pack.preparedOn}`,
    pack.locked ? "This month is locked." : "This month is open. Locking it is a separate step.",
    "",
    pack.disclaimer,
    "",
    "Books",
    books.balanced ? "Trial balance agrees." : `Trial balance differs by ${formatInr(books.difference)}.`,
    `Income ${formatInr(books.income)}`,
    `Expenses ${formatInr(books.expenses)}`,
    `Opening stock ${formatInr(books.openingStock)}`,
    `Closing stock ${formatInr(books.closingStock)}`,
    `${books.resultLabel} ${formatInr(books.resultAmount)}`,
    "",
    "Invoices a GST check would reject",
    ...(pack.gst.length ? pack.gst.map(lineFor) : [pack.gstNote]),
    "",
    "Bank lines still unmatched",
    ...(pack.bank.length ? pack.bank.map(lineFor) : [pack.bankNote]),
    "",
    "Stock rows that need review",
    ...(pack.stock.length ? pack.stock.map(lineFor) : [pack.stockNote]),
  ];
  return lines.filter(line => line != null).join("\n");
}
