import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { downloadPdf, renderDocumentPdf } from "./documentPdf.js";
import { sellerLines } from "./salesInvoicePdf.js";
import { rupeesInWords } from "../model/payroll.js";

const titleCase = text => String(text || "").toLowerCase().replace(/\b[a-z]/g, ch => ch.toUpperCase());

const quantityText = (quantity, unit) => `${Number(quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;

export function tradeDocumentPdfModel(view) {
  const m = view.money;
  const totals = [];
  if (view.tax > 0) {
    totals.push({ label: "Taxable value", value: m(view.taxable) });
    if (view.cgst) totals.push({ label: "CGST", value: m(view.cgst) });
    if (view.sgst) totals.push({ label: "SGST", value: m(view.sgst) });
    if (view.igst) totals.push({ label: "IGST", value: m(view.igst) });
  }
  const totalLabel = view.docType === "delivery_challan" || view.docType === "goods_receipt" ? "Total value" : "Total";
  totals.push({ label: totalLabel, value: m(view.total), bold: true });
  const meta = [
    [`${view.label} No`, view.docNumber],
    ["Date", formatReceiptDate(view.docDate)],
  ];
  if (view.validUntil && view.untilLabel) meta.push([view.untilLabel, formatReceiptDate(view.validUntil)]);
  if (view.reference) meta.push(["Reference", view.reference]);
  if (view.sourceNumber) meta.push(["Against", view.sourceNumber]);
  if (view.status === "cancelled") meta.push(["Status", "CANCELLED"]);
  const showBank = view.docType === "quotation" || view.docType === "sales_order";
  return {
    title: view.title,
    meta,
    seller: { name: view.companyName, lines: sellerLines(view), logoDataUrl: view.companyLogoUrl },
    partyHeading: view.partyHeading,
    party: {
      name: view.partyName || "-",
      lines: [
        view.partyAddress,
        view.partyGstin ? `GSTIN: ${view.partyGstin}` : "",
        view.partyPhone ? `Phone: ${view.partyPhone}` : "",
      ],
    },
    items: view.lines.map(line => ({
      name: line.name,
      detail: [line.sku ? `SKU ${line.sku}` : "", line.hsnSac ? `HSN/SAC ${line.hsnSac}` : ""].filter(Boolean).join(" - "),
      quantity: quantityText(line.quantity, line.unit),
      rate: m(line.rate),
      discount: line.discount > 0 ? m(line.discount) : "",
      gst: line.gstRate ? `${line.gstRate}%` : "",
      amount: m(line.amount),
    })),
    totals,
    amountNote: view.docType === "delivery_challan" ? "Not a tax invoice. Goods sent on delivery challan." : "",
    notes: [
      view.notes ? { heading: "Notes", lines: [view.notes] } : null,
      view.terms ? { heading: "Terms", lines: [view.terms] } : null,
      view.status === "cancelled" && view.cancelReason ? { heading: "Cancelled", lines: [view.cancelReason] } : null,
    ].filter(Boolean),
    bankLines: showBank ? view.bankLines || [] : [],
    upi: null,
    footer: view.docType === "purchase_order" || view.docType === "goods_receipt"
      ? `Issued by ${view.companyName}.`
      : view.receiptFooter || "Thank you for your business.",
    // A4/A5: the same bordered layout as Counter bills, sales invoices and receipts.
    retailLayout: true,
    retail: tradeDocumentRetail(view, { meta, totalLabel, showBank }),
  };
}

function tradeDocumentRetail(view, { meta, totalLabel, showBank }) {
  const m = view.money;
  const clean = value => String(value ?? "").trim();
  const qtyTotal = view.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const itemTotal = view.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return {
    legalName: clean(view.companyLegalName) && view.companyLegalName !== view.companyName ? view.companyLegalName : "",
    phone: clean(view.companyPhone),
    address: clean(view.companyAddress),
    gstin: clean(view.companyGstin),
    email: clean(view.companyEmail),
    tag: view.side === "purchase" ? "ORIGINAL" : "ORIGINAL FOR RECIPIENT",
    meta: meta.map(([label, value], index) => [index === 0 ? `${titleCase(view.label)} No.` : label, value]),
    partyHeading: titleCase(view.partyHeading || "Party"),
    customerName: view.partyName || "-",
    customerPhone: clean(view.partyPhone),
    customerAddress: clean(view.partyAddress),
    customerGstin: clean(view.partyGstin),
    items: view.lines.map(line => ({
      name: line.name,
      detail: [line.sku ? `SKU ${line.sku}` : "", line.hsnSac ? `HSN ${line.hsnSac}` : "", line.gstRate ? `GST ${line.gstRate}%` : ""].filter(Boolean).join(" - "),
      quantity: quantityText(line.quantity, line.unit ? String(line.unit).toUpperCase() : ""),
      rate: m(line.rate),
      discount: line.discount > 0 ? m(line.discount) : "",
      amount: m(line.amount),
    })),
    totalQty: qtyTotal > 0 ? qtyTotal.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "",
    subtotal: m(itemTotal || view.taxable || view.total),
    taxLines: view.tax > 0
      ? [
        ["Taxable Value", m(view.taxable)],
        view.cgst ? ["CGST", m(view.cgst)] : null,
        view.sgst ? ["SGST", m(view.sgst)] : null,
        view.igst ? ["IGST", m(view.igst)] : null,
      ].filter(Boolean)
      : [],
    summary: [{ label: totalLabel === "Total" ? "Total Amount" : titleCase(totalLabel), value: m(view.total), bold: true, big: true, rule: true }],
    wordsLabel: `${totalLabel === "Total" ? "Total Amount" : titleCase(totalLabel)} (in words)`,
    words: rupeesInWords(Number(view.total || 0)),
    settlement: "",
    notes: [
      view.docType === "delivery_challan" ? ["Note", "Not a tax invoice. Goods sent on delivery challan."] : null,
      clean(view.notes) ? ["Notes", clean(view.notes)] : null,
      clean(view.terms) ? ["Terms", clean(view.terms)] : null,
      view.status === "cancelled" ? ["Cancelled", clean(view.cancelReason) || "This document was cancelled."] : null,
    ].filter(Boolean),
    bankLines: showBank ? (view.bankLines || []).filter(Boolean) : [],
  };
}

export function renderTradeDocumentPdf(view, { template } = {}) {
  return renderDocumentPdf(tradeDocumentPdfModel(view), { template: template || view.documentTemplate || "a4" });
}

export function downloadTradeDocumentPdf(view, options = {}) {
  downloadPdf(renderTradeDocumentPdf(view, options), `${view.docNumber || view.docType || "document"}.pdf`);
}
