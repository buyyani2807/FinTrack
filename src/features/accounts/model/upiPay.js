const roundMoney = value => Math.round(Number(value || 0) * 100) / 100;

const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
export const isValidUpiId = value => UPI_ID.test(String(value || "").trim());

/** upi://pay deep link (NPCI). Amount is rounded to paise; note is trimmed to 80 chars. */
export function upiPayLink({ upiId, payeeName = "", amount = 0, note = "" } = {}) {
  if (!isValidUpiId(upiId)) return "";
  const params = [
    ["pa", String(upiId).trim()],
    ["pn", String(payeeName || "").trim().slice(0, 60)],
    ["am", Number(amount) > 0 ? roundMoney(amount).toFixed(2) : ""],
    ["cu", "INR"],
    ["tn", String(note || "").trim().slice(0, 80)],
  ].filter(([, value]) => value);
  return `upi://pay?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}

/** Shareable https page that shows the QR and opens the UPI app (WhatsApp does not link upi:// URLs). */
export function payPageUrl(origin, { upiId, payeeName = "", amount = 0, note = "" } = {}) {
  if (!isValidUpiId(upiId) || !origin) return "";
  const params = new URLSearchParams();
  params.set("pa", String(upiId).trim());
  if (payeeName) params.set("pn", String(payeeName).trim().slice(0, 60));
  if (Number(amount) > 0) params.set("am", roundMoney(amount).toFixed(2));
  if (note) params.set("tn", String(note).trim().slice(0, 80));
  return `${String(origin).replace(/\/$/, "")}/pay?${params.toString()}`;
}

export function parsePayPageParams(search = "") {
  const params = new URLSearchParams(search);
  const upiId = params.get("pa") || "";
  const amount = Number(params.get("am") || 0);
  return {
    upiId,
    payeeName: params.get("pn") || "",
    amount: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0,
    note: params.get("tn") || "",
    valid: isValidUpiId(upiId),
  };
}

export const isPayPagePath = (pathname = typeof window !== "undefined" ? window.location.pathname : "") =>
  /^\/pay\/?$/.test(pathname);

export const browserOrigin = () => (typeof window !== "undefined" && window.location ? window.location.origin : "");
