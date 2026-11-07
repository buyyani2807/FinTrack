/* global process */
import {
  loadConnection,
  supabaseUrl,
  upsertConnection,
  whatsappServiceHeaders,
} from "../_lib/whatsappAuth.js";
import { normalizeWaTo } from "../_lib/whatsappGraph.js";

const json = (res, status, body) => {
  if (typeof body === "string") return res.status(status).send(body);
  return res.status(status).json(body);
};

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

export default async function handler(req, res) {
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
