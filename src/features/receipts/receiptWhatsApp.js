import { applyTemplate, resolveWhatsAppTemplate } from "./templateEngine.js";
import { hasWhatsAppPhone, normalizeWhatsAppPhone } from "./phoneNormalize.js";
import { receiptWhatsAppVariables, withReceiptBranding } from "./receiptModel.js";

export function buildWhatsAppMessage(receipt, settings = {}, templateKey = "payment_receipt") {
  const brandedReceipt = withReceiptBranding(receipt, settings);
  const key = templateKey !== "payment_receipt"
    ? templateKey
    : String(receipt?.source || "").startsWith("chit")
      ? "chit_payment_receipt"
      : receipt?.dailyFields
        ? "daily_payment_receipt"
        : templateKey;
  const template = resolveWhatsAppTemplate(settings, key);
  return applyTemplate(template, receiptWhatsAppVariables(brandedReceipt));
}

export function buildReminderMessage(receipt, settings = {}, templateKey = "monthly_reminder") {
  const brandedReceipt = withReceiptBranding(receipt, settings);
  const template = resolveWhatsAppTemplate(settings, templateKey);
  return applyTemplate(template, receiptWhatsAppVariables(brandedReceipt));
}

export function whatsAppShareUrl(phone, message = "") {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(String(message || ""))}`;
}

function launchWhatsAppUrl(url) {
  if (typeof window === "undefined" || typeof window.open !== "function") {
    return { opened: false };
  }
  let popup = null;
  try {
    popup = window.open(url, "_blank");
  } catch {
    return { opened: false };
  }
  if (!popup) return { opened: false };
  try { popup.opener = null; } catch { /* cross-origin after navigation */ }
  try {
    if (popup.closed) return { opened: false };
  } catch {
    /* A live cross-origin window still means WhatsApp opened. */
  }
  return { opened: true };
}

const HANDOFF_ID = "fintrack-whatsapp-handoff";

function ensureHandoffStyles() {
  if (typeof document === "undefined" || document.getElementById("fintrack-whatsapp-handoff-style")) return;
  const style = document.createElement("style");
  style.id = "fintrack-whatsapp-handoff-style";
  style.textContent = `
    .whatsapp-handoff{position:fixed;right:16px;bottom:16px;z-index:40;max-width:min(360px,calc(100vw - 32px));display:grid;gap:8px;padding:12px 14px;border:1px solid #25d36655;border-radius:12px;background:#143522;color:#e8fff1;box-shadow:0 12px 32px #0008}
    .whatsapp-handoff-text{margin:0;font-size:13px;line-height:1.4}
    .whatsapp-handoff-actions{display:flex;gap:8px;flex-wrap:wrap}
    .whatsapp-handoff .btn{border:1px solid #ffffff22;background:#0f2418;color:#e8fff1;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;text-decoration:none}
    .whatsapp-handoff .btn.whatsapp{border-color:#25d366;color:#8ef0b0}
  `;
  document.head.appendChild(style);
}

function showWhatsAppHandoff({ opened, message = "", url = "" }) {
  if (typeof document === "undefined") return;
  ensureHandoffStyles();
  let root = document.getElementById(HANDOFF_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = HANDOFF_ID;
    document.body.appendChild(root);
  }
  root.replaceChildren();
  root.className = "whatsapp-handoff";
  root.setAttribute("role", "status");

  const text = document.createElement("p");
  text.className = "whatsapp-handoff-text";
  text.textContent = opened ? "WhatsApp opened" : "WhatsApp could not be opened.";
  root.appendChild(text);

  if (!opened) {
    const actions = document.createElement("div");
    actions.className = "whatsapp-handoff-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn";
    copy.textContent = "Copy Message";
    copy.addEventListener("click", async () => {
      const ok = await copyWhatsAppMessage(message);
      copy.textContent = ok ? "Copied" : "Copy Message";
    });
    actions.appendChild(copy);
    if (url) {
      const link = document.createElement("a");
      link.className = "btn whatsapp";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open WhatsApp";
      actions.appendChild(link);
    }
    root.appendChild(actions);
  }

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "btn";
  dismiss.textContent = "Close";
  dismiss.addEventListener("click", () => root.remove());
  root.appendChild(dismiss);
}

export async function copyWhatsAppMessage(message) {
  const text = String(message || "");
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the older copy path */
  }
  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Automated confirmations keep this contract: a valid number that we tried to
 * open counts as opened. Manual buttons use openManualWhatsAppShare instead.
 */
export function openWhatsAppShare({ phone, message }) {
  const url = whatsAppShareUrl(phone, message);
  if (!url || typeof window === "undefined") return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** Manual wa.me handoff. Does not require saved WhatsApp settings. */
export function openManualWhatsAppShare({ phone, message }) {
  const url = whatsAppShareUrl(phone, message);
  if (!url) return { opened: false, reason: "no_phone" };
  const launched = launchWhatsAppUrl(url);
  if (launched.opened) {
    showWhatsAppHandoff({ opened: true });
    return { opened: true, reason: "opened" };
  }
  showWhatsAppHandoff({ opened: false, message, url });
  return { opened: false, reason: "open_failed" };
}

export function canWhatsAppShare(phone) {
  return hasWhatsAppPhone(phone);
}
