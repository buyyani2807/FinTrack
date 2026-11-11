import test from "node:test";
import assert from "node:assert/strict";
import {
  assertVoucherAttachmentMeta,
  normalizeAttachmentContentType,
  proofCountByVoucher,
  VOUCHER_ATTACHMENT_MAX_BYTES,
} from "../src/features/accounts/data/voucherAttachments.js";

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

test("proof counts group attachments by voucher", () => {
  const counts = proofCountByVoucher([
    { voucherId: "a" },
    { voucherId: "a" },
    { voucherId: "b" },
  ]);
  assert.equal(counts.get("a"), 2);
  assert.equal(counts.get("b"), 1);
  assert.equal(counts.get("c") || 0, 0);
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
