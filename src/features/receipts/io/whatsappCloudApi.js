import { listMetaTemplatesForSetup } from "../model/whatsappCloudTemplates.js";

async function parseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || body.message || "WhatsApp request failed.");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export function metaTemplateSetupGuide() {
  return listMetaTemplatesForSetup();
}

export async function fetchWhatsAppConnection(token) {
  const response = await fetch("/api/whatsapp/connect", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(response);
}

export async function startWhatsAppConnect(token) {
  const response = await fetch("/api/whatsapp/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "start" }),
  });
  return parseJson(response);
}

export async function completeWhatsAppConnect(token, payload) {
  const response = await fetch("/api/whatsapp/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "complete", ...payload }),
  });
  return parseJson(response);
}

export async function disconnectWhatsApp(token) {
  const response = await fetch("/api/whatsapp/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "disconnect" }),
  });
  return parseJson(response);
}

/**
 * Send via Cloud API when connected; otherwise return manual wa.me mode.
 * Never throws for “not connected” — caller opens WhatsApp manually.
 */
export async function requestWhatsAppCloudSend(token, {
  phone,
  message = "",
  templateKey = "",
  variables = {},
  sourceType = "",
  sourceId = "",
  kind = "send",
  preferManual = false,
} = {}) {
  const response = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      to: phone,
      text: message,
      templateKey,
      variables,
      sourceType,
      sourceId,
      kind,
      preferManual,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 403 && body.mode === "blocked") {
    return { mode: "blocked", error: body.error || "Opted out", waUrl: "" };
  }
  if (response.status === 429) {
    return {
      mode: "manual",
      waUrl: body.waUrl || "",
      reason: "limit",
      error: body.error || "Monthly WhatsApp send limit reached.",
    };
  }
  if (!response.ok) {
    return {
      mode: "manual",
      waUrl: "",
      reason: "error",
      error: body.error || "WhatsApp send failed.",
    };
  }
  return body;
}
