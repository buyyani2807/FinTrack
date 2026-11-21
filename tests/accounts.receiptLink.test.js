import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// receiptLink.js imports lib/supabase.js (import.meta.env), so the pure helpers are
// checked here by source, matching the other Accounts io tests.
const source = readFileSync(new URL("../src/features/accounts/io/receiptLink.js", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/154_receipt_pdf_links.sql", import.meta.url), "utf8");

test("receipt PDFs are stored per Accounts company and shared through an expiring signed link", () => {
  assert.match(source, /export const RECEIPT_BUCKET = "receipts";/);
  assert.match(source, /return `\$\{folder\}\/\$\{name\}\.pdf`;/);
  assert.match(source, /createSignedUrl\(RECEIPT_BUCKET, path, days \* 24 \* 60 \* 60, token\)/);
  assert.match(source, /Download bill \(PDF\): \$\{link\}/);
});

test("the receipts bucket is private and only the company's own organization can upload or sign", () => {
  assert.match(sql, /values \('receipts', 'receipts', false,/);
  assert.match(sql, /c\.organization_id = public\.current_organization_id\(\)/);
  for (const action of ["insert", "select", "update"]) {
    assert.match(sql, new RegExp(`for ${action} to authenticated[\\s\\S]*?receipt_folder_allowed`));
  }
  assert.doesNotMatch(sql, /to anon/);
});

test("Counter uploads the PDF as soon as a bill with a number is charged", () => {
  const counter = readFileSync(new URL("../src/features/accounts/components/CounterWorkspace.jsx", import.meta.url), "utf8");
  assert.match(counter, /const rememberLastBill = bill => \{\s*setLastBill\(bill\);\s*if \(canWhatsAppShare\(billPhone\(bill\)\)\) receiptLinkFor\(bill\);/);
  assert.doesNotMatch(counter, /\bsetLastBill\(\{/);
});
