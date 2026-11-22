import { formatChitPaymentMonth, formatReceiptDate } from "../model/receiptModel.js";
import { downloadPdf, pdfBinaryToBytes, renderDocumentPdf } from "../../accounts/io/documentPdf.js";
import { rupeesInWords } from "../../accounts/model/payroll.js";

// Payment receipts for Daily / Monthly Finance and Chit Fund, in the same bordered layout
// as Counter bills and sales invoices (accounts/io/documentPdf.js drawRetailBill): shop
// header with logo, receipt number / date / collected by, Received From, a particulars
// table, amount received with previous and remaining balance, amount in words, signature.

const clean = value => String(value ?? "").trim();

/** What the money was for, one row per part (monthly finance splits interest / principal / penalty). */
export function receiptParticulars(receipt) {
  const m = receipt.money;
  const account = clean(receipt.accountId) ? `Account ${clean(receipt.accountId)}` : "";
  const rows = [];
  if (receipt.chitFields?.month || String(receipt.source || "").startsWith("chit")) {
    rows.push({
      name: `Chit installment${clean(receipt.schemeName) ? ` - ${clean(receipt.schemeName)}` : ""}`,
      detail: [formatChitPaymentMonth(receipt.chitFields || {}), account].filter(Boolean).join(" - "),
      amount: m(receipt.amount),
    });
  } else if (receipt.dailyFields) {
    const day = Number(receipt.dailyFields.daysCompleted || 0);
    rows.push({
      name: "Daily Finance collection",
      detail: [account, day ? `Day ${day} of 100` : "", receipt.dailyFields.dailyCollection ? `Daily ${m(receipt.dailyFields.dailyCollection)}` : ""].filter(Boolean).join(" - "),
      amount: m(receipt.amount),
    });
  } else if (receipt.monthlyFields) {
    const parts = [
      ["Interest", receipt.monthlyFields.interestPaid],
      ["Principal", receipt.monthlyFields.principalPaid],
      ["Penalty", receipt.monthlyFields.penaltyPaid],
    ].filter(([, value]) => Number(value) > 0);
    for (const [label, value] of parts) {
      rows.push({ name: `Monthly Finance - ${label}`, detail: account, amount: m(value) });
    }
    if (!rows.length) rows.push({ name: "Monthly Finance payment", detail: account, amount: m(receipt.amount) });
  } else {
    rows.push({
      name: clean(receipt.particularLabel) || `${clean(receipt.financeType) || "Payment"} received`,
      detail: [account, clean(receipt.schemeName)].filter(Boolean).join(" - "),
      amount: m(receipt.amount),
    });
  }
  if (clean(receipt.reference)) rows[rows.length - 1].detail = [rows[rows.length - 1].detail, `Ref ${clean(receipt.reference)}`].filter(Boolean).join(" - ");
  return rows;
}

function paymentModeLine(receipt) {
  const m = receipt.money;
  if (receipt.splitPayment) return `Cash ${m(receipt.cashAmount)} + UPI ${m(receipt.upiAmount)}`;
  return clean(receipt.paymentMode) && receipt.paymentMode !== "—" ? receipt.paymentMode : "";
}

export function receiptPdfModel(receipt) {
  const m = receipt.money;
  const date = formatReceiptDate(receipt.paymentDate);
  const when = clean(receipt.paymentTime) ? `${date}, ${clean(receipt.paymentTime)}` : date;
  const hasBalance = receipt.previousBalance != null || receipt.remainingBalance != null;
  const collector = [clean(receipt.collectedBy), clean(receipt.collectedByRole) && receipt.collectedByRole !== "Financier" ? `(${receipt.collectedByRole})` : ""]
    .filter(Boolean).join(" ");
  return {
    title: "PAYMENT RECEIPT",
    seller: { name: receipt.companyName || "MyFinTracker", logoDataUrl: receipt.companyLogoUrl || "" },
    party: { name: receipt.customerName || "" },
    footer: receipt.receiptFooter || "Thank you for your payment.",
    retailLayout: true,
    retail: {
      phone: clean(receipt.companyPhone),
      address: clean(receipt.companyAddress),
      email: clean(receipt.companyEmail),
      gstin: "",
      meta: [
        ["Receipt No.", receipt.receiptNumber || "-"],
        ["Date", when],
        collector ? ["Collected By", collector] : null,
      ].filter(Boolean),
      partyHeading: "Received From",
      customerName: receipt.customerName || "Customer",
      customerPhone: clean(receipt.customerPhone),
      particulars: true,
      items: receiptParticulars(receipt),
      subtotalLabel: "TOTAL RECEIVED",
      subtotal: m(receipt.amount),
      taxLines: [],
      summary: [
        { label: "Amount Received", value: m(receipt.amount), bold: true, big: true, rule: true },
        ...(hasBalance ? [
          { label: "Previous Balance", value: m(receipt.previousBalance || 0) },
          { label: "Remaining Balance", value: m(receipt.remainingBalance || 0), bold: true, rule: true },
        ] : []),
      ],
      wordsLabel: "Amount Received (in words)",
      words: rupeesInWords(Number(receipt.amount || 0)),
      settlement: paymentModeLine(receipt),
      notes: [
        clean(receipt.notes) ? ["Notes", clean(receipt.notes)] : null,
        clean(receipt.receiptTerms) ? ["Terms", clean(receipt.receiptTerms)] : null,
      ].filter(Boolean),
      bankLines: [],
    },
  };
}

export function renderReceiptPdf(receipt) {
  return renderDocumentPdf(receiptPdfModel(receipt), { template: "a4" });
}

export function receiptPdfFileName(receipt) {
  return `receipt-${String(receipt.receiptNumber || receipt.paymentId || "payment").replace(/[^A-Za-z0-9_-]/g, "-")}.pdf`;
}

/** PDF as a File, for uploading behind a WhatsApp receipt link. Null outside a browser. */
export function receiptPdfFile(receipt) {
  if (typeof File !== "function") return null;
  return new File([pdfBinaryToBytes(renderReceiptPdf(receipt))], receiptPdfFileName(receipt), { type: "application/pdf" });
}

export function downloadReceiptPdf(receipt) {
  downloadPdf(renderReceiptPdf(receipt), receiptPdfFileName(receipt));
}
