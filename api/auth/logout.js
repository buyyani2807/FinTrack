import { clearRefreshCookie, readRefreshCookie } from "../lib/authCookies.js";
import { refreshGrant, revokeSession } from "../lib/supabaseAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
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
