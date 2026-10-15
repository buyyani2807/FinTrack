/* global process */

/**
 * Takes one AI call from the signed-in user's limit (migration 100, `ai_take_quota`).
 * If the limit cannot be checked (migration not applied yet, Supabase slow or down), the call
 * goes ahead: the limit protects the Gemini bill and must never take the AI features down.
 */
export async function takeAiQuota(token, kind, {
  fetchImpl = fetch,
  supabaseUrl = process.env.VITE_SUPABASE_URL,
  anonKey = process.env.VITE_SUPABASE_ANON_KEY,
} = {}) {
  if (!supabaseUrl || !anonKey || !token) return { allowed: true, checked: false };
  try {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/ai_take_quota`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ input_kind: kind }),
    });
    if (!response.ok) return { allowed: true, checked: false };
    const body = await response.json().catch(() => null);
    if (!body || typeof body.allowed !== "boolean") return { allowed: true, checked: false };
    return {
      allowed: body.allowed,
      checked: true,
      scope: body.scope || "",
      retryAfter: Math.max(0, Number(body.retryAfter) || 0),
    };
  } catch {
    return { allowed: true, checked: false };
  }
}

/** Sends the 429 for a refused call. Returns true when the request was refused. */
export function refuseOverQuota(res, quota) {
  if (quota.allowed) return false;
  const retryAfter = quota.retryAfter || 60;
  res.setHeader("Retry-After", String(retryAfter));
  const error = quota.scope === "day"
    ? "You have used today's AI limit. It frees up over the next 24 hours. You can still enter this by hand."
    : quota.scope === "auth"
      ? "Sign in required"
      : "Too many AI requests. Try again in a minute.";
  res.status(quota.scope === "auth" ? 401 : 429).json({ error, retryAfter });
  return true;
}
