import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WHATSAPP_TEMPLATES, applyTemplate, resolveWhatsAppTemplate } from "../src/features/receipts/templateEngine.js";
import { invoiceRegister } from "../src/features/accounts/accountingReports.js";
import {
  buildArReminderMessage,
  buildSalesInvoice,
  buildSalesInvoiceMessage,
  salesSettlementLabel,
} from "../src/features/accounts/salesInvoiceModel.js";
import { renderSalesInvoicePdf } from "../src/features/accounts/salesInvoicePdf.js";

const accounts = [
  { id: "ar", code: "1100", name: "Accounts Receivable", accountType: "receivable", groupType: "asset" },
  { id: "sales", code: "4100", name: "Sales", accountType: "income", groupType: "income" },
  { id: "cash", code: "1000", name: "Cash", accountType: "cash", groupType: "asset" },
];

test("sales invoice builds credit sale with GST and WhatsApp message", () => {
  const invoice = buildSalesInvoice({
    voucher: {
      id: "v1",
      voucherNumber: "SAL-0001",
      date: "2026-09-01",
      dueDate: "2026-09-08",
      narration: "Steel supply",
      partyId: "p1",
      voucherType: "sales",
      status: "posted",
      lines: [
        { coaId: "ar", debit: 1180, credit: 0, code: "1100", name: "Accounts Receivable" },
        { coaId: "sales", debit: 0, credit: 1000, code: "4100", name: "Sales" },
      ],
      gstLines: [{ taxable: 1000, cgst: 90, sgst: 90, igst: 0, rate: 18, hsnSac: "7208", supplyType: "intra" }],
    },
    party: { id: "p1", name: "Acme Traders", phone: "9876543210", gstin: "36AAAAA0000A1Z5", address: "Hyderabad" },
    accounts,
    company: { name: "QA Company B" },
    settings: { companyPhone: "9000000000" },
  });

  assert.equal(invoice.invoiceNumber, "SAL-0001");
  assert.equal(invoice.settlement, "Credit");
  assert.equal(invoice.amount, 1180);
  assert.equal(invoice.taxable, 1000);
  assert.equal(invoice.customerPhone, "9876543210");

  const message = buildSalesInvoiceMessage(invoice, {});
  assert.match(message, /Acme Traders/);
  assert.match(message, /SAL-0001/);
  assert.match(message, /QA Company B/);
  assert.doesNotMatch(message, /\{invoice_number\}/);
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
  }, {}, { name: "Srihitha Infra" });
  assert.match(message, /Ravi/);
  assert.match(message, /SAL-0009/);
  assert.match(message, /Days overdue: 12/);
  assert.match(message, /Srihitha Infra/);
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
