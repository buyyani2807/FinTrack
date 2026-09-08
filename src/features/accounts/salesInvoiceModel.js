import { formatInr } from "../../lib/formatMoney.js";
import { applyTemplate, resolveWhatsAppTemplate } from "../receipts/templateEngine.js";
import { formatReceiptDate } from "../receipts/receiptModel.js";
import { voucherTotals } from "./accountingModel.js";

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
  return {
    companyName,
    companyLegalName: legalName && legalName.toLowerCase() !== booksName.toLowerCase() ? legalName : "",
    companyGstin: company?.gstin || "",
    companyAddress: stateLine,
    companyPhone: "",
    companyEmail: "",
    companyLogoUrl: "",
    receiptFooter: `Thank you for your business.${companyName ? ` - ${companyName}` : ""}`,
    receiptTerms: company?.gstin
      ? `Issued by ${companyName} (GSTIN ${company.gstin}). Please retain this invoice for your records.`
      : `Issued by ${companyName}. Please retain this invoice for your records.`,
  };
}

export function salesSettlementLabel(accounts = [], voucher = {}) {
  const byId = accountById(accounts);
  const hitsReceivable = (voucher.lines || []).some(line => byId[line.coaId]?.accountType === "receivable");
  return hitsReceivable ? "Credit" : "Cash";
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

  return {
    kind: "sales_invoice",
    source: "accounts_sales",
    voucherId: voucher.id,
    invoiceNumber: voucher.voucherNumber || "",
    invoiceDate: voucher.date || "",
    dueDate: voucher.dueDate || voucher.date || "",
    narration: voucher.narration || "",
    settlement: salesSettlementLabel(accounts, voucher),
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
    outstanding: outstanding == null ? amount : Number(outstanding || 0),
    itemLines: (itemLines || []).map(line => ({
      name: line.itemName || line.name || "",
      sku: line.itemSku || line.sku || "",
      quantity: Number(line.quantity || 0),
      unit: line.unit || "",
      rate: Number(line.rate || 0),
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
  };
}

export function buildSalesInvoiceMessage(invoice, settings = {}) {
  // Templates may come from org receipt settings; company_* variables stay on the Accounts company.
  return applyTemplate(resolveWhatsAppTemplate(settings, "sales_invoice"), salesInvoiceWhatsAppVariables(invoice));
}

export function buildArReminderMessage(row, settings = {}, company = {}, workspace = {}) {
  const branding = accountsCompanyBranding(company, workspace);
  const invoice = {
    ...branding,
    customerName: row.partyName,
    invoiceNumber: row.reference,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    amount: row.amount,
    outstanding: row.outstanding,
    daysOverdue: row.daysOverdue || 0,
    money,
  };
  return applyTemplate(resolveWhatsAppTemplate(settings, "ar_reminder"), salesInvoiceWhatsAppVariables(invoice));
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
