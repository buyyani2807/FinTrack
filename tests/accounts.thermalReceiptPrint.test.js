import test from "node:test";
import assert from "node:assert/strict";
import { formatInr } from "../src/lib/formatMoney.js";
import { salesInvoicePdfModel } from "../src/features/accounts/io/salesInvoicePdf.js";
import { buildThermalReceiptHtml } from "../src/features/accounts/io/thermalReceiptPrint.js";

test("thermal HTML slip includes shop, items, and grand total without PDF markers", () => {
  const invoice = {
    posSlip: true,
    title: "BILL",
    invoiceNumber: "B-ADEF1234",
    invoiceDate: "2026-11-09",
    settlement: "Cash",
    customerName: "Walk-in",
    customerPhone: "",
    companyName: "Demo Store",
    companyAddress: "Main Road",
    companyPhone: "9876543210",
    companyGstin: "",
    taxable: 100,
    tax: 0,
    amount: 100,
    itemLines: [{ name: "Samosa", quantity: 2, rate: 50, amount: 100, discount: 0 }],
    receiptFooter: "Thank You & Visit Again..!",
    money: formatInr,
  };
  const html = buildThermalReceiptHtml(salesInvoicePdfModel(invoice), invoice);
  assert.match(html, /Demo Store/);
  assert.match(html, /Samosa/);
  assert.match(html, /Grand Total/);
  assert.match(html, /80mm/);
  assert.doesNotMatch(html, /%PDF|cg-pdf\.ps|PostScript/i);
});
