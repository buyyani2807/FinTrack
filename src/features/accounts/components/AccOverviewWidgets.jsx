import { useId, useMemo, useState } from "react";
import { SegmentedControl } from "../../../components/ui.jsx";
import { VOUCHER_TYPES, roundMoney, voucherTotals } from "../model/accountingModel.js";
import { money, profitResult } from "../accountsFormat.js";
import { currentStockForItem } from "../model/inventoryModel.js";

const MoneyRow = ({ label, value, tone, hint, onClick }) => {
  const content = (
    <>
      <span className="acc-money-label">
        {label}
        {hint ? <span className="acc-money-hint">{hint}</span> : null}
      </span>
      <strong className={`acc-money-value ${tone || ""}`}>{money(value)}</strong>
    </>
  );
  return onClick
    ? <button type="button" className="acc-money-row clickable" onClick={onClick}>{content}</button>
    : <div className="acc-money-row">{content}</div>;
};

const HeroKpi = ({ label, value, hint, tone, onClick }) => {
  const body = (
    <>
      <span className="acc-owner-kpi-label">{label}</span>
      <strong className={`acc-owner-kpi-value ${tone || ""}`}>{value}</strong>
      {hint ? <span className="acc-owner-kpi-hint">{hint}</span> : null}
    </>
  );
  return onClick
    ? <button type="button" className="acc-owner-kpi clickable" onClick={onClick}>{body}</button>
    : <div className="acc-owner-kpi">{body}</div>;
};

export function AccMoneyTiles({ metrics, periodLabel, onNavigate, receivables, payables }) {
  const [span, setSpan] = useState("month");
  const sales = { today: metrics?.todaySales, month: metrics?.monthSales, period: metrics?.periodSales }[span];
  const purchases = { today: metrics?.todayPurchases, month: metrics?.monthPurchases, period: metrics?.periodPurchases }[span];
  const receipts = { today: metrics?.todayReceipts, month: null, period: null }[span];
  const payments = { today: metrics?.todayPayments, month: null, period: null }[span];
  return <section className="acc-money-tiles" aria-label="Money detail">
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
      {span === "today" ? (
        <>
          <MoneyRow label="Receipts" value={receipts} tone="green" />
          <MoneyRow label="Payments" value={payments} tone="red" />
        </>
      ) : null}
    </article>
    <article className="card acc-money-tile">
      <header className="acc-money-head"><h2>Receivables and payables</h2></header>
      <MoneyRow
        label="Receivables"
        value={metrics?.receivables}
        tone="green"
        hint={receivables?.overdue ? `Overdue ${money(receivables.overdue)}` : ""}
        onClick={() => onNavigate("receivables")}
      />
      <MoneyRow
        label="Payables"
        value={metrics?.payables}
        tone="red"
        hint={payables?.overdue ? `Overdue ${money(payables.overdue)}` : ""}
        onClick={() => onNavigate("payables")}
      />
    </article>
    <article className="card acc-money-tile">
      <header className="acc-money-head"><h2>Cash and bank</h2></header>
      <MoneyRow label="Cash" value={metrics?.cash} />
      <MoneyRow label="Bank" value={metrics?.bank} />
      <MoneyRow label="UPI" value={metrics?.upi} />
    </article>
  </section>;
}

/** Dense owner wall: hero KPIs + money tiles + quick actions. Reuses dashboardMetrics / aging only. */
export function AccOwnerDashboard({
  metrics,
  receivables,
  payables,
  items,
  stockMovements,
  periodLabel,
  onNavigate,
  onOpenCollections,
}) {
  const result = profitResult(metrics?.netProfit);
  const cashTotal = roundMoney(
    Number(metrics?.cash || 0) + Number(metrics?.bank || 0) + Number(metrics?.upi || 0),
  );
  const lowStockCount = useMemo(() => (items || []).filter(item => {
    if (item.itemType === "service") return false;
    const stock = currentStockForItem(item, stockMovements);
    const reorder = Number(item.reorderLevel || 0);
    return reorder > 0 && stock != null && Number(stock) <= reorder;
  }).length, [items, stockMovements]);
  const actions = [
    { label: "Record sale", section: "vouchers", tone: "green" },
    { label: "Add expense", section: "vouchers", tone: "red" },
    { label: "Receivables", section: "receivables", tone: "blue" },
    { label: "Payables", section: "payables", tone: "gold" },
    { label: "Counter", section: "counter", tone: "green" },
    { label: "Expired stock", reportTab: "expired_stock", tone: "red" },
  ];
  return (
    <section className="acc-owner-dash" aria-label="Owner dashboard">
      <div className="acc-owner-hero" aria-label="Key figures">
        <HeroKpi
          label={result.label}
          value={money(result.amount)}
          hint={`Income ${money(metrics?.income)} · Expenses ${money(metrics?.expenses)}`}
          tone={result.loss ? "red" : "green"}
          onClick={() => onNavigate("pnl")}
        />
        <HeroKpi
          label="Cash · Bank · UPI"
          value={money(cashTotal)}
          hint={`${money(metrics?.cash)} cash · ${money(metrics?.bank)} bank · ${money(metrics?.upi)} UPI`}
          tone="gold"
        />
        <HeroKpi
          label="Receivables"
          value={money(metrics?.receivables)}
          hint={receivables?.overdue ? `Overdue ${money(receivables.overdue)}` : "All current"}
          tone="blue"
          onClick={() => onNavigate("receivables")}
        />
        <HeroKpi
          label="Payables"
          value={money(metrics?.payables)}
          hint={payables?.overdue ? `Overdue ${money(payables.overdue)}` : "All current"}
          tone="red"
          onClick={() => onNavigate("payables")}
        />
      </div>
      <div className="acc-owner-today" aria-label="Today and stock">
        <HeroKpi label="Today sales" value={money(metrics?.todaySales)} tone="green" onClick={() => onNavigate({ reportTab: "sales" })} />
        <HeroKpi label="Today receipts" value={money(metrics?.todayReceipts)} tone="green" />
        <HeroKpi label="Today purchases" value={money(metrics?.todayPurchases)} tone="red" onClick={() => onNavigate({ reportTab: "purchases" })} />
        <HeroKpi label="Today payments" value={money(metrics?.todayPayments)} tone="red" />
        <HeroKpi label="Month sales" value={money(metrics?.monthSales)} tone="green" onClick={() => onNavigate({ reportTab: "sales" })} />
        <HeroKpi
          label="Low stock"
          value={String(lowStockCount)}
          hint={lowStockCount ? "At or below reorder" : "OK"}
          tone={lowStockCount ? "red" : "green"}
          onClick={() => onNavigate("inventory")}
        />
      </div>
      <AccMoneyTiles
        metrics={metrics}
        periodLabel={periodLabel}
        onNavigate={onNavigate}
        receivables={receivables}
        payables={payables}
      />
      <div className="accounts-business-actions acc-owner-actions" aria-label="Quick actions">
        <span className="small">Quick actions</span>
        {actions.map(action => (
          <button
            key={action.label}
            type="button"
            className={`accounts-business-action ${action.tone}`}
            onClick={() => onNavigate(action.reportTab ? { reportTab: action.reportTab } : action.section)}
          >
            {action.label}<span aria-hidden="true">→</span>
          </button>
        ))}
        {onOpenCollections ? (
          <button type="button" className="accounts-business-action purple" onClick={onOpenCollections}>
            Open collections<span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** @deprecated Prefer AccOwnerDashboard — kept for any external imports. */
export function AccountsBusinessPulse(props) {
  return <AccOwnerDashboard {...props} />;
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
