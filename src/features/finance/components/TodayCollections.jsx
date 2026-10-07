import { useEffect, useState } from "react";
import { Button, BackButton } from "../../../components/ui.jsx";
import { formatInr as money } from "../../../lib/formatMoney.js";
import { buildCollectionCopilot } from "../model/collectionCopilot.js";
import { CollectionCopilotCard } from "./CollectionCopilotCard.jsx";
import { byCollectionOrderThenName } from "../model/collectionOrder";
import { dailyBalance, isDailyCollectionDueOn, loanBalance, monthlyBalance, monthlyCollectionDue, today } from "../model/loanState.js";
import { paymentValue } from "../model/paymentFormat.js";

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
          const monthlyDue = monthly ? monthlyCollectionDue(loan, today()) : null;
          const dueEligible = monthly ? monthlyDue.pending || monthlyDue.settled : isDailyCollectionDueOn(loan);
          const paid = monthly ? monthlyDue.settled : dueEligible && paidToday(loan);
          const due = monthly ? monthlyDue.amount : (dueEligible ? loan.dailyCollection : 0);
          const balance = monthly ? monthlyBalance(loan) : dailyBalance(loan);
          const statusLabel = monthly
            ? (monthlyDue.pending ? "Pending" : monthlyDue.settled ? "Collected" : "Not due")
            : (!dueEligible ? "Starts tomorrow" : paid ? "Collected" : "Pending");
          const showCollect = monthly
            ? monthlyDue.pending && loan.status === "active"
            : dueEligible && !paid && loan.status === "active";
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
            <td className={paid ? "green" : monthly && !monthlyDue.pending ? "" : "gold"} data-label={dueLabel}>{paid ? "✓ Paid" : monthly && !monthlyDue.pending ? "—" : money(due)}</td>
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
  embedded = false,
  collect,
  view,
  canReorder = false,
  isOwner = true,
  businessName = "",
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
  const asOf = today();
  const dailyDueLoans = dailyLoans.filter(loan => isDailyCollectionDueOn(loan));
  const monthlyDueStates = monthlyLoans.map(loan => ({ loan, due: monthlyCollectionDue(loan, asOf) }));
  const monthlyPending = monthlyDueStates.filter(row => row.due.pending);
  const monthlySettled = monthlyDueStates.filter(row => row.due.settled);
  const collectedToday = dailyDueLoans.filter(paidToday).length + monthlySettled.length;
  const dueAccountCount = dailyDueLoans.length + monthlyPending.length + monthlySettled.length;
  const expectedToday = dailyDueLoans.reduce((sum, loan) => sum + loan.dailyCollection, 0)
    + monthlyPending.reduce((sum, row) => sum + row.due.amount, 0);
  const receivedToday = activeLoans.reduce((sum, loan) => sum + loan.transactions.filter(transaction => transaction.date === today()).reduce((total, transaction) => total + paymentValue(loan, transaction), 0), 0);
  const matchesSearch = loan => `${loan.customerName} ${loan.phone} ${loan.address || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  const shownDailyLoans = dailyLoans.filter(matchesSearch).sort(byCollectionOrderThenName);
  const shownMonthlyLoans = monthlyLoans.filter(matchesSearch).sort(byCollectionOrderThenName);
  const copilot = buildCollectionCopilot(activeLoans, { kind, asOf: today(), isOwner, businessName });
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
  // Embedded as a Daily / Monthly Finance tab, the module page supplies the frame (title, tabs); only the date line stays.
  const Wrapper = embedded ? "section" : "main";
  return <Wrapper className={embedded ? "collection-shell collection-embedded" : "shell collection-shell"}>{embedded ? <p className="copy collection-date">{today()} · Customers due today and what has been collected.</p> : <><BackButton onClick={back} /><header className="top"><div><h1 className="title">Today’s collections</h1><p className="copy">{today()} · Daily collection and monthly-interest accounts.</p></div></header></>}<div className="collection-search"><input aria-label="Search customer" placeholder="Search by customer name, phone, or address" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button onClick={() => setSearch("")}>Clear</Button>}</div><div className="collection-summary"><div><span>Collected today</span><strong>{collectedToday} / {dueAccountCount}</strong></div><div><span>Received today</span><strong className="green">{money(receivedToday)}</strong></div><div><span>Daily + monthly due</span><strong className="gold">{money(expectedToday)}</strong></div></div><CollectionCopilotCard copilot={copilot} />{canReorder && (shownDailyLoans.length > 1 || shownMonthlyLoans.length > 1) && <p className="small dashboard-reorder-hint">Drag the handle to save your {kind} collection order. It is restored after refresh and sign-in.</p>}<div className="collection-section"><h2>Daily finance <span>{shownDailyLoans.length} shown</span></h2><TodayCollectionRouteTable rows={shownDailyLoans} sectionKind="daily" {...routeTableProps} /></div><div className="collection-section"><h2>Monthly finance <span>{shownMonthlyLoans.length} shown</span></h2><p className="copy">Monthly cards show interest that is still unpaid. A month already collected stays Collected.</p><TodayCollectionRouteTable rows={shownMonthlyLoans} sectionKind="monthly" {...routeTableProps} /></div></Wrapper>;
}
