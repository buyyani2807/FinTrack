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

export async function signupGrant(email, password) {
  assertAuthConfigured();
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ email, password }),
  });
  return parseAuthResponse(response);
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
