import test from "node:test";
import assert from "node:assert/strict";
import { customerBillMessage, greetingName } from "../src/features/accounts/model/billMessage.js";

test("bill message is a short note with the link, not the itemised bill", () => {
  const text = customerBillMessage({
    businessName: "Balaji Traders", businessPhone: "9143066066", customerName: "Swathi Reddy",
    billNo: "B-ECBCF2F0", amount: 75, balance: 0, paidBy: "Cash", link: "https://myfintracker.com/b/3f9a1c2b7d4e",
  });
  assert.match(text, /^Hi Swathi,\n/);
  assert.match(text, /Thank you for shopping at \*Balaji Traders\*\./);
  assert.match(text, /Bill No: B-ECBCF2F0\nBill Amount: \*₹75\*\nPaid \(Cash\): ₹75/);
  assert.match(text, /View your bill:\nhttps:\/\/myfintracker\.com\/b\/3f9a1c2b7d4e/);
  assert.match(text, /Happy to serve you!\nBalaji Traders\n9143066066$/);
  assert.doesNotMatch(text, /─|Item\s+Qty/);
});

test("credit bill shows the balance due, with paise", () => {
  const text = customerBillMessage({ businessName: "Balaji Traders", amount: 1142.5, balance: 1142.5, link: "https://x/b/1" });
  assert.match(text, /Bill Amount: \*₹1,142\.50\*\nBalance Due: \*₹1,142\.50\*/);
  assert.doesNotMatch(text, /Paid/);
});

test("greeting uses the first name and skips cash customers and the phone suffix", () => {
  assert.equal(greetingName("Swathi (M: 9885908893)"), "Swathi");
  assert.equal(greetingName("Cash customer"), "");
  assert.equal(greetingName(""), "");
  assert.match(customerBillMessage({ customerName: "Cash customer", amount: 10 }), /^Hi,\n/);
});

test("a sales invoice goes out in the Counter bill message format, worded as an invoice", () => {
  const text = customerBillMessage({
    businessName: "Balaji Traders", businessPhone: "9160710101", customerName: "Sai Traders",
    billNo: "SALE-000004", amount: 1600, balance: 1600, link: "https://x/b/1", documentLabel: "invoice", dueDate: "29 Nov 2026",
  });
  assert.match(text, /^Hi Sai,\n\nThank you for shopping at \*Balaji Traders\*\./);
  assert.match(text, /Your invoice is ready\.\nInvoice No: SALE-000004\nInvoice Amount: \*₹1,600\*\nBalance Due: \*₹1,600\*\nDue Date: 29 Nov 2026/);
  assert.match(text, /View your invoice:\nhttps:\/\/x\/b\/1/);
  // Counter bills are unchanged.
  assert.match(customerBillMessage({ billNo: "B-1", amount: 10, link: "https://x" }), /Your bill is ready\.\nBill No: B-1\nBill Amount/);
});
