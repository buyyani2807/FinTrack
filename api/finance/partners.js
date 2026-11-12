/* global process */
// Owner creates a sleeping partner (finance_partner) login: Owner sign-in, view-only on every unlocked workspace module.
import { temporaryAuthPassword } from "../_lib/agentPortal.js";

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const supabaseUrl = readEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = readEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");

const json = (res, status, body) => res.status(status).json(body);
const serviceHeaders = () => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
});
const missingConfigKeys = () => [
  !supabaseUrl && "VITE_SUPABASE_URL (or SUPABASE_URL)",
  !anonKey && "VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)",
  !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean);
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
const contactEmail = value => {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
};

async function callerProfile(accessToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user?.id) return null;
  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=id,organization_id,role,is_active,full_name&limit=1`,
    { headers: serviceHeaders() },
  );
  const rows = await profileRes.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

async function deleteAuthUser(userId) {
  if (!userId) return;
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: serviceHeaders(),
  }).catch(() => {});
}

export default async function handler(req, res) {
  const missing = missingConfigKeys();
  if (missing.length) {
    return json(res, 500, {
      error: `Finance partner login is not configured on this deployment. Missing: ${missing.join(", ")}.`,
      missing,
    });
  }
  const auth = String(req.headers.authorization || "");
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return json(res, 401, { error: "Sign in required." });

  try {
    const profile = await callerProfile(accessToken);
    if (!profile || profile.role !== "owner" || profile.is_active === false) {
      return json(res, 403, { error: "Only the business owner can manage finance partners." });
    }
    const orgId = profile.organization_id;
    if (!isUuid(orgId)) return json(res, 400, { error: "Organization not found." });

    if (req.method === "GET") {
      const profilesRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?organization_id=eq.${orgId}&role=eq.finance_partner&select=id,full_name,email,is_active,created_at&order=created_at.desc`,
        { headers: serviceHeaders() },
      );
      const profiles = await profilesRes.json().catch(() => []);
      if (!profilesRes.ok) {
        const detail = String(profiles?.message || profiles?.error || "");
        if (/finance_partner|profiles_role_check/i.test(detail)) {
          return json(res, 500, { error: "Run migration 123_finance_partner_readonly.sql in the Supabase SQL editor, then try again." });
        }
        return json(res, 500, { error: "Could not load finance partners." });
      }
      const members = (Array.isArray(profiles) ? profiles : []).map(row => ({
        userId: row.id,
        fullName: row.full_name || "",
        email: row.email || "",
        active: row.is_active !== false,
        createdAt: row.created_at,
      }));
      return json(res, 200, { members });
    }

    if (req.method === "PATCH") {
      const { userId, active } = req.body || {};
      if (!isUuid(userId)) return json(res, 400, { error: "Choose a partner to update." });
      const targetRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&organization_id=eq.${orgId}&role=eq.finance_partner&select=id&limit=1`,
        { headers: serviceHeaders() },
      );
      const targets = await targetRes.json().catch(() => []);
      if (!targetRes.ok || !Array.isArray(targets) || !targets.length) {
        return json(res, 404, { error: "That finance partner was not found in your business." });
      }
      if (typeof active !== "boolean") return json(res, 400, { error: "Choose whether the partner stays active." });
      const patched = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH",
        headers: { ...serviceHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({ is_active: active }),
      });
      if (!patched.ok) return json(res, 500, { error: "Could not update the partner login." });
      return json(res, 200, { ok: true });
    }

    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const { fullName, email } = req.body || {};
    const emailAddress = contactEmail(email);
    const name = String(fullName || "").trim();
    if (!name) return json(res, 400, { error: "Enter the partner’s name." });
    if (!emailAddress) return json(res, 400, { error: "Enter a valid email address." });

    const existingLookup = await fetch(`${supabaseUrl}/rest/v1/rpc/acc_admin_find_auth_user_id`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({ input_email: emailAddress }),
    });
    let existingUserId = null;
    if (existingLookup.ok) {
      const found = await existingLookup.json().catch(() => null);
      if (typeof found === "string" && isUuid(found)) existingUserId = found;
    }

    if (existingUserId) {
      const existingProfile = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${existingUserId}&select=id,organization_id,role&limit=1`,
        { headers: serviceHeaders() },
      );
      const rows = await existingProfile.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.organization_id !== orgId) {
        return json(res, 409, { error: "That email already belongs to another MyFinTracker business. Use a different email." });
      }
      if (row && row.organization_id === orgId && row.role === "owner") {
        return json(res, 400, { error: "That email is already the owner of this business." });
      }
      if (row && row.organization_id === orgId && row.role === "staff") {
        return json(res, 400, { error: "That email is already a collection agent. Use a different email for the partner." });
      }
      if (row && row.organization_id === orgId && row.role === "accounts") {
        return json(res, 400, { error: "That email is already an Accounts login. Use a different email for the partner." });
      }
      if (row && row.organization_id === orgId && row.role === "finance_partner") {
        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${existingUserId}`, {
          method: "PATCH",
          headers: { ...serviceHeaders(), Prefer: "return=minimal" },
          body: JSON.stringify({ full_name: name, email: emailAddress, is_active: true }),
        });
        return json(res, 200, {
          status: "updated",
          userId: existingUserId,
          email: emailAddress,
          fullName: name,
          temporaryPassword: null,
          message: "This partner already had a login. Their details were updated. Ask them to sign in with their existing password, or use Forgot password.",
        });
      }
      return json(res, 409, { error: "That email is already registered on MyFinTracker. Use a different email." });
    }

    const password = temporaryAuthPassword();
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({
        email: emailAddress,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, finance_partner: true },
      }),
    });
    const newUser = await created.json().catch(() => ({}));
    if (!created.ok) {
      return json(res, 400, { error: newUser.message || newUser.msg || "Could not create the login." });
    }
    const userId = newUser.id || newUser.user?.id;
    if (!userId) return json(res, 500, { error: "Login was created but its ID was unavailable." });

    const saved = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: "POST",
      headers: { ...serviceHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        id: userId,
        organization_id: orgId,
        full_name: name,
        email: emailAddress,
        role: "finance_partner",
        is_active: true,
      }),
    });
    if (!saved.ok) {
      await deleteAuthUser(userId);
      const detail = await saved.text();
      if (/profiles_role_check|finance_partner|role/i.test(detail)) {
        return json(res, 500, { error: "Run migration 123_finance_partner_readonly.sql in the Supabase SQL editor, then try again." });
      }
      return json(res, 500, { error: "Login was created but the profile could not be saved." });
    }

    return json(res, 201, {
      status: "created",
      userId,
      email: emailAddress,
      fullName: name,
      temporaryPassword: password,
      message: "Share the email and temporary password with your partner. They use Owner sign-in and can view every module unlocked in this workspace, in view-only mode.",
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not manage finance partners." });
  }
}
