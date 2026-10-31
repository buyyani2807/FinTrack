/* global process */
// Owner creates a CA / Accounts team login inside their own organization,
// scoped to one or more Accounts companies.
import { temporaryAuthPassword } from "../_lib/agentPortal.js";

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
};

// Prefer server names; keep VITE_* fallbacks used elsewhere in this repo.
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

/** Validate company UUIDs belong to this org and are active. */
async function resolveCompanyIds(orgId, companyIds) {
  const requested = [...new Set((Array.isArray(companyIds) ? companyIds : []).filter(isUuid))];
  if (!requested.length) {
    return { error: "Choose at least one Accounts company for this login." };
  }
  const companiesRes = await fetch(
    `${supabaseUrl}/rest/v1/acc_companies?organization_id=eq.${orgId}&status=eq.active&id=in.(${requested.join(",")})&select=id,name`,
    { headers: serviceHeaders() },
  );
  const companies = await companiesRes.json().catch(() => []);
  if (!companiesRes.ok || !Array.isArray(companies) || companies.length !== requested.length) {
    return { error: "One or more selected companies were not found in this business." };
  }
  return {
    companyIds: companies.map(row => row.id),
    companyNames: companies.map(row => row.name),
  };
}

async function replaceCompanyAccess(orgId, userId, companyIds, createdBy) {
  const deleted = await fetch(
    `${supabaseUrl}/rest/v1/acc_user_company_access?organization_id=eq.${orgId}&user_id=eq.${userId}`,
    { method: "DELETE", headers: serviceHeaders() },
  );
  if (!deleted.ok) {
    const detail = await deleted.text();
    if (/acc_user_company_access|schema cache|does not exist/i.test(detail)) {
      return { error: "Run migration 111_accounts_team_company_access.sql in the Supabase SQL editor, then try again." };
    }
    return { error: "Could not update company access." };
  }
  const rows = companyIds.map(companyId => ({
    organization_id: orgId,
    user_id: userId,
    company_id: companyId,
    created_by: createdBy,
  }));
  const inserted = await fetch(`${supabaseUrl}/rest/v1/acc_user_company_access`, {
    method: "POST",
    headers: { ...serviceHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!inserted.ok) {
    const detail = await inserted.text();
    if (/acc_user_company_access|schema cache|does not exist/i.test(detail)) {
      return { error: "Run migration 111_accounts_team_company_access.sql in the Supabase SQL editor, then try again." };
    }
    return { error: "Could not save company access." };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  // Safe config probe: which keys this deployment actually sees (no secret values).
  if (req.method === "GET" && (req.query?.config === "1" || String(req.url || "").includes("config=1"))) {
    return json(res, 200, {
      hasUrl: Boolean(supabaseUrl),
      hasAnon: Boolean(anonKey),
      hasServiceRole: Boolean(serviceKey),
      missing: missingConfigKeys(),
      vercelEnv: process.env.VERCEL_ENV || null,
      vercelTarget: process.env.VERCEL_TARGET_ENV || null,
    });
  }

  const missing = missingConfigKeys();
  if (missing.length) {
    return json(res, 500, {
      error: `Accounts team login is not configured on this deployment. Missing: ${missing.join(", ")}. In Vercel → fin-track → Settings → Environment Variables, open SUPABASE_SERVICE_ROLE_KEY (yellow Needs Attention usually means empty or not applied). Assign it to Preview and the staging custom environment, save a real service_role JWT from Supabase, then Redeploy the staging deployment. Local Vite proxies /api to staging-fintrack.vercel.app.`,
      missing,
      vercelEnv: process.env.VERCEL_ENV || null,
    });
  }
  const auth = String(req.headers.authorization || "");
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return json(res, 401, { error: "Sign in required." });

  try {
    const profile = await callerProfile(accessToken);
    if (!profile || profile.role !== "owner" || profile.is_active === false) {
      return json(res, 403, { error: "Only the business owner can add a CA or Accounts login." });
    }
    const orgId = profile.organization_id;
    if (!isUuid(orgId)) return json(res, 400, { error: "Organization not found." });

    if (req.method === "GET") {
      const [rolesRes, profilesRes, accessRes, companiesRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/acc_user_roles?organization_id=eq.${orgId}&select=id,user_id,role,created_at&order=created_at.desc`,
          { headers: serviceHeaders() },
        ),
        fetch(
          `${supabaseUrl}/rest/v1/profiles?organization_id=eq.${orgId}&role=eq.accounts&select=id,full_name,email,is_active,created_at&order=created_at.desc`,
          { headers: serviceHeaders() },
        ),
        fetch(
          `${supabaseUrl}/rest/v1/acc_user_company_access?organization_id=eq.${orgId}&select=user_id,company_id`,
          { headers: serviceHeaders() },
        ),
        fetch(
          `${supabaseUrl}/rest/v1/acc_companies?organization_id=eq.${orgId}&status=eq.active&select=id,name&order=name.asc`,
          { headers: serviceHeaders() },
        ),
      ]);
      const roles = await rolesRes.json().catch(() => []);
      const profiles = await profilesRes.json().catch(() => []);
      const accessRows = await accessRes.json().catch(() => []);
      const companies = await companiesRes.json().catch(() => []);
      if (!accessRes.ok && /acc_user_company_access|schema cache|does not exist/i.test(String(accessRows?.message || accessRows?.error || ""))) {
        return json(res, 500, { error: "Run migration 111_accounts_team_company_access.sql in the Supabase SQL editor, then try again." });
      }
      const roleByUser = new Map((Array.isArray(roles) ? roles : []).map(row => [row.user_id, row]));
      const nameByCompany = new Map((Array.isArray(companies) ? companies : []).map(row => [row.id, row.name]));
      const companiesByUser = new Map();
      for (const row of Array.isArray(accessRows) ? accessRows : []) {
        const list = companiesByUser.get(row.user_id) || [];
        list.push(row.company_id);
        companiesByUser.set(row.user_id, list);
      }
      const members = (Array.isArray(profiles) ? profiles : []).map(row => {
        const companyIds = companiesByUser.get(row.id) || [];
        return {
          userId: row.id,
          fullName: row.full_name || "",
          email: row.email || "",
          active: row.is_active !== false,
          role: roleByUser.get(row.id)?.role || "viewer",
          roleId: roleByUser.get(row.id)?.id || null,
          companyIds,
          companyNames: companyIds.map(id => nameByCompany.get(id) || id),
          createdAt: row.created_at,
        };
      });
      return json(res, 200, { members });
    }

    if (req.method === "PATCH") {
      const { userId, active, role, companyIds } = req.body || {};
      if (!isUuid(userId)) return json(res, 400, { error: "Choose a team member to update." });
      const targetRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&organization_id=eq.${orgId}&role=eq.accounts&select=id&limit=1`,
        { headers: serviceHeaders() },
      );
      const targets = await targetRes.json().catch(() => []);
      if (!targetRes.ok || !Array.isArray(targets) || !targets.length) {
        return json(res, 404, { error: "That Accounts login was not found in your business." });
      }
      if (typeof active === "boolean") {
        const patched = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
          method: "PATCH",
          headers: { ...serviceHeaders(), Prefer: "return=minimal" },
          body: JSON.stringify({ is_active: active }),
        });
        if (!patched.ok) return json(res, 500, { error: "Could not update the login." });
      }
      if (role === "accountant" || role === "viewer" || role === "cashier") {
        const upserted = await fetch(`${supabaseUrl}/rest/v1/acc_user_roles`, {
          method: "POST",
          headers: { ...serviceHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            organization_id: orgId,
            user_id: userId,
            role,
            created_by: profile.id,
          }),
        });
        if (!upserted.ok) {
          await fetch(
            `${supabaseUrl}/rest/v1/acc_user_roles?organization_id=eq.${orgId}&user_id=eq.${userId}`,
            {
              method: "PATCH",
              headers: { ...serviceHeaders(), Prefer: "return=minimal" },
              body: JSON.stringify({ role, created_by: profile.id }),
            },
          );
        }
      }
      if (companyIds !== undefined) {
        const resolved = await resolveCompanyIds(orgId, companyIds);
        if (resolved.error) return json(res, 400, { error: resolved.error });
        const access = await replaceCompanyAccess(orgId, userId, resolved.companyIds, profile.id);
        if (access.error) return json(res, 500, { error: access.error });
      }
      return json(res, 200, { ok: true });
    }

    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const { fullName, email, role = "viewer", companyIds } = req.body || {};
    const emailAddress = contactEmail(email);
    const name = String(fullName || "").trim();
    const accountsRole = role === "accountant" || role === "cashier" ? role : "viewer";
    if (!name) return json(res, 400, { error: "Enter the CA’s name." });
    if (!emailAddress) return json(res, 400, { error: "Enter a valid email address." });

    const resolved = await resolveCompanyIds(orgId, companyIds);
    if (resolved.error) return json(res, 400, { error: resolved.error });

    const existingLookup = await fetch(`${supabaseUrl}/rest/v1/rpc/acc_admin_find_auth_user_id`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({ input_email: emailAddress }),
    });
    let existingUserId = null;
    if (existingLookup.ok) {
      const found = await existingLookup.json().catch(() => null);
      if (typeof found === "string" && isUuid(found)) existingUserId = found;
    } else {
      const detail = await existingLookup.text();
      if (/acc_admin_find_auth_user_id|schema cache|could not find/i.test(detail)) {
        return json(res, 500, { error: "Run migration 109_accounts_team_login.sql in the Supabase SQL editor, then try again." });
      }
    }

    if (existingUserId) {
      const existingProfile = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${existingUserId}&select=id,organization_id,role&limit=1`,
        { headers: serviceHeaders() },
      );
      const rows = await existingProfile.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.organization_id !== orgId) {
        return json(res, 409, { error: "That email already belongs to another FinTrack business. Use a different email." });
      }
      if (row && row.organization_id === orgId && row.role === "owner") {
        return json(res, 400, { error: "That email is already the owner of this business." });
      }
      if (row && row.organization_id === orgId && row.role === "staff") {
        return json(res, 400, { error: "That email is already a collection agent. Use a different email for the CA." });
      }
      if (row && row.organization_id === orgId && row.role === "accounts") {
        const roleWrite = await fetch(`${supabaseUrl}/rest/v1/acc_user_roles`, {
          method: "POST",
          headers: { ...serviceHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            organization_id: orgId,
            user_id: existingUserId,
            role: accountsRole,
            created_by: profile.id,
          }),
        });
        if (!roleWrite.ok) {
          await fetch(
            `${supabaseUrl}/rest/v1/acc_user_roles?organization_id=eq.${orgId}&user_id=eq.${existingUserId}`,
            {
              method: "PATCH",
              headers: { ...serviceHeaders(), Prefer: "return=minimal" },
              body: JSON.stringify({ role: accountsRole, created_by: profile.id }),
            },
          );
        }
        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${existingUserId}`, {
          method: "PATCH",
          headers: { ...serviceHeaders(), Prefer: "return=minimal" },
          body: JSON.stringify({ full_name: name, email: emailAddress, is_active: true }),
        });
        const access = await replaceCompanyAccess(orgId, existingUserId, resolved.companyIds, profile.id);
        if (access.error) return json(res, 500, { error: access.error });
        return json(res, 200, {
          status: "updated",
          userId: existingUserId,
          email: emailAddress,
          fullName: name,
          role: accountsRole,
          companyIds: resolved.companyIds,
          companyNames: resolved.companyNames,
          temporaryPassword: null,
          message: "This CA already had a login. Their role and company access were updated. Ask them to sign in with their existing password, or use Forgot password.",
        });
      }
      return json(res, 409, { error: "That email is already registered on FinTrack. Use a different email." });
    }

    const password = temporaryAuthPassword();
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({
        email: emailAddress,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, accounts_team: true },
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
        role: "accounts",
        is_active: true,
      }),
    });
    if (!saved.ok) {
      await deleteAuthUser(userId);
      const detail = await saved.text();
      if (/profiles_role_check|role/i.test(detail)) {
        return json(res, 500, { error: "Run migration 109_accounts_team_login.sql in the Supabase SQL editor, then try again." });
      }
      return json(res, 500, { error: "Login was created but the profile could not be saved." });
    }

    const roleWrite = await fetch(`${supabaseUrl}/rest/v1/acc_user_roles`, {
      method: "POST",
      headers: { ...serviceHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        organization_id: orgId,
        user_id: userId,
        role: accountsRole,
        created_by: profile.id,
      }),
    });
    if (!roleWrite.ok) {
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, { method: "DELETE", headers: serviceHeaders() });
      await deleteAuthUser(userId);
      return json(res, 500, { error: "Login was created but the Accounts role could not be saved. Run migrations 070–076 and 109, then try again." });
    }

    const access = await replaceCompanyAccess(orgId, userId, resolved.companyIds, profile.id);
    if (access.error) {
      await fetch(`${supabaseUrl}/rest/v1/acc_user_roles?organization_id=eq.${orgId}&user_id=eq.${userId}`, { method: "DELETE", headers: serviceHeaders() });
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, { method: "DELETE", headers: serviceHeaders() });
      await deleteAuthUser(userId);
      return json(res, 500, { error: access.error });
    }

    return json(res, 201, {
      status: "created",
      userId,
      email: emailAddress,
      fullName: name,
      role: accountsRole,
      companyIds: resolved.companyIds,
      companyNames: resolved.companyNames,
      temporaryPassword: password,
      message: "Share the email and temporary password with your CA. They use Owner sign-in and only see the companies you assigned.",
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not create the Accounts login." });
  }
}
