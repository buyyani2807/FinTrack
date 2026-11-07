/* global process */
import {
  META_TEMPLATE_LANGUAGE,
  buildMetaTemplateComponents,
  metaTemplateForKey,
} from "../../src/features/receipts/model/whatsappCloudTemplates.js";

const GRAPH = "https://graph.facebook.com/v21.0";

export function metaAppConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function embeddedSignupConfigured() {
  return metaAppConfigured() && Boolean(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID);
}

/** Digits only, with country code (default 91 for 10-digit Indian mobiles). */
export function normalizeWaTo(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) digits = `91${digits.slice(1)}`;
  return digits.length >= 10 ? digits : "";
}

export async function exchangeEmbeddedSignupCode(code) {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret || !code) {
    throw new Error("Meta app credentials or authorization code missing.");
  }
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("code", String(code));
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(body?.error?.message || "Could not exchange WhatsApp signup code.");
  }
  return body;
}

export async function debugToken(inputToken) {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret || !inputToken) return null;
  const url = new URL(`${GRAPH}/debug_token`);
  url.searchParams.set("input_token", inputToken);
  url.searchParams.set("access_token", `${appId}|${secret}`);
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  return body?.data || null;
}

export async function fetchPhoneDisplay(phoneNumberId, accessToken) {
  const response = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { displayPhone: "", verifiedName: "" };
  return {
    displayPhone: body.display_phone_number || "",
    verifiedName: body.verified_name || "",
  };
}

/**
 * Send a WhatsApp Cloud API message.
 * Prefer Meta template when templateKey is mapped; otherwise session text.
 */
export async function sendCloudMessage({
  phoneNumberId,
  accessToken,
  to,
  templateKey = "",
  variables = {},
  text = "",
}) {
  const toDigits = normalizeWaTo(to);
  if (!toDigits) throw new Error("Customer phone is missing or invalid.");
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp is not connected for this workspace.");

  const spec = templateKey ? metaTemplateForKey(templateKey) : null;
  let payload;
  if (spec) {
    const components = buildMetaTemplateComponents(templateKey, variables);
    payload = {
      messaging_product: "whatsapp",
      to: toDigits,
      type: "template",
      template: {
        name: spec.name,
        language: { code: META_TEMPLATE_LANGUAGE },
        components: components || [],
      },
    };
  } else {
    const body = String(text || "").trim();
    if (!body) throw new Error("Message text is empty.");
    payload = {
      messaging_product: "whatsapp",
      to: toDigits,
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4096) },
    };
  }

  const response = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || "WhatsApp Cloud API rejected the send.";
    const err = new Error(message);
    err.code = body?.error?.code;
    err.details = body?.error;
    throw err;
  }
  const messageId = body?.messages?.[0]?.id || "";
  return { messageId, to: toDigits, raw: body };
}
