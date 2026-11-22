import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Today's sales list and the Day report table only had Print/Void — no way to share a
// bill on WhatsApp once it had scrolled off the just-charged receipt. This wires a
// WhatsApp button into both rows, reusing sendSalesInvoiceOnWhatsApp (same PDF-attach-
// on-mobile, text-on-desktop behavior as "+ New sale").
test("CounterWorkspace exposes an onWhatsAppShare prop and wires a WhatsApp button into Today's list and the Day report table", () => {
  const source = readFileSync(
    new URL("../src/features/accounts/components/CounterWorkspace.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /onWhatsAppShare = null,/);
  const whatsAppButtons = source.match(/onClick=\{\(\) => onWhatsAppShare\(bill\.id\)\}/g) || [];
  assert.equal(whatsAppButtons.length, 2, "expected a WhatsApp button in both Today's list and the Day report table");
});

test("AccountingProduct wires onWhatsAppShare into both CounterWorkspace mounts and sends via sendSalesInvoiceOnWhatsApp", () => {
  const source = readFileSync(
    new URL("../src/features/accounts/AccountingProduct.jsx", import.meta.url),
    "utf8",
  );
  const wiredCount = (source.match(/onWhatsAppShare=\{voucherId => setPendingCounterWhatsAppId\(voucherId\)\}/g) || []).length;
  assert.equal(wiredCount, 2);
  assert.match(source, /sendSalesInvoiceOnWhatsApp\(withCounterReceiptPrint\(built, counterSettings\.printFormat\), \{[\s\S]*?billKey: voucher\.id,/);
});

test("sendSalesInvoiceOnWhatsApp is exported for reuse outside SalesInvoiceActions", () => {
  const source = readFileSync(
    new URL("../src/features/accounts/components/SalesInvoiceActions.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /export function sendSalesInvoiceOnWhatsApp\(invoice, explicitLink = null\)/);
});
