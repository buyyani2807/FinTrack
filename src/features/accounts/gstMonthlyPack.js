/** One-click monthly GST pack for the CA. Calculated books data only — never a filing. */

import { affectsLedgers, isReversalVoucher, roundMoney, voucherTotals } from "./accountingModel.js";
import { dayBook, gstBooksReport } from "./accountingReports.js";
import { accountsCsvText, renderAccountsPdf } from "./accountingExport.js";
import { gstinValidationMessage, normalizeGstin } from "./accountingGst.js";
import { buildGstr1Preparation, buildGstr3bPreparation, gstrPrepToCsvRows, gstrPrepToJson } from "./gstPrepExport.js";
import { monthLabel, monthRange } from "./gstCalendar.js";

const B2C_LARGE_LIMIT = 100000;
const inr = value => `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const voucherPartyId = voucher => voucher.partyId || (voucher.lines || []).find(line => line.partyId)?.partyId || null;
const sumBy = (rows, key) => roundMoney((rows || []).reduce((total, row) => total + Number(row[key] || 0), 0));

const voucherSign = voucher => (isReversalVoucher(voucher) ? -1 : 1);

function voucherGst(voucher) {
  const sign = voucherSign(voucher);
  const lines = voucher.gstLines || [];
  return {
    taxable: roundMoney(sign * sumBy(lines, "taxable")),
    cgst: roundMoney(sign * sumBy(lines, "cgst")),
    sgst: roundMoney(sign * sumBy(lines, "sgst")),
    igst: roundMoney(sign * sumBy(lines, "igst")),
    total: roundMoney(sign * voucherTotals(voucher.lines || []).debit),
  };
}

function registerRows(vouchers, partyById, { types, itc = false }) {
  const header = ["Date", "Voucher no", "Type", "Party", "GSTIN", "State code", "Taxable", "CGST", "SGST", "IGST", "Invoice total", "Status"];
  if (itc) header.splice(11, 0, "ITC eligible");
  const rows = [header];
  for (const voucher of vouchers) {
    if (!types.includes(voucher.voucherType)) continue;
    const party = partyById.get(voucherPartyId(voucher));
    const gst = voucherGst(voucher);
    const row = [
      voucher.date,
      voucher.voucherNumber,
      isReversalVoucher(voucher) ? `${voucher.voucherType} reversal` : voucher.voucherType,
      party?.name || (voucher.voucherType === "sales" ? "Cash sale" : ""),
      normalizeGstin(party?.gstin),
      party?.stateCode || "",
      gst.taxable, gst.cgst, gst.sgst, gst.igst, gst.total,
      voucher.status,
    ];
    if (itc) row.splice(11, 0, (voucher.gstLines || []).every(line => line.itcEligible !== false) ? "Yes" : "Partly / No");
    rows.push(row);
  }
  return rows;
}

function hsnSummaryRows(books, vouchersInRange, voucherItemLines) {
  const outwardIds = new Map(
    vouchersInRange
      .filter(voucher => voucher.voucherType === "sales" || voucher.voucherType === "credit_note")
      .map(voucher => [voucher.id, voucher.voucherType === "credit_note" || isReversalVoucher(voucher) ? -1 : 1]),
  );
  const quantities = new Map();
  for (const line of voucherItemLines || []) {
    const sign = outwardIds.get(line.voucherId);
    if (!sign) continue;
    const key = line.hsnSac || "—";
    const entry = quantities.get(key) || { quantity: 0, unit: line.unit || "", description: line.itemName || "" };
    entry.quantity = roundMoney(entry.quantity + sign * Number(line.quantity || 0));
    quantities.set(key, entry);
  }
  const grouped = new Map();
  for (const row of books.output) {
    const key = `${row.hsnSac || "—"}|${row.rate}`;
    const entry = grouped.get(key) || { hsnSac: row.hsnSac || "—", rate: row.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    entry.taxable = roundMoney(entry.taxable + row.taxable);
    entry.cgst = roundMoney(entry.cgst + row.cgst);
    entry.sgst = roundMoney(entry.sgst + row.sgst);
    entry.igst = roundMoney(entry.igst + row.igst);
    grouped.set(key, entry);
  }
  const seenQty = new Set();
  const rows = [["HSN/SAC", "Description", "UQC", "Total quantity", "Rate %", "Taxable value", "CGST", "SGST", "IGST", "Total tax"]];
  for (const entry of [...grouped.values()].sort((a, b) => a.hsnSac.localeCompare(b.hsnSac) || a.rate - b.rate)) {
    const qty = quantities.get(entry.hsnSac);
    const showQty = qty && !seenQty.has(entry.hsnSac);
    if (showQty) seenQty.add(entry.hsnSac);
    rows.push([
      entry.hsnSac,
      qty?.description || "",
      qty?.unit || "",
      showQty ? qty.quantity : "",
      entry.rate,
      entry.taxable, entry.cgst, entry.sgst, entry.igst,
      roundMoney(entry.cgst + entry.sgst + entry.igst),
    ]);
  }
  return rows;
}

export function gstPackChecks({ company, vouchersInRange, books, partyById }) {
  const checks = [];
  const add = (severity, title, detail = "") => checks.push({ severity, title, detail });
  const registration = company?.gstRegistration || "unregistered";
  if (registration === "unregistered") add("error", "Company is not GST registered", "Set the GST registration and GSTIN in company settings before sharing this pack.");
  const companyGstinError = registration !== "unregistered" ? (normalizeGstin(company?.gstin) ? gstinValidationMessage(company.gstin) : "GSTIN is missing.") : "";
  if (companyGstinError) add("error", "Company GSTIN needs attention", companyGstinError);

  const sales = vouchersInRange.filter(voucher => voucher.voucherType === "sales" && !isReversalVoucher(voucher));
  const purchases = vouchersInRange.filter(voucher => voucher.voucherType === "purchase" && !isReversalVoucher(voucher));
  if (!sales.length && !purchases.length) add("info", "No sales or purchases this month", "If nothing else happened, a NIL return may apply. Confirm with your CA.");

  const noGst = sales.filter(voucher => !(voucher.gstLines || []).length);
  if (registration === "regular" && noGst.length) {
    add("warn", `${noGst.length} sales invoice${noGst.length === 1 ? " has" : "s have"} no GST lines`, noGst.slice(0, 8).map(voucher => voucher.voucherNumber).join(", "));
  }

  const badGstin = new Map();
  for (const voucher of [...sales, ...purchases]) {
    const party = partyById.get(voucherPartyId(voucher));
    if (party?.gstin && gstinValidationMessage(party.gstin)) badGstin.set(party.id, party.name);
  }
  if (badGstin.size) add("error", `${badGstin.size} part${badGstin.size === 1 ? "y has" : "ies have"} an invalid GSTIN`, [...badGstin.values()].slice(0, 8).join(", "));

  const missingHsn = books.output.filter(row => !row.hsnSac);
  if (missingHsn.length) {
    const numbers = [...new Set(missingHsn.map(row => row.voucherNumber))];
    add("warn", `HSN/SAC missing on ${numbers.length} invoice${numbers.length === 1 ? "" : "s"}`, numbers.slice(0, 8).join(", "));
  }

  const itcWithoutGstin = purchases.filter(voucher => {
    const party = partyById.get(voucherPartyId(voucher));
    return !normalizeGstin(party?.gstin) && (voucher.gstLines || []).some(line => line.itcEligible !== false && (line.cgst || line.sgst || line.igst));
  });
  if (itcWithoutGstin.length) {
    add("warn", `ITC on ${itcWithoutGstin.length} bill${itcWithoutGstin.length === 1 ? "" : "s"} from suppliers without a GSTIN`, "Input tax from unregistered suppliers is usually not claimable. Review before filing GSTR-3B.");
  }

  const b2cLarge = sales.filter(voucher => {
    const party = partyById.get(voucherPartyId(voucher));
    const gst = voucherGst(voucher);
    return !normalizeGstin(party?.gstin) && gst.igst > 0 && gst.total > B2C_LARGE_LIMIT;
  });
  if (b2cLarge.length) add("info", `${b2cLarge.length} inter-state B2C invoice${b2cLarge.length === 1 ? "" : "s"} above ${inr(B2C_LARGE_LIMIT)}`, "These go into the B2C (Large) table of GSTR-1.");

  if (!checks.some(check => check.severity !== "info")) add("ok", "Books look ready for your CA", "No blocking issues found in this month's GST data.");
  return checks;
}

/**
 * Build every file of the pack. `generatedAt` is injectable for tests.
 * Returns { period, range, summary, checks, files: [{ name, data }], shareText, fileName }.
 */
export function buildGstMonthlyPack({
  company = {},
  businessName = "",
  period,
  vouchers = [],
  parties = [],
  voucherItemLines = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const range = monthRange(period);
  const label = monthLabel(period);
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const vouchersInRange = (vouchers || [])
    .filter(voucher => affectsLedgers(voucher) && voucher.date >= range.from && voucher.date <= range.to)
    .sort((a, b) => `${a.date}${a.voucherNumber}`.localeCompare(`${b.date}${b.voucherNumber}`));
  const books = gstBooksReport(vouchers, range);
  const gstr1 = buildGstr1Preparation({ vouchers, parties, range });
  const gstr3b = buildGstr3bPreparation({ vouchers, range });
  const checks = gstPackChecks({ company, vouchersInRange, books, partyById });

  const salesCount = vouchersInRange.filter(voucher => voucher.voucherType === "sales" && !isReversalVoucher(voucher)).length;
  const purchaseCount = vouchersInRange.filter(voucher => voucher.voucherType === "purchase" && !isReversalVoucher(voucher)).length;
  const noteCount = vouchersInRange.filter(voucher => voucher.voucherType === "credit_note" || voucher.voucherType === "debit_note").length;
  const summary = {
    outwardTaxable: gstr3b.outward.taxable,
    outputTax: books.outputTax,
    eligibleItc: books.inputTax,
    netPayable: books.netPayable,
    salesCount,
    purchaseCount,
    noteCount,
    b2bCount: gstr1.summary.b2bCount,
    b2cCount: gstr1.summary.b2cCount,
    errors: checks.filter(check => check.severity === "error").length,
    warnings: checks.filter(check => check.severity === "warn").length,
  };

  const companyName = company.legalName || company.name || businessName || "Company";
  const gstin = normalizeGstin(company.gstin);
  const header = `${companyName}${gstin ? ` · GSTIN ${gstin}` : ""}`;

  const summaryRows = [
    ["Item", "Value"],
    ["Period", `${label} (${range.from} to ${range.to})`],
    ["GST registration", company.gstRegistration || "unregistered"],
    ["Sales invoices", salesCount],
    ["Purchase bills", purchaseCount],
    ["Credit / debit notes", noteCount],
    ["B2B lines / B2C lines", `${summary.b2bCount} / ${summary.b2cCount}`],
    ["Outward taxable value", inr(summary.outwardTaxable)],
    ["Output CGST", inr(gstr3b.outward.cgst)],
    ["Output SGST", inr(gstr3b.outward.sgst)],
    ["Output IGST", inr(gstr3b.outward.igst)],
    ["Eligible ITC", inr(summary.eligibleItc)],
    ["Net GST payable (before cash/credit ledger)", inr(summary.netPayable)],
    ["", ""],
    ["Checks", ""],
    ...checks.map(check => [`${check.severity.toUpperCase()}: ${check.title}`, check.detail]),
    ["", ""],
    ["Note", "Calculated from FinTrack books. Not filed on the GST portal."],
  ];

  const partyRows = [["Party", "Type", "GSTIN", "GSTIN check", "State code", "Phone"]];
  const activeIds = new Set(vouchersInRange.map(voucherPartyId).filter(Boolean));
  for (const party of (parties || []).filter(item => activeIds.has(item.id)).sort((a, b) => a.name.localeCompare(b.name))) {
    partyRows.push([party.name, party.partyType, normalizeGstin(party.gstin), party.gstin ? (gstinValidationMessage(party.gstin) || "OK") : "Unregistered", party.stateCode || "", party.phone || ""]);
  }

  const dayBookRows = [["Date", "Voucher no", "Type", "Narration", "Debit", "Credit", "Status"]];
  for (const voucher of dayBook(vouchers, range)) {
    dayBookRows.push([voucher.date, voucher.voucherNumber, voucher.voucherType, voucher.narration, voucher.debit, voucher.credit, voucher.status]);
  }

  const checkRows = [["Severity", "Check", "Detail"], ...checks.map(check => [check.severity, check.title, check.detail])];

  const readme = [
    `GST pack — ${label}`,
    header,
    `Generated ${generatedAt.slice(0, 16).replace("T", " ")} UTC from FinTrack Accounts.`,
    "",
    "This pack is CALCULATED from the books. Nothing has been filed on the GST portal.",
    "",
    "Files:",
    "  01-Summary.pdf            One-page summary and checks",
    "  02-GSTR-1-prep.csv/.json  B2B, B2C, credit and debit notes by invoice",
    "  03-GSTR-3B-prep.csv/.json Outward tax, eligible ITC and net payable",
    "  04-Sales-register.csv     Every sales invoice with tax split",
    "  05-Purchase-register.csv  Every purchase bill with tax split and ITC flag",
    "  06-HSN-summary.csv        Outward HSN/SAC summary with quantity",
    "  07-Notes.csv              Credit and debit notes",
    "  08-Day-book.csv           All posted vouchers in the month",
    "  09-Party-GSTINs.csv       GSTIN check for parties used this month",
    "  10-Checks.csv             Issues to review before filing",
    "",
    `Net GST payable (calculated): ${inr(summary.netPayable)}`,
  ].join("\r\n");

  const files = [
    { name: "README.txt", data: readme },
    { name: "01-Summary.pdf", data: renderAccountsPdf({ title: `GST pack - ${label}`, subtitle: `${companyName}${gstin ? ` | GSTIN ${gstin}` : ""}`, rows: summaryRows }) },
    { name: "02-GSTR-1-prep.csv", data: accountsCsvText(gstrPrepToCsvRows(gstr1)) },
    { name: "02-GSTR-1-prep.json", data: JSON.stringify({ ...gstrPrepToJson(gstr1), exportedAt: generatedAt, company: { name: companyName, gstin } }, null, 2) },
    { name: "03-GSTR-3B-prep.csv", data: accountsCsvText(gstrPrepToCsvRows(gstr3b)) },
    { name: "03-GSTR-3B-prep.json", data: JSON.stringify({ ...gstrPrepToJson(gstr3b), exportedAt: generatedAt, company: { name: companyName, gstin } }, null, 2) },
    { name: "04-Sales-register.csv", data: accountsCsvText(registerRows(vouchersInRange, partyById, { types: ["sales"] })) },
    { name: "05-Purchase-register.csv", data: accountsCsvText(registerRows(vouchersInRange, partyById, { types: ["purchase"], itc: true })) },
    { name: "06-HSN-summary.csv", data: accountsCsvText(hsnSummaryRows(books, vouchersInRange, voucherItemLines)) },
    { name: "07-Notes.csv", data: accountsCsvText(registerRows(vouchersInRange, partyById, { types: ["credit_note", "debit_note"] })) },
    { name: "08-Day-book.csv", data: accountsCsvText(dayBookRows) },
    { name: "09-Party-GSTINs.csv", data: accountsCsvText(partyRows) },
    { name: "10-Checks.csv", data: accountsCsvText(checkRows) },
  ];

  const issues = summary.errors + summary.warnings;
  const shareText = [
    `GST pack for ${label} — ${companyName}${gstin ? ` (${gstin})` : ""}`,
    `Sales: ${salesCount} invoices · Purchases: ${purchaseCount} bills`,
    `Outward taxable: ${inr(summary.outwardTaxable)}`,
    `Output tax: ${inr(summary.outputTax)} · Eligible ITC: ${inr(summary.eligibleItc)}`,
    `Net GST payable (calculated): ${inr(summary.netPayable)}`,
    issues ? `${issues} item${issues === 1 ? "" : "s"} to review — see 10-Checks.csv.` : "No issues flagged.",
    "ZIP has GSTR-1/3B prep, registers, HSN summary and day book.",
  ].join("\n");

  const safeName = companyName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
  return { period, range, label, summary, checks, files, shareText, fileName: `GST-pack-${safeName}-${period}.zip` };
}
