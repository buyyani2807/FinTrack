/* global process */
import {
  bearerToken,
  loadConnection,
  resolveSignedInOrg,
  supabaseUrl,
  upsertConnection,
  whatsappServiceHeaders,
} from "../_lib/whatsappAuth.js";
import { decryptWhatsAppToken, whatsappCryptoConfigured } from "../_lib/whatsappCrypto.js";
import { normalizeWaTo, sendCloudMessage } from "../_lib/whatsappGraph.js";
import { metaTemplateForKey } from "../../src/features/receipts/model/whatsappCloudTemplates.js";

const json = (res, status, body) => res.status(status).json(body);

function whatsAppShareUrl(phone, message = "") {
  const digits = normalizeWaTo(phone);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(String(message || ""))}`;
}

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

async function findByIdempotency(organizationId, key) {
  if (!key) return null;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/whatsapp_message_log?organization_id=eq.${organizationId}&idempotency_key=eq.${encodeURIComponent(key)}&select=*&limit=1`,
    { headers: whatsappServiceHeaders() },
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertLog(row) {
  const response = await fetch(`${supabaseUrl}/rest/v1/whatsapp_message_log`, {
    method: "POST",
    headers: whatsappServiceHeaders(),
    body: JSON.stringify(row),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || "Could not write WhatsApp send log.");
  }
  return Array.isArray(body) ? body[0] : body;
}

async function updateLog(id, patch) {
  await fetch(`${supabaseUrl}/rest/v1/whatsapp_message_log?id=eq.${id}`, {
    method: "PATCH",
    headers: whatsappServiceHeaders(),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function loadOrgLimits(organizationId) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${organizationId}&select=feature_packs,module_overrides&limit=1`,
    { headers: whatsappServiceHeaders() },
  );
  const rows = await response.json().catch(() => []);
  const org = Array.isArray(rows) ? rows[0] : null;
  const monthlyCap = resolveWhatsAppMonthlyCap({
    moduleOverrides: org?.module_overrides,
    envCap: process.env.WHATSAPP_SENDS_PER_MONTH || 0,
  });
  return {
    monthlyCap,
    featurePacks: org?.feature_packs || null,
  };
}

function isOptedOut(connection, phone) {
  const digits = normalizeWaTo(phone);
  const list = connection?.opted_out_phones || [];
  return list.some(item => normalizeWaTo(item) === digits);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const token = bearerToken(req);
  const ctx = await resolveSignedInOrg(token);
  if (!ctx.ok) return json(res, ctx.status, { error: ctx.error });

  const to = String(req.body?.to || req.body?.phone || "").trim();
  const text = String(req.body?.text || req.body?.message || "");
  const templateKey = String(req.body?.templateKey || "").trim();
  const variables = req.body?.variables && typeof req.body.variables === "object" ? req.body.variables : {};
  const sourceType = String(req.body?.sourceType || "").trim();
  const sourceId = String(req.body?.sourceId || "").trim();
  const kind = String(req.body?.kind || "send").trim() || "send";
  const preferManual = Boolean(req.body?.preferManual);

  const toDigits = normalizeWaTo(to);
  if (!toDigits) return json(res, 400, { error: "Customer phone is missing or invalid." });

  const waUrl = whatsAppShareUrl(toDigits, text);
  const connection = await loadConnection(ctx.organizationId);

  if (preferManual || !connection || connection.status !== "connected" || !connection.phone_number_id) {
    return json(res, 200, {
      mode: "manual",
      waUrl,
      reason: preferManual ? "prefer_manual" : "not_connected",
    });
  }

  if (isOptedOut(connection, toDigits)) {
    return json(res, 403, { error: "This number opted out of WhatsApp messages.", mode: "blocked" });
  }

  if (!whatsappCryptoConfigured()) {
    return json(res, 200, { mode: "manual", waUrl, reason: "crypto_not_configured" });
  }

  const accessToken = decryptWhatsAppToken(connection.access_token_encrypted);
  if (!accessToken) {
    return json(res, 200, { mode: "manual", waUrl, reason: "token_unavailable" });
  }

  const limits = await loadOrgLimits(ctx.organizationId);
  const key = monthKey();
  let sends = Number(connection.sends_this_month || 0);
  if (connection.sends_month_key !== key) sends = 0;
  if (limits.monthlyCap != null && sends >= limits.monthlyCap) {
    return json(res, 429, {
      error: "This workspace has reached its WhatsApp Cloud API send limit for the month.",
      mode: "manual",
      waUrl,
      retryAfter: 86400,
    });
  }

  const idemKey = idempotencyKey({ sourceType, sourceId, kind, templateKey });
  if (idemKey) {
    const existing = await findByIdempotency(ctx.organizationId, idemKey);
    if (existing && existing.status !== "failed") {
      return json(res, 200, {
        mode: existing.status === "manual" ? "manual" : "sent",
        messageId: existing.meta_message_id || "",
        logId: existing.id,
        duplicate: true,
        waUrl: existing.status === "manual" ? waUrl : undefined,
      });
    }
  }

  // If a Meta template is required for business-initiated send but not mapped, fall back to manual with text.
  if (templateKey && !metaTemplateForKey(templateKey) && !String(text).trim()) {
    return json(res, 200, { mode: "manual", waUrl, reason: "no_template_mapping" });
  }

  let logRow;
  try {
    logRow = await insertLog({
      organization_id: ctx.organizationId,
      to_phone: toDigits,
      template_key: templateKey,
      kind,
      status: "queued",
      source_type: sourceType,
      source_id: sourceId,
      idempotency_key: idemKey,
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not start WhatsApp send." });
  }

  try {
    const result = await sendCloudMessage({
      phoneNumberId: connection.phone_number_id,
      accessToken,
      to: toDigits,
      templateKey: metaTemplateForKey(templateKey) ? templateKey : "",
      variables,
      text: metaTemplateForKey(templateKey) ? "" : text,
    });
    await updateLog(logRow.id, {
      status: "sent",
      meta_message_id: result.messageId,
      error: "",
    });
    await upsertConnection(ctx.organizationId, {
      sends_this_month: sends + 1,
      sends_month_key: key,
      status: "connected",
      status_detail: "",
      access_token_encrypted: connection.access_token_encrypted,
      phone_number_id: connection.phone_number_id,
      waba_id: connection.waba_id,
      display_phone: connection.display_phone,
    });
    return json(res, 200, {
      mode: "sent",
      messageId: result.messageId,
      logId: logRow.id,
      to: result.to,
    });
  } catch (error) {
    await updateLog(logRow.id, {
      status: "failed",
      error: String(error.message || "send_failed").slice(0, 500),
    });
    return json(res, 200, {
      mode: "manual",
      waUrl,
      reason: "send_failed",
      error: error.message || "WhatsApp Cloud API send failed.",
      logId: logRow.id,
    });
  }
}
