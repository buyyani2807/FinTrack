import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { receiptParticulars, renderReceiptPdf } from "../src/features/receipts/io/receiptPdf.js";
import { buildWhatsAppMessage, withReceiptLinkLine } from "../src/features/receipts/io/receiptWhatsApp.js";
import { DEFAULT_WHATSAPP_TEMPLATES } from "../src/features/receipts/model/templateEngine.js";
import { routeCollectionReceipt } from "../src/features/accounts/model/routeCollectionsModel.js";
import { renderTradeDocumentPdf } from "../src/features/accounts/io/tradeDocumentPdf.js";
import { buildTradeDocumentLinkMessage } from "../src/features/accounts/model/tradeDocumentModel.js";
import { formatInr } from "../src/lib/formatMoney.js";

const base = {
  source: "finance", paymentId: "t1", companyName: "Sudheer Finance", companyPhone: "9160710101", customerName: "Ramesh Kumar",
  customerPhone: "9885908893", paymentDate: "2026-11-22", paymentTime: "05:10 pm", collectedBy: "Ravi", collectedByRole: "Collection Agent",
  receiptNumber: "RCPT-000145", accountId: "DF-1A2B", amount: 500, paymentMode: "Cash", previousBalance: 27500, remainingBalance: 27000, money: formatInr,
};

test("Finance, monthly and chit receipts list what the payment was for", () => {
  assert.match(receiptParticulars({ ...base, dailyFields: { dailyCollection: 500, daysCompleted: 46 } })[0].detail, /Day 46 of 100/);
  const monthly = receiptParticulars({ ...base, amount: 6500, monthlyFields: { interestPaid: 1500, principalPaid: 5000, penaltyPaid: 0 } });
  assert.deepEqual(monthly.map(row => row.name), ["Monthly Finance - Interest", "Monthly Finance - Principal"]);
  const chit = receiptParticulars({ ...base, source: "chit_fixed", schemeName: "Gold 1 Lakh", chitFields: { month: 4, totalMonths: 20, monthLabel: "Nov 26" } });
  assert.equal(chit[0].name, "Chit installment - Gold 1 Lakh");
  assert.match(chit[0].detail, /Nov 26 \(Month 4 of 20\)/);
});

test("receipt PDF uses the shared bordered layout", () => {
  const pdf = renderReceiptPdf({ ...base, dailyFields: { daysCompleted: 46 } });
  for (const text of ["(PAYMENT RECEIPT)", "(Received From)", "(Particulars)", "(TOTAL RECEIVED)", "(Amount Received)",
    "(Previous Balance)", "(Remaining Balance)", "(Amount Received \\(in words\\))", "(Collected By)", "(Ravi \\(Collection Agent\\))", "(Powered by MyFinTracker)"]) {
    assert.ok(pdf.includes(text), `missing ${text}`);
  }
});

test("default receipt messages are short, carry the receipt link and no hard-coded town", () => {
  for (const key of ["payment_receipt", "daily_payment_receipt", "chit_payment_receipt"]) {
    assert.match(DEFAULT_WHATSAPP_TEMPLATES[key], /\{receipt_link\}/);
    assert.doesNotMatch(DEFAULT_WHATSAPP_TEMPLATES[key], /Bachupally/);
  }
  const message = buildWhatsAppMessage({ ...base, receiptLink: "https://myfintracker.com/b/abcdefabcdef" }, {});
  assert.match(message, /Amount Received: \*₹500\*/);
  assert.match(message, /View your receipt:\nhttps:\/\/myfintracker\.com\/b\/abcdefabcdef/);
});

test("receipt link line: dropped when offline, added to custom templates without {receipt_link}", () => {
  assert.equal(withReceiptLinkLine("Hi\n\nView your receipt:\n\nThanks", "x {receipt_link}", ""), "Hi\n\nThanks");
  assert.equal(withReceiptLinkLine("Hi Ravi, received ₹500.", "Hi {customer_name}, received {amount}.", "https://x/b/1"), "Hi Ravi, received ₹500.\n\nView your receipt:\nhttps://x/b/1");
  const custom = buildWhatsAppMessage({ ...base }, { whatsappTemplates: { payment_receipt: "Hi {customer_name}, received {amount}." } });
  assert.equal(custom, "Hi Ramesh Kumar, received ₹500.");
});

test("route collection becomes a payment receipt against the outstanding", () => {
  const receipt = routeCollectionReceipt({ voucherId: "v1", voucherNumber: "RCT-9", date: "2026-11-22", amount: 2000, mode: "upi", outstandingAfter: 3000, partyName: "Sai Traders", partyPhone: "8106790077", agentName: "Ravi", routeName: "Balanagar" }, { id: "c1", name: "Balaji Traders", phone: "9160710101" });
  assert.equal(receipt.previousBalance, 5000);
  assert.equal(receipt.remainingBalance, 3000);
  assert.equal(receipt.companyName, "Balaji Traders");
  assert.equal(receiptParticulars(receipt)[0].name, "Payment against outstanding");
  assert.ok(renderReceiptPdf(receipt).includes("(Payment against outstanding)"));
});

const view = {
  id: "d1", docType: "quotation", side: "sales", label: "Quotation", title: "QUOTATION", partyHeading: "QUOTATION FOR", docNumber: "QUO-0007",
  docDate: "2026-11-22", validUntil: "2026-12-07", untilLabel: "Valid until", companyName: "Buyyani's Sports", companyPhone: "9160710101",
  partyName: "Vamsee Sports", partyPhone: "8106790077", lines: [{ name: "Racquet", quantity: 10, unit: "nos", rate: 1500, amount: 15000 }],
  taxable: 15000, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 15000, money: formatInr,
};

test("quotation PDF uses the shared layout and its WhatsApp note links to it", () => {
  const pdf = renderTradeDocumentPdf(view, { template: "a4" });
  for (const text of ["(QUOTATION)", "(Quotation For)", "(Quotation No.)", "(Valid until)", "(SUBTOTAL)", "(Total Amount)", "(Total Amount \\(in words\\))"]) {
    assert.ok(pdf.includes(text), `missing ${text}`);
  }
  assert.ok(!pdf.includes("(Received Amount)"));
  const message = buildTradeDocumentLinkMessage(view, "https://myfintracker.com/b/1");
  assert.match(message, /^Hi Vamsee,\n\nThank you for your enquiry\. Here is our quotation\./);
  assert.match(message, /Total: \*₹15,000\*\n\nView the quotation:\nhttps:\/\/myfintracker\.com\/b\/1/);
});

test("156 files organization documents and records the kind; page reads every column", () => {
  const sql = readFileSync(new URL("../supabase/156_receipt_links_all_modules.sql", import.meta.url), "utf8");
  assert.match(sql, /folder = public\.current_organization_id\(\)::text/);
  assert.match(sql, /p_kind text default 'bill'/);
  assert.match(sql, /drop function if exists public\.create_receipt_link\(uuid, text, text, text, text, date, numeric, numeric, integer\);/);
  const page = readFileSync(new URL("../api/_lib/receiptLinkPage.js", import.meta.url), "utf8");
  assert.match(page, /receipt_links\?code=eq\.\$\{code\}&select=\*/);
  const link = readFileSync(new URL("../src/features/accounts/io/receiptLink.js", import.meta.url), "utf8");
  assert.match(link, /details\.kind && details\.kind !== "bill" \? \{ p_kind/);
});

test("a saved copy of the old built-in receipt template gets the new short one; real edits stay", async () => {
  const { resolveWhatsAppTemplate } = await import("../src/features/receipts/model/templateEngine.js");
  const oldDaily = `Hi {customer_name},\n\nWe have received your payment of {amount}.\n\nReceipt No: {receipt_number}\nAccount: {account_id}\nPayment Date: {payment_date}\nPayment Mode: {payment_mode}\n{day_progress}\nRemaining Balance: {remaining_balance}\n\nThank you for your payment.\n{company_name}\nBachupally | {company_phone}`;
  assert.equal(resolveWhatsAppTemplate({ whatsappTemplates: { daily_payment_receipt: oldDaily } }, "daily_payment_receipt"), DEFAULT_WHATSAPP_TEMPLATES.daily_payment_receipt);
  const edited = oldDaily.replace("Bachupally", "Kukatpally");
  assert.equal(resolveWhatsAppTemplate({ whatsappTemplates: { daily_payment_receipt: edited } }, "daily_payment_receipt"), edited);
  const message = buildWhatsAppMessage({ ...base, dailyFields: { daysCompleted: 76, daysRemaining: 24 }, receiptLink: "https://x/b/1" },
    { whatsappTemplates: { daily_payment_receipt: oldDaily } });
  assert.match(message, /Amount Received: \*₹500\*/);
  assert.doesNotMatch(message, /Bachupally/);
});
