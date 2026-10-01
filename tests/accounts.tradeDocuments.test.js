import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  buildTradeDocumentMessage,
  buildTradeDocumentView,
  conversionLines,
  creditCheck,
  documentDisplayStatus,
  documentDraft,
  documentFulfilment,
  emptyDocumentForm,
  pendingOrderRows,
} from "../src/features/accounts/tradeDocumentModel.js";
import { isValidUpiId, parsePayPageParams, payPageUrl, upiPayLink } from "../src/features/accounts/upiPay.js";
import { encodeQr } from "../src/lib/qrCode.js";
import { jpegInfo, renderDocumentPdf, textWidth, wrapText } from "../src/features/accounts/documentPdf.js";
import { renderTradeDocumentPdf } from "../src/features/accounts/tradeDocumentPdf.js";
import { buildArReminderMessage, buildSalesInvoice, buildSalesInvoiceMessage } from "../src/features/accounts/salesInvoiceModel.js";
import { renderSalesInvoicePdf } from "../src/features/accounts/salesInvoicePdf.js";
import { costItemMovements } from "../src/features/accounts/inventoryValuation.js";
import { itemizedEntryDraft, mapVoucherItemLinesForRpc } from "../src/features/accounts/inventoryModel.js";

const line = (id, quantity, rate, extra = {}) => ({
  id, itemId: `item-${id}`, itemName: `Item ${id}`, itemType: "product", unit: "Nos", quantity, rate,
  discountAmount: 0, gstRate: 18, hsnSac: "7214", taxableAmount: quantity * rate, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, ...extra,
});

const salesOrder = { id: "so1", docType: "sales_order", docNumber: "SO-00001", docDate: "2026-09-01", validUntil: "2026-09-10", partyId: "c1", status: "open", lines: [line("sol1", 10, 100), line("sol2", 4, 50)] };
const challan = { id: "dc1", docType: "delivery_challan", docNumber: "DC-00001", docDate: "2026-09-03", partyId: "c1", status: "open", sourceDocumentId: "so1", lines: [line("dcl1", 6, 100, { sourceLineId: "sol1" })] };
const cancelledChallan = { ...challan, id: "dc2", status: "cancelled", lines: [line("dcl2", 4, 100, { sourceLineId: "sol1" })] };

test("document draft validates and shapes lines for the RPC", () => {
  const form = { ...emptyDocumentForm("quotation", "2026-09-01"), partyId: "c1", lines: [{ itemId: "i1", itemName: "Cement", itemType: "product", unit: "Bag", quantity: "10", rate: "350", discount: "10%", gstRate: "18" }] };
  assert.equal(form.validUntil, "2026-09-16");
  const draft = documentDraft(form, { intra: true, gstEnabled: true });
  assert.equal(draft.lines.length, 1);
  assert.equal(draft.lines[0].discount_amount, 350);
  assert.equal(draft.lines[0].taxable_amount, 3150);
  assert.equal(draft.lines[0].cgst_amount, 283.5);
  assert.equal(draft.totals.total, 3717);
  assert.throws(() => documentDraft({ ...form, partyId: "" }), /customer/);
  assert.throws(() => documentDraft({ ...form, validUntil: "2026-08-01" }), /before the document date/);
  const challanForm = { ...emptyDocumentForm("delivery_challan", "2026-09-01"), partyId: "c1", lines: [{ itemName: "Loose item", itemType: "product", quantity: "1", rate: "10" }] };
  assert.throws(() => documentDraft(challanForm), /saved item/);
});

test("fulfilment counts later documents and posted invoice lines, not cancelled ones", () => {
  const voucherItemLines = [
    { id: "v1l", voucherId: "inv1", quantity: 3, sourceDocumentLineId: "sol1" },
    { id: "v2l", voucherId: "draft1", quantity: 1, sourceDocumentLineId: "sol1" },
    { id: "v3l", voucherId: "inv2", quantity: 6, sourceDocumentLineId: "dcl1" },
  ];
  const vouchers = [{ id: "inv1", status: "posted" }, { id: "draft1", status: "cancelled" }, { id: "inv2", status: "posted" }];
  const fulfilment = documentFulfilment({ documents: [salesOrder, challan, cancelledChallan], voucherItemLines, vouchers });
  const so = fulfilment.get("so1");
  assert.equal(so.lines[0].used, 9);
  assert.equal(so.lines[0].pending, 1);
  assert.equal(so.lines[1].pending, 4);
  assert.equal(so.progress, "partial");
  assert.equal(so.hasFollowups, true);
  assert.equal(fulfilment.get("dc1").progress, "complete");
  assert.deepEqual(documentDisplayStatus(salesOrder, so, "2026-09-05"), { label: "Partly delivered", tone: "amber" });
  assert.deepEqual(documentDisplayStatus(challan, fulfilment.get("dc1"), "2026-09-05"), { label: "Billed", tone: "green" });

  const converted = conversionLines(salesOrder, so);
  assert.deepEqual(converted.map(row => [row.quantity, row.sourceDocumentLineId]), [["1", "sol1"], ["4", "sol2"]]);

  const rows = pendingOrderRows({ documents: [salesOrder], fulfilment, side: "sales", parties: [{ id: "c1", name: "Ravi" }], today: "2026-09-12" });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].overdue, true);
  assert.equal(rows[0].partyName, "Ravi");
});

test("conversion prorates the discount on the pending quantity", () => {
  const quote = { id: "q1", docType: "quotation", status: "open", lines: [line("ql1", 10, 100, { discountAmount: 100 })] };
  const summary = { lines: [{ lineId: "ql1", quantity: 10, used: 6, pending: 4 }] };
  const [next] = conversionLines(quote, summary);
  assert.equal(next.quantity, "4");
  assert.equal(next.discount, "40");
  assert.equal(next.sourceLineId, "ql1");
});

test("quotation statuses: converted, accepted, expired, declined", () => {
  const quote = { id: "q", docType: "quotation", status: "open", validUntil: "2026-09-10" };
  assert.equal(documentDisplayStatus(quote, { hasFollowups: true }, "2026-09-20").label, "Converted");
  assert.equal(documentDisplayStatus(quote, null, "2026-09-20").label, "Expired");
  assert.equal(documentDisplayStatus({ ...quote, status: "accepted" }, null, "2026-09-05").label, "Accepted");
  assert.equal(documentDisplayStatus({ ...quote, status: "declined" }, null, "2026-09-05").label, "Declined");
});

test("invoice lines made from a document carry the source line to the RPC", () => {
  const accounts = [
    { id: "ar", code: "1100", accountType: "receivable", groupType: "asset" },
    { id: "sales", code: "4300", accountType: "income", groupType: "income" },
  ];
  const draft = itemizedEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-09-05",
    partyId: "c1",
    settlement: "credit",
    itemLines: [{ itemId: "i1", itemName: "Cement", itemType: "product", unit: "Bag", quantity: "2", rate: "100", gstRate: "0", sourceDocumentLineId: "dcl1" }],
    intra: true,
    gstEnabled: false,
  });
  const [rpcLine] = mapVoucherItemLinesForRpc(draft.itemLines);
  assert.equal(rpcLine.source_document_line_id, "dcl1");
});

test("credit check warns or blocks on limit and overdue days", () => {
  const party = { id: "c1", name: "Ravi", creditLimit: 10000 };
  assert.equal(creditCheck({ party, outstanding: 4000, invoiceTotal: 5000, settings: { creditControl: "block" } }).level, "ok");
  const over = creditCheck({ party, outstanding: 8000, invoiceTotal: 5000, settings: { creditControl: "warn" } });
  assert.equal(over.level, "warn");
  assert.match(over.messages[0], /over the credit limit/);
  assert.equal(creditCheck({ party, outstanding: 8000, invoiceTotal: 5000, settings: { creditControl: "block" } }).level, "block");
  assert.equal(creditCheck({ party, outstanding: 8000, invoiceTotal: 5000, settings: { creditControl: "off" } }).level, "ok");
  const overdue = creditCheck({ party: { ...party, creditLimit: 0 }, overdueDays: 45, settings: { creditControl: "block", overdueBlockDays: 30 } });
  assert.equal(overdue.level, "block");
  assert.match(overdue.messages[0], /overdue by 45 days/);
});

test("UPI links and the public pay page round-trip", () => {
  assert.equal(isValidUpiId("shop@okaxis"), true);
  assert.equal(isValidUpiId("not an id"), false);
  assert.equal(upiPayLink({ upiId: "shop@okaxis", payeeName: "Sri Traders", amount: 1250, note: "INV-12" }), "upi://pay?pa=shop%40okaxis&pn=Sri%20Traders&am=1250.00&cu=INR&tn=INV-12");
  assert.equal(upiPayLink({ upiId: "bad" }), "");
  const url = payPageUrl("https://app.example.com/", { upiId: "shop@okaxis", payeeName: "Sri Traders", amount: 99.999, note: "INV-12" });
  assert.equal(url, "https://app.example.com/pay?pa=shop%40okaxis&pn=Sri+Traders&am=100.00&tn=INV-12");
  const parsed = parsePayPageParams(new URL(url).search);
  assert.deepEqual(parsed, { upiId: "shop@okaxis", payeeName: "Sri Traders", amount: 100, note: "INV-12", valid: true });
  assert.equal(parsePayPageParams("?pa=nope").valid, false);
});

test("QR encoder matches the reference implementation", () => {
  const expected = [
    "11111110100101100111101111111",
    "10000010111010001100101000001",
    "10111010001111100011001011101",
    "10111010100100111101101011101",
    "10111010001011111111001011101",
    "10000010010101000101101000001",
    "11111110101010101010101111111",
    "00000000110110010110100000000",
    "10110111000111101101001001011",
    "01001001111001001011101010101",
    "10001011001111000010011000000",
    "11010001001111010000011001011",
    "11000111110100110101000000111",
    "11011000100010010101011001001",
    "01011011101010001001101000111",
    "10101100010100010001101010010",
    "11100010101010101011110010000",
    "00001101111000011100100100110",
    "10010010001101110000011101100",
    "00110001001101100110100011110",
    "01111110001011100101111110111",
    "00000000101110000100100010001",
    "11111110100000100110101010110",
    "10000010100101110010100010001",
    "10111010011010000110111110111",
    "10111010100000010110110010101",
    "10111010111100101001000000001",
    "10000010001101110001101111010",
    "11111110111011101001111111010",
  ];
  const qr = encodeQr("upi://pay?pa=shop@okaxis&am=10.00&cu=INR", { ecc: "M", mask: 3 });
  assert.equal(qr.version, 3);
  assert.deepEqual(qr.modules.map(row => row.map(dark => (dark ? "1" : "0")).join("")), expected);
  const auto = encodeQr("x".repeat(300));
  assert.equal(auto.size, auto.version * 4 + 17);
  assert.ok(auto.mask >= 0 && auto.mask < 8);
  assert.throws(() => encodeQr("x".repeat(3000)), /too long/);
});

test("PDF text helpers measure and wrap Helvetica text", () => {
  assert.equal(textWidth("ii", 10), 4.44);
  assert.ok(textWidth("W", 10, true) > textWidth("i", 10, true));
  const lines = wrapText("Steel rod TMT 12mm Fe500D grade bundle", 9, 80);
  assert.ok(lines.length > 1);
  lines.forEach(row => assert.ok(textWidth(row, 9) <= 80));
  assert.deepEqual(wrapText("₹ 100 — paid", 9, 500), ["Rs. 100 - paid"]);
});

const tinyJpeg = () => {
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9];
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
};

test("document PDF embeds the logo and a UPI QR on every template", () => {
  assert.deepEqual(jpegInfo(Buffer.from(tinyJpeg().split(",")[1], "base64").toString("latin1")), { height: 16, width: 32, components: 3 });
  const model = {
    title: "TAX INVOICE",
    meta: [["Invoice No", "SALE-1"]],
    seller: { name: "Sri Traders", lines: ["Hyderabad"], logoDataUrl: tinyJpeg() },
    party: { name: "Ravi", lines: [] },
    items: [{ name: "Cement", quantity: "2 Bag", rate: "Rs.350", amount: "Rs.700" }],
    totals: [{ label: "Total", value: "Rs.700", bold: true }],
    upi: { link: "upi://pay?pa=shop@okaxis&am=700.00&cu=INR", caption: ["Scan to pay Rs.700"] },
  };
  for (const template of ["a4", "a5", "thermal"]) {
    const pdf = renderDocumentPdf(model, { template });
    assert.match(pdf, /^%PDF-1\.4/);
    assert.match(pdf, /\/Filter \/DCTDecode/);
    assert.match(pdf, /\/Width 32 \/Height 16/);
    assert.match(pdf, /Scan to pay Rs\.700/);
    assert.ok((pdf.match(/ re/g) || []).length > 100, "QR modules drawn");
    assert.match(pdf, /startxref\n\d+\n%%EOF$/);
  }
  const thermal = renderDocumentPdf(model, { template: "thermal" });
  assert.match(thermal, /\/MediaBox \[0 0 226 \d+\]/);
  const xref = Number(/startxref\n(\d+)/.exec(thermal)[1]);
  assert.equal(thermal.slice(xref, xref + 4), "xref");
});

test("long invoices continue on more pages", () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ name: `Item ${i + 1}`, quantity: "1", rate: "Rs.1", amount: "Rs.1" }));
  const pdf = renderDocumentPdf({ title: "INVOICE", seller: { name: "Co" }, party: { name: "P" }, items, totals: [] }, { template: "a5" });
  assert.ok((pdf.match(/\/Type \/Page /g) || []).length >= 2);
  assert.match(pdf, /Page 1 of/);
});

const accounts = [
  { id: "ar", code: "1100", name: "Accounts Receivable", accountType: "receivable", groupType: "asset" },
  { id: "cash", code: "1000", name: "Cash", accountType: "cash", groupType: "asset" },
  { id: "sales", code: "4100", name: "Sales", accountType: "income", groupType: "income" },
];
const docSettings = { businessAddress: "Ameerpet, Hyderabad", businessPhone: "9000000000", upiId: "shop@okaxis", bankName: "HDFC", bankAccountNumber: "123", bankIfsc: "hdfc0001", invoiceTerms: "No returns.", showUpiQr: true };
const company = { id: "co", name: "Sri Traders", gstin: "36AAAAA0000A1Z5", stateName: "Telangana", stateCode: "36", documentSettings: docSettings };

test("credit invoices carry branding, a UPI QR and a pay link; cash sales do not", () => {
  const voucher = { id: "v", voucherNumber: "SALE-7", date: "2026-09-01", dueDate: "2026-09-15", status: "posted", partyId: "c1", lines: [{ coaId: "ar", debit: 1180 }, { coaId: "sales", credit: 1000 }], gstLines: [{ taxable: 1000, cgst: 90, sgst: 90, igst: 0, rate: 18 }] };
  const invoice = buildSalesInvoice({ voucher, party: { name: "Ravi", phone: "9876543210" }, accounts, company });
  assert.equal(invoice.title, "TAX INVOICE");
  assert.equal(invoice.companyAddress, "Ameerpet, Hyderabad, Telangana (36)");
  assert.equal(invoice.companyPhone, "9000000000");
  assert.deepEqual(invoice.bankLines, ["Bank: HDFC  A/c: 123  IFSC: HDFC0001"]);
  assert.equal(invoice.receiptTerms, "No returns.");
  assert.equal(invoice.upiLink, "upi://pay?pa=shop%40okaxis&pn=Sri%20Traders&am=1180.00&cu=INR&tn=SALE-7");
  const pdf = renderSalesInvoicePdf(invoice);
  assert.match(pdf, /Scan to pay Rs\.1,180/);
  assert.match(pdf, /IFSC: HDFC0001/);

  const cash = buildSalesInvoice({ voucher: { ...voucher, lines: [{ coaId: "cash", debit: 1180 }, { coaId: "sales", credit: 1180 }], gstLines: [] }, accounts, company });
  assert.equal(cash.upiLink, "");
  assert.doesNotMatch(renderSalesInvoicePdf(cash), /Scan to pay/);
  assert.doesNotMatch(buildSalesInvoiceMessage(cash), /Pay by UPI/);
});

test("payment reminders include the pay page link when a UPI ID is set", () => {
  const row = { partyName: "Ravi", reference: "SALE-7", invoiceDate: "2026-09-01", dueDate: "2026-09-15", amount: 1180, outstanding: 500, daysOverdue: 3 };
  const message = buildArReminderMessage(row, {}, company, {}, { origin: "https://app.example.com" });
  assert.match(message, /Pay by UPI: https:\/\/app\.example\.com\/pay\?pa=shop%40okaxis&pn=Sri\+Traders&am=500\.00&tn=SALE-7/);
  const withoutUpi = buildArReminderMessage(row, {}, { name: "Sri Traders" }, {}, { origin: "https://app.example.com" });
  assert.doesNotMatch(withoutUpi, /Pay by UPI/);
});

test("trade document view, WhatsApp text and PDF", () => {
  const quote = { id: "q1", docType: "quotation", docNumber: "QT-00003", docDate: "2026-09-01", validUntil: "2026-09-16", partyId: "c1", status: "open", reference: "ENQ-9", lines: [line("ql1", 10, 100, { cgstAmount: 90, sgstAmount: 90 })] };
  const view = buildTradeDocumentView({ doc: quote, party: { name: "Ravi", phone: "9876543210" }, company: { ...company, documentSettings: { ...docSettings, quotationTerms: "Valid 15 days." } } });
  assert.equal(view.title, "QUOTATION");
  assert.equal(view.total, 1180);
  assert.equal(view.terms, "Valid 15 days.");
  const message = buildTradeDocumentMessage(view);
  assert.match(message, /Quotation No: QT-00003/);
  assert.match(message, /Valid until: /);
  assert.match(message, /- Item ql1: 10 Nos x/);
  assert.match(message, /incl\. GST/);
  const pdf = renderTradeDocumentPdf(view, { template: "a4" });
  assert.match(pdf, /QUOTATION/);
  assert.match(pdf, /QT-00003/);
  assert.match(pdf, /Valid 15 days\./);
  assert.doesNotMatch(pdf, /Scan to pay/);

  const dcView = buildTradeDocumentView({ doc: challan, party: { name: "Ravi" }, company, documents: [salesOrder] });
  assert.equal(dcView.sourceNumber, "Sales order SO-00001");
  assert.match(renderTradeDocumentPdf(dcView, { template: "thermal" }), /Not a tax invoice/);
});

test("goods receipts are costed from their document line", () => {
  const item = { id: "i1", itemType: "product", purchasePrice: 0, openingStock: 0 };
  const movements = [
    { id: "g", itemId: "i1", movementDate: "2026-09-01", quantityDelta: 10, reason: "goods_receipt", documentLineId: "grl1" },
    { id: "d", itemId: "i1", movementDate: "2026-09-02", quantityDelta: -4, reason: "delivery", documentLineId: "dcl1" },
  ];
  const result = costItemMovements(item, movements, [{ id: "grl1", quantity: 10, rate: 55, amount: 550, discountAmount: 50, taxableAmount: 500 }]);
  assert.equal(result.averageCost, 50);
  assert.equal(result.quantity, 6);
  assert.equal(result.value, 300);
});
