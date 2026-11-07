/* Shared WhatsApp Cloud API helpers (not a serverless entrypoint). */

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function idempotencyKey({ sourceType, sourceId, kind, templateKey }) {
  const parts = [sourceType || "", sourceId || "", kind || "send", templateKey || ""].map(part => String(part).trim());
  if (!parts[0] || !parts[1]) return "";
  return parts.join(":");
}

export function resolveWhatsAppMonthlyCap({ moduleOverrides = {}, envCap = 0 } = {}) {
  const overrides = moduleOverrides && typeof moduleOverrides === "object" ? moduleOverrides : {};
  const entitlementLimits = overrides.entitlementLimits && typeof overrides.entitlementLimits === "object"
    ? overrides.entitlementLimits
    : overrides;
  const packCapRaw = entitlementLimits.whatsappSendsPerMonth
    ?? entitlementLimits.whatsappOpensPerMonth
    ?? null;
  const packCap = Number(packCapRaw);
  const platformCap = Number(envCap);
  if (Number.isFinite(packCap) && packCap > 0) return packCap;
  if (Number.isFinite(platformCap) && platformCap > 0) return platformCap;
  return null;
}
