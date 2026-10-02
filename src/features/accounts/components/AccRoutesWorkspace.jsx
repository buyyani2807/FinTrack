import { useEffect, useMemo, useState } from "react";
import { formatInr } from "../../../lib/formatMoney.js";
import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { downloadAccountsCsv } from "../io/accountingExport.js";
import { loadCollectionAgents, loadRouteCollectionsReport } from "../data/accountingRepository.js";
import {
  COLLECTION_MODES,
  WEEKDAYS,
  agentHandoverSummary,
  collectionModeLabel,
  mapCollectionAgent,
  mapCollectionRoute,
  mapFieldCollectionRow,
  mapRouteStop,
  moveInList,
  routeOverview,
  weekdaysLabel,
} from "../model/routeCollectionsModel.js";
import { AccMoreMenu } from "./AccUi.jsx";
import { CloseButton } from "../../../components/ui.jsx";

const money = formatInr;

function Field({ label, children, className = "" }) {
  return <label className={`accounts-filter-field ${className}`.trim()}><span className="small">{label}</span>{children}</label>;
}

function Modal({ title, close, children, actions }) {
  return (
    <div className="modal-bg" role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="modal acc-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row">
          <h2 className="title">{title}</h2>
          <CloseButton onClick={close} />
        </div>
        {children}
        {actions ? <div className="acc-modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

const emptyRouteForm = () => ({ id: null, name: "", agentId: "", weekdays: [], notes: "", isActive: true });

function RouteForm({ form, setForm, agents, saving, error, onSave, onClose }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const toggleDay = id => set("weekdays", form.weekdays.includes(id) ? form.weekdays.filter(day => day !== id) : [...form.weekdays, id].sort((a, b) => a - b));
  return <Modal
    title={form.id ? "Edit route" : "New collection route"}
    close={() => !saving && onClose()}
    actions={<div className="tabs spacer">
      
      <button type="button" className="btn primary" disabled={saving || !form.name.trim()} onClick={onSave}>{saving ? "Saving…" : "Save route"}</button>
    </div>}
  >
    <div className="form">
      <Field label="Route name"><input value={form.name} maxLength={80} placeholder="e.g. Market road beat" autoFocus onChange={event => set("name", event.target.value)} /></Field>
      <Field label="Collection agent">
        <select value={form.agentId} onChange={event => set("agentId", event.target.value)}>
          <option value="">Not assigned</option>
          {agents.filter(agent => agent.isActive || agent.id === form.agentId).map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name || agent.phone || "Unnamed"}{agent.role === "owner" ? " (owner)" : ""}{agent.isActive ? "" : " (inactive)"}</option>
          ))}
        </select>
      </Field>
      <div className="span">
        <span className="small">Runs on (leave empty for every day)</span>
        <div className="acc-routes-days" role="group" aria-label="Weekdays">
          {WEEKDAYS.map(day => <button key={day.id} type="button" className={`btn ${form.weekdays.includes(day.id) ? "primary" : ""}`} aria-pressed={form.weekdays.includes(day.id)} onClick={() => toggleDay(day.id)}>{day.short}</button>)}
        </div>
      </div>
      <Field className="span" label="Notes for the agent"><input value={form.notes} maxLength={300} placeholder="Start point, timings, landmarks" onChange={event => set("notes", event.target.value)} /></Field>
      <label className="acc-toggle-row span"><input type="checkbox" checked={form.isActive} onChange={event => set("isActive", event.target.checked)} /><span>Active (shown to the agent)</span></label>
    </div>
    {!agents.length && <p className="small">Add Collection Staff from the main dashboard (Collection staff) to assign agents.</p>}
    {error && <p className="red small">{error}</p>}
  </Modal>;
}

function StopsEditor({ route, parties, stopRouteByParty, routeNameById, positions, saving, onSave, onClose }) {
  const [order, setOrder] = useState(() => route.stops.map(stop => stop.partyId));
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);
  const partyById = useMemo(() => new Map(parties.map(party => [party.id, party])), [parties]);
  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    const chosen = new Set(order);
    return parties
      .filter(party => party.partyType !== "supplier" && party.isActive !== false && !chosen.has(party.id))
      .filter(party => !onlyDue || (positions.get(party.id)?.outstanding || 0) > 0)
      .filter(party => !term || `${party.name} ${party.phone} ${party.address}`.toLowerCase().includes(term))
      .sort((a, b) => (positions.get(b.id)?.outstanding || 0) - (positions.get(a.id)?.outstanding || 0) || a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [parties, order, search, onlyDue, positions]);
  const dirty = order.join(",") !== route.stops.map(stop => stop.partyId).join(",");

  return <Modal
    title={`Customers on ${route.name}`}
    close={() => !saving && onClose()}
    actions={<div className="tabs spacer">
      
      <button type="button" className="btn primary" disabled={saving || !dirty} onClick={() => onSave(order)}>{saving ? "Saving…" : `Save ${order.length} stop${order.length === 1 ? "" : "s"}`}</button>
    </div>}
  >
    <p className="small">Visiting order is the order the agent sees. Customers already on another route move to this one when you save.</p>
    <ol className="acc-routes-stop-list">
      {order.map((partyId, index) => {
        const party = partyById.get(partyId);
        const position = positions.get(partyId);
        return <li key={partyId}>
          <span className="acc-routes-stop-no">{index + 1}</span>
          <span className="acc-routes-stop-name">{party?.name || "Removed party"}{party?.address ? <span className="small"> · {party.address}</span> : null}</span>
          <span className="small acc-num">{position?.outstanding ? money(position.outstanding) : "No dues"}</span>
          <span className="acc-btn-group">
            <button type="button" className="btn ghost" aria-label="Move up" disabled={index === 0} onClick={() => setOrder(current => moveInList(current, index, -1))}>↑</button>
            <button type="button" className="btn ghost" aria-label="Move down" disabled={index === order.length - 1} onClick={() => setOrder(current => moveInList(current, index, 1))}>↓</button>
            <button type="button" className="btn ghost" aria-label="Remove" onClick={() => setOrder(current => current.filter(id => id !== partyId))}>✕</button>
          </span>
        </li>;
      })}
      {!order.length && <li className="small">No customers yet. Add them below.</li>}
    </ol>
    <div className="accounts-action-row spacer">
      <input className="accounts-search" placeholder="Search customers to add" value={search} onChange={event => setSearch(event.target.value)} />
      <label className="acc-toggle-row"><input type="checkbox" checked={onlyDue} onChange={event => setOnlyDue(event.target.checked)} /><span>Only customers with dues</span></label>
    </div>
    <ul className="acc-routes-candidates">
      {candidates.map(party => {
        const otherRoute = stopRouteByParty.get(party.id);
        return <li key={party.id}>
          <span className="acc-routes-stop-name">{party.name}{otherRoute && otherRoute !== route.id ? <span className="small"> · on {routeNameById.get(otherRoute) || "another route"}</span> : null}</span>
          <span className="small acc-num">{positions.get(party.id)?.outstanding ? money(positions.get(party.id).outstanding) : ""}</span>
          <button type="button" className="btn" disabled={order.length >= 500} onClick={() => setOrder(current => [...current, party.id])}>Add</button>
        </li>;
      })}
      {!candidates.length && <li className="small">No more customers match.</li>}
    </ul>
  </Modal>;
}

function FieldCollections({ token, today }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadRouteCollectionsReport(token, from, to)
      .then(result => { if (!cancelled) { setError(""); setRows(result === null ? null : result.map(mapFieldCollectionRow)); } })
      .catch(err => { if (!cancelled) { setError(err?.message || "Could not load field collections."); setRows([]); } });
    return () => { cancelled = true; };
  }, [token, from, to]);
  const handover = useMemo(() => agentHandoverSummary(rows || []), [rows]);

  const exportCsv = () => downloadAccountsCsv(`field-collections-${from}-to-${to}.csv`, [
    ["Date", "Receipt", "Customer", "Agent", "Mode", "Amount", "Status", "Narration"],
    ...(rows || []).map(row => [row.date, row.voucherNumber, row.partyName, row.agentName, collectionModeLabel(row.mode), row.amount, row.status, row.narration]),
  ]);

  if (rows === null) return <div className="card spacer"><strong>Field collections need a database update</strong><p className="copy">Run migration 082_accounts_route_collections_gst_filings.sql in the Supabase SQL editor.</p></div>;
  return <>
    <div className="accounts-action-row spacer">
      <Field label="From"><input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></Field>
      <Field label="To"><input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></Field>
      <button type="button" className="btn" disabled={!rows?.length} onClick={exportCsv}>Export CSV</button>
    </div>
    {error && <p className="red small">{error}</p>}
    <h3 className="acc-routes-subhead">Cash handover by agent</h3>
    <div className="table acc-table-wrap"><table><thead><tr>
      <th>Agent</th><th className="acc-num">Receipts</th>{COLLECTION_MODES.map(mode => <th key={mode.id} className="acc-num">{mode.label}</th>)}<th className="acc-num">Total</th>
    </tr></thead><tbody>
      {handover.agents.map(agent => <tr key={agent.agentId}>
        <td>{agent.agentName}</td><td className="acc-num">{agent.count}</td>
        {COLLECTION_MODES.map(mode => <td key={mode.id} className="acc-num">{agent.byMode[mode.id] ? money(agent.byMode[mode.id]) : "—"}</td>)}
        <td className="acc-num"><strong>{money(agent.total)}</strong></td>
      </tr>)}
      {handover.agents.length > 0 && <tr className="acc-routes-total-row">
        <td>Total</td><td className="acc-num">{handover.totals.count}</td>
        {COLLECTION_MODES.map(mode => <td key={mode.id} className="acc-num">{handover.totals.byMode[mode.id] ? money(handover.totals.byMode[mode.id]) : "—"}</td>)}
        <td className="acc-num"><strong>{money(handover.totals.total)}</strong></td>
      </tr>}
      {rows === undefined && <tr><td colSpan={COLLECTION_MODES.length + 3}>Loading…</td></tr>}
      {rows && !handover.agents.length && <tr><td colSpan={COLLECTION_MODES.length + 3}>No field collections in these dates.</td></tr>}
    </tbody></table></div>
    <p className="small">Cash and cheques should match what each agent hands over. Reversed receipts are excluded from the totals.</p>
    <h3 className="acc-routes-subhead">Receipts</h3>
    <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Agent</th><th>Mode</th><th className="acc-num">Amount</th><th>Status</th></tr></thead><tbody>
      {(rows || []).map(row => <tr key={row.voucherId} className={row.status !== "posted" ? "acc-row-muted" : ""}>
        <td>{formatReceiptDate(row.date)}</td><td>{row.voucherNumber}</td><td>{row.partyName}</td><td>{row.agentName}</td>
        <td>{collectionModeLabel(row.mode)}</td><td className="acc-num">{money(row.amount)}</td><td>{row.status}</td>
      </tr>)}
      {rows && !rows.length && <tr><td colSpan="7">No receipts.</td></tr>}
    </tbody></table></div>
  </>;
}

/** Owner / accountant: routes (beats), their customers and agent, plus field collections for cash handover. */
export function AccRoutesWorkspace({
  token,
  routesData = null,
  parties = [],
  positions = new Map(),
  canEdit = false,
  saving = false,
  today,
  onSaveRoute,
  onDeleteRoute,
  onSetStops,
  tab: routeTab = null,
  onTabChange,
}) {
  // The open tab is the URL (/accounting/parties/routes/:tab).
  const tab = routeTab === "collections" ? "collections" : "routes";
  const setTab = next => onTabChange?.(next);
  const [agents, setAgents] = useState([]);
  const [agentsError, setAgentsError] = useState("");
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [stopsRouteId, setStopsRouteId] = useState(null);
  const [deleteRoute, setDeleteRoute] = useState(null);
  const available = Boolean(routesData);

  useEffect(() => {
    if (!canEdit || !available) return undefined;
    let cancelled = false;
    loadCollectionAgents(token)
      .then(rows => { if (!cancelled) { setAgentsError(""); setAgents(rows.map(mapCollectionAgent)); } })
      .catch(err => { if (!cancelled) setAgentsError(err?.message || "Could not load collection staff."); });
    return () => { cancelled = true; };
  }, [token, canEdit, available]);

  const routes = useMemo(() => (routesData?.routes || []).map(mapCollectionRoute), [routesData]);
  const stops = useMemo(() => (routesData?.stops || []).map(mapRouteStop), [routesData]);
  const overview = useMemo(() => routeOverview({ routes, stops, parties, positions, agents }), [routes, stops, parties, positions, agents]);
  const stopRouteByParty = useMemo(() => new Map(stops.map(stop => [stop.partyId, stop.routeId])), [stops]);
  const routeNameById = useMemo(() => new Map(routes.map(route => [route.id, route.name])), [routes]);
  const unrouted = useMemo(() => parties.filter(party => party.partyType !== "supplier" && !stopRouteByParty.has(party.id) && (positions.get(party.id)?.outstanding || 0) > 0), [parties, stopRouteByParty, positions]);
  const unroutedDue = unrouted.reduce((sum, party) => sum + (positions.get(party.id)?.outstanding || 0), 0);
  const stopsRoute = stopsRouteId ? overview.find(route => route.id === stopsRouteId) : null;

  const saveForm = async () => {
    setFormError("");
    if (!form.name.trim()) return setFormError("Route name is required.");
    const ok = await onSaveRoute?.(form);
    if (ok) setForm(null);
  };

  return <section className="acc-routes">
    <div className="accounts-section-nav">
      <button type="button" className={`accounts-section-tab ${tab === "routes" ? "active" : ""}`} onClick={() => setTab("routes")}>Routes</button>
      <button type="button" className={`accounts-section-tab ${tab === "collections" ? "active" : ""}`} onClick={() => setTab("collections")}>Field collections</button>
    </div>

    {!available && <div className="card spacer">
      <strong>Collection routes need a database update</strong>
      <p className="copy">Run migration 082_accounts_route_collections_gst_filings.sql in the Supabase SQL editor to enable distributor routes and agent collections.</p>
    </div>}

    {available && tab === "routes" && <>
      <p className="copy spacer">Group customers into routes (beats) and assign a Collection Staff login. The agent opens <strong>Route collections</strong> on their dashboard, sees today's customers with dues, and records cash, UPI (with QR) or cheque. Each collection posts a receipt here straight away.</p>
      {agentsError && <p className="red small">{agentsError}</p>}
      <div className="accounts-action-row spacer">
        {canEdit && <button type="button" className="btn primary" disabled={saving} onClick={() => { setFormError(""); setForm(emptyRouteForm()); }}>+ New route</button>}
        {unrouted.length > 0 && <p className="small">{unrouted.length} customer{unrouted.length === 1 ? "" : "s"} with dues ({money(unroutedDue)}) {unrouted.length === 1 ? "is" : "are"} not on any route.</p>}
      </div>
      <div className="acc-routes-grid spacer">
        {overview.map(route => <article key={route.id} className={`card acc-routes-card ${route.isActive ? "" : "inactive"}`}>
          <header className="acc-routes-card-head">
            <div>
              <h3>{route.name}</h3>
              <p className="small">{route.agent ? route.agent.name || route.agent.phone : route.agentId ? "Agent" : "No agent assigned"} · {weekdaysLabel(route.weekdays)}{route.isActive ? "" : " · Paused"}</p>
            </div>
            {canEdit && <AccMoreMenu label="More" items={[
              { id: "edit", label: "Edit route", onClick: () => { setFormError(""); setForm({ ...route }); } },
              { id: "delete", label: "Delete route", danger: true, onClick: () => setDeleteRoute(route) },
            ]} />}
          </header>
          <div className="acc-routes-card-metrics">
            <div><span className="small">Customers</span><strong>{route.stops.length}</strong></div>
            <div><span className="small">Outstanding</span><strong>{money(route.outstanding)}</strong></div>
            <div><span className="small">Overdue</span><strong className={route.overdue > 0 ? "red" : ""}>{money(route.overdue)}</strong></div>
          </div>
          <ol className="acc-routes-preview">
            {route.stops.slice(0, 5).map(stop => <li key={stop.partyId}><span>{stop.name}</span><span className="small">{stop.outstanding > 0 ? money(stop.outstanding) : "—"}</span></li>)}
            {route.stops.length > 5 && <li className="small">+ {route.stops.length - 5} more</li>}
            {!route.stops.length && <li className="small">No customers yet.</li>}
          </ol>
          {canEdit && <button type="button" className="btn" disabled={saving} onClick={() => setStopsRouteId(route.id)}>Edit customers & order</button>}
          {route.notes && <p className="small">{route.notes}</p>}
        </article>)}
        {!overview.length && <div className="card acc-empty">
          <strong>No routes yet</strong>
          <p className="copy">Create a route for each area or beat your agents cover, then add customers in visiting order.</p>
        </div>}
      </div>
    </>}

    {available && tab === "collections" && <FieldCollections token={token} today={today} />}

    {form && <RouteForm form={form} setForm={setForm} agents={agents} saving={saving} error={formError} onSave={saveForm} onClose={() => setForm(null)} />}
    {stopsRoute && <StopsEditor
      route={stopsRoute}
      parties={parties}
      stopRouteByParty={stopRouteByParty}
      routeNameById={routeNameById}
      positions={positions}
      saving={saving}
      onClose={() => setStopsRouteId(null)}
      onSave={async order => { const ok = await onSetStops?.(stopsRoute.id, order); if (ok) setStopsRouteId(null); }}
    />}
    {deleteRoute && <Modal
      title={`Delete ${deleteRoute.name}?`}
      close={() => !saving && setDeleteRoute(null)}
      actions={<div className="tabs spacer">
        <button type="button" className="btn" disabled={saving} onClick={() => setDeleteRoute(null)}>Keep it</button>
        <button type="button" className="btn danger" disabled={saving} onClick={async () => { const ok = await onDeleteRoute?.(deleteRoute); if (ok) setDeleteRoute(null); }}>{saving ? "Deleting…" : "Delete route"}</button>
      </div>}
    >
      <p className="copy">The route and its customer list are removed. Receipts already collected on this route stay in your books.</p>
    </Modal>}
  </section>;
}
