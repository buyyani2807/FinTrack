// Minimal Supabase REST/Auth client using the browser's built-in fetch.
// Keeping this small avoids putting a service-role secret or server access in the frontend.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ACCESS_TOKEN_KEY = "fintrack_access_token";
const REFRESH_TOKEN_KEY = "fintrack_refresh_token";

if (!url || !anonKey) {
  console.warn("Supabase is not configured. Copy .env.example to .env and add public project values.");
}

const headers = (accessToken, extra = {}) => ({
  apikey: anonKey,
  Authorization: `Bearer ${accessToken || anonKey}`,
  "Content-Type": "application/json",
  ...extra,
});

const saveSession = session => {
  if (session?.access_token) localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  if (session?.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
};

async function refreshSession() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: headers(), body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const session = await response.json().catch(() => null);
  if (!response.ok || !session?.access_token) return null;
  saveSession(session);
  return session.access_token;
}

async function request(path, options = {}, accessToken, retried = false) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: headers(accessToken, options.headers),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status === 401 && !retried && (body?.code === "PGRST303" || /jwt expired/i.test(body?.message || ""))) {
    const refreshedToken = await refreshSession();
    if (refreshedToken) return request(path, options, refreshedToken, true);
  }
  if (!response.ok) {
    throw new Error(body?.msg || body?.message || body?.error_description || body?.hint || body?.code || "Supabase request failed");
  }
  return body;
}

export const supabase = {
  auth: {
    signUp: async (email, password) => { const session = await request("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password }) }); saveSession(session); return session; },
    signIn: async (email, password) => { const session = await request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }); saveSession(session); return session; },
    resetPasswordForEmail: (email) => request("/auth/v1/recover", { method: "POST", body: JSON.stringify({ email, redirect_to: `${window.location.origin}?reset-password=1` }) }),
    updatePassword: (password, accessToken) => request("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password }) }, accessToken),
    signOut: (token) => request("/auth/v1/logout", { method: "POST" }, token),
    getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
    clearSession: () => { localStorage.removeItem(ACCESS_TOKEN_KEY); localStorage.removeItem(REFRESH_TOKEN_KEY); },
  },
  rpc: (name, args, token) => request(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) }, token),
  query: (path, token) => request(path, {}, token),
  from: (table, token) => ({
    select: (query = "*") => request(`/rest/v1/${table}?select=${encodeURIComponent(query)}`, {}, token),
    insert: (values) => request(`/rest/v1/${table}`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(values) }, token),
    update: (values, filters) => request(`/rest/v1/${table}?${filters}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(values) }, token),
  }),
};
