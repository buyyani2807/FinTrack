/* global process */
import { setRefreshCookie } from "../lib/authCookies.js";
import { deleteAuthUser, signupGrant } from "../lib/supabaseAuth.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

function publicSignupAllowed() {
  return process.env.VITE_ALLOW_PUBLIC_SIGNUP !== "false";
}

function inviteOk(code) {
  const required = String(process.env.VITE_SIGNUP_INVITE_CODE || "").trim();
  if (!required) return true;
  return String(code || "").trim() === required;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let createdUserId = null;
  try {
    if (!publicSignupAllowed()) {
      return res.status(403).json({ error: "New business signup is invite-only. Contact FinTrack support for access." });
    }
    const { email, password, businessName, fullName, inviteCode } = req.body || {};
    if (!email?.trim() || !password) return res.status(400).json({ error: "Email and password are required" });
    if (!businessName?.trim() || !fullName?.trim()) {
      return res.status(400).json({ error: "Business name and your full name are required" });
    }
    if (!inviteOk(inviteCode)) return res.status(400).json({ error: "Enter a valid invite code." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const session = await signupGrant(email.trim(), password);
    createdUserId = session.user?.id || session.id || null;
    if (!createdUserId && session.access_token) {
      const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
      });
      if (who.ok) {
        const user = await who.json();
        createdUserId = user.id || null;
      }
    }

    const provision = await fetch(`${supabaseUrl}/rest/v1/rpc/provision_financier`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_name: businessName.trim(),
        display_name: fullName.trim(),
        invite_code: inviteCode?.trim() || null,
      }),
    });
    if (!provision.ok) {
      const body = await provision.json().catch(() => ({}));
      if (createdUserId) await deleteAuthUser(createdUserId);
      createdUserId = null;
      throw new Error(body.message || body.hint || body.error || "Could not create the business workspace");
    }

    setRefreshCookie(res, session.refresh_token);
    return res.status(200).json({
      access_token: session.access_token,
      expires_in: session.expires_in,
      provisioned: true,
      full_name: fullName.trim(),
      business_name: businessName.trim(),
    });
  } catch (error) {
    if (createdUserId) await deleteAuthUser(createdUserId);
    return res.status(400).json({ error: error.message || "Sign up failed" });
  }
}
