import { formatReceiptDate, formatReceiptDateTime } from "../../receipts/model/receiptModel.js";
import { salesInvoicePresentation } from "../model/salesInvoiceModel.js";
import { downloadPdf, pdfBinaryToBytes, renderDocumentPdf } from "./documentPdf.js";
import { printThermalReceiptHtml } from "./thermalReceiptPrint.js";

const quantityText = (quantity, unit) => `${Number(quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;

export function sellerLines(source, { posSlip = false } = {}) {
  if (posSlip) {
    return [
      source.companyAddress,
      source.companyPhone ? `Mobile No: ${source.companyPhone}` : "",
      source.companyEmail || "",
      source.companyGstin ? `GSTIN: ${source.companyGstin}` : "",
    ];
  }
  return [
    source.companyLegalName ? `Legal name: ${source.companyLegalName}` : "",
    source.companyAddress,
    source.companyGstin ? `GSTIN: ${source.companyGstin}` : "",
    [source.companyPhone ? `Phone: ${source.companyPhone}` : "", source.companyEmail].filter(Boolean).join("  "),
  ];
}

function totalItemQty(itemLines = []) {
  return (itemLines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
}

export function upiCaption(source, amount, money) {
  return [`Scan to pay ${money(amount)}`, `UPI: ${source.upiId}`];
}

export function salesInvoicePdfModel(invoice) {
  const m = invoice.money;
  const isPos = Boolean(invoice.posSlip || invoice.autoPrint);
  const hasGst = Number(invoice.tax || 0) > 0;
  const totals = [];
  if (isPos) {
    if (hasGst) totals.push({ label: "Sub Total", value: m(invoice.taxable) });
    if (invoice.cgst) totals.push({ label: "CGST", value: m(invoice.cgst) });
    if (invoice.sgst) totals.push({ label: "SGST", value: m(invoice.sgst) });
    if (invoice.igst) totals.push({ label: "IGST", value: m(invoice.igst) });
    if (!hasGst && Number(invoice.taxable || 0) > 0 && Number(invoice.taxable) !== Number(invoice.amount)) {
      totals.push({ label: "Sub Total", value: m(invoice.taxable) });
    }
    totals.push({ label: "Grand Total", value: m(invoice.amount), bold: true });
  } else {
    if (hasGst) {
      totals.push({ label: "Taxable value", value: m(invoice.taxable) });
      if (invoice.cgst) totals.push({ label: "CGST", value: m(invoice.cgst) });
      if (invoice.sgst) totals.push({ label: "SGST", value: m(invoice.sgst) });
      if (invoice.igst) totals.push({ label: "IGST", value: m(invoice.igst) });
    }
    totals.push({ label: invoice.amountLabel || "Invoice total", value: m(invoice.amount), bold: true });
  }
  if (invoice.outstanding != null && invoice.outstanding !== invoice.amount) {
    totals.push({ label: "Balance due", value: m(invoice.outstanding) });
  }
  const moneyOnly = invoice.kind === "receipt" || invoice.kind === "payment";
  const showQr = invoice.showUpiQr !== false && invoice.upiLink && Number(invoice.payableAmount || 0) > 0;
  const taxSheet = !isPos && (!invoice.kind || invoice.kind === "sales_invoice")
    ? salesInvoicePresentation(invoice)
    : null;
  const dateValue = invoice.showSaleTime && invoice.soldAt
    ? formatReceiptDateTime(invoice.soldAt)
    : formatReceiptDate(invoice.invoiceDate);
  const customerName = invoice.customerName || "Customer";
  const customerPhone = String(invoice.customerPhone || "").trim();
  const partyName = isPos && customerPhone
    ? `${customerName} (M: ${customerPhone})`
    : customerName;
  const qtyTotal = totalItemQty(invoice.itemLines);
  return {
    layout: taxSheet ? "tax" : "",
    taxSheet,
    posSlip: isPos,
    title: invoice.title || (isPos ? "BILL" : "SALES INVOICE"),
    meta: isPos
      ? [
        ["Date", dateValue],
        invoice.cashier ? ["Cashier", invoice.cashier] : null,
        invoice.tillLabel ? ["Till", invoice.tillLabel] : null,
        ["Bill No.", invoice.invoiceNumber],
      ].filter(Boolean)
      : [
        [invoice.numberLabel || "Invoice No", invoice.invoiceNumber],
        ["Date", dateValue],
        moneyOnly || !invoice.dueDate ? null : ["Due", formatReceiptDate(invoice.dueDate)],
        ["Settlement", invoice.settlement || "-"],
      ].filter(Boolean),
    seller: { name: invoice.companyName, lines: sellerLines(invoice, { posSlip: isPos }), logoDataUrl: invoice.companyLogoUrl },
    partyHeading: isPos ? "Name" : (invoice.partyHeading || "BILL TO"),
    party: {
      name: partyName,
      lines: isPos
        ? [
          invoice.customerGstin ? `GSTIN: ${invoice.customerGstin}` : "",
          invoice.customerAddress || "",
        ]
        : [
          invoice.customerAddress,
          invoice.customerGstin ? `GSTIN: ${invoice.customerGstin}` : "",
          invoice.customerPhone ? `Phone: ${invoice.customerPhone}` : "",
        ],
    },
    items: (invoice.itemLines || []).map(line => ({
      name: line.name,
      detail: isPos
        ? (line.hsnSac && hasGst ? `HSN ${line.hsnSac}` : "")
        : [line.sku ? `SKU ${line.sku}` : "", line.hsnSac ? `HSN/SAC ${line.hsnSac}` : ""].filter(Boolean).join(" - "),
      quantity: isPos
        ? String(Number(line.quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 }))
        : quantityText(line.quantity, line.unit),
      qtyValue: Number(line.quantity || 0),
      rate: m(line.rate),
      discount: line.discount > 0 ? m(line.discount) : "",
      gst: !isPos && line.gstRate ? `${line.gstRate}%` : "",
      amount: m(line.amount),
    })),
    description: [invoice.narration, !isPos && invoice.hsnSac ? `HSN/SAC: ${invoice.hsnSac}` : ""].filter(Boolean).join(" - "),
    totals,
    totalQty: qtyTotal > 0 ? qtyTotal.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "",
    payment: isPos && invoice.settlement
      ? {
        when: dateValue,
        method: invoice.settlement,
        amount: /credit|khata/i.test(String(invoice.settlement || ""))
          ? m(0)
          : m(invoice.amount),
      }
      : null,
    amountNote: taxSheet ? `Amount chargeable (in words): ${taxSheet.amountWords}` : "",
    notes: isPos
      ? []
      : [
        invoice.itemLines?.length && invoice.narration ? { heading: "Notes", lines: [invoice.narration] } : null,
        invoice.receiptTerms ? { heading: "Terms", lines: [invoice.receiptTerms] } : null,
      ].filter(Boolean),
    bankLines: isPos ? [] : (invoice.bankLines || []),
    upi: showQr ? { link: invoice.upiLink, caption: upiCaption(invoice, invoice.payableAmount, m) } : null,
    footer: invoice.receiptFooter || (isPos ? "Thank You & Visit Again..!" : "Thank you for your business."),
  };
}

export function renderSalesInvoicePdf(invoice, { template } = {}) {
  return renderDocumentPdf(salesInvoicePdfModel(invoice), { template: template || invoice.documentTemplate || "a4" });
}

export function downloadSalesInvoicePdf(invoice, options = {}) {
  downloadPdf(renderSalesInvoicePdf(invoice, options), `${invoice.invoiceNumber || "sales-invoice"}.pdf`);
}

function isThermalPrint(invoice, options = {}) {
  const template = options.template || invoice?.documentTemplate || "a4";
  return template === "thermal" || Boolean(invoice?.posSlip);
}

/**
 * Print a receipt. Thermal / Counter slips use HTML (80 mm) so ESC/POS printers
 * do not dump PDF→PostScript source. A4 invoices still print from PDF.
 * Call only from a Print click — browsers block this after async Charge alone.
 */
export function printSalesInvoicePdf(invoice, options = {}) {
  if (typeof window === "undefined") return false;
  if (isThermalPrint(invoice, options)) {
    return printThermalReceiptHtml(salesInvoicePdfModel(invoice), invoice);
  }
  if (typeof URL === "undefined") return false;
  const binary = renderSalesInvoicePdf(invoice, options);
  const blob = new Blob([pdfBinaryToBytes(binary)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  let win = null;
  try {
    win = window.open(url, "_blank");
  } catch {
    win = null;
  }

  if (win) {
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* PDF tab is open — user can use the browser Print control */
      }
    }, 700);
    window.setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }, 120_000);
    return true;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Receipt print");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.border = "0";
  frame.src = url;
  document.body.appendChild(frame);
  frame.onload = () => {
    window.setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch { /* ignore */ }
      window.setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        frame.remove();
      }, 120_000);
    }, 400);
  };
  return false;
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
