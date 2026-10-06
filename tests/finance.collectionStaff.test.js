import test from "node:test";
import assert from "node:assert/strict";
import { agentCollectsAccounts, agentCollectsFinance, financeKindLabel, mapAgentRouteCustomers, routeCustomerCounts, routesForAgent, staffAssignableLoans } from "../src/features/finance/model/collectionStaff.js";

const statusOf = loan => loan.status;

test("assignment list includes active daily and monthly accounts", () => {
  const loans = [
    { id: "d1", kind: "daily", status: "active", customerName: "Ann", phone: "1", collectionAgentId: "" },
    { id: "m1", kind: "monthly", status: "active", customerName: "Ben", phone: "2", collectionAgentId: "" },
    { id: "d2", kind: "daily", status: "closed", customerName: "Cara", phone: "3", collectionAgentId: "" },
  ];
  assert.deepEqual(staffAssignableLoans(loans, { selectedAgentId: "agent-1", statusOf }).map(loan => loan.id), ["d1", "m1"]);
});

test("search and existing assignment still apply to monthly accounts", () => {
  const loans = [
    { id: "m1", kind: "monthly", status: "active", customerName: "Ravi Kumar", phone: "900", collectionAgentId: "" },
    { id: "m2", kind: "monthly", status: "active", customerName: "Other", phone: "901", collectionAgentId: "someone-else" },
  ];
  assert.deepEqual(
    staffAssignableLoans(loans, { selectedAgentId: "agent-1", search: "ravi", statusOf }).map(loan => loan.id),
    ["m1"],
  );
});

test("financeKindLabel distinguishes daily and monthly", () => {
  assert.equal(financeKindLabel("monthly"), "Monthly");
  assert.equal(financeKindLabel("daily"), "Daily");
});

test("accounts-company agents are not finance assignment targets", () => {
  assert.equal(agentCollectsAccounts({ collection_scope: "accounts", accounts_company_id: "co-1" }), true);
  assert.equal(agentCollectsAccounts({ collection_scope: "finance", accounts_company_id: "" }), false);
  assert.equal(agentCollectsFinance({ collection_scope: "finance" }), true);
  assert.equal(agentCollectsAccounts({ collection_scope: null }), false);
});

test("route customers stay with the agent's company routes", () => {
  const routes = [
    { id: "r1", name: "KPHB", agent_id: "sai", is_active: true },
    { id: "r2", name: "Other", agent_id: "other", is_active: true },
  ];
  const stops = [
    { route_id: "r1", party_id: "p2", stop_order: 2 },
    { route_id: "r1", party_id: "p1", stop_order: 1 },
    { route_id: "r2", party_id: "p3", stop_order: 1 },
  ];
  const parties = [
    { id: "p1", name: "Mahaveer Traders", phone: "900" },
    { id: "p2", name: "Srihitha Infra", phone: "901" },
    { id: "p3", name: "Nikhil Buyyani", phone: "902" },
  ];
  assert.deepEqual(
    mapAgentRouteCustomers(routes.filter(route => route.agent_id === "sai"), stops, parties).map(row => row.name),
    ["Mahaveer Traders", "Srihitha Infra"],
  );
  assert.deepEqual(routeCustomerCounts(routes, stops), { sai: 2, other: 1 });
  assert.deepEqual(routesForAgent(routes, "missing").map(route => route.id), []);
  assert.deepEqual(routesForAgent([{ id: "r1", agent_id: null }, { id: "r2", agent_id: "other" }], "sai").map(route => route.id), ["r1"]);
  assert.deepEqual(
    mapAgentRouteCustomers(routes, stops, parties, "missing").map(row => row.name),
    [],
  );
  assert.deepEqual(
    mapAgentRouteCustomers([{ id: "r1", name: "KPHB", agent_id: null }], stops, parties, "sai").map(row => row.name),
    ["Mahaveer Traders", "Srihitha Infra"],
  );
});
