import test from "node:test";
import assert from "node:assert/strict";
import { buildOfflineReceiptInvoice } from "../src/features/accounts/model/counterOffline.js";
import { renderSalesInvoicePdf } from "../src/features/accounts/io/salesInvoicePdf.js";

const bill = status => ({
  id: "x", offlineRef: "B-ECBCF2F0", date: "2026-11-21", createdAt: "2026-11-21T06:58:00Z", amount: 75,
  moneyMode: "cash", syncStatus: status, customerName: "Swathi", customerPhone: "9885908893", tillLabel: "Till 1",
  itemLines: [{ itemName: "Chana Dal", quantity: 0.5, unit: "kg", rate: 150, amount: 75, taxableAmount: 75 }],
});
const invoice = status => buildOfflineReceiptInvoice({
  bill: bill(status), companyName: "Balaji Traders", companyAddress: "Kukatpally, Hyderabad", companyPhone: "9143066066",
  bankLines: ["IFSC: KKBK0007466"], printFormat: "a4",
});

test("Counter bill on regular paper has shop phone and address, Bill To, units and received/balance", () => {
  const pdf = renderSalesInvoicePdf(invoice("posted"), { template: "a4" });
  for (const text of ["(Balaji Traders)", "(Ph: 9143066066)", "(Kukatpally, Hyderabad)", "(Bill To)", "(Mobile)", "(9885908893)",
    "(0.5 KG)", "(SUBTOTAL)", "(Received Amount)", "(Balance)", "(Total Amount \\(in words\\))", "(Bank Details)", "(Signature)", "(ORIGINAL FOR RECIPIENT)"]) {
    assert.ok(pdf.includes(text), `missing ${text}`);
  }
});

test("only a bill still waiting to sync says the bill number is provisional", () => {
  assert.equal(invoice("posted").receiptFooter, "Thank You & Visit Again..!");
  assert.equal(invoice("synced").receiptFooter, "Thank You & Visit Again..!");
  assert.match(invoice("pending").receiptFooter, /Offline/);
});
