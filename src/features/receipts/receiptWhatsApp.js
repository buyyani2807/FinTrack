import { applyTemplate, resolveWhatsAppTemplate } from "./templateEngine.js";
import { hasWhatsAppPhone, normalizeWhatsAppPhone } from "./phoneNormalize.js";
import { receiptWhatsAppVariables, withReceiptBranding } from "./receiptModel.js";

export function buildWhatsAppMessage(receipt, settings = {}, templateKey = "payment_receipt") {
  const brandedReceipt = withReceiptBranding(receipt, settings);
  const template = resolveWhatsAppTemplate(settings, templateKey);
  return applyTemplate(template, receiptWhatsAppVariables(brandedReceipt));
}

export function buildReminderMessage(receipt, settings = {}, templateKey = "monthly_reminder") {
  const brandedReceipt = withReceiptBranding(receipt, settings);
  const template = resolveWhatsAppTemplate(settings, templateKey);
  return applyTemplate(template, receiptWhatsAppVariables(brandedReceipt));
}

export function openWhatsAppShare({ phone, message }) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return false;
  const url = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export function canWhatsAppShare(phone) {
  return hasWhatsAppPhone(phone);
}
