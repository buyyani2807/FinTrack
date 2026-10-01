import { formatInr } from "../../lib/formatMoney.js";
import { applyTemplate, resolveWhatsAppTemplate } from "../receipts/templateEngine.js";
import { formatReceiptDate } from "../receipts/receiptModel.js";
import { voucherTotals } from "./accountingModel.js";
import { browserOrigin, isValidUpiId, payPageUrl, upiPayLink } from "./upiPay.js";

const money = formatInr;

const accountById = (accounts = []) => Object.fromEntries((accounts || []).map(account => [account.id, account]));

/** Branding for Accounts documents — active books company name, never Finance org settings. */
export function accountsCompanyBranding(company = null, workspace = {}) {
  const booksName = String(company?.name || workspace.businessName || "FinTrack").trim();
  const legalName = String(company?.legalName || "").trim();
  // Header uses the company shown in Accounts (books name). Legal name is only a GST subtitle when different.
  const companyName = booksName;
  const stateLine = [company?.stateName, company?.stateCode ? `(${company.stateCode})` : ""]
    .map(part => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  const doc = company?.documentSettings || {};
  const upiId = isValidUpiId(doc.upiId) ? String(doc.upiId).trim() : "";
  return {
    companyName,
    companyLegalName: legalName && legalName.toLowerCase() !== booksName.toLowerCase() ? legalName : "",
    companyGstin: company?.gstin || "",
    companyAddress: [String(doc.businessAddress || "").trim(), stateLine].filter(Boolean).join(", "),
    companyPhone: String(doc.businessPhone || "").trim(),
    companyEmail: String(doc.businessEmail || "").trim(),
    companyLogoUrl: doc.logoDataUrl || "",
    upiId,
    upiPayeeName: String(doc.upiPayeeName || "").trim() || companyName,
    showUpiQr: doc.showUpiQr !== false,
    bankLines: bankDetailLines(doc),
    documentTemplate: doc.invoiceTemplate || "a4",
    quotationTerms: String(doc.quotationTerms || "").trim(),
    receiptFooter: `Thank you for your business.${companyName ? ` - ${companyName}` : ""}`,
    receiptTerms: String(doc.invoiceTerms || "").trim() || (company?.gstin
      ? `Issued by ${companyName} (GSTIN ${company.gstin}). Please retain this invoice for your records.`
      : `Issued by ${companyName}. Please retain this invoice for your records.`),
  };
}

export function bankDetailLines(doc = {}) {
  const parts = [
    doc.bankName ? `Bank: ${String(doc.bankName).trim()}` : "",
    doc.bankAccountNumber ? `A/c: ${String(doc.bankAccountNumber).trim()}` : "",
    doc.bankIfsc ? `IFSC: ${String(doc.bankIfsc).trim().toUpperCase()}` : "",
  ].filter(Boolean);
  return parts.length ? [parts.join("  ")] : [];
}

/** Pay link details for an amount due to the company, or null when no UPI ID is set. */
export function companyPayLinks(branding, { amount = 0, note = "", origin = browserOrigin() } = {}) {
  if (!branding?.upiId || !(Number(amount) > 0)) return null;
  const params = { upiId: branding.upiId, payeeName: branding.upiPayeeName, amount, note };
  return { upiLink: upiPayLink(params), payUrl: payPageUrl(origin, params) };
}

const withPayLink = (message, payUrl) => {
  if (!payUrl || message.includes(payUrl)) return message;
  return `${message.trimEnd()}\n\nPay by UPI: ${payUrl}`;
};

export function salesSettlementLabel(accounts = [], voucher = {}) {
  const byId = accountById(accounts);
  const lines = voucher.lines || [];
  if (lines.some(line => byId[line.coaId]?.accountType === "receivable")) return "Credit";
  const cash = lines.some(line => byId[line.coaId]?.accountType === "cash" && Number(line.debit || 0) > 0);
  const upi = lines.some(line => byId[line.coaId]?.accountType === "upi" && Number(line.debit || 0) > 0);
  const bank = lines.some(line => byId[line.coaId]?.accountType === "bank" && Number(line.debit || 0) > 0);
  if (cash && upi) return "Cash + UPI";
  if (upi) return "UPI";
  if (bank) return "Bank transfer";
  return "Cash";
}

export function buildSalesInvoice({
  voucher,
  party = null,
  accounts = [],
  company = null,
  workspace = {},
  outstanding = null,
  itemLines = [],
}) {
  if (!voucher) return null;
  const totals = voucherTotals(voucher.lines || []);
  const gst = (voucher.gstLines || []).reduce((sum, line) => ({
    taxable: sum.taxable + Number(line.taxable || 0),
    cgst: sum.cgst + Number(line.cgst || 0),
    sgst: sum.sgst + Number(line.sgst || 0),
    igst: sum.igst + Number(line.igst || 0),
    rate: line.rate || sum.rate,
    hsnSac: line.hsnSac || sum.hsnSac,
    supplyType: line.supplyType || sum.supplyType,
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, rate: 0, hsnSac: "", supplyType: "none" });
  const amount = Number(totals.debit || 0);
  const tax = gst.cgst + gst.sgst + gst.igst;
  const taxable = gst.taxable || Math.max(0, amount - tax);
  const branding = accountsCompanyBranding(company, workspace);
  const due = outstanding == null ? amount : Number(outstanding || 0);
  const settlement = salesSettlementLabel(accounts, voucher);
  const payable = outstanding == null ? (settlement === "Credit" ? amount : 0) : due;
  const pay = voucher.status === "cancelled" ? null : companyPayLinks(branding, { amount: payable, note: voucher.voucherNumber || "" });

  return {
    kind: "sales_invoice",
    title: branding.companyGstin && tax > 0 ? "TAX INVOICE" : "SALES INVOICE",
    upiLink: pay?.upiLink || "",
    payUrl: pay?.payUrl || "",
    source: "accounts_sales",
    voucherId: voucher.id,
    invoiceNumber: voucher.voucherNumber || "",
    invoiceDate: voucher.date || "",
    dueDate: voucher.dueDate || voucher.date || "",
    narration: voucher.narration || "",
    settlement,
    payableAmount: pay ? payable : 0,
    status: voucher.status || "posted",
    customerName: party?.name || (voucher.partyId ? "Customer" : "Cash customer"),
    customerPhone: party?.phone || "",
    customerGstin: party?.gstin || "",
    customerAddress: party?.address || "",
    amount,
    taxable,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    tax,
    gstRate: gst.rate,
    hsnSac: gst.hsnSac,
    supplyType: gst.supplyType,
    outstanding: due,
    itemLines: (itemLines || []).map(line => ({
      name: line.itemName || line.name || "",
      sku: line.itemSku || line.sku || "",
      quantity: Number(line.quantity || 0),
      unit: line.unit || "",
      rate: Number(line.rate || 0),
      discount: Number(line.discountAmount || 0),
      amount: Number(line.taxableAmount ?? line.amount ?? 0),
      gstRate: Number(line.gstRate || 0),
      hsnSac: line.hsnSac || "",
    })),
    lines: (voucher.lines || []).map(line => ({
      name: [line.code, line.name].filter(Boolean).join(" ") || line.description || "Line",
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      description: line.description || "",
    })),
    ...branding,
    money,
  };
}

export function salesInvoiceWhatsAppVariables(invoice) {
  return {
    customer_name: invoice.customerName || "",
    amount: invoice.money(invoice.amount),
    invoice_number: invoice.invoiceNumber || "",
    invoice_date: formatReceiptDate(invoice.invoiceDate),
    due_date: formatReceiptDate(invoice.dueDate),
    outstanding: invoice.money(invoice.outstanding),
    days_overdue: invoice.daysOverdue != null ? String(invoice.daysOverdue) : "0",
    company_name: invoice.companyName || "",
    company_phone: invoice.companyPhone || "",
    settlement: invoice.settlement || "",
    gstin: invoice.customerGstin || "",
    pay_link: invoice.payUrl || "",
  };
}

export function buildSalesInvoiceMessage(invoice, settings = {}) {
  // Templates may come from org receipt settings; company_* variables stay on the Accounts company.
  const message = applyTemplate(resolveWhatsAppTemplate(settings, "sales_invoice"), salesInvoiceWhatsAppVariables(invoice));
  return withPayLink(message, invoice.payUrl);
}

export function buildArReminderMessage(row, settings = {}, company = {}, workspace = {}, { origin } = {}) {
  const branding = accountsCompanyBranding(company, workspace);
  const pay = companyPayLinks(branding, { amount: row.outstanding, note: row.reference || "", ...(origin != null ? { origin } : {}) });
  const invoice = {
    ...branding,
    customerName: row.partyName,
    invoiceNumber: row.reference,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    amount: row.amount,
    outstanding: row.outstanding,
    daysOverdue: row.daysOverdue || 0,
    payUrl: pay?.payUrl || "",
    money,
  };
  return withPayLink(applyTemplate(resolveWhatsAppTemplate(settings, "ar_reminder"), salesInvoiceWhatsAppVariables(invoice)), invoice.payUrl);
}

export function buildPaymentAdviceMessage(row, settings = {}, company = {}, workspace = {}) {
  const branding = accountsCompanyBranding(company, workspace);
  return applyTemplate(resolveWhatsAppTemplate(settings, "payment_advice"), {
    supplier_name: row.partyName || "Supplier",
    amount: money(row.outstanding || row.amount || 0),
    payment_date: formatReceiptDate(row.invoiceDate || row.dueDate),
    payment_mode: row.paymentMode || "Bank / UPI",
    payment_reference: row.reference || "",
    voucher_number: row.reference || "",
    company_name: branding.companyName || "",
    company_phone: branding.companyPhone || "",
  });
}

export function buildPurchaseDocumentMessage(voucher, party = {}, settings = {}, company = {}, workspace = {}) {
  const branding = accountsCompanyBranding(company, workspace);
  const amount = (voucher?.lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0);
  return applyTemplate(resolveWhatsAppTemplate(settings, "purchase_document"), {
    supplier_name: party.name || "Supplier",
    document_number: voucher?.voucherNumber || "",
    document_date: formatReceiptDate(voucher?.date),
    amount: money(amount),
    due_date: formatReceiptDate(voucher?.dueDate || voucher?.date),
    notes: voucher?.narration || "",
    company_name: branding.companyName || "",
    company_phone: branding.companyPhone || "",
  });
}

export function buildPartyStatementMessage({
  party,
  partyBook = {},
  periodFrom = "",
  periodTo = "",
  settings = {},
  company = {},
  workspace = {},
} = {}) {
  const branding = accountsCompanyBranding(company, workspace);
  const closing = Number(partyBook.closing ?? partyBook.outstanding ?? partyBook.advance ?? 0);
  return applyTemplate(resolveWhatsAppTemplate(settings, "party_statement"), {
    party_name: party?.name || "Party",
    period_from: periodFrom || "",
    period_to: periodTo || "",
    opening_balance: money(partyBook.opening || 0),
    closing_balance: money(Math.abs(closing)),
    company_name: branding.companyName || "",
    company_phone: branding.companyPhone || "",
  });
}

export function buildOutstandingSummaryMessage({
  party,
  outstanding = 0,
  kind = "receivable",
  settings = {},
  company = {},
  workspace = {},
} = {}) {
  const branding = accountsCompanyBranding(company, workspace);
  if (kind === "payable") {
    return applyTemplate(resolveWhatsAppTemplate(settings, "payment_advice"), {
      supplier_name: party?.name || "Supplier",
      amount: money(outstanding),
      payment_date: formatReceiptDate(new Date().toISOString().slice(0, 10)),
      payment_mode: "As agreed",
      payment_reference: "Outstanding balance",
      voucher_number: "",
      company_name: branding.companyName || "",
      company_phone: branding.companyPhone || "",
    });
  }
  const pay = companyPayLinks(branding, { amount: outstanding, note: "Outstanding balance" });
  return withPayLink(applyTemplate(resolveWhatsAppTemplate(settings, "ar_reminder"), {
    customer_name: party?.name || "Customer",
    amount: money(outstanding),
    invoice_number: "Outstanding",
    invoice_date: "",
    due_date: "",
    outstanding: money(outstanding),
    days_overdue: "",
    company_name: branding.companyName || "",
    company_phone: branding.companyPhone || "",
    settlement: "",
    gstin: party?.gstin || "",
    pay_link: pay?.payUrl || "",
  }), pay?.payUrl);
}

export function buildSalesInvoiceFromRegisterRow({ row, voucher, party, accounts, company, workspace }) {
  const invoice = buildSalesInvoice({
    voucher: voucher || {
      id: row.id,
      voucherNumber: row.reference,
      date: row.invoiceDate,
      dueDate: row.dueDate,
      narration: "",
      partyId: row.partyId,
      voucherType: "sales",
      status: "posted",
      lines: [{ debit: row.amount, credit: 0, name: "Sales", code: "" }],
      gstLines: [],
    },
    party: party || (row.partyPhone || row.partyName ? { name: row.partyName, phone: row.partyPhone } : null),
    accounts,
    company,
    workspace,
    outstanding: row.outstanding,
  });
  if (!invoice) return null;
  return { ...invoice, daysOverdue: row.daysOverdue || 0 };
}
