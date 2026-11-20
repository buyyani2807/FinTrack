import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// On a busy-counter desktop, forcing web.whatsapp.com always pays for a fresh browser
// tab + page boot. wa.me (openManualWhatsAppShare) lets the OS hand the link straight
// to the WhatsApp Desktop app when it's installed — near-instant, already signed in —
// and still falls back to web.whatsapp.com itself when nothing claims it.
test("invoice WhatsApp text fallback uses wa.me (openManualWhatsAppShare), not a forced web.whatsapp.com tab", () => {
  const source = readFileSync(
    new URL("../src/features/accounts/components/SalesInvoiceActions.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /function sendInvoiceMessage\(invoice\) \{[\s\S]*?openManualWhatsAppShare\(\{ phone: invoice\.customerPhone, message \}\);[\s\S]*?\}/);
  assert.doesNotMatch(source, /openWhatsAppWeb/);
});
