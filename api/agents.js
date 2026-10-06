/* global process */
// Secure Vercel endpoint. Add SUPABASE_SERVICE_ROLE_KEY to Vercel only; never put it in the browser.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const json = (res, status, body) => res.status(status).json(body);
const headers = token => ({ apikey: serviceKey || anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));

async function agentCompanyLink(body, organizationId, { required = false } = {}) {
  const scope = body.collectionScope;
  if (!scope) {
    if (!required) return { patch: {} };
    return { status: 400, error: "Choose whether this agent collects for an Accounts company or for finance and chit customers." };
  }
  if (scope === "finance") return { patch: { collection_scope: "finance", accounts_company_id: null } };
  if (scope !== "accounts" || !isUuid(body.accountsCompanyId)) {
    return { status: 400, error: "Choose the Accounts company this agent collects for." };
  }
  const company = await fetch(`${supabaseUrl}/rest/v1/acc_companies?id=eq.${body.accountsCompanyId}&organization_id=eq.${organizationId}&status=eq.active&select=id`, { headers: headers(serviceKey) });
  const rows = await company.json().catch(() => []);
  if (!company.ok || !Array.isArray(rows) || !rows.length) return { status: 400, error: "That Accounts company was not found." };
  return { patch: { collection_scope: "accounts", accounts_company_id: body.accountsCompanyId } };
}

function routeCustomerRow(route, stop, partyById) {
  const party = partyById.get(stop.party_id) || {};
  return {
    partyId: stop.party_id,
    name: party.name || "Customer",
    phone: party.phone || "",
    routeId: route.id,
    routeName: route.name || "",
    routeActive: route.is_active !== false,
    stopOrder: Number(stop.stop_order || 0),
    companyId: route.company_id || "",
    agentId: route.agent_id || "",
  };
}

async function routeCustomersByAgent(organizationId) {
  if (!isUuid(organizationId)) return { byAgent: {}, unassignedByCompany: {} };
  const read = async path => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: headers(serviceKey) });
    if (!response.ok) return [];
    const body = await response.json();
    return Array.isArray(body) ? body : [];
  };
  const [routes, stops, parties] = await Promise.all([
    read(`acc_collection_routes?organization_id=eq.${organizationId}&select=id,name,is_active,agent_id,company_id`),
    read(`acc_collection_route_stops?organization_id=eq.${organizationId}&select=route_id,party_id,stop_order`),
    read(`acc_parties?organization_id=eq.${organizationId}&select=id,name,phone`),
  ]);
  const partyById = new Map(parties.map(party => [party.id, party]));
  const routeById = new Map(routes.map(route => [route.id, route]));
  const byAgent = {};
  const unassignedByCompany = {};
  for (const stop of stops) {
    const route = routeById.get(stop.route_id);
    if (!route) continue;
    const row = routeCustomerRow(route, stop, partyById);
    if (route.agent_id) {
      if (!byAgent[route.agent_id]) byAgent[route.agent_id] = [];
      byAgent[route.agent_id].push(row);
    } else if (route.company_id) {
      if (!unassignedByCompany[route.company_id]) unassignedByCompany[route.company_id] = [];
      unassignedByCompany[route.company_id].push(row);
    }
  }
  for (const rows of [...Object.values(byAgent), ...Object.values(unassignedByCompany)]) {
    rows.sort((a, b) => a.routeName.localeCompare(b.routeName) || a.stopOrder - b.stopOrder || a.name.localeCompare(b.name));
  }
  return { byAgent, unassignedByCompany };
}

function routeCustomersFor(agent, { byAgent = {}, unassignedByCompany = {} } = {}) {
  if (agent.collection_scope === "finance") return [];
  const rows = byAgent[agent.id] || [];
  if (agent.collection_scope === "accounts" && agent.accounts_company_id) {
    const forCompany = rows.filter(row => row.companyId === agent.accounts_company_id);
    if (forCompany.length) return forCompany;
    if (rows.length) return rows;
    return unassignedByCompany[agent.accounts_company_id] || [];
  }
  return rows;
}

async function separateAgentBooks(organizationId, agentId, patch) {
  if (!isUuid(agentId) || !isUuid(organizationId) || !patch?.collection_scope) return;
  const write = (path, body) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...headers(serviceKey), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (patch.collection_scope === "accounts") {
    await write(`finance_accounts?organization_id=eq.${organizationId}&collection_agent_id=eq.${agentId}`, { collection_agent_id: null });
    if (patch.accounts_company_id) {
      await write(`acc_collection_routes?organization_id=eq.${organizationId}&agent_id=eq.${agentId}&company_id=neq.${patch.accounts_company_id}`, { agent_id: null });
    }
    return;
  }
  if (patch.collection_scope === "finance") {
    await write(`acc_collection_routes?organization_id=eq.${organizationId}&agent_id=eq.${agentId}`, { agent_id: null });
  }
}

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
      const staffSelect = "id,full_name,email,phone,is_active,created_at,collection_scope,accounts_company_id";
      let agentsResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?organization_id=eq.${profile.organization_id}&role=eq.staff&select=${staffSelect}&order=created_at.desc`, { headers: headers(serviceKey) });
      if (!agentsResponse.ok) {
        agentsResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?organization_id=eq.${profile.organization_id}&role=eq.staff&select=id,full_name,email,phone,is_active,created_at&order=created_at.desc`, { headers: headers(serviceKey) });
      }
      const assignmentsResponse = await fetch(`${supabaseUrl}/rest/v1/finance_accounts?organization_id=eq.${profile.organization_id}&select=collection_agent_id`, { headers: headers(serviceKey) });
      if (!agentsResponse.ok || !assignmentsResponse.ok) return json(res, 500, { error: "Could not load collection agents" });
      const [agents, assignments, routeCustomers] = await Promise.all([
        agentsResponse.json(),
        assignmentsResponse.json(),
        routeCustomersByAgent(profile.organization_id),
      ]);
      const assignedCounts = assignments.reduce((counts, account) => { if (account.collection_agent_id) counts[account.collection_agent_id] = (counts[account.collection_agent_id] || 0) + 1; return counts; }, {});
      return json(res, 200, agents.map(agent => {
        const customers = routeCustomersFor(agent, routeCustomers);
        return { ...agent, assigned_customer_count: assignedCounts[agent.id] || 0, route_customers: customers, route_customer_count: customers.length };
      }));
    }
    if (req.method === "PATCH") {
      const { id, name, email, phone = "", active, password } = req.body || {};
      if (!id || !name?.trim() || !email?.trim()) return json(res, 400, { error: "Name and email are required" });
      if (password && password.length < 8) return json(res, 400, { error: "New password must be at least 8 characters" });
      const existing = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}&organization_id=eq.${profile.organization_id}&role=eq.staff&select=id`, { headers: headers(serviceKey) });
      if (!(await existing.json()).length) return json(res, 404, { error: "Collection staff member not found" });
      const authChanges = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, { method: "PUT", headers: headers(serviceKey), body: JSON.stringify({ email: email.trim().toLowerCase(), email_confirm: true, ...(password ? { password } : {}) }) });
      if (!authChanges.ok) return json(res, 500, { error: "Could not save the staff login details" });
      const companyLink = await agentCompanyLink(req.body || {}, profile.organization_id);
      if (companyLink.error) return json(res, companyLink.status, { error: companyLink.error });
      const updated = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", headers: { ...headers(serviceKey), Prefer: "return=representation" }, body: JSON.stringify({ full_name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), is_active: Boolean(active), ...companyLink.patch }) });
      if (!updated.ok) {
        const detail = await updated.text();
        return json(res, 500, { error: /collection_scope|accounts_company_id/i.test(detail) ? "Run migration 085_agent_company.sql in the Supabase SQL editor, then save the agent again." : "Could not save staff changes" });
      }
      await separateAgentBooks(profile.organization_id, id, companyLink.patch);
      return json(res, 200, (await updated.json())[0]);
    }
    const { name, email, phone = "", password, active = true } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password || password.length < 8) return json(res, 400, { error: "Name, email and a password of at least 8 characters are required" });
    const companyLink = await agentCompanyLink(req.body || {}, profile.organization_id, { required: true });
    if (companyLink.error) return json(res, companyLink.status, { error: companyLink.error });
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, { method: "POST", headers: headers(serviceKey), body: JSON.stringify({ email: email.trim().toLowerCase(), password, email_confirm: true }) });
    const newUser = await created.json();
    if (!created.ok) return json(res, 400, { error: newUser.message || "Could not create the agent account" });
    const agentId = newUser.id || newUser.user?.id;
    if (!agentId) return json(res, 500, { error: "Agent authentication account was created but its ID was unavailable" });
    const saved = await fetch(`${supabaseUrl}/rest/v1/profiles`, { method: "POST", headers: { ...headers(serviceKey), Prefer: "return=representation" }, body: JSON.stringify({ id: agentId, organization_id: profile.organization_id, full_name: name.trim(), email: email.trim().toLowerCase(), role: "staff", phone: phone.trim(), is_active: Boolean(active), ...companyLink.patch }) });
    if (!saved.ok) {
      // Compensate for the Auth user creation so failed requests do not leave
      // an unusable/orphaned login behind.
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${agentId}`, { method: "DELETE", headers: headers(serviceKey) });
      const detail = await saved.text();
      return json(res, 500, { error: /collection_scope|accounts_company_id/i.test(detail) ? "Run migration 085_agent_company.sql in the Supabase SQL editor, then create the agent again." : "Agent login was created but its profile could not be saved" });
    }
    await separateAgentBooks(profile.organization_id, agentId, companyLink.patch);
    return json(res, 201, { id: agentId, name: name.trim(), email: email.trim().toLowerCase() });
  } catch (error) { return json(res, 500, { error: error.message || "Could not create agent" }); }
}
