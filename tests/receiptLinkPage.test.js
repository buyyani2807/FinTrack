/* global process */
import test from "node:test";
import assert from "node:assert/strict";

process.env.VITE_SUPABASE_URL = "https://proj.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
const rows = {
  aaaaaaaaaaaa: { storage_path: "co/bill.pdf", business_name: "Balaji Traders", bill_no: "B-1", bill_date: "2026-11-21", amount: 718, balance: 0, expires_at: "2099-01-01T00:00:00Z" },
  cccccccccccc: { storage_path: "co/old.pdf", business_name: "Balaji Traders", amount: 1, balance: 0, expires_at: "2020-01-01T00:00:00Z" },
};
const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const href = String(url);
  if (href.includes("/rest/v1/receipt_links")) {
    const code = /code=eq\.([a-f0-9]+)/.exec(href)?.[1];
    return new Response(JSON.stringify(rows[code] ? [rows[code]] : []), { status: 200 });
  }
  if (href.includes("/storage/v1/object/sign/receipts/co/bill.pdf")) {
    return new Response(JSON.stringify({ signedURL: "/object/sign/receipts/co/bill.pdf?token=t" }), { status: 200 });
  }
  return realFetch(url);
};
const { default: handler } = await import("../api/accounts/bill-scan.js");
const { receiptCardElement } = await import("../api/_lib/receiptLinkPage.js");

async function run(query, method = "GET") {
  const out = { status: 200, headers: {}, body: null };
  const res = {
    status(code) { out.status = code; return res; },
    setHeader(key, value) { out.headers[key] = value; },
    send(body) { out.body = body; return res; },
    json(body) { out.body = body; return res; },
    end() { return res; },
  };
  await handler({ method, query, headers: { host: "myfintracker.com" } }, res);
  return out;
}

test("/b/<code> serves a preview page (shop, amount, card image) that opens the PDF", async () => {
  const page = await run({ receipt: "aaaaaaaaaaaa" });
  assert.equal(page.status, 200);
  assert.match(page.body, /og:title" content="Balaji Traders · Bill ₹718"/);
  assert.match(page.body, /og:description" content="Bill No B-1 · 21 Nov 2026 · Paid · Tap to view your bill"/);
  assert.match(page.body, /og:image" content="https:\/\/myfintracker\.com\/b\/aaaaaaaaaaaa\/card\.png"/);
  assert.match(page.body, /http-equiv="refresh" content="1;url=https:\/\/proj\.supabase\.co\/storage\/v1\/object\/sign\/receipts\/co\/bill\.pdf\?token=t"/);
});

test("expired, unknown and malformed links never reach storage", async () => {
  assert.equal((await run({ receipt: "cccccccccccc" })).status, 410);
  assert.equal((await run({ receipt: "dddddddddddd" })).status, 404);
  assert.equal((await run({ receipt: "../../etc" })).status, 404);
  assert.equal((await run({ receipt: "aaaaaaaaaaaa" }, "POST")).status, 405);
});

test("bill-scan still refuses non-POST requests that are not bill links", async () => {
  assert.equal((await run({})).status, 405);
});

test("preview card shows Paid or the balance due", () => {
  const json = value => JSON.stringify(receiptCardElement(value));
  assert.match(json({ business_name: "Balaji", amount: 718, balance: 0 }), /"Paid"/);
  const due = json({ business_name: "Balaji", amount: 1142.5, balance: 1142.5 });
  assert.match(due, /"Unpaid"/);
  assert.match(due, /₹1,142\.50/);
});

test("preview wording follows the document kind", async () => {
  const { documentWording } = await import("../api/_lib/receiptLinkPage.js");
  const receipt = documentWording({ kind: "receipt", amount: 500, balance: 27000 });
  assert.equal(receipt.amountLabel, "Payment Received");
  assert.equal(receipt.pill, "Received");
  assert.equal(receipt.status, "Balance ₹27,000");
  assert.equal(documentWording({ kind: "quotation", amount: 18500 }).amountLabel, "Quotation Value");
  assert.equal(documentWording({ amount: 75, balance: 0 }).pill, "Paid");
  assert.equal(documentWording({ kind: "invoice", amount: 1575, balance: 1575 }).amountLabel, "Balance Due");
});
