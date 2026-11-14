/* global process */
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const baseHeaders = {
  apikey: anonKey,
  "Content-Type": "application/json",
};

async function parseAuthResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.msg || body.message || body.error_description || "Authentication failed");
  }
  if (!body.access_token || !body.refresh_token) {
    throw new Error("Authentication response was incomplete");
  }
  return body;
}

export function assertAuthConfigured() {
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase auth is not configured on the server");
  }
}

export async function passwordGrant(email, password) {
  assertAuthConfigured();
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ email, password }),
  });
  return parseAuthResponse(response);
}

/**
 * Create the Auth user. Returns a session when Supabase signs the user in at once, or the
 * bare user (no tokens) when "Confirm email" is on and a confirmation email was sent.
 */
export async function signupGrant(email, password, { data, redirectTo } = {}) {
  assertAuthConfigured();
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
  const response = await fetch(`${supabaseUrl}/auth/v1/signup${query}`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ email, password, ...(data ? { data } : {}) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.msg || body.message || body.error_description || "Authentication failed");
  }
  return body;
}

/** Create the business workspace for the signed-in user. Resolves to { ok, message }. */
export async function provisionWorkspace(accessToken, { businessName, fullName, inviteCode }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/provision_financier`, {
    method: "POST",
    headers: { ...baseHeaders, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      workspace_name: String(businessName || "").trim(),
      display_name: String(fullName || "").trim(),
      invite_code: String(inviteCode || "").trim() || null,
    }),
  });
  if (response.ok) return { ok: true, message: "" };
  const body = await response.json().catch(() => ({}));
  return { ok: false, message: body.message || body.hint || body.error || "Could not create the business workspace" };
}

/** Best-effort update of the signed-in user's own metadata. */
export async function updateUserMetadata(accessToken, data) {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: { ...baseHeaders, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ data }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Best-effort Auth user cleanup when workspace provisioning fails after signup. */
export async function deleteAuthUser(userId) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !userId) return false;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function refreshGrant(refreshToken) {
  assertAuthConfigured();
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return parseAuthResponse(response);
}

export async function revokeSession(accessToken) {
  if (!supabaseUrl || !anonKey || !accessToken) return;
  await fetch(`${supabaseUrl}/auth/v1/logout`, {
    method: "POST",
    headers: { ...baseHeaders, Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}
