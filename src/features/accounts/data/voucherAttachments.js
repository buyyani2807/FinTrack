/** Voucher attachment validation shared by UI and unit tests. */

export const VOUCHER_ATTACHMENT_MAX_BYTES = 512 * 1024;
export const VOUCHER_ATTACHMENT_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function normalizeAttachmentContentType(type, fileName = "") {
  const raw = String(type || "").trim().toLowerCase();
  if (VOUCHER_ATTACHMENT_TYPES.includes(raw)) return raw;
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return raw || "";
}

export function assertVoucherAttachmentMeta({ fileName, contentType, byteSize }) {
  const name = String(fileName || "").trim();
  if (!name) throw new Error("File name is required");
  if (name.length > 180) throw new Error("File name is too long");
  const type = normalizeAttachmentContentType(contentType, name);
  if (!VOUCHER_ATTACHMENT_TYPES.includes(type)) {
    throw new Error("Only PDF, JPEG, PNG, or WebP attachments are allowed");
  }
  const size = Number(byteSize || 0);
  if (!Number.isFinite(size) || size <= 0 || size > VOUCHER_ATTACHMENT_MAX_BYTES) {
    throw new Error("Attachment must be between 1 byte and 512 KB");
  }
  return { fileName: name, contentType: type, byteSize: size };
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.readAsDataURL(file);
  });
}

export function attachmentDownloadHref(attachment) {
  if (!attachment?.contentBase64 || !attachment?.contentType) return "";
  return `data:${attachment.contentType};base64,${attachment.contentBase64}`;
}
