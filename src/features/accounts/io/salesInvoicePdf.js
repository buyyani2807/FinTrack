import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { downloadPdf, pdfBinaryToBytes, renderDocumentPdf } from "./documentPdf.js";

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

/** The invoice as plain text, matching the PDF, for WhatsApp when a file cannot be attached. */
export function salesInvoiceDocumentText(invoice) {
  const model = salesInvoicePdfModel(invoice);
  const lines = [model.seller?.name, ...(model.seller?.lines || [])].filter(Boolean);
  lines.push("", model.title || "SALES INVOICE");
  for (const [label, value] of model.meta || []) {
    if (value) lines.push(`${label}: ${value}`);
  }
  lines.push("", model.partyHeading || "BILL TO");
  if (model.party?.name) lines.push(model.party.name);
  for (const line of model.party?.lines || []) if (line) lines.push(line);
  if (model.items?.length) {
    lines.push("", "ITEMS");
    for (const item of model.items) {
      const bits = [
        item.name,
        item.quantity,
        item.rate ? `@ ${item.rate}` : "",
        item.discount ? `disc ${item.discount}` : "",
        item.gst ? `GST ${item.gst}` : "",
        item.amount,
      ].filter(Boolean);
      lines.push(bits.join("  "));
      if (item.detail) lines.push(item.detail);
    }
  }
  if (model.description) lines.push("", model.description);
  if (model.totals?.length) {
    lines.push("");
    for (const total of model.totals) lines.push(`${total.label}: ${total.value}`);
  }
  for (const block of model.notes || []) {
    lines.push("", block.heading);
    for (const line of block.lines || []) if (line) lines.push(line);
  }
  if (model.bankLines?.length) lines.push("", ...model.bankLines);
  if (invoice?.upiId && Number(invoice.payableAmount || 0) > 0) {
    lines.push("", ...upiCaption(invoice, invoice.payableAmount, invoice.money));
  }
  if (model.footer) lines.push("", model.footer);
  return lines.filter(line => line != null).join("\n");
}

const whatsAppBold = value => {
  const text = String(value ?? "").replace(/\*/g, "").trim();
  return text ? `*${text}*` : "";
};

/** Invoice text WhatsApp can render: bold labels, no legal paragraph. */
export function salesInvoiceWhatsAppText(invoice) {
  const model = salesInvoicePdfModel(invoice);
  const lines = [whatsAppBold(model.title || "SALES INVOICE")];
  if (model.seller?.name) lines.push(model.seller.name);
  for (const line of model.seller?.lines || []) if (line) lines.push(line);
  lines.push("");
  for (const [label, value] of model.meta || []) {
    if (value) lines.push(`${whatsAppBold(label)} ${value}`);
  }
  lines.push("", whatsAppBold(model.partyHeading || "BILL TO"));
  if (model.party?.name) lines.push(model.party.name);
  for (const line of model.party?.lines || []) if (line) lines.push(line);
  if (model.items?.length) {
    lines.push("", whatsAppBold("Items"));
    for (const item of model.items) {
      const detail = [item.quantity, item.rate ? `× ${item.rate}` : "", item.discount ? `disc ${item.discount}` : "", item.gst ? `GST ${item.gst}` : ""].filter(Boolean).join(" ");
      lines.push(item.name || "Item");
      const amount = item.amount ? whatsAppBold(item.amount) : "";
      if (detail || amount) lines.push([detail, amount].filter(Boolean).join(" · "));
      if (item.detail) lines.push(item.detail);
    }
  }
  if (model.totals?.length) {
    lines.push("");
    for (const total of model.totals) {
      lines.push(total.bold ? `${whatsAppBold(total.label)} ${whatsAppBold(total.value)}` : `${whatsAppBold(total.label)} ${total.value}`);
    }
  }
  if (model.bankLines?.length) lines.push("", ...model.bankLines);
  if (invoice?.upiId && Number(invoice.payableAmount || 0) > 0) {
    lines.push("", ...upiCaption(invoice, invoice.payableAmount, invoice.money));
  }
  if (model.footer) lines.push("", model.footer);
  return lines.filter(line => line != null).join("\n").replace(/\n{3,}/g, "\n\n");
}

export function salesInvoicePdfFile(invoice, options = {}) {
  if (typeof File !== "function") return null;
  const bytes = pdfBinaryToBytes(renderSalesInvoicePdf(invoice, options));
  const name = `${invoice.invoiceNumber || "sales-invoice"}.pdf`;
  return new File([bytes], name, { type: "application/pdf" });
}

/** Phones can hand the PDF to WhatsApp. A computer share menu does not. */
export function invoicePdfShareOnThisDevice(userAgent = "", maxTouchPoints = 0) {
  const ua = String(userAgent || "");
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && Number(maxTouchPoints) > 1;
}
