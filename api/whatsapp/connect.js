/* global process */
import { randomBytes } from "node:crypto";
import {
  bearerToken,
  loadConnection,
  resolveOwnerContext,
  upsertConnection,
} from "../_lib/whatsappAuth.js";
import { decryptWhatsAppToken, encryptWhatsAppToken, whatsappCryptoConfigured } from "../_lib/whatsappCrypto.js";
import {
  embeddedSignupConfigured,
  exchangeEmbeddedSignupCode,
  fetchPhoneDisplay,
  metaAppConfigured,
} from "../_lib/whatsappGraph.js";

const json = (res, status, body) => res.status(status).json(body);

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

export default async function handler(req, res) {
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

// Keep decrypt import referenced for tests / future token refresh.
export { decryptWhatsAppToken };
