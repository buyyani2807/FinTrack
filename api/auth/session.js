import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../_lib/authCookies.js";
import { refreshGrant, revokeSession } from "../_lib/supabaseAuth.js";

// Hobby plan: one serverless function for session refresh (GET) and logout (POST).
// `/api/auth/logout` is rewritten to this file in vercel.json.
export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const refreshToken = readRefreshCookie(req);
      if (!refreshToken) return res.status(401).json({ error: "No session" });
      const session = await refreshGrant(refreshToken);
      setRefreshCookie(res, session.refresh_token);
      return res.status(200).json({
        access_token: session.access_token,
        expires_in: session.expires_in,
      });
    } catch (error) {
      return res.status(401).json({ error: error.message || "Session expired" });
    }
  }

  if (req.method === "POST") {
    const authHeader = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    try {
      if (authHeader) {
        await revokeSession(authHeader);
      } else {
        const refreshToken = readRefreshCookie(req);
        if (refreshToken) {
          const session = await refreshGrant(refreshToken).catch(() => null);
          if (session?.access_token) await revokeSession(session.access_token);
        }
      }
    } catch {
      // Always clear the browser cookie even if Supabase logout fails.
    }
    clearRefreshCookie(res);
    return res.status(204).end();
  }

  return res.status(405).json({ error: "Method not allowed" });
}
