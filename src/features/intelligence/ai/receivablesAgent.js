import { invoiceRegister } from "../../accounts/model/accountingReports.js";
import { advisory, bySeverity, confidenceFor, formatInr, isoDate, n, roundMoney, source } from "./aiCommon.js";
import { lagProfile, partySettlementLags } from "./paymentHistory.js";

const SCOPE_ROLES = new Set(["owner", "accountant", "viewer"]);

function routeAssignments(collectionRoutes) {
  const routes = collectionRoutes?.routes || [];
  const routeById = new Map(routes.map(route => [route.id, route]));
  const byParty = new Map();
  for (const stop of collectionRoutes?.stops || []) {
    const route = routeById.get(stop.route_id);
    if (!route) continue;
    byParty.set(stop.party_id, { routeId: route.id, routeName: route.name || "Route", agentId: route.agent_id || null });
  }
  return byParty;
}

/**
 * Customers a person may see. Company-level Accounts roles see every customer; a collection agent sees only
 * customers on routes assigned to them. Unknown roles see nothing.
 */
export function scopeCustomersForViewer(rows = [], { role = "owner", agentId = "", collectionRoutes = null } = {}) {
  if (SCOPE_ROLES.has(role)) return rows;
  if (role !== "agent" || !agentId) return [];
  const assignments = routeAssignments(collectionRoutes);
  return rows.filter(row => assignments.get(row.partyId)?.agentId === agentId);
}

const channelFor = (party = {}) => {
  if (party.phone) return { channel: "Phone call", secondaryChannel: "WhatsApp" };
  if (party.email) return { channel: "Email", secondaryChannel: null };
  return { channel: "Visit", secondaryChannel: null };
};

/**
 * Prioritised customer collection list from open sales invoices and verified settlement history.
 * Advisory: it never records payments, changes credit limits, reassigns agents, or sends messages.
 */
export function buildReceivablesCollectionPlan({ accounts = [], vouchers = [], parties = [], asOf, collectionRoutes = null, role = "owner", agentId = "" } = {}) {
  const today = isoDate(asOf);
  const open = invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today, outstandingOnly: true });
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const lags = partySettlementLags(vouchers, { settleType: "receipt" });
  const assignments = routeAssignments(collectionRoutes);

  const byParty = new Map();
  for (const row of open) {
    if (!row.partyId) continue;
    if (!byParty.has(row.partyId)) byParty.set(row.partyId, []);
    byParty.get(row.partyId).push(row);
  }

  const rows = [];
  for (const [partyId, invoices] of byParty) {
    const party = partyById.get(partyId) || {};
    const outstanding = roundMoney(invoices.reduce((sum, row) => sum + n(row.outstanding), 0));
    if (!(outstanding > 0)) continue;
    const daysOverdue = Math.max(0, ...invoices.map(row => n(row.daysOverdue)));
    const overdueAmount = roundMoney(invoices.filter(row => n(row.daysOverdue) > 0).reduce((sum, row) => sum + n(row.outstanding), 0));
    const partial = invoices.filter(row => n(row.paid) > 0).length;
    const profile = lagProfile(lags.get(partyId) || []);
    const creditLimit = n(party.creditLimit);
    const overLimit = creditLimit > 0 && outstanding > creditLimit;

    let score = 0;
    if (daysOverdue > 60) score += 45;
    else if (daysOverdue > 30) score += 30;
    else if (daysOverdue > 0) score += 15;
    if (profile.typicalLag != null && profile.typicalLag > 15) score += 15;
    if (overLimit) score += 15;
    if (partial) score += 5;
    if (overdueAmount >= 100000) score += 15;
    else if (overdueAmount >= 25000) score += 8;
    const risk = score >= 50 ? "high" : score >= 20 ? "medium" : "low";

    const reasons = [
      daysOverdue > 0 ? `${daysOverdue} day(s) overdue on the oldest invoice` : "Not yet overdue",
      overdueAmount > 0 ? `${formatInr(overdueAmount)} overdue` : null,
      profile.typicalLag != null ? `Historically pays ${profile.lowLag}–${profile.highLag} days after the due date (${profile.samples} settlements)` : "No settlement history yet",
      overLimit ? `Outstanding is above the ${formatInr(creditLimit)} credit limit` : null,
      partial ? `${partial} invoice(s) partly paid` : null,
    ].filter(Boolean);

    const { channel, secondaryChannel } = channelFor(party);
    const recommendedAction = risk === "high"
      ? `${channel === "Phone call" ? "Call" : channel === "Visit" ? "Visit" : "Email"} ${party.name || "the customer"} today.`
      : risk === "medium"
        ? `${secondaryChannel ? "Send a WhatsApp reminder" : `${channel} follow-up`} this week.`
        : daysOverdue > 0 ? "Send a polite reminder." : "Send a reminder before the due date.";
    const assignment = assignments.get(partyId);
    const nextDue = invoices.map(row => row.dueDate).filter(Boolean).sort()[0] || "";

    rows.push(advisory({
      id: `receivable-${partyId}`,
      partyId,
      customer: party.name || invoices[0].partyName || "Customer",
      phone: party.phone || "",
      outstanding,
      overdueAmount,
      daysOverdue,
      nextDue,
      invoiceCount: invoices.length,
      risk,
      severity: risk,
      score,
      reason: reasons.join(" · "),
      reasons,
      paymentPattern: profile.typicalLag != null ? `Historically pays ${profile.lowLag}–${profile.highLag} days after the due date.` : null,
      title: `${party.name || "Customer"}: ${formatInr(outstanding)} outstanding`,
      explanation: reasons.join(". "),
      recommendedAction,
      channel,
      secondaryChannel,
      assignedAgent: assignment ? `Route: ${assignment.routeName}` : "Not on a collection route",
      assignedAgentId: assignment?.agentId || null,
      sourceRecords: invoices.map(row => ({ voucherId: row.voucherId, reference: row.reference, outstanding: roundMoney(row.outstanding), dueDate: row.dueDate })),
      ...confidenceFor(profile.samples + (daysOverdue > 0 ? 2 : 0), { high: 6, medium: 2 }),
      source: source("receivables", "Open receivables", { partyId }),
    }));
  }
  const scoped = scopeCustomersForViewer(rows, { role, agentId, collectionRoutes });
  return scoped.sort((a, b) => bySeverity(a, b) || b.score - a.score || b.outstanding - a.outstanding);
}
