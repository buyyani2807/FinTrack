/* global process */
import { randomBytes, randomInt } from "node:crypto";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAgentPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function internalAgentEmail() {
  return `agent.${randomBytes(12).toString("hex")}@staff.fintrack.invalid`;
}

export function temporaryAuthPassword() {
  return randomBytes(24).toString("base64url");
}

export function agentCredentialError(error) {
  const message = String(error?.message || "");
  if (/issue_agent_portal_credential|agent_portal_credentials|schema cache|could not find the function/i.test(message)) {
    return "Run migration 091_agent_portal_login.sql in the Supabase SQL editor, then try again.";
  }
  return message || "The agent ID could not be created.";
}

export async function serviceRpc(name, args) {
  if (!supabaseUrl || !serviceKey) throw new Error("Agent management is not configured yet");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || "Agent portal request failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function issueAgentPortal(profileId) {
  const pin = createAgentPin();
  const portalId = await serviceRpc("issue_agent_portal_credential", {
    input_profile_id: profileId,
    input_pin: pin,
  });
  if (typeof portalId !== "string" || !portalId.startsWith("AG-")) {
    throw new Error("Agent ID was not created");
  }
  return { portalId, pin };
}
