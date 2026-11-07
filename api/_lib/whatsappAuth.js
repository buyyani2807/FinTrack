/* global process */

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function whatsappServiceHeaders() {
  return {
    apikey: serviceKey || anonKey,
    Authorization: `Bearer ${serviceKey || anonKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export function bearerToken(req) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

export async function resolveOwnerContext(accessToken) {
  if (!supabaseUrl || !anonKey || !accessToken) {
    return { ok: false, status: 401, error: "Sign in required" };
  }
  const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!who.ok) return { ok: false, status: 401, error: "Sign in required" };
  const user = await who.json().catch(() => null);
  if (!user?.id) return { ok: false, status: 401, error: "Sign in required" };

  if (!serviceKey) {
    return { ok: false, status: 503, error: "WhatsApp Cloud API is not configured on this server yet (missing service role)." };
  }

  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=id,organization_id,role,is_active,full_name&limit=1`,
    { headers: whatsappServiceHeaders() },
  );
  const profiles = await profileResponse.json().catch(() => []);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile?.organization_id || profile.is_active === false) {
    return { ok: false, status: 403, error: "No active workspace." };
  }
  if (profile.role !== "owner") {
    return { ok: false, status: 403, error: "Only the workspace owner can manage WhatsApp Business." };
  }
  return { ok: true, user, profile, organizationId: profile.organization_id };
}

export async function resolveSignedInOrg(accessToken) {
  if (!supabaseUrl || !anonKey || !accessToken) {
    return { ok: false, status: 401, error: "Sign in required" };
  }
  const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!who.ok) return { ok: false, status: 401, error: "Sign in required" };
  const user = await who.json().catch(() => null);
  if (!user?.id) return { ok: false, status: 401, error: "Sign in required" };
  if (!serviceKey) {
    return { ok: false, status: 503, error: "WhatsApp Cloud API is not configured on this server yet." };
  }
  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=id,organization_id,role,is_active&limit=1`,
    { headers: whatsappServiceHeaders() },
  );
  const profiles = await profileResponse.json().catch(() => []);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile?.organization_id || profile.is_active === false) {
    return { ok: false, status: 403, error: "No active workspace." };
  }
  return { ok: true, user, profile, organizationId: profile.organization_id };
}

export async function loadConnection(organizationId) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/org_whatsapp_connections?organization_id=eq.${organizationId}&select=*&limit=1`,
    { headers: whatsappServiceHeaders() },
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function upsertConnection(organizationId, patch) {
  const body = { organization_id: organizationId, updated_at: new Date().toISOString(), ...patch };
  const response = await fetch(`${supabaseUrl}/rest/v1/org_whatsapp_connections`, {
    method: "POST",
    headers: { ...whatsappServiceHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(rows?.message || rows?.error || "Could not save WhatsApp connection.");
  }
  return Array.isArray(rows) ? rows[0] : rows;
}

export { supabaseUrl, anonKey, serviceKey };
