import { setRefreshCookie } from "../lib/authCookies.js";
import { signupGrant } from "../lib/supabaseAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email, password } = req.body || {};
    if (!email?.trim() || !password) return res.status(400).json({ error: "Email and password are required" });
    const session = await signupGrant(email.trim(), password);
    setRefreshCookie(res, session.refresh_token);
    return res.status(200).json({
      access_token: session.access_token,
      expires_in: session.expires_in,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Sign up failed" });
  }
}
