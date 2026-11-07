/* global process */
/**
 * Single Hobby-plan-friendly entry for WhatsApp Cloud API.
 * Paths /api/whatsapp/connect|send|webhook rewrite here (see vercel.json).
 */
import { randomBytes } from "node:crypto";
import {
  bearerToken,
  loadConnection,
  resolveOwnerContext,
  resolveSignedInOrg,
  supabaseUrl,
  upsertConnection,
  whatsappServiceHeaders,
} from "./_lib/whatsappAuth.js";
import { decryptWhatsAppToken, encryptWhatsAppToken, whatsappCryptoConfigured } from "./_lib/whatsappCrypto.js";
import {
  embeddedSignupConfigured,
  exchangeEmbeddedSignupCode,
  fetchPhoneDisplay,
  metaAppConfigured,
  normalizeWaTo,
  sendCloudMessage,
} from "./_lib/whatsappGraph.js";
import { idempotencyKey, monthKey, resolveWhatsAppMonthlyCap } from "./_lib/whatsappHelpers.js";
import { metaTemplateForKey } from "../src/features/receipts/model/whatsappCloudTemplates.js";

export { idempotencyKey, monthKey, resolveWhatsAppMonthlyCap } from "./_lib/whatsappHelpers.js";

const json = (res, status, body) => {
  if (typeof body === "string") return res.status(status).send(body);
  return res.status(status).json(body);
};

function routeOf(req) {
  const fromQuery = String(req.query?.route || "").trim();
  if (fromQuery) return fromQuery;
  const url = String(req.url || "");
  if (url.includes("/webhook")) return "webhook";
  if (url.includes("/send")) return "send";
  if (url.includes("/connect")) return "connect";
  return String(req.body?.route || "").trim() || "send";
}

function publicStatus(row) {
  if (!row) {
    return { connected: false, status: "disconnected", displayPhone: "", detail: "", sendsThisMonth: 0 };
  }
  return {
    connected: row.status === "connected" && Boolean(row.phone_number_id),
    status: row.status,
    displayPhone: row.display_phone || "",
    wabaId: row.waba_id || "",
    phoneNumberId: row.phone_number_id || "",
    connectedAt: row.connected_at || null,
    detail: row.status_detail || "",
    sendsThisMonth: Number(row.sends_this_month || 0),
  };
}

async function saveConnected({
  organizationId,
  userId,
  accessToken,
  phoneNumberId,
  wabaId = "",
  displayPhone = "",
}) {
  if (!whatsappCryptoConfigured()) {
    throw new Error("Set WHATSAPP_TOKEN_ENCRYPTION_KEY on the server before connecting WhatsApp.");
  }
  const encrypted = encryptWhatsAppToken(accessToken);
  if (!encrypted) throw new Error("Could not encrypt the WhatsApp token.");
  let phoneLabel = displayPhone;
  if (!phoneLabel) {
    const meta = await fetchPhoneDisplay(phoneNumberId, accessToken);
    phoneLabel = meta.displayPhone || "";
  }
  return upsertConnection(organizationId, {
    waba_id: String(wabaId || ""),
    phone_number_id: String(phoneNumberId),
    display_phone: phoneLabel,
    access_token_encrypted: encrypted,
    token_expires_at: null,
    status: "connected",
    status_detail: "",
    webhook_verify_token: randomBytes(16).toString("hex"),
    connected_at: new Date().toISOString(),
    connected_by: userId,
  });
}

async function handleConnect(req, res) {
  const token = bearerToken(req);
  const ctx = await resolveOwnerContext(token);
  if (!ctx.ok) return json(res, ctx.status, { error: ctx.error });

  if (req.method === "GET") {
    const row = await loadConnection(ctx.organizationId);
    return json(res, 200, {
      ...publicStatus(row),
      platform: {
        metaAppConfigured: metaAppConfigured(),
        embeddedSignupConfigured: embeddedSignupConfigured(),
        cryptoConfigured: whatsappCryptoConfigured(),
        appId: process.env.META_APP_ID || "",
        configId: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || "",
      },
    });
  }

  if (req.method === "POST") {
    const action = String(req.body?.action || "complete").trim();

    if (action === "start") {
      if (!embeddedSignupConfigured()) {
        return json(res, 200, {
          mode: "manual_token",
          message: "Embedded Signup is not configured. Paste a permanent Cloud API token and phone number id, or set META_APP_ID, META_APP_SECRET, and META_EMBEDDED_SIGNUP_CONFIG_ID.",
          platform: {
            metaAppConfigured: metaAppConfigured(),
            embeddedSignupConfigured: false,
            cryptoConfigured: whatsappCryptoConfigured(),
            appId: process.env.META_APP_ID || "",
            configId: "",
          },
        });
      }
      return json(res, 200, {
        mode: "embedded_signup",
        platform: {
          metaAppConfigured: true,
          embeddedSignupConfigured: true,
          cryptoConfigured: whatsappCryptoConfigured(),
          appId: process.env.META_APP_ID,
          configId: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID,
        },
      });
    }

    if (action === "complete") {
      try {
        let accessToken = String(req.body?.accessToken || "").trim();
        let phoneNumberId = String(req.body?.phoneNumberId || "").trim();
        let wabaId = String(req.body?.wabaId || "").trim();
        let displayPhone = String(req.body?.displayPhone || "").trim();
        const code = String(req.body?.code || "").trim();

        if (code && !accessToken) {
          const exchanged = await exchangeEmbeddedSignupCode(code);
          accessToken = exchanged.access_token;
        }
        if (!accessToken || !phoneNumberId) {
          return json(res, 400, { error: "Provide a Cloud API access token and phone number id (or an Embedded Signup code)." });
        }
        const row = await saveConnected({
          organizationId: ctx.organizationId,
          userId: ctx.user.id,
          accessToken,
          phoneNumberId,
          wabaId,
          displayPhone,
        });
        return json(res, 200, publicStatus(row));
      } catch (error) {
        return json(res, 400, { error: error.message || "Could not connect WhatsApp." });
      }
    }

    if (action === "disconnect") {
      const existing = await loadConnection(ctx.organizationId);
      const row = await upsertConnection(ctx.organizationId, {
        status: "disconnected",
        status_detail: "Disconnected by owner",
        access_token_encrypted: "",
        phone_number_id: existing?.phone_number_id || "",
        waba_id: existing?.waba_id || "",
        display_phone: existing?.display_phone || "",
        connected_at: null,
        connected_by: null,
      });
      return json(res, 200, publicStatus(row));
    }

    return json(res, 400, { error: "Unknown action." });
  }

  return json(res, 405, { error: "Method not allowed" });
}

function whatsAppShareUrl(phone, message = "") {
  const digits = normalizeWaTo(phone);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(String(message || ""))}`;
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

async function handleSend(req, res) {
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

async function findLogByMetaId(messageId) {
  if (!messageId) return null;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/whatsapp_message_log?meta_message_id=eq.${encodeURIComponent(messageId)}&select=*&limit=1`,
    { headers: whatsappServiceHeaders() },
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

async function patchLog(id, patch) {
  await fetch(`${supabaseUrl}/rest/v1/whatsapp_message_log?id=eq.${id}`, {
    method: "PATCH",
    headers: whatsappServiceHeaders(),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function findConnectionByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/org_whatsapp_connections?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&select=*&limit=1`,
    { headers: whatsappServiceHeaders() },
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

async function recordOptOut(organizationId, phone) {
  const digits = normalizeWaTo(phone);
  if (!organizationId || !digits) return;
  const connection = await loadConnection(organizationId);
  if (!connection) return;
  const existing = new Set((connection.opted_out_phones || []).map(normalizeWaTo).filter(Boolean));
  existing.add(digits);
  await upsertConnection(organizationId, {
    opted_out_phones: [...existing],
    access_token_encrypted: connection.access_token_encrypted,
    phone_number_id: connection.phone_number_id,
    waba_id: connection.waba_id,
    display_phone: connection.display_phone,
    status: connection.status,
  });
}

async function handleWebhook(req, res) {
  const verifyToken = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "";

  if (req.method === "GET") {
    const mode = req.query?.["hub.mode"];
    const token = req.query?.["hub.verify_token"];
    const challenge = req.query?.["hub.challenge"];
    if (mode === "subscribe" && verifyToken && token === verifyToken) {
      return json(res, 200, String(challenge || ""));
    }
    return json(res, 403, { error: "Verification failed" });
  }

  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const body = req.body || {};
  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id || "";

        for (const status of value.statuses || []) {
          const log = await findLogByMetaId(status.id);
          if (!log) continue;
          const mapped = String(status.status || "").toLowerCase();
          const next = ["sent", "delivered", "read", "failed"].includes(mapped) ? mapped : log.status;
          await patchLog(log.id, {
            status: next,
            error: status.errors?.[0]?.title || status.errors?.[0]?.message || log.error || "",
          });
        }

        for (const message of value.messages || []) {
          const text = String(message.text?.body || "").trim().toUpperCase();
          const from = message.from || "";
          if (text === "STOP" || text === "UNSUBSCRIBE" || text === "CANCEL") {
            const connection = await findConnectionByPhoneNumberId(phoneNumberId);
            if (connection?.organization_id) {
              await recordOptOut(connection.organization_id, from);
            }
          }
        }
      }
    }
  } catch {
    // Always 200 to Meta so it does not retry forever on our parse bugs.
  }
  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  const route = routeOf(req);
  if (route === "connect") return handleConnect(req, res);
  if (route === "webhook") return handleWebhook(req, res);
  if (route === "send") return handleSend(req, res);
  return json(res, 404, { error: "Unknown WhatsApp route." });
}
