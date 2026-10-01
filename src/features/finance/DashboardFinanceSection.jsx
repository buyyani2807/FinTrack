import { Button, Metric } from "../../components/ui.jsx";
import { formatInr as money } from "../../lib/formatMoney.js";
import { FinanceInsightsBrief } from "./FinanceInsightsBrief.jsx";
import { DashboardDragHandle } from "./TodayCollections.jsx";
import { byCollectionOrderThenName } from "./collectionOrder";
import { loanBalance, loanPaid } from "./loanState.js";
import { investedAmount, realizedLoss, realizedProfit } from "./pnl.js";

export function DashboardFinanceSection({
  title,
  customerLabel,
  kind,
  loans,
  customersOpen = false,
  onToggleCustomers,
  onView,
  canReorder = false,
  showPnl = false,
  draggedId,
  setDraggedId,
  onReorder,
  startTouchDrag,
  moveTouchDrag,
  finishTouchDrag,
  cancelTouchDrag,
}) {
  const financed = loans.reduce((sum, loan) => sum + investedAmount(loan), 0);
  const received = loans.reduce((sum, loan) => sum + loanPaid(loan), 0);
  const outstanding = loans.reduce((sum, loan) => sum + loanBalance(loan), 0);
  const profit = loans.reduce((sum, loan) => sum + realizedProfit(loan), 0);
  const loss = loans.reduce((sum, loan) => sum + realizedLoss(loan), 0);
  const icon = title === "Daily Finance" ? "◷" : "◫";
  const rows = [...loans].sort(byCollectionOrderThenName);
  const panelId = `dashboard-${kind}-customers`;
  const toggleId = `${panelId}-toggle`;
  const beginDrag = (event, loanId) => {
    if (!canReorder) return;
    if (event.target.closest("a,button")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData("text/plain", loanId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    setDraggedId(loanId);
  };
  return <section className="card dashboard-finance-section">
    <div className="toolbar dashboard-finance-heading">
      <div className="dashboard-finance-title">
        <div className="dashboard-finance-icon">{icon}</div>
        <div>
          <strong>{title}</strong>
        </div>
      </div>
    </div>
    <div className="grid metrics dashboard-finance-metrics">
      <Metric label="Amount financed" value={money(financed)} color="gold" />
      <Metric label="Amounts received" value={money(received)} color="green" />
      <Metric label="Outstanding" value={money(outstanding)} color="red" />
      {showPnl && <Metric label="Profit / loss" value={`${money(profit)} / ${money(loss)}`} color={loss ? "red" : "green"} />}
    </div>
    <div className="dashboard-section-summary"><span className="dashboard-section-summary-dot" />{loans.length ? `${loans.length} active ${kind} account${loans.length === 1 ? "" : "s"} ready for collection` : `No active ${kind} accounts yet`}</div>
    <FinanceInsightsBrief kind={kind} loans={loans} isOwner={canReorder || showPnl} onViewCustomers={onToggleCustomers} />
    <button
      type="button"
      id={toggleId}
      className="dashboard-customers-toggle"
      aria-expanded={customersOpen}
      aria-controls={panelId}
      onClick={onToggleCustomers}
    >
      <span>{customerLabel || "Active Customers"} ({loans.length})</span>
      <span className="dashboard-customers-chevron" aria-hidden="true">{customersOpen ? "▲" : "▼"}</span>
    </button>
    <div
      id={panelId}
      className={`dashboard-customers-panel${customersOpen ? " open" : ""}`}
      role="region"
      aria-labelledby={toggleId}
      hidden={!customersOpen}
    >
    {canReorder && rows.length > 1 && <p className="small dashboard-reorder-hint">Drag the handle to save your {kind} collection order. It is restored after refresh and sign-in.</p>}
    {rows.length ? <div className={`table dashboard-finance-table${canReorder ? " can-reorder" : ""}`}>
      <table>
        <thead>
          <tr>
            {canReorder && <th>Order</th>}
            <th>Customer</th>
            <th>Financed</th>
            <th>Balance</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((loan, index) => <tr
            key={loan.id}
            data-account-id={loan.id}
            className={draggedId === loan.id ? "route-row-dragging" : ""}
            draggable={canReorder}
            aria-grabbed={canReorder ? draggedId === loan.id : undefined}
            onDragStart={event => beginDrag(event, loan.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={event => canReorder && event.preventDefault()}
            onDrop={event => {
              if (!canReorder) return;
              event.preventDefault();
              onReorder?.(loan.id);
            }}
          >
            {canReorder && <DashboardDragHandle
              index={index + 1}
              customerName={loan.customerName}
              loanId={loan.id}
              startTouchDrag={startTouchDrag}
              moveTouchDrag={moveTouchDrag}
              finishTouchDrag={finishTouchDrag}
              cancelTouchDrag={cancelTouchDrag}
            />}
            <td><strong>{loan.customerName}</strong><br /><a className="small phone-link" href={`tel:${loan.phone}`}>{loan.phone}</a></td>
            <td data-label="Financed">{money(investedAmount(loan))}</td>
            <td className="red" data-label="Balance">{money(loanBalance(loan))}</td>
            <td><Button onClick={() => onView(loan)}>View</Button></td>
          </tr>)}
        </tbody>
      </table>
    </div> : <p className="small spacer dashboard-finance-empty">No active customers.</p>}
    </div>
  </section>;
}
