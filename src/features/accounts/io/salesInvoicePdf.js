import { formatReceiptDate, formatReceiptDateTime } from "../../receipts/model/receiptModel.js";
import { salesInvoicePresentation } from "../model/salesInvoiceModel.js";
import { rupeesInWords } from "../model/payroll.js";
import { downloadPdf, pdfBinaryToBytes, renderDocumentPdf } from "./documentPdf.js";
import { printThermalReceiptHtml } from "./thermalReceiptPrint.js";
import { buildCounterWhatsAppReceipt } from "../model/counterBillMath.js";

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
    footer: taxSheet
      ? RETAIL_FOOTER
      : invoice.receiptFooter || (isPos ? RETAIL_FOOTER : "Thank you for your business."),
    // Sales invoices on paper use the same bordered layout, wording and colours as Counter bills.
    retailLayout: Boolean(taxSheet),
    retail: isPos
      ? retailBillModel(invoice, { dateValue, hasGst, qtyTotal })
      : taxSheet
        ? retailBillModel(invoice, { dateValue, hasGst, qtyTotal, taxSheet })
        : null,
  };
}

/**
 * Counter bill on regular paper (A4/A5) and every Counter PDF sent to a customer: shop
 * header with phone and address, Bill To, items with units, totals with received and
 * balance, amount in words, bank details and a signature box.
 */
const RETAIL_FOOTER = "Thank You & Visit Again..!";

// Custom invoice terms the shop typed in settings; the generated "Issued by ..." line is not shown.
const customTerms = terms => {
  const text = String(terms || "").trim();
  return text && !text.startsWith("Issued by ") ? text : "";
};

function retailBillModel(invoice, { dateValue, hasGst, qtyTotal, taxSheet = null }) {
  const m = invoice.money;
  const isInvoice = Boolean(taxSheet);
  const amount = Number(invoice.amount || 0);
  const onCredit = /credit|khata/i.test(String(invoice.settlement || ""));
  // A Counter bill is settled at the till unless it went on credit. A sales invoice is paid
  // in full when it was a cash/UPI/bank sale; on credit, the balance is what is still owed.
  const balance = isInvoice
    ? (onCredit ? Math.min(amount, Math.max(0, Number(invoice.outstanding ?? amount))) : 0)
    : (onCredit ? amount : Math.max(0, Number(invoice.outstanding || 0)));
  const itemTotal = (invoice.itemLines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const roundOff = taxSheet?.totals?.find(row => row.label === "Round off");
  return {
    phone: String(invoice.companyPhone || "").trim(),
    address: String(invoice.companyAddress || "").trim(),
    legalName: isInvoice ? String(invoice.companyLegalName || "").trim() : "",
    gstin: String(invoice.companyGstin || "").trim(),
    email: String(invoice.companyEmail || "").trim(),
    meta: isInvoice
      ? [
        [invoice.numberLabel ? `${String(invoice.numberLabel).replace(/\.$/, "")}.` : "Invoice No.", invoice.invoiceNumber],
        ["Invoice Date", dateValue],
        invoice.dueDate ? ["Due Date", formatReceiptDate(invoice.dueDate)] : null,
      ].filter(Boolean)
      : [
        ["Bill No.", invoice.invoiceNumber],
        ["Bill Date", dateValue],
        invoice.tillLabel ? ["Till", invoice.tillLabel] : null,
        invoice.cashier ? ["Cashier", invoice.cashier] : null,
      ].filter(Boolean),
    customerName: invoice.customerName || "Cash customer",
    customerPhone: String(invoice.customerPhone || "").trim(),
    customerGstin: String(invoice.customerGstin || "").trim(),
    customerAddress: isInvoice ? String(invoice.customerAddress || "").trim() : "",
    items: (invoice.itemLines || []).map(line => ({
      name: line.name || "Item",
      detail: [
        line.hsnSac && (hasGst || isInvoice) ? `HSN ${line.hsnSac}` : "",
        isInvoice && hasGst && Number(line.gstRate) > 0 ? `GST ${Number(line.gstRate)}%` : "",
      ].filter(Boolean).join(" - "),
      quantity: quantityText(line.quantity, line.unit ? String(line.unit).toUpperCase() : ""),
      rate: m(line.rate),
      discount: line.discount > 0 ? m(line.discount) : "",
      amount: m(line.amount),
    })),
    totalQty: qtyTotal > 0 ? qtyTotal.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "",
    subtotal: m(itemTotal || invoice.taxable || amount),
    taxLines: hasGst
      ? [
        ["Taxable Value", m(invoice.taxable)],
        invoice.cgst ? ["CGST", m(invoice.cgst)] : null,
        invoice.sgst ? ["SGST", m(invoice.sgst)] : null,
        invoice.igst ? ["IGST", m(invoice.igst)] : null,
        roundOff ? ["Round Off", roundOff.value] : null,
      ].filter(Boolean)
      : (roundOff ? [["Round Off", roundOff.value]] : []),
    // HSN-wise GST summary, kept on sales invoices (customers claim input tax from it).
    taxSummary: isInvoice && hasGst && taxSheet.hsn?.length
      ? { rows: taxSheet.hsn, showCgst: taxSheet.showCgst, showIgst: taxSheet.showIgst }
      : null,
    total: m(amount),
    received: m(amount - balance),
    balance: m(balance),
    settlement: invoice.settlement || "",
    words: rupeesInWords(amount),
    bankLines: (invoice.bankLines || []).filter(Boolean),
    notes: isInvoice
      ? [
        invoice.narration ? ["Notes", String(invoice.narration)] : null,
        customTerms(invoice.receiptTerms) ? ["Terms", customTerms(invoice.receiptTerms)] : null,
      ].filter(Boolean)
      : [],
  };
}

export function renderSalesInvoicePdf(invoice, { template } = {}) {
  return renderDocumentPdf(salesInvoicePdfModel(invoice), { template: template || invoice.documentTemplate || "a4" });
}

export function downloadSalesInvoicePdf(invoice, options = {}) {
  downloadPdf(renderSalesInvoicePdf(invoice, options), `${invoice.invoiceNumber || "sales-invoice"}.pdf`);
}

// "thermal" is the pre-58mm-support value; older saved invoices/offline bills may still
// carry it, and it has always meant the 80 mm slip.
function thermalWidthMm(template) {
  if (template === "thermal58") return 58;
  if (template === "thermal80" || template === "thermal") return 80;
  return null;
}

function isThermalPrint(invoice, options = {}) {
  const template = options.template || invoice?.documentTemplate || "a4";
  return thermalWidthMm(template) != null || Boolean(invoice?.posSlip);
}

/**
 * Print a receipt. Thermal / Counter slips use HTML (80 mm or 58 mm) so ESC/POS printers
 * do not dump PDF→PostScript source. Regular A4/A5 invoices still print from PDF.
 * Call only from a Print click — browsers block this after async Charge alone.
 */
export function printSalesInvoicePdf(invoice, options = {}) {
  if (typeof window === "undefined") return false;
  if (isThermalPrint(invoice, options)) {
    const template = options.template || invoice?.documentTemplate || "thermal80";
    const widthMm = thermalWidthMm(template) || 80;
    return printThermalReceiptHtml(salesInvoicePdfModel(invoice), invoice, { widthMm });
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

/**
 * Invoice text for WhatsApp, in the same slip layout as the Counter WhatsApp receipt.
 * Sent when the PDF link can't be made (offline) or the invoice has no link context.
 */
export function salesInvoiceWhatsAppText(invoice) {
  const onCredit = /credit|khata/i.test(String(invoice.settlement || ""));
  const amount = Number(invoice.amount || 0);
  const isPos = Boolean(invoice.posSlip || invoice.autoPrint);
  const balance = onCredit
    ? Math.min(amount, Math.max(0, Number(invoice.outstanding ?? amount)))
    : 0;
  const due = invoice.dueDate ? formatReceiptDate(invoice.dueDate) : "";
  const creditNote = isPos
    ? undefined
    : (balance > 0 ? `_Balance due ${invoice.money(balance)}${due ? ` by ${due}` : ""}_` : "");
  const text = buildCounterWhatsAppReceipt({
    companyName: invoice.companyName || "",
    companyPhone: invoice.companyPhone || "",
    companyGstin: invoice.companyGstin || "",
    companyAddress: invoice.companyAddress || "",
    tillLabel: invoice.tillLabel || "",
    cashierName: invoice.cashier || "",
    billNo: invoice.invoiceNumber || "",
    title: isPos ? "" : invoice.title || "SALES INVOICE",
    billNoLabel: isPos ? "Bill No." : "Invoice No.",
    isReturn: /return/i.test(String(invoice.title || "")),
    isCredit: onCredit,
    payLabel: invoice.settlement || "",
    customerName: invoice.customerName || "",
    customerPhone: invoice.customerPhone || "",
    lines: (invoice.itemLines || []).map(line => ({
      itemName: line.name || "Item",
      quantity: Number(line.quantity || 0),
      rate: Number(line.rate || 0),
      netAmount: Number(line.amount || 0),
    })),
    taxable: Number(invoice.taxable || 0),
    tax: Number(invoice.tax || 0),
    cgst: Number(invoice.cgst || 0),
    sgst: Number(invoice.sgst || 0),
    igst: Number(invoice.igst || 0),
    total: amount,
    date: invoice.invoiceDate || "",
    ...(creditNote === undefined ? {} : { creditNote }),
  });
  const upi = invoice?.upiId && Number(invoice.payableAmount || 0) > 0
    ? `\n\n${upiCaption(invoice, invoice.payableAmount, invoice.money).join("\n")}`
    : "";
  return `${text}${upi}`;
}

/**
 * PDF handed to the customer (share sheet or download link). A Counter bill always goes
 * out as the A4 retail bill, even when the shop prints thermal slips: a narrow slip PDF is
 * hard to read on a phone and has no room for address, bank details or signature.
 */
export function salesInvoicePdfFile(invoice, options = {}) {
  if (typeof File !== "function") return null;
  const template = options.template || (invoice?.posSlip ? "a4" : undefined);
  const bytes = pdfBinaryToBytes(renderSalesInvoicePdf(invoice, { ...options, template }));
  const name = `${invoice.invoiceNumber || "sales-invoice"}.pdf`;
  return new File([bytes], name, { type: "application/pdf" });
}

/** Phones can hand the PDF to WhatsApp. A computer share menu does not. */
export function invoicePdfShareOnThisDevice(userAgent = "", maxTouchPoints = 0) {
  const ua = String(userAgent || "");
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && Number(maxTouchPoints) > 1;
}
