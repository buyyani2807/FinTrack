import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WHATSAPP_TEMPLATES, applyTemplate, resolveWhatsAppTemplate } from "../src/features/receipts/model/templateEngine.js";
import { invoiceRegister } from "../src/features/accounts/model/accountingReports.js";
import {
  buildArReminderMessage,
  buildSalesInvoice,
  buildSalesInvoiceMessage,
  buildVoucherDocument,
  salesInvoicePresentation,
  salesSettlementLabel,
} from "../src/features/accounts/model/salesInvoiceModel.js";
import { invoicePdfShareOnThisDevice, renderSalesInvoicePdf, salesInvoiceDocumentText, salesInvoiceWhatsAppText } from "../src/features/accounts/io/salesInvoicePdf.js";
import { whatsAppWebSendUrl } from "../src/features/receipts/io/receiptWhatsApp.js";

const accounts = [
  { id: "ar", code: "1100", name: "Accounts Receivable", accountType: "receivable", groupType: "asset" },
  { id: "sales", code: "4100", name: "Sales", accountType: "income", groupType: "income" },
  { id: "cash", code: "1000", name: "Cash", accountType: "cash", groupType: "asset" },
];

test("sales invoice branding uses Accounts company name, not GST legal name or Finance org", () => {
  const invoice = buildSalesInvoice({
    voucher: {
      id: "v1",
      voucherNumber: "SALE-000028",
      date: "2026-09-06",
      dueDate: "2026-09-12",
      narration: "Credit sale",
      partyId: "p1",
      voucherType: "sales",
      status: "posted",
      lines: [
        { coaId: "ar", debit: 11564, credit: 0, code: "1100", name: "Accounts Receivable" },
        { coaId: "sales", debit: 0, credit: 9800, code: "4100", name: "Sales" },
      ],
      gstLines: [{ taxable: 9800, cgst: 0, sgst: 0, igst: 1764, rate: 18, hsnSac: "7208", supplyType: "inter" }],
    },
    party: { id: "p1", name: "Initial Coatings", phone: "9848626699", gstin: "36AAACL9861H1Z7" },
    accounts,
    company: {
      name: "SRIHITHA INFRA",
      legalName: "Decathlon Sports India Pvt Ltd",
      gstin: "36AAAAA0000A1Z5",
      stateName: "Telangana",
      stateCode: "36",
    },
    workspace: { businessName: "Sudheer Finance" },
  });

  assert.equal(invoice.companyName, "SRIHITHA INFRA");
  assert.equal(invoice.companyLegalName, "Decathlon Sports India Pvt Ltd");
  assert.equal(invoice.companyGstin, "36AAAAA0000A1Z5");
  assert.equal(invoice.customerName, "Initial Coatings");
  assert.doesNotMatch(invoice.companyName, /Decathlon/i);
  assert.doesNotMatch(invoice.receiptFooter, /Sudheer Finance|Decathlon/i);
  assert.match(invoice.receiptFooter, /SRIHITHA INFRA/);
  assert.doesNotMatch(invoice.receiptFooter, /—|\?/);

  const message = buildSalesInvoiceMessage(invoice, {
    companyName: "Sudheer Finance",
    whatsappTemplates: {
      sales_invoice: "From {company_name} to {customer_name} invoice {invoice_number}",
    },
  });
  assert.match(message, /From SRIHITHA INFRA to Initial Coatings/);
  assert.doesNotMatch(message, /Sudheer Finance|Decathlon/);
});

test("cash sale settlement label", () => {
  assert.equal(salesSettlementLabel(accounts, {
    lines: [
      { coaId: "cash", debit: 500, credit: 0 },
      { coaId: "sales", debit: 0, credit: 500 },
    ],
  }), "Cash");
});

test("AR reminder template includes outstanding and overdue days", () => {
  const message = buildArReminderMessage({
    partyName: "Ravi",
    partyPhone: "9876543210",
    reference: "SAL-0009",
    invoiceDate: "2026-08-01",
    dueDate: "2026-08-08",
    amount: 5000,
    outstanding: 2000,
    daysOverdue: 12,
  }, { companyName: "Sudheer Finance" }, { name: "Srihitha Infra" });
  assert.match(message, /Ravi/);
  assert.match(message, /SAL-0009/);
  assert.match(message, /Days overdue: 12/);
  assert.match(message, /Srihitha Infra/);
  assert.doesNotMatch(message, /Sudheer Finance/);
});

test("invoice register exposes party phone for WhatsApp reminders", () => {
  const rows = invoiceRegister(
    accounts,
    [{
      id: "v2",
      voucherType: "sales",
      voucherNumber: "SAL-0002",
      date: "2026-09-01",
      dueDate: "2026-09-10",
      status: "posted",
      partyId: "p2",
      lines: [
        { coaId: "ar", debit: 1000, credit: 0, partyId: "p2" },
        { coaId: "sales", debit: 0, credit: 1000 },
      ],
    }],
    [{ id: "p2", name: "Buyer Co", phone: "9123456780", partyType: "customer" }],
    { kind: "receivable", today: "2026-09-06", outstandingOnly: true },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].partyPhone, "9123456780");
});

test("sales invoice PDF renders and defaults templates resolve", () => {
  const invoice = buildSalesInvoice({
    voucher: {
      id: "v3",
      voucherNumber: "SAL-0003",
      date: "2026-09-01",
      dueDate: "2026-09-01",
      narration: "Cash sale",
      voucherType: "sales",
      status: "posted",
      lines: [
        { coaId: "cash", debit: 200, credit: 0, code: "1000", name: "Cash" },
        { coaId: "sales", debit: 0, credit: 200, code: "4100", name: "Sales" },
      ],
      gstLines: [],
    },
    party: null,
    accounts,
    company: { name: "Demo Co" },
  });
  const pdf = renderSalesInvoicePdf(invoice);
  assert.match(pdf, /^%PDF-1.4/);
  assert.match(pdf, /SALES INVOICE/);
  assert.ok(resolveWhatsAppTemplate({}, "sales_invoice").includes("{invoice_number}"));
  assert.ok(DEFAULT_WHATSAPP_TEMPLATES.ar_reminder.includes("{outstanding}"));
  assert.match(applyTemplate(DEFAULT_WHATSAPP_TEMPLATES.sales_invoice, {
    customer_name: "A",
    amount: "₹1",
    invoice_number: "1",
    invoice_date: "1 Sep",
    due_date: "1 Sep",
    settlement: "Cash",
    company_name: "Co",
    company_phone: "",
  }), /Invoice No: 1/);
});

test("a phone can hand the invoice PDF to WhatsApp, and a computer opens WhatsApp Web", () => {
  assert.equal(invoicePdfShareOnThisDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
  assert.equal(invoicePdfShareOnThisDevice("Mozilla/5.0 (Linux; Android 14)"), true);
  assert.equal(invoicePdfShareOnThisDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false);
  assert.equal(invoicePdfShareOnThisDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true);
  assert.equal(whatsAppWebSendUrl("9876543210"), "https://web.whatsapp.com/send?phone=919876543210");
});

test("WhatsApp sale share uses the invoice content, not the greeting template", () => {
  const invoice = buildSalesInvoice({
    voucher: {
      id: "v4",
      voucherNumber: "SALE-000017",
      date: "2026-10-21",
      dueDate: "2026-10-28",
      narration: "",
      voucherType: "sales",
      status: "posted",
      partyId: "p4",
      lines: [
        { coaId: "ar", debit: 1168, credit: 0, code: "1100", name: "Accounts Receivable" },
        { coaId: "sales", debit: 0, credit: 1168, code: "4100", name: "Sales" },
      ],
      gstLines: [],
    },
    party: { id: "p4", name: "Mahaveer Traders", phone: "9000000001" },
    accounts,
    company: { name: "Buyyani's Enterprises" },
    itemLines: [{ itemName: "Cement", quantity: 2, unit: "Bag", rate: 584, amount: 1168 }],
  });
  const text = salesInvoiceDocumentText(invoice);
  assert.match(text, /SALES INVOICE/);
  assert.match(text, /Invoice No: SALE-000017/);
  assert.match(text, /Mahaveer Traders/);
  assert.match(text, /Cement/);
  assert.match(text, /Invoice total/);
  assert.doesNotMatch(text, /^Hi /);
  assert.doesNotMatch(text, /Thank you for your purchase/);

  const formatted = salesInvoiceWhatsAppText(invoice);
  assert.match(formatted, /\*SALES INVOICE\*/);
  assert.match(formatted, /\*Invoice No\* SALE-000017/);
  assert.match(formatted, /Mahaveer Traders/);
  assert.match(formatted, /Cement/);
  assert.match(formatted, /\*Invoice total\* \*₹1,168\*/);
  assert.doesNotMatch(formatted, /Please retain this invoice/);
  assert.doesNotMatch(formatted, /^Hi /);
});

test("purchase bills and receipts open as their own documents", () => {
  const books = [
    ...accounts,
    { id: "ap", code: "2000", name: "Accounts Payable", accountType: "payable", groupType: "liability" },
    { id: "purchase", code: "5110", name: "Purchase", accountType: "expense", groupType: "expense" },
  ];
  const purchase = buildVoucherDocument({
    voucher: {
      id: "pur",
      voucherNumber: "PUR-000008",
      date: "2026-10-24",
      voucherType: "purchase",
      status: "posted",
      partyId: "s1",
      lines: [
        { coaId: "purchase", debit: 168150, credit: 0, code: "5110", name: "Purchase" },
        { coaId: "ap", debit: 0, credit: 168150, code: "2000", name: "Accounts Payable" },
      ],
      gstLines: [],
    },
    party: { id: "s1", name: "Initial Coatings" },
    accounts: books,
    company: { name: "Buyyani's Enterprises" },
    outstanding: 50000,
  });
  const purchaseText = salesInvoiceDocumentText(purchase);
  assert.equal(purchase.title, "PURCHASE BILL");
  assert.equal(purchase.partyHeading, "SUPPLIER");
  assert.equal(purchase.settlement, "Credit");
  assert.equal(purchase.upiLink, "");
  assert.equal(purchase.outstanding, 50000);
  assert.match(purchaseText, /Bill No: PUR-000008/);
  assert.match(purchaseText, /SUPPLIER/);
  assert.match(purchaseText, /Initial Coatings/);
  assert.match(purchaseText, /Balance due/);

  const receipt = buildVoucherDocument({
    voucher: {
      id: "rcp",
      voucherNumber: "RCT-000003",
      date: "2026-10-20",
      voucherType: "receipt",
      status: "posted",
      partyId: "c1",
      lines: [
        { coaId: "cash", debit: 5000, credit: 0, code: "1000", name: "Cash" },
        { coaId: "ar", debit: 0, credit: 5000, code: "1100", name: "Accounts Receivable" },
      ],
      gstLines: [],
    },
    party: { id: "c1", name: "Sai Traders" },
    accounts: books,
    company: { name: "Buyyani's Enterprises" },
  });
  const receiptText = salesInvoiceDocumentText(receipt);
  assert.equal(receipt.title, "RECEIPT");
  assert.equal(receipt.partyHeading, "RECEIVED FROM");
  assert.equal(receipt.settlement, "Cash");
  assert.equal(receipt.payableAmount, 0);
  assert.match(receiptText, /Receipt No: RCT-000003/);
  assert.doesNotMatch(receiptText, /Balance due/);
  assert.doesNotMatch(receiptText, /Due:/);
});

test("sales invoice sheet groups HSN tax and spells the amount", () => {
  const invoice = buildSalesInvoice({
    voucher: {
      id: "v-tax",
      voucherNumber: "ic/2026-27/203",
      date: "2026-10-23",
      dueDate: "2026-10-23",
      narration: "",
      voucherType: "sales",
      status: "posted",
      partyId: "p1",
      lines: [
        { coaId: "ar", debit: 61500, credit: 0 },
        { coaId: "sales", debit: 0, credit: 61500 },
      ],
      gstLines: [{ taxable: 52118.58, cgst: 4690.67, sgst: 4690.67, igst: 0, rate: 18 }],
    },
    party: { name: "Srinivas Paints", address: "Kukatpally", gstin: "36BBBBB0000B1Z5", phone: "9876500000" },
    accounts,
    company: { name: "Initial Coatings", gstin: "36AAAAA0000A1Z5", stateName: "Telangana", stateCode: "36", documentSettings: { businessAddress: "Hyderabad" } },
    itemLines: [
      { itemName: "Cement Primer", hsnSac: "320901090", quantity: 15, unit: "NOS", rate: 2542.37, taxableAmount: 38135.55, gstRate: 18 },
      { itemName: "Interior Cp", hsnSac: "320901090", quantity: 5, unit: "NOS", rate: 2288.13, taxableAmount: 11440.65, gstRate: 18 },
      { itemName: "Micro Concrete", hsnSac: "32141000", quantity: 3, unit: "NOS", rate: 847.46, taxableAmount: 2542.38, gstRate: 18 },
    ],
  });
  const sheet = salesInvoicePresentation(invoice);
  assert.equal(sheet.title, "TAX INVOICE");
  assert.equal(sheet.quantityTotal, "23 NOS");
  assert.equal(sheet.hsn.length, 2);
  assert.equal(sheet.hsn[0].hsn, "320901090");
  assert.equal(sheet.hsn[0].cgstRate, "9%");
  assert.equal(sheet.hsn[0].taxable, "₹49,576.20");
  assert.equal(sheet.totals.find(row => row.label === "Round off").value, "₹0.08");
  assert.equal(sheet.totals.find(row => row.bold).value, "₹61,500");
  assert.match(sheet.amountWords, /Sixty One Thousand Five Hundred/);
  assert.match(sheet.taxWords, /Nine Thousand Three Hundred Eighty One and Thirty Four Paise/);
  assert.match(sheet.declaration, /actual price of the goods/);
  const pdf = renderSalesInvoicePdf(invoice);
  assert.match(pdf, /Amount chargeable/);
  assert.match(pdf, /HSN\/SAC/);
  assert.match(pdf, /Authorised Signatory/);
  assert.match(pdf, /computer generated invoice/);
  assert.match(pdf, /320901090/);
  const thermal = renderSalesInvoicePdf(invoice, { template: "thermal" });
  assert.match(thermal, /Amount chargeable/);
});
