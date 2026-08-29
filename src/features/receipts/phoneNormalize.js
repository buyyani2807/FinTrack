/** Normalize Indian phone numbers for WhatsApp wa.me links (digits only, country code 91). */
export function normalizeWhatsAppPhone(raw = "") {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return "";
}

export function hasWhatsAppPhone(raw = "") {
  return normalizeWhatsAppPhone(raw).length >= 12;
}
