/* global process */
export const REFRESH_COOKIE = "fintrack_refresh";

function cookieFlags(maxAge) {
  const secure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  return [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function setRefreshCookie(res, refreshToken) {
  res.setHeader("Set-Cookie", `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(60 * 60 * 24 * 30)}`);
}

export function clearRefreshCookie(res) {
  res.setHeader("Set-Cookie", `${REFRESH_COOKIE}=; ${cookieFlags(0)}`);
}

export function readRefreshCookie(req) {
  const match = (req.headers.cookie || "")
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${REFRESH_COOKIE}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(REFRESH_COOKIE.length + 1));
}
