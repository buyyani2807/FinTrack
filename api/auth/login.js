import { setRefreshCookie } from "../_lib/authCookies.js";
import { CLEARED_PENDING_WORKSPACE, isEmailNotConfirmed, pendingWorkspace } from "../_lib/signupConfirmation.js";
import { passwordGrant, provisionWorkspace, revokeSession, updateUserMetadata } from "../_lib/supabaseAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email, password } = req.body || {};
    if (!email?.trim() || !password) return res.status(400).json({ error: "Email and password are required" });
    const session = await passwordGrant(email.trim(), password);

    // First sign-in after confirming the signup email: create the workspace now.
    const pending = pendingWorkspace(session.user);
    if (pending) {
      const provision = await provisionWorkspace(session.access_token, pending);
      if (!provision.ok && !/already provisioned/i.test(provision.message)) {
        await revokeSession(session.access_token);
        return res.status(400).json({ error: provision.message });
      }
      await updateUserMetadata(session.access_token, CLEARED_PENDING_WORKSPACE);
    }

    setRefreshCookie(res, session.refresh_token);
    return res.status(200).json({
      access_token: session.access_token,
      expires_in: session.expires_in,
    });
  } catch (error) {
    const message = error.message || "Sign in failed";
    return res.status(401).json({ error: message, ...(isEmailNotConfirmed(message) ? { code: "email_not_confirmed" } : {}) });
  }
}
