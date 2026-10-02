import { formatInr } from "../../../lib/formatMoney.js";
import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { roundMoney } from "./accountingModel.js";

export const WEEKDAYS = [
  { id: 1, short: "Mon", label: "Monday" },
  { id: 2, short: "Tue", label: "Tuesday" },
  { id: 3, short: "Wed", label: "Wednesday" },
  { id: 4, short: "Thu", label: "Thursday" },
  { id: 5, short: "Fri", label: "Friday" },
  { id: 6, short: "Sat", label: "Saturday" },
  { id: 7, short: "Sun", label: "Sunday" },
];

export const COLLECTION_MODES = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "cheque", label: "Cheque" },
  { id: "bank", label: "Bank transfer" },
];

export const collectionModeLabel = mode => COLLECTION_MODES.find(item => item.id === mode)?.label || String(mode || "");

/** ISO weekday (Mon = 1 … Sun = 7) of a YYYY-MM-DD date. */
export function isoWeekday(iso) {
  const day = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** A route with no weekdays runs every day. */
export const routeRunsOn = (route, iso) => !route?.weekdays?.length || route.weekdays.includes(isoWeekday(iso));

export function weekdaysLabel(days = []) {
  const list = [...new Set((days || []).map(Number).filter(day => day >= 1 && day <= 7))].sort((a, b) => a - b);
  if (!list.length || list.length === 7) return "Every day";
  const contiguous = list.length >= 3 && list.every((day, index) => index === 0 || day === list[index - 1] + 1);
  const short = id => WEEKDAYS[id - 1].short;
  if (contiguous) return `${short(list[0])}–${short(list[list.length - 1])}`;
  return list.map(short).join(", ");
}

const num = value => roundMoney(Number(value || 0));

export const mapCollectionRoute = row => ({
  id: row.id,
  name: row.name || "",
  agentId: row.agent_id || "",
  weekdays: (row.weekdays || []).map(Number),
  notes: row.notes || "",
  isActive: row.is_active !== false,
  updatedAt: row.updated_at || "",
});

export const mapRouteStop = row => ({
  routeId: row.route_id,
  partyId: row.party_id,
  stopOrder: Number(row.stop_order || 0),
});

export const mapCollectionAgent = row => ({
  id: row.id,
  name: row.full_name || "",
  phone: row.phone || "",
  role: row.role || "staff",
  isActive: row.is_active !== false,
});

export function mapRouteSheet(raw = {}) {
  const sheet = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
  return {
    date: sheet.date || "",
    today: sheet.today || sheet.date || "",
    agentName: sheet.agent_name || "",
    companies: (sheet.companies || []).map(row => ({
      id: row.id,
      name: row.name || "",
      gstin: row.gstin || "",
      upiId: row.upi_id || "",
      upiPayeeName: row.upi_payee_name || "",
      phone: row.phone || "",
    })),
    routes: (sheet.routes || []).map(row => ({
      id: row.id,
      companyId: row.company_id,
      name: row.name || "",
      weekdays: (row.weekdays || []).map(Number),
      notes: row.notes || "",
    })),
    stops: (sheet.stops || []).map(row => ({
      routeId: row.route_id,
      stopOrder: Number(row.stop_order || 0),
      partyId: row.party_id,
      companyId: row.company_id,
      name: row.name || "",
      phone: row.phone || "",
      address: row.address || "",
      outstanding: num(row.outstanding),
      overdue: num(row.overdue),
      lastPaidOn: row.last_paid_on || "",
    })),
    collections: (sheet.collections || []).map(row => ({
      voucherId: row.voucher_id,
      voucherNumber: row.voucher_number || "",
      date: row.date || "",
      partyId: row.party_id,
      companyId: row.company_id,
      mode: row.mode || "",
      amount: num(row.amount),
      createdAt: row.created_at || "",
    })),
  };
}

const emptyByMode = () => ({ cash: 0, upi: 0, cheque: 0, bank: 0 });

/**
 * Route cards plus the stop list for one route ("today" = every route that runs on the sheet date).
 * Collected amounts come from today's field collections by this agent.
 */
export function routeSheetView(sheet, { routeId = "today" } = {}) {
  const date = sheet?.date || "";
  const collectedByParty = new Map();
  const byMode = emptyByMode();
  let collectedTotal = 0;
  for (const row of sheet?.collections || []) {
    collectedByParty.set(row.partyId, num((collectedByParty.get(row.partyId) || 0) + row.amount));
    if (row.mode in byMode) byMode[row.mode] = num(byMode[row.mode] + row.amount);
    collectedTotal = num(collectedTotal + row.amount);
  }
  const decorate = stop => ({ ...stop, collected: collectedByParty.get(stop.partyId) || 0 });
  const routes = (sheet?.routes || []).map(route => {
    const stops = (sheet?.stops || []).filter(stop => stop.routeId === route.id).map(decorate);
    return {
      ...route,
      runsToday: routeRunsOn(route, date),
      stopCount: stops.length,
      dueStops: stops.filter(stop => stop.outstanding > 0).length,
      outstanding: num(stops.reduce((sum, stop) => sum + stop.outstanding, 0)),
      overdue: num(stops.reduce((sum, stop) => sum + stop.overdue, 0)),
      collected: num(stops.reduce((sum, stop) => sum + stop.collected, 0)),
    };
  });
  const chosen = routeId === "today"
    ? routes.filter(route => route.runsToday).map(route => route.id)
    : [routeId];
  const order = new Map(routes.map((route, index) => [route.id, index]));
  const stops = (sheet?.stops || [])
    .filter(stop => chosen.includes(stop.routeId))
    .map(decorate)
    .sort((a, b) => (order.get(a.routeId) - order.get(b.routeId)) || (a.stopOrder - b.stopOrder) || a.name.localeCompare(b.name));
  return {
    date,
    routes,
    stops,
    totals: {
      stops: stops.length,
      visited: stops.filter(stop => stop.collected > 0).length,
      outstanding: num(stops.reduce((sum, stop) => sum + stop.outstanding, 0)),
      overdue: num(stops.reduce((sum, stop) => sum + stop.overdue, 0)),
      collected: collectedTotal,
      byMode,
    },
  };
}

export function validateCollection({ amount, mode, reference = "", outstanding = 0 } = {}) {
  const value = roundMoney(Number(amount));
  if (!(value > 0)) return "Enter the amount collected.";
  if (!COLLECTION_MODES.some(item => item.id === mode)) return "Choose how the customer paid.";
  if ((mode === "cheque" || mode === "bank") && !String(reference || "").trim()) return "Enter the cheque number or transaction reference.";
  if (Number(outstanding) > 0 && value - Number(outstanding) > 0.004) return `Amount is more than the outstanding balance of ${formatInr(outstanding)}.`;
  if (!(Number(outstanding) > 0)) return "This customer has no outstanding balance.";
  return "";
}

/** WhatsApp receipt the agent sends to the customer after a field collection. */
export function collectionReceiptMessage(result = {}) {
  const body = [
    `Dear ${result.partyName || "Customer"},`,
    `We have received ${formatInr(result.amount)} by ${collectionModeLabel(result.mode)}${result.reference ? ` (Ref ${result.reference})` : ""} on ${formatReceiptDate(result.date)}.`,
    result.voucherNumber ? `Receipt no: ${result.voucherNumber}` : "",
    `Balance due: ${formatInr(Math.max(0, Number(result.outstandingAfter || 0)))}`,
  ].filter(Boolean);
  const footer = [result.agentName ? `Collected by ${result.agentName}.` : "", "Thank you."].filter(Boolean);
  return [`Payment received - ${result.companyName || "FinTrack"}`, "", ...body, "", ...footer].join("\n");
}

export const mapCollectionResult = row => ({
  voucherId: row?.voucher_id || "",
  voucherNumber: row?.voucher_number || "",
  date: row?.date || "",
  amount: num(row?.amount),
  mode: row?.mode || "",
  reference: row?.reference || "",
  alreadyRecorded: Boolean(row?.already_recorded),
  outstandingAfter: num(row?.outstanding_after),
  partyId: row?.party_id || "",
  partyName: row?.party_name || "",
  partyPhone: row?.party_phone || "",
  companyName: row?.company_name || "",
  routeName: row?.route_name || "",
  agentName: row?.agent_name || "",
});

export const mapFieldCollectionRow = row => ({
  voucherId: row.voucher_id,
  voucherNumber: row.voucher_number || "",
  date: row.date || "",
  status: row.status || "posted",
  partyId: row.party_id || "",
  partyName: row.party_name || "",
  mode: row.mode || "",
  amount: num(row.amount),
  agentId: row.agent_id || "",
  agentName: row.agent_name || "",
  narration: row.narration || "",
  createdAt: row.created_at || "",
});

/** Cash handover: posted field collections per agent, split by payment mode. */
export function agentHandoverSummary(rows = []) {
  const byAgent = new Map();
  const totals = { count: 0, total: 0, byMode: emptyByMode() };
  for (const row of rows || []) {
    if (row.status !== "posted") continue;
    const key = row.agentId || "unknown";
    if (!byAgent.has(key)) byAgent.set(key, { agentId: key, agentName: row.agentName || "Unknown agent", count: 0, total: 0, byMode: emptyByMode() });
    const entry = byAgent.get(key);
    entry.count += 1;
    entry.total = num(entry.total + row.amount);
    totals.count += 1;
    totals.total = num(totals.total + row.amount);
    if (row.mode in entry.byMode) {
      entry.byMode[row.mode] = num(entry.byMode[row.mode] + row.amount);
      totals.byMode[row.mode] = num(totals.byMode[row.mode] + row.amount);
    }
  }
  return { agents: [...byAgent.values()].sort((a, b) => b.total - a.total), totals };
}

/**
 * Owner view of each route: stops in order with the customer's receivable position.
 * `positions` maps partyId → { outstanding, overdue }.
 */
export function routeOverview({ routes = [], stops = [], parties = [], positions = new Map(), agents = [] } = {}) {
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const agentById = new Map((agents || []).map(agent => [agent.id, agent]));
  return (routes || []).map(route => {
    const list = (stops || [])
      .filter(stop => stop.routeId === route.id)
      .sort((a, b) => a.stopOrder - b.stopOrder)
      .map(stop => {
        const party = partyById.get(stop.partyId);
        const position = positions.get(stop.partyId) || { outstanding: 0, overdue: 0 };
        return { ...stop, party, name: party?.name || "Removed party", outstanding: num(position.outstanding), overdue: num(position.overdue) };
      });
    return {
      ...route,
      agent: agentById.get(route.agentId) || null,
      stops: list,
      outstanding: num(list.reduce((sum, stop) => sum + Math.max(0, stop.outstanding), 0)),
      overdue: num(list.reduce((sum, stop) => sum + Math.max(0, stop.overdue), 0)),
    };
  });
}

/** Receivable outstanding and overdue per party from invoice-register rows. */
export function receivablePositions(invoiceRows = []) {
  const map = new Map();
  for (const row of invoiceRows || []) {
    if (!row.partyId || !(Number(row.outstanding || 0) > 0)) continue;
    const entry = map.get(row.partyId) || { outstanding: 0, overdue: 0, maxDaysOverdue: 0 };
    entry.outstanding = num(entry.outstanding + Number(row.outstanding));
    if (Number(row.daysOverdue || 0) > 0) {
      entry.overdue = num(entry.overdue + Number(row.outstanding));
      entry.maxDaysOverdue = Math.max(entry.maxDaysOverdue, Number(row.daysOverdue));
    }
    map.set(row.partyId, entry);
  }
  return map;
}

export function moveInList(list, index, delta) {
  const next = [...list];
  const target = index + delta;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return list;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
