import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { downloadPdf, renderDocumentPdf } from "./documentPdf.js";
import { sellerLines } from "./salesInvoicePdf.js";

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
  };
}

export function renderTradeDocumentPdf(view, { template } = {}) {
  return renderDocumentPdf(tradeDocumentPdfModel(view), { template: template || view.documentTemplate || "a4" });
}

export function downloadTradeDocumentPdf(view, options = {}) {
  downloadPdf(renderTradeDocumentPdf(view, options), `${view.docNumber || view.docType || "document"}.pdf`);
}
