/* global process */
import { randomBytes } from "node:crypto";
import { setRefreshCookie } from "../lib/authCookies.js";
import { serviceRpc } from "../lib/agentPortal.js";
import { passwordGrant } from "../lib/supabaseAuth.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const serviceHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function authEmail(profileId) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${profileId}`, { headers: serviceHeaders });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Invalid agent ID or PIN");
  return body.email || body.user?.email || "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: "Agent sign-in is not configured yet" });
  const portalId = String(req.body?.portalId || "").trim();
  const pin = String(req.body?.pin || "").trim();
  if (!portalId || !pin) return res.status(400).json({ error: "Enter your agent ID and PIN." });
  try {
    const profileId = await serviceRpc("agent_portal_login", { input_portal_id: portalId, input_pin: pin });
    if (!profileId) return res.status(401).json({ error: "Invalid agent ID or PIN" });
    const email = await authEmail(profileId);
    if (!email) return res.status(401).json({ error: "Invalid agent ID or PIN" });
    const password = randomBytes(24).toString("base64url");
    const updated = await fetch(`${supabaseUrl}/auth/v1/admin/users/${profileId}`, {
      method: "PUT",
      headers: serviceHeaders,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!updated.ok) return res.status(500).json({ error: "Could not open the agent workspace. Try again." });
    const session = await passwordGrant(email, password);
    setRefreshCookie(res, session.refresh_token);
    return res.status(200).json({ access_token: session.access_token, expires_in: session.expires_in });
  } catch (error) {
    const message = error.message || "Sign in failed";
    const status = /too many|disabled/i.test(message) ? 403 : /not configured|091_agent_portal/i.test(message) ? 500 : 401;
    return res.status(status).json({ error: message });
  }
}
