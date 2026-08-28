import { readRefreshCookie, setRefreshCookie } from "../lib/authCookies.js";
import { refreshGrant } from "../lib/supabaseAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
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
