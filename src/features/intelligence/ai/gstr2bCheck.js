import { isPosted, isReversalVoucher, roundMoney } from "../../accounts/model/accountingModel.js";
import { billNumberFromNarration } from "../../accounts/model/billScan.js";
import { normalizeGstin } from "../../accounts/model/accountingGst.js";
import { isoDate } from "./aiCommon.js";

export const ITC_DISCLAIMER = "Compared with posted purchases. Accept, Reject and Pending are suggestions for the Invoice Management System. Nothing is sent to the GST portal, and no record is changed.";

const TOLERANCE = 1;

export function normInvoiceNo(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toIso(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function num(value) {
  const parsed = Number(String(value ?? "").replace(/[,₹\s]/g, ""));
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
}

function headerKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_FIELDS = {
  gstin: ["gstin", "suppliergstin", "ctin", "gstinofsupplier"],
  name: ["supplier", "suppliername", "tradename", "trdnm", "party", "name"],
  invoice: ["invoicenumber", "invoiceno", "inum", "billno", "billnumber", "documentnumber"],
  date: ["invoicedate", "date", "dt", "documentdate"],
  taxable: ["taxablevalue", "taxable", "txval"],
  igst: ["igst", "igstamount"],
  cgst: ["cgst", "cgstamount"],
  sgst: ["sgst", "sgstamount"],
  total: ["invoicevalue", "value", "val", "total"],
};

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") { current += "\""; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function mapHeaders(headers) {
  const mapped = {};
  headers.forEach((header, index) => {
    const key = headerKey(header);
    for (const [field, aliases] of Object.entries(HEADER_FIELDS)) {
      if (aliases.includes(key) && mapped[field] == null) mapped[field] = index;
    }
  });
  return mapped;
}

function rowFromCells(cells, columns) {
  const pick = field => (columns[field] == null ? "" : cells[columns[field]] || "");
  const invoice = normInvoiceNo(pick("invoice"));
  const gstin = normalizeGstin(pick("gstin"));
  if (!invoice && !gstin) return null;
  const igst = num(pick("igst"));
  const cgst = num(pick("cgst"));
  const sgst = num(pick("sgst"));
  return {
    gstin,
    name: String(pick("name") || "").trim(),
    invoice,
    date: toIso(pick("date")),
    taxable: num(pick("taxable")),
    tax: roundMoney(igst + cgst + sgst),
    total: num(pick("total")),
  };
}

function invoicesFromB2b(groups = []) {
  const invoices = [];
  for (const group of groups || []) {
    const gstin = normalizeGstin(group.ctin || group.gstin);
    const name = group.trdnm || group.tradeName || group.supplierName || "";
    for (const invoice of group.inv || group.invoices || []) {
      const items = invoice.items || invoice.itms || [];
      let taxable = 0;
      let tax = 0;
      for (const item of items) {
        const detail = item.itm_det || item.itmDet || item;
        taxable = roundMoney(taxable + num(detail.txval ?? detail.taxable));
        tax = roundMoney(tax + num(detail.igst) + num(detail.cgst) + num(detail.sgst));
      }
      const number = normInvoiceNo(invoice.inum || invoice.invoiceNumber);
      if (!number && !gstin) continue;
      invoices.push({
        gstin,
        name,
        invoice: number,
        date: toIso(invoice.dt || invoice.date),
        taxable,
        tax,
        total: num(invoice.val ?? invoice.value),
      });
    }
  }
  return invoices;
}

function portalBody(parsed) {
  if (Array.isArray(parsed)) return { invoices: parsed.map(row => rowFromObject(row)).filter(Boolean), notes: [] };
  const data = parsed?.data || parsed;
  const doc = data?.docdata || data?.docData || data;
  const notes = [];
  if (doc?.b2ba?.length || doc?.cdnr?.length || doc?.cdnra?.length) {
    notes.push("Amended invoices and credit notes in this file are not matched. Review those on the GST portal.");
  }
  const groups = doc?.b2b || data?.b2b;
  if (groups) return { invoices: invoicesFromB2b(groups), notes };
  if (Array.isArray(data?.invoices)) return { invoices: data.invoices.map(rowFromObject).filter(Boolean), notes };
  return null;
}

function rowFromObject(row) {
  if (!row || typeof row !== "object") return null;
  const cells = Object.values(row);
  const columns = mapHeaders(Object.keys(row));
  if (columns.invoice == null && columns.gstin == null) return null;
  return rowFromCells(cells, columns);
}

/** Read a GSTR-2B JSON download or a CSV. Returns invoices, or an error. Nothing is uploaded. */
export function parseGstr2b(text) {
  const raw = String(text || "").trim();
  if (!raw) return { error: "The file is empty." };
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const body = portalBody(JSON.parse(raw));
      if (!body?.invoices?.length) return { error: "No B2B invoices were found in this JSON." };
      return body;
    } catch {
      return { error: "This JSON could not be read." };
    }
  }
  const lines = raw.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { error: "The CSV needs a header and at least one invoice." };
  const columns = mapHeaders(splitCsvLine(lines[0]));
  if (columns.invoice == null || columns.gstin == null) {
    return { error: "The CSV needs GSTIN and invoice number columns." };
  }
  const invoices = lines.slice(1).map(line => rowFromCells(splitCsvLine(line), columns)).filter(Boolean);
  if (!invoices.length) return { error: "No invoices were found in this CSV." };
  return { invoices, notes: [] };
}

function bookInvoiceNumbers(voucher) {
  const numbers = new Set();
  const add = value => {
    const number = normInvoiceNo(value);
    if (number) numbers.add(number);
  };
  add(voucher.voucherNumber);
  add(billNumberFromNarration(voucher.narration));
  add(voucher.reference);
  return numbers;
}

function bookTax(voucher) {
  const lines = voucher.gstLines || [];
  const taxable = roundMoney(lines.reduce((sum, line) => sum + num(line.taxable), 0));
  const tax = roundMoney(lines.reduce((sum, line) => sum + num(line.cgst) + num(line.sgst) + num(line.igst), 0));
  return { taxable, tax };
}

function agrees(portal, book) {
  return Math.abs(portal.taxable - book.taxable) <= TOLERANCE && Math.abs(portal.tax - book.tax) <= TOLERANCE;
}

/**
 * Match a GSTR-2B file to posted purchases and suggest an IMS action.
 * Accept, Reject and Pending are advice. Nothing is filed or posted.
 */
export function buildItcCheck({ invoices = [], vouchers = [], parties = [] } = {}) {
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const knownGstins = new Set((parties || []).map(party => normalizeGstin(party.gstin)).filter(Boolean));
  const books = (vouchers || []).filter(voucher => isPosted(voucher) && voucher.voucherType === "purchase" && !isReversalVoucher(voucher)).map(voucher => {
    const party = partyById.get(voucher.partyId) || null;
    return {
      voucher,
      gstin: normalizeGstin(party?.gstin),
      name: party?.name || "",
      numbers: bookInvoiceNumbers(voucher),
      ...bookTax(voucher),
    };
  });
  const used = new Set();
  const rows = [];
  invoices.forEach((invoice, index) => {
    const candidates = books.filter(book => book.gstin === invoice.gstin && book.numbers.has(invoice.invoice));
    const book = candidates[0] || null;
    if (book) used.add(book.voucher.id);
    let action = "pending";
    let reason = "This bill is on GSTR-2B, but this invoice number is not on a posted purchase.";
    if (candidates.length > 1) {
      reason = "More than one posted purchase uses this supplier and invoice number.";
    } else if (book && agrees(invoice, book)) {
      action = "accept";
      reason = "The supplier, invoice number and tax agree with a posted purchase. Accepting it on IMS is the usual next step.";
    } else if (book) {
      reason = `The invoice number matches, but the taxable value or tax differs. Portal ${invoice.taxable} taxable and ${invoice.tax} tax; books ${book.taxable} taxable and ${book.tax} tax.`;
    } else if (!knownGstins.has(invoice.gstin)) {
      action = "reject";
      reason = "This supplier GSTIN is not in your parties, and the invoice number is not on a posted purchase.";
    }
    rows.push({
      id: `itc-${index}-${invoice.gstin}-${invoice.invoice}`,
      action,
      supplier: invoice.name || book?.name || invoice.gstin || "Supplier",
      gstin: invoice.gstin,
      invoice: invoice.invoice,
      date: isoDate(invoice.date),
      reason,
      voucherId: book?.voucher.id || "",
      voucherNumber: book?.voucher.voucherNumber || "",
    });
  });
  for (const book of books) {
    if (used.has(book.voucher.id) || !book.gstin) continue;
    const invoice = normInvoiceNo(billNumberFromNarration(book.voucher.narration)) || [...book.numbers][0] || book.voucher.voucherNumber;
    rows.push({
      id: `books-${book.voucher.id}`,
      action: "pending",
      supplier: book.name || book.gstin,
      gstin: book.gstin,
      invoice,
      date: isoDate(book.voucher.date),
      reason: "This posted purchase is not in the uploaded GSTR-2B. The supplier may not have reported it yet.",
      voucherId: book.voucher.id,
      voucherNumber: book.voucher.voucherNumber,
    });
  }
  const count = action => rows.filter(row => row.action === action).length;
  return {
    disclaimer: ITC_DISCLAIMER,
    summary: { portal: invoices.length, accept: count("accept"), pending: count("pending"), reject: count("reject") },
    rows,
    advisory: true,
    writeAction: "none",
  };
}
