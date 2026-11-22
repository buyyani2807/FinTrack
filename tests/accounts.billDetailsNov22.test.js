import test from "node:test";
import assert from "node:assert/strict";
import { buildSalesInvoice } from "../src/features/accounts/model/salesInvoiceModel.js";
import { buildOfflineReceiptInvoice } from "../src/features/accounts/model/counterOffline.js";
import { isThermalPrint, renderSalesInvoicePdf } from "../src/features/accounts/io/salesInvoicePdf.js";
import { buildCounterWhatsAppReceipt } from "../src/features/accounts/model/counterBillMath.js";

const accounts = [
  { id: "ar", code: "1100", name: "Accounts Receivable", type: "asset", subtype: "receivable" },
  { id: "sales", code: "4100", name: "Sales", type: "income" },
];
const saleVoucher = (date, postedAt) => ({
  id: "v9", voucherNumber: "SALE-000029", date, postedAt, createdAt: postedAt, narration: "Credit sale", partyId: "p1",
  voucherType: "sales", status: "posted",
  lines: [{ coaId: "ar", debit: 1575, credit: 0 }, { coaId: "sales", debit: 0, credit: 1575 }],
});
const invoiceFor = voucher => buildSalesInvoice({
  voucher, party: { id: "p1", name: "Vamsee Sports" }, accounts, company: { name: "Buyyani's Sports" }, workspace: {},
});

test("sales invoice shows the time when entered on its invoice date (India time)", () => {
  // 22 Nov 2026, 11:11 am IST
  const sameDay = invoiceFor(saleVoucher("2026-11-22", "2026-11-22T05:41:00Z"));
  assert.equal(sameDay.showSaleTime, true);
  // 11:30 pm IST on the 22nd is still the 22nd in India although it is the 22nd/23rd boundary in UTC terms
  assert.equal(invoiceFor(saleVoucher("2026-11-22", "2026-11-22T18:00:00Z")).showSaleTime, true);
});

test("back-dated sales invoice shows the date only", () => {
  assert.equal(invoiceFor(saleVoucher("2026-11-20", "2026-11-22T05:41:00Z")).showSaleTime, false);
  assert.equal(invoiceFor(saleVoucher("2026-11-20", "")).showSaleTime, false);
});

const counterBill = settlement => ({
  id: "x", offlineRef: "B-9C4A4AD0", date: "2026-11-22", createdAt: "2026-11-22T05:41:00Z", amount: 1575, moneyMode: "cash",
  syncStatus: "posted", customerName: "Swathi", tillLabel: "Till 1", cashierName: "Sudheer",
  itemLines: [{ itemName: "Racquet", quantity: 1, rate: 1500, amount: 1500, taxableAmount: 1500 }],
  payload: { kind: "sale", settlement, totals: { taxable: 1500, tax: 75, total: 1575 } },
});
const counterInvoice = (settlement, upiId = "9160710101@ybl") => buildOfflineReceiptInvoice({
  bill: counterBill(settlement), companyName: "Buyyani's Sports", upiId, printFormat: "thermal80",
});

test("Khata Counter bill shows Khata, the full balance, and a UPI QR for it", () => {
  const invoice = counterInvoice("credit");
  assert.equal(invoice.settlement, "Khata");
  assert.equal(invoice.outstanding, 1575);
  assert.equal(invoice.payableAmount, 1575);
  assert.match(invoice.upiLink, /^upi:\/\/pay\?.*pa=9160710101%40ybl/);
  const pdf = renderSalesInvoicePdf(invoice, { template: "a4" });
  assert.ok(pdf.includes("(UPI: 9160710101@ybl)"));
  assert.ok(!pdf.includes("undefined"));
});

test("paid Counter bill gets no QR (already collected at the till)", () => {
  const invoice = counterInvoice("paid");
  assert.equal(invoice.settlement, "Cash");
  assert.equal(invoice.upiLink, "");
  assert.equal(invoice.payableAmount, 0);
  assert.equal(counterInvoice("credit", "").upiLink, "");
});

test("Counter bill shows the cashier, not the till", () => {
  const pdf = renderSalesInvoicePdf(counterInvoice("paid"), { template: "a4" });
  assert.ok(pdf.includes("(Cashier)") && pdf.includes("(Sudheer)"));
  assert.ok(!pdf.includes("(Till)") && !pdf.includes("(Till 1)"));
  const text = buildCounterWhatsAppReceipt({ companyName: "Buyyani's Sports", tillLabel: "Till 1", cashierName: "Sudheer", billNo: "B-1", lines: [], total: 0 });
  assert.match(text, /Cashier: Sudheer/);
  assert.doesNotMatch(text, /Till/);
});

test("Counter printer setting decides thermal slip vs regular bill", () => {
  assert.equal(isThermalPrint({ posSlip: true, documentTemplate: "thermal80" }), true);
  assert.equal(isThermalPrint({ posSlip: true, documentTemplate: "thermal58" }), true);
  assert.equal(isThermalPrint({ posSlip: true, documentTemplate: "a4" }), false);
  assert.equal(isThermalPrint({ posSlip: true, documentTemplate: "a5" }), false);
  assert.equal(isThermalPrint({ posSlip: true }), true);
  assert.equal(isThermalPrint({ documentTemplate: "a4" }), false);
});
