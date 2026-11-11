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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that photo. Use a JPEG or PNG."));
    image.src = src;
  });
}

async function fileToJpegBlob(file) {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read that photo. Use a JPEG or PNG.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => {
      if (result) resolve(result);
      else reject(new Error("Could not read that photo. Use a JPEG or PNG."));
    }, "image/jpeg", 0.72);
  });
  return blob;
}

function jpegFileName(fileName) {
  const base = String(fileName || "expense-bill").replace(/\.[^.]+$/, "").slice(0, 170).trim() || "expense-bill";
  return `${base}.jpg`;
}

/** Compress photos and validate a PDF/image for acc_voucher_attachments. */
export async function prepareVoucherAttachmentFile(file) {
  if (!file) throw new Error("Choose a PDF or photo of the bill.");
  const type = normalizeAttachmentContentType(file.type, file.name);
  if (!VOUCHER_ATTACHMENT_TYPES.includes(type)) {
    throw new Error("Only PDF, JPEG, PNG, or WebP bills are allowed");
  }
  if (type === "application/pdf") {
    const data = await readFileAsBase64(file);
    const meta = assertVoucherAttachmentMeta({
      fileName: String(file.name || "expense-bill.pdf").slice(0, 180),
      contentType: type,
      byteSize: file.size,
    });
    return { ...meta, data };
  }
  const jpeg = await fileToJpegBlob(file);
  const data = await readFileAsBase64(jpeg);
  const meta = assertVoucherAttachmentMeta({
    fileName: jpegFileName(file.name),
    contentType: "image/jpeg",
    byteSize: jpeg.size,
  });
  return { ...meta, data };
}

export function proofCountByVoucher(index = []) {
  const map = new Map();
  for (const row of index || []) {
    const id = row.voucherId || row.voucher_id;
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + 1);
  }
  return map;
}
