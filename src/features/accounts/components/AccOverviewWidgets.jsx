import { useId, useMemo, useState } from "react";
import { SegmentedControl } from "../../../components/ui.jsx";
import { VOUCHER_TYPES, voucherTotals } from "../model/accountingModel.js";
import { money } from "../accountsFormat.js";
import { AccMetric } from "./AccUi.jsx";

const MoneyRow = ({ label, value, tone, onClick }) => {
  const content = <><span className="acc-money-label">{label}</span><strong className={`acc-money-value ${tone}`}>{money(value)}</strong></>;
  return onClick
    ? <button type="button" className="acc-money-row clickable" onClick={onClick}>{content}</button>
    : <div className="acc-money-row">{content}</div>;
};

export function AccMoneyTiles({ metrics, periodLabel, onNavigate }) {
  const [span, setSpan] = useState("month");
  const sales = { today: metrics?.todaySales, month: metrics?.monthSales, period: metrics?.periodSales }[span];
  const purchases = { today: metrics?.todayPurchases, month: metrics?.monthPurchases, period: metrics?.periodPurchases }[span];
  return <section className="acc-money-tiles" aria-label="Money at a glance">
    <article className="card acc-money-tile">
      <header className="acc-money-head">
        <h2>Sales and purchase</h2>
        <SegmentedControl
          label="Sales and purchase window"
          className="acc-money-window"
          options={[{ id: "today", label: "Today" }, { id: "month", label: "Month" }, { id: "period", label: periodLabel }]}
          value={span}
          onChange={setSpan}
        />
      </header>
      <MoneyRow label="Sales" value={sales} tone="green" onClick={() => onNavigate({ reportTab: "sales" })} />
      <MoneyRow label="Purchases" value={purchases} tone="red" onClick={() => onNavigate({ reportTab: "purchases" })} />
    </article>
    <article className="card acc-money-tile">
      <header className="acc-money-head"><h2>Receivables and payables</h2></header>
      <MoneyRow label="Receivables" value={metrics?.receivables} tone="green" onClick={() => onNavigate("receivables")} />
      <MoneyRow label="Payables" value={metrics?.payables} tone="red" onClick={() => onNavigate("payables")} />
    </article>
    <article className="card acc-money-tile">
      <header className="acc-money-head"><h2>Cash and bank</h2></header>
      <MoneyRow label="Cash" value={metrics?.cash} />
      <MoneyRow label="Bank" value={metrics?.bank} />
      <MoneyRow label="UPI" value={metrics?.upi} />
    </article>
  </section>;
}

export function AccountsBusinessPulse({ metrics, receivables, payables, items, stockMovements, onNavigate, onOpenCollections }) {
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
    {/* Items needing review are listed in the Attention center card right below. */}
  </section>;
}
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
