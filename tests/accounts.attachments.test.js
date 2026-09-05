import test from "node:test";
import assert from "node:assert/strict";
import {
  assertVoucherAttachmentMeta,
  normalizeAttachmentContentType,
  VOUCHER_ATTACHMENT_MAX_BYTES,
} from "../src/features/accounts/voucherAttachments.js";

test("attachment content type is inferred from file extension", () => {
  assert.equal(normalizeAttachmentContentType("", "bill.PDF"), "application/pdf");
  assert.equal(normalizeAttachmentContentType("image/png", "x.png"), "image/png");
});

test("attachment meta rejects oversized and unknown types", () => {
  assert.throws(
    () => assertVoucherAttachmentMeta({ fileName: "x.txt", contentType: "text/plain", byteSize: 10 }),
    /Only PDF/,
  );
  assert.throws(
    () => assertVoucherAttachmentMeta({
      fileName: "big.pdf",
      contentType: "application/pdf",
      byteSize: VOUCHER_ATTACHMENT_MAX_BYTES + 1,
    }),
    /512 KB/,
  );
});

test("attachment meta accepts a valid PDF under the size cap", () => {
  const meta = assertVoucherAttachmentMeta({
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    byteSize: 2048,
  });
  assert.deepEqual(meta, {
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    byteSize: 2048,
  });
});
