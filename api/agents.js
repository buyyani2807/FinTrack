// Secure Vercel endpoint. Add SUPABASE_SERVICE_ROLE_KEY to Vercel only; never put it in the browser.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const json = (res, status, body) => res.status(status).json(body);
const headers = token => ({ apikey: serviceKey || anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: "Agent management is not configured yet" });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(res, 401, { error: "Sign in required" });
  try {
    const who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
    if (!who.ok) return json(res, 401, { error: "Your session has expired" });
    const user = await who.json();
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=organization_id,role,is_active`, { headers: headers(serviceKey) });
    const [profile] = await profileResponse.json();
    if (!profile || profile.role !== "owner" || !profile.is_active) return json(res, 403, { error: "Only an active financier can manage agents" });
    if (req.method === "GET") {
      const agents = await fetch(`${supabaseUrl}/rest/v1/profiles?organization_id=eq.${profile.organization_id}&role=eq.staff&select=id,full_name,email,phone,is_active,created_at&order=created_at.desc`, { headers: headers(serviceKey) });
      return json(res, agents.ok ? 200 : 500, agents.ok ? await agents.json() : { error: "Could not load collection agents" });
    }
    if (req.method === "PATCH") {
      const { id, name, email, phone = "", active } = req.body || {};
      if (!id || !name?.trim() || !email?.trim()) return json(res, 400, { error: "Name and email are required" });
      const existing = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}&organization_id=eq.${profile.organization_id}&role=eq.staff&select=id`, { headers: headers(serviceKey) });
      if (!(await existing.json()).length) return json(res, 404, { error: "Collection staff member not found" });
      const updated = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", headers: { ...headers(serviceKey), Prefer: "return=representation" }, body: JSON.stringify({ full_name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), is_active: Boolean(active) }) });
      if (!updated.ok) return json(res, 500, { error: "Could not save staff changes" });
      return json(res, 200, (await updated.json())[0]);
    }
    const { name, email, phone = "", password, active = true } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password || password.length < 8) return json(res, 400, { error: "Name, email and a password of at least 8 characters are required" });
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, { method: "POST", headers: headers(serviceKey), body: JSON.stringify({ email: email.trim().toLowerCase(), password, email_confirm: true }) });
    const newUser = await created.json();
    if (!created.ok) return json(res, 400, { error: newUser.message || "Could not create the agent account" });
    const agentId = newUser.id || newUser.user?.id;
    if (!agentId) return json(res, 500, { error: "Agent authentication account was created but its ID was unavailable" });
    const saved = await fetch(`${supabaseUrl}/rest/v1/profiles`, { method: "POST", headers: { ...headers(serviceKey), Prefer: "return=representation" }, body: JSON.stringify({ id: agentId, organization_id: profile.organization_id, full_name: name.trim(), email: email.trim().toLowerCase(), role: "staff", phone: phone.trim(), is_active: Boolean(active) }) });
    if (!saved.ok) return json(res, 500, { error: "Agent login was created but its profile could not be saved" });
    return json(res, 201, { id: agentId, name: name.trim(), email: email.trim().toLowerCase() });
  } catch (error) { return json(res, 500, { error: error.message || "Could not create agent" }); }
}
