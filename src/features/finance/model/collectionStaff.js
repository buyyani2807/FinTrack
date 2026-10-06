export function staffAssignableLoans(loans, { selectedAgentId, search = "", statusOf } = {}) {
  const query = String(search || "").toLowerCase();
  return (loans || []).filter(loan =>
    statusOf(loan) === "active"
    && (!loan.collectionAgentId || loan.collectionAgentId === selectedAgentId)
    && `${loan.customerName || ""} ${loan.phone || ""}`.toLowerCase().includes(query)
  );
}

export function financeKindLabel(kind) {
  return kind === "monthly" ? "Monthly" : "Daily";
}

export const agentCollectsAccounts = agent => agent?.collection_scope === "accounts" && Boolean(agent?.accounts_company_id);

export const agentCollectsFinance = agent => agent?.collection_scope === "finance";

/** Customers on the routes assigned to one Accounts-company agent. */
export function mapAgentRouteCustomers(routes = [], stops = [], parties = []) {
  const routeById = new Map(routes.map(route => [route.id, route]));
  const partyById = new Map(parties.map(party => [party.id, party]));
  return stops
    .filter(stop => routeById.has(stop.route_id))
    .map(stop => {
      const route = routeById.get(stop.route_id);
      const party = partyById.get(stop.party_id) || {};
      return {
        partyId: stop.party_id,
        name: party.name || "Customer",
        phone: party.phone || "",
        routeId: route.id,
        routeName: route.name || "",
        routeActive: route.is_active !== false,
        stopOrder: Number(stop.stop_order || 0),
      };
    })
    .sort((a, b) => a.routeName.localeCompare(b.routeName) || a.stopOrder - b.stopOrder || a.name.localeCompare(b.name));
}

export function routeCustomerCounts(routes = [], stops = []) {
  const agentByRoute = new Map(routes.filter(route => route.agent_id).map(route => [route.id, route.agent_id]));
  const counts = {};
  for (const stop of stops) {
    const agentId = agentByRoute.get(stop.route_id);
    if (!agentId) continue;
    counts[agentId] = (counts[agentId] || 0) + 1;
  }
  return counts;
}
