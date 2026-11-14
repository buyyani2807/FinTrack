/* global process */
import { setRefreshCookie } from "../_lib/authCookies.js";
import { CLEARED_PENDING_WORKSPACE, confirmationRedirect, pendingWorkspaceMetadata, signupOutcome } from "../_lib/signupConfirmation.js";
import { deleteAuthUser, provisionWorkspace, signupGrant, updateUserMetadata } from "../_lib/supabaseAuth.js";

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
      return res.status(403).json({ error: "New business signup is invite-only. Contact MyFinTracker support for access." });
    }
    const { email, password, businessName, fullName, inviteCode } = req.body || {};
    if (!email?.trim() || !password) return res.status(400).json({ error: "Email and password are required" });
    if (!businessName?.trim() || !fullName?.trim()) {
      return res.status(400).json({ error: "Business name and your full name are required" });
    }
    if (!inviteOk(inviteCode)) return res.status(400).json({ error: "Enter a valid invite code." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const workspace = { businessName, fullName, inviteCode };
    const session = await signupGrant(email.trim(), password, {
      data: pendingWorkspaceMetadata(workspace),
      redirectTo: confirmationRedirect(process.env.VITE_APP_ORIGIN || req.headers.origin),
    });
    const outcome = signupOutcome(session);
    if (outcome === "exists") {
      return res.status(400).json({ error: "An account with this email already exists. Sign in instead, or use Forgot password." });
    }
    if (outcome === "confirm") {
      // Confirm email is on: no session yet. The workspace is created on the first
      // sign-in after the owner opens the link (see api/auth/login.js).
      return res.status(200).json({ confirmation_required: true, email: email.trim() });
    }

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

    const provision = await provisionWorkspace(session.access_token, workspace);
    if (!provision.ok) {
      if (createdUserId) await deleteAuthUser(createdUserId);
      createdUserId = null;
      throw new Error(provision.message);
    }
    await updateUserMetadata(session.access_token, CLEARED_PENDING_WORKSPACE);

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
