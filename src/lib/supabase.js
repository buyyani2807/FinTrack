// Minimal Supabase REST/Auth client using the browser's built-in fetch.
// Refresh tokens live in HttpOnly cookies (via /api/auth/*). Access tokens stay in memory only.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const LEGACY_ACCESS_KEY = "fintrack_access_token";
const LEGACY_REFRESH_KEY = "fintrack_refresh_token";

if (!url || !anonKey) {
  console.warn("Supabase is not configured. Copy .env.example to .env and add public project values.");
}

let memoryAccessToken = null;

const headers = (accessToken, extra = {}) => ({
  apikey: anonKey,
  Authorization: `Bearer ${accessToken || anonKey}`,
  "Content-Type": "application/json",
  ...extra,
});

function clearLegacyStorage() {
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}

function rememberAccessToken(token) {
  memoryAccessToken = token || null;
}

async function authApi(path, options = {}) {
  const response = await fetch(`/api/auth/${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || "Authentication request failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

async function directPasswordGrant(email, password) {
  const session = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  rememberAccessToken(session.access_token);
  return session;
}

async function directSignupGrant(email, password) {
  const session = await request("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  rememberAccessToken(session.access_token);
  return session;
}

async function refreshSession() {
  try {
    const session = await authApi("session", { method: "GET" });
    rememberAccessToken(session.access_token);
    return session.access_token;
  } catch {
    const legacyRefresh = localStorage.getItem(LEGACY_REFRESH_KEY);
    if (!legacyRefresh) return null;
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ refresh_token: legacyRefresh }),
    });
    const session = await response.json().catch(() => null);
    clearLegacyStorage();
    if (!response.ok || !session?.access_token) return null;
    rememberAccessToken(session.access_token);
    return session.access_token;
  }
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
    signUp: async (email, password, workspace = {}) => {
      try {
        const session = await authApi("signup", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            businessName: workspace.businessName || workspace.workspace_name || "",
            fullName: workspace.fullName || workspace.display_name || "",
            inviteCode: workspace.inviteCode || workspace.invite_code || "",
          }),
        });
        rememberAccessToken(session.access_token);
        clearLegacyStorage();
        return session;
      } catch (error) {
        if (error.status === 404) return directSignupGrant(email, password);
        throw error;
      }
    },
    signIn: async (email, password) => {
      try {
        const session = await authApi("login", { method: "POST", body: JSON.stringify({ email, password }) });
        rememberAccessToken(session.access_token);
        clearLegacyStorage();
        return session;
      } catch (error) {
        if (error.status === 404) return directPasswordGrant(email, password);
        throw error;
      }
    },
    resetPasswordForEmail: email => request("/auth/v1/recover", {
      method: "POST",
      body: JSON.stringify({ email, redirect_to: `${window.location.origin}?reset-password=1` }),
    }),
    updatePassword: (password, accessToken) => request("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify({ password }),
    }, accessToken),
    restoreSession: async () => {
      if (memoryAccessToken) return { access_token: memoryAccessToken };
      const legacyAccess = localStorage.getItem(LEGACY_ACCESS_KEY);
      if (legacyAccess) {
        rememberAccessToken(legacyAccess);
        clearLegacyStorage();
        return { access_token: legacyAccess };
      }
      const token = await refreshSession();
      return token ? { access_token: token } : null;
    },
    signOut: async () => {
      const token = memoryAccessToken;
      rememberAccessToken(null);
      clearLegacyStorage();
      try {
        await authApi("logout", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        if (token) await request("/auth/v1/logout", { method: "POST" }, token).catch(() => {});
      }
    },
    getAccessToken: () => memoryAccessToken,
    clearSession: () => {
      rememberAccessToken(null);
      clearLegacyStorage();
    },
  },
  rpc: (name, args, token) => request(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) }, token),
  query: (path, token, options = {}) => request(path, options, token),
  from: (table, token) => ({
    select: (query = "*") => request(`/rest/v1/${table}?select=${encodeURIComponent(query)}`, {}, token),
    insert: values => request(`/rest/v1/${table}`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(values) }, token),
    update: (values, filters) => request(`/rest/v1/${table}?${filters}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(values) }, token),
  }),
};
