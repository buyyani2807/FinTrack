import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Field, Modal, Spinner } from "../../components/ui.jsx";
import { formatInr } from "../../lib/formatMoney.js";
import { QrSvg } from "../accounts/PayPage.jsx";
import { upiPayLink } from "../accounts/model/upiPay.js";
import {
  COLLECTION_MODES,
  collectionModeLabel,
  collectionReceiptMessage,
  routeSheetBrand,
  routeSheetView,
  validateCollection,
  weekdaysLabel,
} from "../accounts/model/routeCollectionsModel.js";
import { canWhatsAppShare, openManualWhatsAppShare } from "../receipts/io/receiptWhatsApp.js";
import { loadAgentRouteSheet, newCollectionRequestId, recordRouteCollection } from "./routeCollectionsApi.js";
import "./routeCollections.css";

const longDate = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }) : "");

function CollectModal({ stop, company, close, onSaved, token }) {
  const [form, setForm] = useState(() => ({
    amount: String(stop.overdue > 0 ? stop.overdue : stop.outstanding),
    mode: "cash",
    reference: "",
    note: "",
  }));
  const [requestId] = useState(newCollectionRequestId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const amount = Number(form.amount || 0);
  const upiLink = form.mode === "upi" && company?.upiId && amount > 0
    ? upiPayLink({ upiId: company.upiId, payeeName: company.upiPayeeName || company.name, amount, note: `${stop.name} payment` })
    : "";

  const submit = async () => {
    if (busy) return;
    const message = validateCollection({ ...form, outstanding: stop.outstanding });
    if (message) return setError(message);
    setError("");
    setBusy(true);
    try {
      const result = await recordRouteCollection(token, { partyId: stop.partyId, ...form, requestId });
      onSaved({ ...result, partyPhone: result.partyPhone || stop.phone });
    } catch (err) {
      setError(err?.message || "Could not record the collection. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return <Modal close={() => !busy && close()}>
    <h2 className="title">Collect from {stop.name}</h2>
    <p className="copy">Outstanding {formatInr(stop.outstanding)}{stop.overdue > 0 ? ` · Overdue ${formatInr(stop.overdue)}` : ""}</p>
    <div className="rc-mode-row spacer" role="group" aria-label="Payment mode">
      {COLLECTION_MODES.map(mode => <button key={mode.id} type="button" className={`btn ${form.mode === mode.id ? "primary" : ""}`} onClick={() => set("mode", mode.id)}>{mode.label}</button>)}
    </div>
    <div className="form spacer">
      <Field label="Amount collected (₹)">
        <input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={event => set("amount", event.target.value)} autoFocus />
      </Field>
      <Field label={form.mode === "cheque" ? "Cheque number" : form.mode === "bank" ? "Transaction reference" : "Reference (optional)"}>
        <input value={form.reference} onChange={event => set("reference", event.target.value)} />
      </Field>
      <Field className="span" label="Note (optional)">
        <input value={form.note} onChange={event => set("note", event.target.value)} maxLength={120} />
      </Field>
    </div>
    <div className="rc-quick-amounts">
      {stop.overdue > 0 && stop.overdue !== stop.outstanding && <button type="button" className="btn ghost" onClick={() => set("amount", String(stop.overdue))}>Overdue {formatInr(stop.overdue)}</button>}
      <button type="button" className="btn ghost" onClick={() => set("amount", String(stop.outstanding))}>Full {formatInr(stop.outstanding)}</button>
    </div>
    {form.mode === "upi" && (upiLink
      ? <div className="rc-upi">
        <QrSvg text={upiLink} size={200} label={`UPI QR for ${formatInr(amount)}`} />
        <p className="small">Ask the customer to scan and pay {formatInr(amount)} to {company.upiPayeeName || company.name}. Save only after you see the payment succeed.</p>
      </div>
      : <p className="small muted spacer">{company?.upiId ? "Enter the amount to show a UPI QR." : "No UPI ID is set for this business, so no QR can be shown. Check the payment on the customer's phone."}</p>)}
    {error && <p className="red small">{error}</p>}
    <div className="row spacer">
      
      <Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : `Save ${amount > 0 ? formatInr(amount) : "collection"}`}</Button>
    </div>
  </Modal>;
}

function SuccessModal({ result, close }) {
  const message = collectionReceiptMessage(result);
  const canShare = canWhatsAppShare(result.partyPhone);
  return <Modal close={close}>
    <h2 className="title">{result.alreadyRecorded ? "Already recorded" : "Collection saved"}</h2>
    <p className="rc-success-amount green">{formatInr(result.amount)}</p>
    <p className="copy">{result.partyName} · {collectionModeLabel(result.mode)}{result.voucherNumber ? ` · Receipt ${result.voucherNumber}` : ""}</p>
    <p className="small">Balance due now: <strong>{formatInr(result.outstandingAfter)}</strong></p>
    {result.alreadyRecorded && <p className="small muted">This collection was saved earlier, so it was not recorded twice.</p>}
    <div className="row spacer">
      <Button onClick={close}>Done</Button>
      <Button className="primary" disabled={!canShare} onClick={() => openManualWhatsAppShare({ phone: result.partyPhone, message })}>
        {canShare ? "Send WhatsApp receipt" : "No phone for WhatsApp"}
      </Button>
    </div>
  </Modal>;
}

/** Collection agent's route sheet: today's customers in visiting order, collect with cash / UPI QR / cheque. */
// The chosen route is the URL (/route-collections/:routeId, "today" by default; see app/AppRoutes.jsx).
export function RouteCollectionsPage({ token, businessName, back, routeId = "today", onRouteChange }) {
  const [sheet, setSheet] = useState(undefined);
  const [error, setError] = useState("");
  const setRouteId = next => onRouteChange?.(next);
  const [search, setSearch] = useState("");
  const [hidePaid, setHidePaid] = useState(false);
  const [collectStop, setCollectStop] = useState(null);
  const [success, setSuccess] = useState(null);

  const refresh = useCallback(() => {
    return loadAgentRouteSheet(token)
      .then(result => { setError(""); setSheet(result); })
      .catch(err => { setError(err?.message || "Could not load your routes."); setSheet(current => current ?? null); });
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const view = useMemo(() => (sheet ? routeSheetView(sheet, { routeId }) : null), [sheet, routeId]);
  const companyById = useMemo(() => new Map((sheet?.companies || []).map(company => [company.id, company])), [sheet]);
  const visibleStops = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (view?.stops || []).filter(stop => {
      if (hidePaid && !(stop.outstanding > 0)) return false;
      if (!term) return true;
      return `${stop.name} ${stop.phone} ${stop.address}`.toLowerCase().includes(term);
    });
  }, [view, search, hidePaid]);
  const multiCompany = (sheet?.companies || []).length > 1;
  const todayRoutes = (view?.routes || []).filter(route => route.runsToday);

  const header = <header className="top">
    <div>
      <div className="brand">{routeSheetBrand(sheet, view, { routeId, fallback: businessName || "Route collections" })}</div>
      <div className="sub">Route collections{sheet?.agentName ? ` · ${sheet.agentName}` : ""}{sheet?.date ? ` · ${longDate(sheet.date)}` : ""}</div>
    </div>
    <div className="top-actions">
      <Button onClick={() => refresh()}>Refresh</Button>
      {back && <Button onClick={back}>← Dashboard</Button>}
    </div>
  </header>;

  if (sheet === undefined) {
    return <main className="shell rc-page">{header}<Spinner label="Loading your route" /></main>;
  }
  if (sheet === null) {
    return <main className="shell rc-page">{header}
      <section className="card spacer">
        <h2 className="title">Route collections are not set up yet</h2>
        <p className="copy">{error || "Ask the business owner to run the latest FinTrack update and assign you a collection route in Accounts → Collection routes."}</p>
      </section>
    </main>;
  }
  if (!sheet.routes.length) {
    return <main className="shell rc-page">{header}
      <section className="card spacer">
        <h2 className="title">No route assigned</h2>
        <p className="copy">You don't have a collection route yet. The owner can assign one in Accounts → Collection routes.</p>
      </section>
    </main>;
  }

  return <main className="shell rc-page">
    {header}
    {error && <p className="red small">{error}</p>}
    <section className="grid rc-metrics">
      <div className="card"><div className="metric-label">To collect</div><div className="metric-value">{formatInr(view.totals.outstanding)}</div><div className="small">{view.totals.stops} customer{view.totals.stops === 1 ? "" : "s"}</div></div>
      <div className="card"><div className="metric-label">Overdue</div><div className="metric-value red">{formatInr(view.totals.overdue)}</div></div>
      <div className="card"><div className="metric-label">Collected today</div><div className="metric-value green">{formatInr(view.totals.collected)}</div><div className="small">{view.totals.visited} visited</div></div>
    </section>

    <nav className="rc-route-tabs" aria-label="Routes">
      <button type="button" className={`rc-route-tab ${routeId === "today" ? "active" : ""}`} onClick={() => setRouteId("today")}>
        <strong>Today</strong><span>{todayRoutes.length ? todayRoutes.map(route => route.name).join(", ") : "No route today"}</span>
      </button>
      {view.routes.map(route => <button key={route.id} type="button" className={`rc-route-tab ${routeId === route.id ? "active" : ""}`} onClick={() => setRouteId(route.id)}>
        <strong>{route.name}</strong><span>{weekdaysLabel(route.weekdays)} · {route.dueStops}/{route.stopCount} due</span>
      </button>)}
    </nav>

    {routeId === "today" && !todayRoutes.length && <p className="copy">None of your routes run today. Pick a route above to collect anyway.</p>}
    {routeId !== "today" && view.routes.find(route => route.id === routeId)?.notes && <p className="small rc-route-notes">{view.routes.find(route => route.id === routeId).notes}</p>}

    <div className="rc-filter-row">
      <input type="search" placeholder="Search customer, phone or area" value={search} onChange={event => setSearch(event.target.value)} />
      <label className="rc-toggle"><input type="checkbox" checked={hidePaid} onChange={event => setHidePaid(event.target.checked)} /> Hide paid-up</label>
    </div>

    <ol className="rc-stops">
      {visibleStops.map((stop, index) => {
        const company = companyById.get(stop.companyId);
        const due = stop.outstanding > 0;
        return <li key={stop.partyId} className={`card rc-stop ${due ? "" : "paid"} ${stop.collected > 0 ? "visited" : ""}`}>
          <div className="rc-stop-no" aria-hidden="true">{index + 1}</div>
          <div className="rc-stop-main">
            <div className="rc-stop-name">{stop.name}</div>
            {stop.address && <div className="small">{stop.address}</div>}
            <div className="small muted">
              {multiCompany && company ? `${company.name} · ` : ""}
              {stop.lastPaidOn ? `Last paid ${stop.lastPaidOn}` : "No payment yet"}
            </div>
            {stop.collected > 0 && <span className="rc-chip ok">Collected {formatInr(stop.collected)} today</span>}
          </div>
          <div className="rc-stop-side">
            <div className="rc-stop-due">{due ? formatInr(stop.outstanding) : "No dues"}</div>
            {stop.overdue > 0 && <div className="small red">{formatInr(stop.overdue)} overdue</div>}
            <div className="rc-stop-actions">
              {stop.phone && <a className="btn ghost" href={`tel:${stop.phone}`}>Call</a>}
              <Button className="primary" disabled={!due} onClick={() => setCollectStop(stop)}>Collect</Button>
            </div>
          </div>
        </li>;
      })}
      {!visibleStops.length && <li className="card rc-empty">{view.stops.length ? "No customers match." : "No customers on this route yet."}</li>}
    </ol>

    {view.totals.collected > 0 && <section className="card rc-handover">
      <h2 className="title">Hand over today</h2>
      <div className="rc-handover-modes">
        {COLLECTION_MODES.filter(mode => view.totals.byMode[mode.id] > 0).map(mode => <div key={mode.id}><span className="small">{mode.label}</span><strong>{formatInr(view.totals.byMode[mode.id])}</strong></div>)}
      </div>
      <p className="small muted">Cash and cheques collected today should be handed to the office. UPI and bank payments go straight to the business account.</p>
    </section>}

    {collectStop && <CollectModal
      token={token}
      stop={collectStop}
      company={companyById.get(collectStop.companyId)}
      close={() => setCollectStop(null)}
      onSaved={result => { setCollectStop(null); setSuccess(result); refresh(); }}
    />}
    {success && <SuccessModal result={success} close={() => setSuccess(null)} />}
  </main>;
}

/** Dashboard card for agents with a route; renders nothing when no route is assigned or 082 is missing. */
export function RouteCollectionsEntryCard({ token, onOpen }) {
  const [sheet, setSheet] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    loadAgentRouteSheet(token)
      .then(result => { if (!cancelled) setSheet(result); })
      .catch(() => { if (!cancelled) setSheet(null); });
    return () => { cancelled = true; };
  }, [token]);
  const view = useMemo(() => (sheet ? routeSheetView(sheet) : null), [sheet]);
  if (!sheet?.routes?.length || !view) return null;
  const today = view.routes.filter(route => route.runsToday);
  return <section className="card rc-entry">
    <div>
      <div className="metric-label">Route collections</div>
      <div className="rc-entry-title">{today.length ? today.map(route => route.name).join(", ") : "No route today"}</div>
      <div className="small">{view.totals.stops} customers · {formatInr(view.totals.outstanding)} to collect · {formatInr(view.totals.collected)} collected today</div>
    </div>
    <Button className="primary" onClick={onOpen}>Open route</Button>
  </section>;
}
