import { formatInr } from "../../lib/formatMoney.js";
import { formatReceiptDate } from "../receipts/receiptModel.js";
import { addDaysIso, roundMoney } from "./accountingModel.js";
import { aggregateItemizedGst, emptyItemLine, normalizeItemLine, validateItemLines } from "./inventoryModel.js";
import { accountsCompanyBranding } from "./salesInvoiceModel.js";

export const DOCUMENT_TYPES = {
  quotation: { label: "Quotation", plural: "Quotations", side: "sales", partyType: "customer", stock: 0, untilLabel: "Valid until", untilDays: 15 },
  sales_order: { label: "Sales order", plural: "Sales orders", side: "sales", partyType: "customer", stock: 0, untilLabel: "Expected delivery", untilDays: 7 },
  delivery_challan: { label: "Delivery challan", plural: "Delivery challans", side: "sales", partyType: "customer", stock: -1, untilLabel: "", untilDays: 0 },
  purchase_order: { label: "Purchase order", plural: "Purchase orders", side: "purchase", partyType: "supplier", stock: 0, untilLabel: "Expected delivery", untilDays: 7 },
  goods_receipt: { label: "Goods receipt", plural: "Goods receipts", side: "purchase", partyType: "supplier", stock: 1, untilLabel: "", untilDays: 0 },
};

/** What each document can become. "invoice" / "bill" open the sale / purchase entry prefilled. */
export const DOCUMENT_NEXT = {
  quotation: ["sales_order", "delivery_challan", "invoice"],
  sales_order: ["delivery_challan", "invoice"],
  delivery_challan: ["invoice"],
  purchase_order: ["goods_receipt", "bill"],
  goods_receipt: ["bill"],
};

export const documentLabel = type => DOCUMENT_TYPES[type]?.label || (type === "invoice" ? "Sales invoice" : type === "bill" ? "Purchase bill" : String(type || ""));

export const emptyDocumentForm = (docType = "quotation", today) => {
  const date = today || new Date().toISOString().slice(0, 10);
  const config = DOCUMENT_TYPES[docType] || DOCUMENT_TYPES.quotation;
  return {
    id: null,
    docType,
    docDate: date,
    validUntil: config.untilDays ? addDaysIso(date, config.untilDays) : "",
    partyId: "",
    reference: "",
    notes: "",
    terms: "",
    sourceDocumentId: null,
    lines: [emptyItemLine()],
  };
};

export function documentTotals(lines = [], { intra = true, gstEnabled = false } = {}) {
  const aggregate = aggregateItemizedGst(lines.map(line => (gstEnabled ? line : { ...line, gstRate: 0 })), { intra, taxInclusive: false });
  return {
    lines: aggregate.lines.map((line, index) => ({ ...line, sourceLineId: lines[index]?.sourceLineId || null })),
    taxable: aggregate.taxable,
    cgst: aggregate.cgst,
    sgst: aggregate.sgst,
    igst: aggregate.igst,
    tax: aggregate.tax,
    total: aggregate.total,
  };
}

/** Validate a document form and shape it for acc_save_trade_document. */
export function documentDraft(form = {}, { intra = true, gstEnabled = false } = {}) {
  const config = DOCUMENT_TYPES[form.docType];
  if (!config) throw new Error("Choose a document type.");
  if (!form.docDate) throw new Error("Document date is required.");
  if (!form.partyId) throw new Error(`Choose the ${config.partyType}.`);
  if (form.validUntil && form.validUntil < form.docDate) throw new Error(`${config.untilLabel || "Due date"} cannot be before the document date.`);
  const lines = (form.lines || []).filter(line => line.itemId || String(line.itemName || "").trim() || Number(line.quantity || 0));
  const lineError = validateItemLines(lines);
  if (lineError) throw new Error(lineError);
  if (config.stock) {
    const missing = lines.findIndex(line => normalizeItemLine(line).itemType === "product" && !line.itemId);
    if (missing >= 0) throw new Error(`Choose a saved item on line ${missing + 1} so stock can move.`);
  }
  const totals = documentTotals(lines, { intra, gstEnabled });
  return {
    id: form.id || null,
    docType: form.docType,
    docDate: form.docDate,
    validUntil: config.untilLabel ? form.validUntil || null : null,
    partyId: form.partyId,
    reference: form.reference || "",
    notes: form.notes || "",
    terms: form.terms || "",
    sourceDocumentId: form.sourceDocumentId || null,
    lines: totals.lines.map(line => ({
      item_id: line.itemId || null,
      item_name: line.itemName,
      item_sku: line.itemSku,
      item_type: line.itemType,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.rate,
      discount_amount: line.discountAmount,
      gst_rate: gstEnabled ? line.gstRate : 0,
      hsn_sac: line.hsnSac,
      taxable_amount: line.taxableAmount,
      cgst_amount: line.cgstAmount,
      sgst_amount: line.sgstAmount,
      igst_amount: line.igstAmount,
      source_line_id: line.sourceLineId || null,
    })),
    totals,
  };
}

const roundQty = value => Math.round(Number(value || 0) * 1000) / 1000;

/**
 * Quantity carried forward from each document line: later documents (not cancelled) made from it,
 * plus posted invoice/bill lines linked to it.
 */
export function documentFulfilment({ documents = [], voucherItemLines = [], vouchers = [] } = {}) {
  const usedByLine = new Map();
  const add = (lineId, quantity) => {
    if (!lineId) return;
    usedByLine.set(lineId, roundQty((usedByLine.get(lineId) || 0) + Number(quantity || 0)));
  };
  for (const doc of documents || []) {
    if (doc.status === "cancelled") continue;
    for (const line of doc.lines || []) add(line.sourceLineId, line.quantity);
  }
  const postedVoucherIds = new Set((vouchers || []).filter(voucher => voucher.status === "posted").map(voucher => voucher.id));
  for (const line of voucherItemLines || []) {
    if (line.sourceDocumentLineId && postedVoucherIds.has(line.voucherId)) add(line.sourceDocumentLineId, line.quantity);
  }
  const byDocument = new Map();
  for (const doc of documents || []) {
    let ordered = 0;
    let used = 0;
    const lines = (doc.lines || []).map(line => {
      const quantity = Number(line.quantity || 0);
      const lineUsed = Math.min(quantity, usedByLine.get(line.id) || 0);
      ordered += quantity;
      used += lineUsed;
      return { lineId: line.id, quantity, used: roundQty(lineUsed), pending: roundQty(quantity - lineUsed) };
    });
    const progress = used <= 0 ? "none" : roundQty(used) >= roundQty(ordered) ? "complete" : "partial";
    byDocument.set(doc.id, {
      ordered: roundQty(ordered),
      used: roundQty(used),
      pending: roundQty(ordered - used),
      progress,
      hasFollowups: (doc.lines || []).some(line => (usedByLine.get(line.id) || 0) > 0),
      lines,
    });
  }
  return byDocument;
}

/** Status shown in lists: combines the stored status with fulfilment and expiry. */
export function documentDisplayStatus(doc, summary, today) {
  if (!doc) return { label: "", tone: "" };
  if (doc.status === "cancelled") return { label: "Cancelled", tone: "muted" };
  const progress = summary?.progress || "none";
  if (doc.docType === "quotation") {
    if (doc.status === "declined") return { label: "Declined", tone: "red" };
    if (summary?.hasFollowups) return { label: "Converted", tone: "green" };
    if (doc.status === "accepted") return { label: "Accepted", tone: "green" };
    if (doc.validUntil && today && doc.validUntil < today) return { label: "Expired", tone: "amber" };
    return { label: "Open", tone: "blue" };
  }
  if (doc.docType === "delivery_challan" || doc.docType === "goods_receipt") {
    if (progress === "complete") return { label: "Billed", tone: "green" };
    if (doc.status === "closed") return { label: "Closed", tone: "muted" };
    if (progress === "partial") return { label: "Partly billed", tone: "amber" };
    return { label: "Not billed", tone: "blue" };
  }
  const doneWord = doc.docType === "purchase_order" ? "received" : "delivered";
  if (progress === "complete") return { label: `Fully ${doneWord}`, tone: "green" };
  if (doc.status === "closed") return { label: "Closed", tone: "muted" };
  if (progress === "partial") return { label: `Partly ${doneWord}`, tone: "amber" };
  if (doc.validUntil && today && doc.validUntil < today) return { label: "Overdue", tone: "red" };
  return { label: "Open", tone: "blue" };
}

/** Item lines for the next document or invoice: only the quantity still pending on each line. */
export function conversionLines(doc, summary) {
  const pendingById = new Map((summary?.lines || []).map(line => [line.lineId, line.pending]));
  return (doc?.lines || [])
    .map(line => {
      const pending = pendingById.has(line.id) ? pendingById.get(line.id) : Number(line.quantity || 0);
      if (!(pending > 0)) return null;
      const share = Number(line.quantity || 0) > 0 ? pending / Number(line.quantity) : 1;
      const discount = roundMoney(Number(line.discountAmount || 0) * share);
      return {
        ...emptyItemLine(),
        itemId: line.itemId || "",
        itemName: line.itemName,
        itemSku: line.itemSku || "",
        itemType: line.itemType || "product",
        unit: line.unit || "Nos",
        quantity: String(pending),
        rate: String(line.rate ?? ""),
        rateTouched: true,
        discount: discount ? String(discount) : "",
        gstRate: String(line.gstRate ?? 0),
        hsnSac: line.hsnSac || "",
        sourceLineId: line.id,
        sourceDocumentLineId: line.id,
      };
    })
    .filter(Boolean);
}

/** Open order lines with quantity still to deliver / receive. */
export function pendingOrderRows({ documents = [], fulfilment = new Map(), side = "sales", parties = [], today } = {}) {
  const orderType = side === "purchase" ? "purchase_order" : "sales_order";
  const partyName = Object.fromEntries((parties || []).map(party => [party.id, party.name]));
  const rows = [];
  for (const doc of documents || []) {
    if (doc.docType !== orderType || doc.status === "cancelled" || doc.status === "closed") continue;
    const summary = fulfilment.get(doc.id);
    for (const line of doc.lines || []) {
      const lineSummary = summary?.lines.find(entry => entry.lineId === line.id);
      const pending = lineSummary ? lineSummary.pending : Number(line.quantity || 0);
      if (!(pending > 0)) continue;
      rows.push({
        documentId: doc.id,
        lineId: line.id,
        docNumber: doc.docNumber,
        docDate: doc.docDate,
        dueDate: doc.validUntil || "",
        overdue: Boolean(doc.validUntil && today && doc.validUntil < today),
        partyName: partyName[doc.partyId] || "",
        itemName: line.itemName,
        unit: line.unit,
        ordered: Number(line.quantity || 0),
        pending,
        pendingValue: roundMoney(pending * Number(line.rate || 0)),
      });
    }
  }
  return rows.sort((a, b) => String(a.dueDate || a.docDate).localeCompare(String(b.dueDate || b.docDate)));
}

/**
 * Credit control for a credit sale. `outstanding` is the customer's current receivable,
 * `overdueDays` the age of their oldest overdue invoice.
 */
export function creditCheck({ party, outstanding = 0, invoiceTotal = 0, overdueDays = 0, settings = {} } = {}) {
  const mode = settings.creditControl || "warn";
  if (!party || mode === "off") return { level: "ok", messages: [] };
  const messages = [];
  const limit = Number(party.creditLimit || 0);
  const exposure = roundMoney(Number(outstanding || 0) + Number(invoiceTotal || 0));
  if (limit > 0 && exposure > limit) {
    messages.push(`${party.name} would owe ${formatPlain(exposure)}, over the credit limit of ${formatPlain(limit)}.`);
  }
  const blockDays = Number(settings.overdueBlockDays || 0);
  if (blockDays > 0 && Number(overdueDays || 0) > blockDays) {
    messages.push(`${party.name} has an invoice overdue by ${overdueDays} days (limit ${blockDays}).`);
  }
  if (!messages.length) return { level: "ok", messages };
  return { level: mode === "block" ? "block" : "warn", messages };
}

const formatPlain = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export { isValidUpiId, parsePayPageParams, payPageUrl, upiPayLink } from "./upiPay.js";

const DOCUMENT_TITLES = {
  quotation: "QUOTATION",
  sales_order: "SALES ORDER",
  delivery_challan: "DELIVERY CHALLAN",
  purchase_order: "PURCHASE ORDER",
  goods_receipt: "GOODS RECEIPT NOTE",
};

const PARTY_HEADINGS = {
  quotation: "QUOTATION FOR",
  sales_order: "CUSTOMER",
  delivery_challan: "DELIVER TO",
  purchase_order: "SUPPLIER",
  goods_receipt: "RECEIVED FROM",
};

/** Everything the viewer, PDF and WhatsApp share need for one document. */
export function buildTradeDocumentView({ doc, party = null, company = null, workspace = {}, documents = [] } = {}) {
  if (!doc) return null;
  const config = DOCUMENT_TYPES[doc.docType] || DOCUMENT_TYPES.quotation;
  const branding = accountsCompanyBranding(company, workspace);
  const source = doc.sourceDocumentId ? (documents || []).find(item => item.id === doc.sourceDocumentId) : null;
  const lines = doc.lines || [];
  const sum = key => roundMoney(lines.reduce((total, line) => total + Number(line[key] || 0), 0));
  const cgst = sum("cgstAmount");
  const sgst = sum("sgstAmount");
  const igst = sum("igstAmount");
  const taxable = lines.length ? sum("taxableAmount") : Number(doc.taxableTotal || 0);
  const tax = roundMoney(cgst + sgst + igst);
  const terms = String(doc.terms || "").trim() || (doc.docType === "quotation" ? branding.quotationTerms : "");
  return {
    ...branding,
    kind: "trade_document",
    id: doc.id,
    docType: doc.docType,
    side: config.side,
    label: config.label,
    title: DOCUMENT_TITLES[doc.docType] || config.label.toUpperCase(),
    partyHeading: PARTY_HEADINGS[doc.docType] || "PARTY",
    docNumber: doc.docNumber || "",
    docDate: doc.docDate || "",
    untilLabel: config.untilLabel,
    validUntil: doc.validUntil || "",
    reference: doc.reference || "",
    sourceNumber: source ? `${documentLabel(source.docType)} ${source.docNumber}` : "",
    status: doc.status,
    cancelReason: doc.cancelReason || "",
    partyName: party?.name || "",
    partyPhone: party?.phone || "",
    partyGstin: party?.gstin || "",
    partyAddress: party?.address || "",
    lines: lines.map(line => ({
      name: line.itemName,
      sku: line.itemSku || "",
      hsnSac: line.hsnSac || "",
      quantity: Number(line.quantity || 0),
      unit: line.unit || "",
      rate: Number(line.rate || 0),
      discount: Number(line.discountAmount || 0),
      gstRate: Number(line.gstRate || 0),
      amount: Number(line.taxableAmount || 0),
    })),
    taxable,
    cgst,
    sgst,
    igst,
    tax,
    total: roundMoney(taxable + tax),
    notes: doc.notes || "",
    terms,
    money: formatInr,
  };
}

export function buildTradeDocumentMessage(view) {
  if (!view) return "";
  const m = view.money;
  const greeting = view.partyName ? `Hi ${view.partyName},` : "Hi,";
  const intro = {
    quotation: "Please find our quotation below.",
    sales_order: "We confirm your order.",
    delivery_challan: "Your goods have been dispatched.",
    purchase_order: "Please supply the following as per this purchase order.",
    goods_receipt: "We have received the following goods.",
  }[view.docType] || "";
  const items = view.lines.slice(0, 15).map(line => `- ${line.name}: ${line.quantity} ${line.unit}${view.docType === "delivery_challan" || view.docType === "goods_receipt" ? "" : ` x ${m(line.rate)}`}`);
  if (view.lines.length > 15) items.push(`- and ${view.lines.length - 15} more`);
  return [
    greeting,
    intro,
    `${view.label} No: ${view.docNumber}`,
    `Date: ${formatReceiptDate(view.docDate)}`,
    view.validUntil && view.untilLabel ? `${view.untilLabel}: ${formatReceiptDate(view.validUntil)}` : "",
    "",
    ...items,
    "",
    `Total: ${m(view.total)}${view.tax > 0 ? ` (incl. GST ${m(view.tax)})` : ""}`,
    view.terms ? `Terms: ${view.terms}` : "",
    "",
    `Thank you,\n${view.companyName}${view.companyPhone ? `\n${view.companyPhone}` : ""}`,
  ].filter((line, index, all) => line !== "" || (all[index - 1] !== "" && index > 0)).join("\n");
}
