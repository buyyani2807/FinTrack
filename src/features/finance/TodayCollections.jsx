import { useEffect, useState } from "react";
import { Button } from "../../components/ui.jsx";
import { formatInr as money } from "../../lib/formatMoney.js";
import { byCollectionOrderThenName } from "./collectionOrder";
import { annualRate, dailyBalance, isDailyCollectionDueOn, loanBalance, monthlyBalance, today } from "./loanState.js";
import { paymentValue } from "./paymentFormat.js";

export function DashboardDragHandle({ index, customerName, loanId, startTouchDrag, moveTouchDrag, finishTouchDrag, cancelTouchDrag }) {
  return <td
    className="small route-handle dashboard-drag-handle"
    title={`Drag to reorder ${customerName}`}
    aria-label={`Drag to reorder ${customerName}`}
    onTouchStart={event => startTouchDrag?.(event, loanId)}
    onTouchMove={moveTouchDrag}
    onTouchEnd={finishTouchDrag}
    onTouchCancel={cancelTouchDrag}
  >↕ {index}</td>;
}
export function TodayCollectionRouteTable({
  rows,
  sectionKind,
  paidToday,
  canReorder,
  draggedId,
  setDraggedId,
  onReorder,
  startTouchDrag,
  moveTouchDrag,
  finishTouchDrag,
  cancelTouchDrag,
  collect,
  view,
}) {
  const monthly = sectionKind === "monthly";
  const dueLabel = monthly ? "Interest due" : "Daily due";
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
  if (!rows.length) {
    return <div className="card">No matching {monthly ? "monthly" : "daily"}-finance customers.</div>;
  }
  return <div className={`table dashboard-finance-table collection-route-table${canReorder ? " can-reorder" : ""}`}>
    <table>
      <thead>
        <tr>
          {canReorder && <th>Order</th>}
          <th>Customer</th>
          <th>{dueLabel}</th>
          <th>Balance</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((loan, index) => {
          const dueEligible = monthly || isDailyCollectionDueOn(loan);
          const paid = dueEligible && paidToday(loan);
          const due = monthly
            ? Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100)
            : (dueEligible ? loan.dailyCollection : 0);
          const balance = monthly ? monthlyBalance(loan) : dailyBalance(loan);
          const statusLabel = !dueEligible ? "Starts tomorrow" : paid ? "Collected" : "Pending";
          const showCollect = dueEligible && !paid && loan.status === "active";
          return <tr
            key={loan.id}
            data-account-id={loan.id}
            className={`${draggedId === loan.id ? "route-row-dragging" : ""}${paid ? " collection-row-collected" : ""}`}
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
            <td data-label="Customer"><strong>{loan.customerName}</strong><br /><a className="small phone-link" href={`tel:${loan.phone}`}>{loan.phone}</a></td>
            <td className={paid ? "green" : "gold"} data-label={dueLabel}>{paid ? "✓ Paid" : money(due)}</td>
            <td className="red" data-label="Balance">{money(balance)}</td>
            <td data-label="Status">{statusLabel}</td>
            <td><Button onClick={() => view(loan)}>Details</Button>{showCollect && <Button className="primary" onClick={() => collect(loan)}>Collect</Button>}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}
export function TodayCollections({
  loans,
  kind,
  back,
  collect,
  view,
  canReorder = false,
  draggedId,
  setDraggedId,
  onReorder,
  startTouchDrag,
  moveTouchDrag,
  finishTouchDrag,
  cancelTouchDrag,
}) {
  const [search, setSearch] = useState("");
  const activeLoans = loans.filter(loan => loan.status === "active" && loanBalance(loan) > 0);
  const dailyLoans = activeLoans.filter(loan => loan.kind === "daily");
  const monthlyLoans = activeLoans.filter(loan => loan.kind === "monthly");
  const paidToday = loan => loan.transactions.some(transaction => transaction.date === today());
  const dailyDueLoans = dailyLoans.filter(loan => isDailyCollectionDueOn(loan));
  const collectedToday = dailyDueLoans.filter(paidToday).length + monthlyLoans.filter(paidToday).length;
  const dueAccountCount = dailyDueLoans.length + monthlyLoans.length;
  const expectedToday = dailyDueLoans.reduce((sum, loan) => sum + loan.dailyCollection, 0) + monthlyLoans.reduce((sum, loan) => sum + Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100), 0);
  const receivedToday = activeLoans.reduce((sum, loan) => sum + loan.transactions.filter(transaction => transaction.date === today()).reduce((total, transaction) => total + paymentValue(loan, transaction), 0), 0);
  const matchesSearch = loan => `${loan.customerName} ${loan.phone} ${loan.address || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  const shownDailyLoans = dailyLoans.filter(matchesSearch).sort(byCollectionOrderThenName);
  const shownMonthlyLoans = monthlyLoans.filter(matchesSearch).sort(byCollectionOrderThenName);
  const routeTableProps = {
    paidToday,
    canReorder,
    draggedId,
    setDraggedId,
    onReorder,
    startTouchDrag,
    moveTouchDrag,
    finishTouchDrag,
    cancelTouchDrag,
    collect,
    view,
  };
  useEffect(() => {
    const sections = document.querySelectorAll(".collection-shell .collection-section");
    const unrelatedSection = kind === "daily" ? sections[1] : sections[0];
    if (unrelatedSection) unrelatedSection.hidden = true;
    return () => {
      if (unrelatedSection) unrelatedSection.hidden = false;
    };
  }, [kind]);
  return <main className="shell collection-shell"><header className="top"><div><Button onClick={back}>← Dashboard</Button><h1 className="title spacer">Today’s collections</h1><p className="copy">{today()} · Daily collection and monthly-interest accounts.</p></div></header><div className="collection-search"><input aria-label="Search customer" placeholder="Search by customer name, phone, or address" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button onClick={() => setSearch("")}>Clear</Button>}</div><div className="collection-summary"><div><span>Collected today</span><strong>{collectedToday} / {dueAccountCount}</strong></div><div><span>Received today</span><strong className="green">{money(receivedToday)}</strong></div><div><span>Daily + monthly due</span><strong className="gold">{money(expectedToday)}</strong></div></div>{canReorder && (shownDailyLoans.length > 1 || shownMonthlyLoans.length > 1) && <p className="small dashboard-reorder-hint">Drag the handle to save your {kind} collection order. It is restored after refresh and sign-in.</p>}<div className="collection-section"><h2>Daily finance <span>{shownDailyLoans.length} shown</span></h2><TodayCollectionRouteTable rows={shownDailyLoans} sectionKind="daily" {...routeTableProps} /></div><div className="collection-section"><h2>Monthly finance <span>{shownMonthlyLoans.length} shown</span></h2><p className="copy">Monthly cards show interest due on the current outstanding principal.</p><TodayCollectionRouteTable rows={shownMonthlyLoans} sectionKind="monthly" {...routeTableProps} /></div></main>;
}
