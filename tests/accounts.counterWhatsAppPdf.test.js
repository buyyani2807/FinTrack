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
  const shareFnMatch = source.match(/const shareLastReceipt = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(shareFnMatch, "shareLastReceipt function not found");
  const body = shareFnMatch[0];
  assert.match(body, /invoicePdfShareOnThisDevice\(navigator\.userAgent, navigator\.maxTouchPoints\)/);
  assert.match(body, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(body, /navigator\.share\(\{ files: \[file\], title: file\.name \}\)/);
  // The PDF-attach attempt must come before the existing text-message branches.
  const pdfIndex = body.indexOf("navigator.share({ files:");
  const textIndex = body.indexOf("openManualWhatsAppShare({ phone: partyPhone, message: text })");
  assert.ok(pdfIndex > -1 && textIndex > -1 && pdfIndex < textIndex);
});
