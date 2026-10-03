import { useId, useMemo, useState } from "react";
import { VOUCHER_TYPES, voucherTotals } from "../model/accountingModel.js";
import { money } from "../accountsFormat.js";
import { AccMetric } from "./AccUi.jsx";

export function AccountsBusinessPulse({ metrics, receivables, payables, items, stockMovements, attention, onNavigate, onOpenCollections }) {
  const lowStockCount = useMemo(() => (items || []).filter(item => {
    const current = Number(item.current_stock ?? item.stock ?? item.quantity ?? 0);
    const reorder = Number(item.reorder_level ?? item.reorderPoint ?? 0);
    return reorder > 0 && current <= reorder;
  }).length, [items]);
  const actions = [
    { label: "Record sale", section: "vouchers", tone: "green" },
    { label: "Add expense", section: "vouchers", tone: "red" },
    { label: "View receivables", section: "receivables", tone: "blue" },
    { label: "View payables", section: "payables", tone: "gold" },
  ];
  return <section className="acc-section accounts-business-pulse">
    <div className="accounts-business-pulse-head">
      <div><span className="small">Business pulse</span><h2 className="acc-section-title">Today at a glance</h2></div>
      <span className="small">Live from your books</span>
    </div>
    <div className="accounts-business-kpis">
      <AccMetric label="Cash in hand" value={money(metrics?.cash)} tone="gold" />
      <AccMetric label="Receivables due" value={money(receivables?.total)} tone="blue" onClick={() => onNavigate("receivables")} />
      <AccMetric label="Payables due" value={money(payables?.total)} tone="red" onClick={() => onNavigate("payables")} />
      <AccMetric label="Profit this period" value={money(metrics?.netProfit)} tone={Number(metrics?.netProfit) < 0 ? "red" : "green"} onClick={() => onNavigate("pnl")} />
      <AccMetric label="Low-stock items" value={String(lowStockCount)} tone={lowStockCount ? "red" : "green"} onClick={() => onNavigate("inventory")} />
      <AccMetric label="Stock movements" value={String((stockMovements || []).length)} tone="blue" onClick={() => onNavigate("inventory")} />
    </div>
    <div className="accounts-business-actions" aria-label="Quick actions">
      <span className="small">Quick actions</span>
      {actions.map(action => <button key={action.label} type="button" className={`accounts-business-action ${action.tone}`} onClick={() => onNavigate(action.section)}>{action.label}<span aria-hidden="true">→</span></button>)}
      {onOpenCollections && <button type="button" className="accounts-business-action purple" onClick={onOpenCollections}>Open collections<span aria-hidden="true">→</span></button>}
    </div>
    {attention?.count > 0 && <div className="accounts-business-alert" role="status">
      <span className="accounts-business-alert-icon" aria-hidden="true">!</span>
      <div><strong>{attention.summary}</strong><span className="small"> Review the most urgent item to keep your books moving.</span></div>
      <button type="button" className="btn" onClick={() => onNavigate(attention.items?.[0]?.href || "reports")}>Review now →</button>
    </div>}
  </section>;
}
const piePoint = (cx, cy, r, angle) => {
  const rad = (angle - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};
const pieSlicePath = (cx, cy, r, startPct, endPct) => {
  const span = Math.max(0, Math.min(1, endPct) - Math.max(0, startPct));
  if (span <= 0) return "";
  if (span >= 0.999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const start = piePoint(cx, cy, r, startPct * 360);
  const end = piePoint(cx, cy, r, endPct * 360);
  return `M ${cx} ${cy} L ${start[0]} ${start[1]} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${end[0]} ${end[1]} Z`;
};
export const AccCompareChart = ({ ar, ap, onReceivables, onPayables }) => {
  const arTotal = Number(ar?.current || 0) + Number(ar?.overdue || 0);
  const apTotal = Number(ap?.current || 0) + Number(ap?.overdue || 0);
  const combined = arTotal + apTotal;
  const arShare = combined > 0 ? arTotal / combined : 0;
  const arCurrentPct = arTotal > 0 ? (Number(ar.current) / arTotal) * 100 : 0;
  const arOverduePct = arTotal > 0 ? (Number(ar.overdue) / arTotal) * 100 : 0;
  const apCurrentPct = apTotal > 0 ? (Number(ap.current) / apTotal) * 100 : 0;
  const apOverduePct = apTotal > 0 ? (Number(ap.overdue) / apTotal) * 100 : 0;
  return (
    <section className="card acc-ov-chart" aria-label="Receivables versus payables">
      <header className="acc-ov-chart-head">
        <div>
          <strong>Receivables & payables</strong>
          <p className="small">Unpaid invoices versus unpaid bills</p>
        </div>
      </header>
      <div className="acc-ov-chart-body">
        <svg className="acc-ov-pie" viewBox="0 0 120 120" role="img" aria-label={`Receivables ${money(arTotal)}, payables ${money(apTotal)}`}>
          <circle cx="60" cy="60" r="46" className="acc-ov-pie-bg" />
          {combined > 0 ? (
            <>
              {arTotal > 0 && (
                <path className="acc-ov-pie-ar" d={pieSlicePath(60, 60, 46, 0, arShare)} onClick={onReceivables} />
              )}
              {apTotal > 0 && (
                <path className="acc-ov-pie-ap" d={pieSlicePath(60, 60, 46, arShare, 1)} onClick={onPayables} />
              )}
            </>
          ) : null}
          <circle cx="60" cy="60" r="24" className="acc-ov-pie-hole" />
        </svg>
        <div className="acc-ov-chart-bars">
          <button type="button" className="acc-ov-chart-row kind-ar" onClick={onReceivables} aria-label={`Total receivables ${money(arTotal)}. Open`}>
            <span className="acc-ov-chart-label"><i className="ar" /> Receivables</span>
            <strong>{money(arTotal)}</strong>
            <span className="acc-ov-aging-bar" aria-hidden="true">
              <span className="current" style={{ width: `${arCurrentPct}%` }} />
              <span className="overdue" style={{ width: `${arOverduePct}%` }} />
            </span>
          </button>
          <button type="button" className="acc-ov-chart-row kind-ap" onClick={onPayables} aria-label={`Total payables ${money(apTotal)}. Open`}>
            <span className="acc-ov-chart-label"><i className="ap" /> Payables</span>
            <strong>{money(apTotal)}</strong>
            <span className="acc-ov-aging-bar" aria-hidden="true">
              <span className="current" style={{ width: `${apCurrentPct}%` }} />
              <span className="overdue" style={{ width: `${apOverduePct}%` }} />
            </span>
          </button>
          <p className="acc-ov-aging-foot">
            <span><i className="current" /> Current</span>
            <span><i className="overdue" /> Overdue</span>
          </p>
        </div>
      </div>
    </section>
  );
};
export function AccOverviewRecent({ rows, onViewAll }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className="card acc-ov-recent-card">
      <button type="button" className="acc-ov-recent-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(current => !current)}>
        <span>Recent transactions{rows.length ? ` · ${rows.length}` : ""}</span>
        <span className="acc-ov-recent-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      <div id={panelId} hidden={!open}>
        {rows.length ? (
          <div className="acc-ov-recent">
            {rows.map(voucher => (
              <div key={voucher.id} className="acc-ov-recent-row">
                <div>
                  <strong>{voucher.voucherNumber}</strong>
                  <p>{voucher.date} · {VOUCHER_TYPES[voucher.voucherType]?.label || voucher.voucherType}</p>
                </div>
                <span className="amt">{money(voucherTotals(voucher.lines).debit)}</span>
              </div>
            ))}
            <button type="button" className="acc-ov-link-btn acc-ov-recent-all" onClick={onViewAll}>View all</button>
          </div>
        ) : (
          <p className="acc-ov-recent-empty">No transactions yet. Use New to record one.</p>
        )}
      </div>
    </section>
  );
}
