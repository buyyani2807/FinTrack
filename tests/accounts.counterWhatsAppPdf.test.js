import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Counter sale's "Share on WhatsApp" used to be text-only, unlike the regular
// Sales Invoice ("+ New sale") WhatsApp button, which already tried handing
// WhatsApp the PDF via the native share sheet on phones/tablets first. This
// locks in that Counter sale now tries the same PDF-attach path before
// falling back to the text message.
test("Counter sale WhatsApp share tries the PDF-attach (navigator.share) path before falling back to text", () => {
  const source = readFileSync(
    new URL("../src/features/accounts/components/CounterWorkspace.jsx", import.meta.url),
    "utf8",
  );
  const shareFnMatch = source.match(/const shareLastReceipt = async \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(shareFnMatch, "shareLastReceipt function not found");
  const body = shareFnMatch[0];
  assert.match(body, /invoicePdfShareOnThisDevice\(navigator\.userAgent, navigator\.maxTouchPoints\)/);
  assert.match(body, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(body, /navigator\.share\(\{ files: \[file\], title: file\.name \}\)/);
  // A bill with a customer number goes straight to that number (wa.me + PDF link) first;
  // the share sheet (which can't take a recipient) is only for bills without one.
  const numberIndex = body.indexOf("if (canWhatsAppShare(partyPhone))");
  const pdfIndex = body.indexOf("navigator.share({ files:");
  const noPhoneIndex = body.indexOf("No customer phone on this bill");
  assert.ok(numberIndex > -1 && pdfIndex > -1 && noPhoneIndex > -1);
  assert.ok(numberIndex < pdfIndex && pdfIndex < noPhoneIndex);
  // With a link: the short customer note; without one (offline): the itemised text.
  assert.match(body, /const message = link\s*\? customerBillMessage\(\{[\s\S]*?link,[\s\S]*?\}\)\s*: withReceiptLink\(text, ""\);/);
  assert.match(body, /openManualWhatsAppShare\(\{\s*phone: partyPhone,\s*message,/);
});
