import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { downloadPdf, renderDocumentPdf } from "./documentPdf.js";

const quantityText = (quantity, unit) => `${Number(quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;

export function sellerLines(source) {
  return [
    source.companyLegalName ? `Legal name: ${source.companyLegalName}` : "",
    source.companyAddress,
    source.companyGstin ? `GSTIN: ${source.companyGstin}` : "",
    [source.companyPhone ? `Phone: ${source.companyPhone}` : "", source.companyEmail].filter(Boolean).join("  "),
  ];
}

export function upiCaption(source, amount, money) {
  return [`Scan to pay ${money(amount)}`, `UPI: ${source.upiId}`];
}

export function salesInvoicePdfModel(invoice) {
  const m = invoice.money;
  const totals = [];
  if (invoice.tax > 0) {
    totals.push({ label: "Taxable value", value: m(invoice.taxable) });
    if (invoice.cgst) totals.push({ label: "CGST", value: m(invoice.cgst) });
    if (invoice.sgst) totals.push({ label: "SGST", value: m(invoice.sgst) });
    if (invoice.igst) totals.push({ label: "IGST", value: m(invoice.igst) });
  }
  totals.push({ label: "Invoice total", value: m(invoice.amount), bold: true });
  if (invoice.outstanding != null && invoice.outstanding !== invoice.amount) {
    totals.push({ label: "Balance due", value: m(invoice.outstanding) });
  }
  const showQr = invoice.showUpiQr !== false && invoice.upiLink && Number(invoice.payableAmount || 0) > 0;
  return {
    title: invoice.title || "SALES INVOICE",
    meta: [
      ["Invoice No", invoice.invoiceNumber],
      ["Date", formatReceiptDate(invoice.invoiceDate)],
      ["Due", formatReceiptDate(invoice.dueDate)],
      ["Settlement", invoice.settlement || "-"],
    ],
    seller: { name: invoice.companyName, lines: sellerLines(invoice), logoDataUrl: invoice.companyLogoUrl },
    partyHeading: "BILL TO",
    party: {
      name: invoice.customerName || "Customer",
      lines: [
        invoice.customerAddress,
        invoice.customerGstin ? `GSTIN: ${invoice.customerGstin}` : "",
        invoice.customerPhone ? `Phone: ${invoice.customerPhone}` : "",
      ],
    },
    items: (invoice.itemLines || []).map(line => ({
      name: line.name,
      detail: [line.sku ? `SKU ${line.sku}` : "", line.hsnSac ? `HSN/SAC ${line.hsnSac}` : ""].filter(Boolean).join(" - "),
      quantity: quantityText(line.quantity, line.unit),
      rate: m(line.rate),
      discount: line.discount > 0 ? m(line.discount) : "",
      gst: line.gstRate ? `${line.gstRate}%` : "",
      amount: m(line.amount),
    })),
    description: [invoice.narration, invoice.hsnSac ? `HSN/SAC: ${invoice.hsnSac}` : ""].filter(Boolean).join(" - "),
    totals,
    notes: [
      invoice.itemLines?.length && invoice.narration ? { heading: "Notes", lines: [invoice.narration] } : null,
      invoice.receiptTerms ? { heading: "Terms", lines: [invoice.receiptTerms] } : null,
    ].filter(Boolean),
    bankLines: invoice.bankLines || [],
    upi: showQr ? { link: invoice.upiLink, caption: upiCaption(invoice, invoice.payableAmount, m) } : null,
    footer: invoice.receiptFooter || "Thank you for your business.",
  };
}

export function renderSalesInvoicePdf(invoice, { template } = {}) {
  return renderDocumentPdf(salesInvoicePdfModel(invoice), { template: template || invoice.documentTemplate || "a4" });
}

export function downloadSalesInvoicePdf(invoice, options = {}) {
  downloadPdf(renderSalesInvoicePdf(invoice, options), `${invoice.invoiceNumber || "sales-invoice"}.pdf`);
}
