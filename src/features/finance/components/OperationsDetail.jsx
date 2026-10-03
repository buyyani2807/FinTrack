import { useState } from "react";
import { Badge, Button, ConfirmDialog, Metric, Modal, BackButton } from "../../../components/ui.jsx";
import { formatInr as money } from "../../../lib/formatMoney.js";
import { C } from "../../../styles/theme.js";
import { CreditScoreCard } from "../../creditScore/CreditScoreCard.jsx";
import { ReceiptActions } from "../../receipts/components/ReceiptActions.jsx";
import { UpcomingPaymentCard } from "../../receipts/components/UpcomingPaymentsSection.jsx";
import { buildFinanceReceipt, formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { eventTypeForFinanceLoan } from "../../receipts/io/transactionConfirmations.js";
import { buildMonthlyUpcoming } from "../../receipts/model/upcomingPayments.js";
import { AccountStatusModal, PaymentCorrectionEditor, PaymentNoteEditor } from "./AccountForms.jsx";
import { KycDetails } from "./CustomerPortalKyc.jsx";
import { accountOutcome, collectedOn, dailyBalance, dailyProgress, isDailyCollectionDueOn, loanBalance, loanPaid, loanStatus, monthlyBalance, monthlyInterestPending } from "../model/loanState.js";
import { paymentModeLabel } from "../model/paymentFormat.js";
import { investedAmount, netPosition, realizedLoss, realizedProfit } from "../model/pnl.js";
import { collectionDetailVisibility } from "../model/workspaceAccess.js";

export function AccountActionsMenu({ open, close, children }) {
  if (!open) return null;
  return <Modal close={close}>
    <h2 className="title">More actions</h2>
    <p className="copy">Portal, WhatsApp, and account lifecycle.</p>
    <div className="account-actions-menu">{children}</div>
    
  </Modal>;
}
export function ProfitLoss({ loan }) {
  const outstanding = loan.status === "bankrupt" ? 0 : loanBalance(loan);
  return <div className="card spacer"><strong>Profit &amp; loss</strong><p className="small">Live position based on collections, payout/principal and account status.</p><div className="grid metrics"><Metric label="Paid / invested" value={money(investedAmount(loan))} color="gold" /><Metric label="Total collected" value={money(loanPaid(loan))} color="green" /><Metric label="Outstanding" value={money(outstanding)} color="red" /><Metric label="Realized profit" value={money(realizedProfit(loan))} color="green" /><Metric label="Loss" value={money(realizedLoss(loan))} color={realizedLoss(loan) ? "red" : ""} /><Metric label="Net cash position" value={money(netPosition(loan))} color={netPosition(loan) < 0 ? "red" : "green"} /></div>{loan.status === "bankrupt" && <p className="notice"><strong>BANKRUPT</strong> · Capital loss {money(realizedLoss(loan))} · Recorded {loan.statusChangedAt ? new Date(loan.statusChangedAt).toLocaleDateString("en-IN") : "—"}<br /><strong>Bankruptcy reason:</strong> {loan.statusNote || "No reason recorded."}</p>}{loan.status === "closed" && <p className="notice"><strong>Closed account</strong> · {loan.statusNote || "No closure note recorded."}</p>}</div>;
}
export function OperationsDetail({ loan, relatedLoans = [], back, embedded = false, collect, edit, remove, portal, kyc, editKyc, isOwner, changeStatus, editPaymentNote, correctPayment, deletePayment, orgSettings, authToken, workspace, onLogReceipt, reminderLog = [], confirmationLog = [], onStatement, onResendConfirmation }) {
  const monthly = loan.kind === "monthly";
  const [confirmNotice, setConfirmNotice] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const eventType = eventTypeForFinanceLoan(loan);
  const confirmation = (confirmationLog || []).find(row => row.event_type === eventType && row.source_id === loan.id);
  const confirmationLabel = !confirmation ? "Not sent"
    : confirmation.status === "opened" ? (confirmation.resend_count > 0 ? `Opened · resent ${confirmation.resend_count}×` : "Opened")
    : confirmation.status === "skipped_no_phone" ? "Skipped — no phone"
    : confirmation.status === "failed" ? "Failed"
    : confirmation.status || "Pending";
  const resendConfirmation = async () => {
    if (!onResendConfirmation || confirmBusy) return;
    setConfirmBusy(true); setConfirmNotice("");
    try {
      const toast = await onResendConfirmation(loan);
      setConfirmNotice(toast || "WhatsApp confirmation opened.");
    } catch (error) {
      setConfirmNotice(error?.message || "WhatsApp confirmation could not be sent.");
    } finally {
      setConfirmBusy(false);
    }
  };
  const upcoming = monthly ? buildMonthlyUpcoming([loan])[0] : null;
  const [noteTransaction, setNoteTransaction] = useState(null);
  const [correctTransaction, setCorrectTransaction] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);
  const [confirmRemoveAccount, setConfirmRemoveAccount] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const paymentRows = [...loan.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const disabled = loan.status === "bankrupt" || loan.status === "closed";
  const { showDisbursedAmount, showCustomerStatement } = collectionDetailVisibility(isOwner);
  const runMore = action => {
    setMoreOpen(false);
    action?.();
  };
  const removeAccount = async () => {
    setDialogBusy(true); setDialogError("");
    try { await remove(loan); setConfirmRemoveAccount(false); }
    catch (error) { setDialogError(error?.message || "Could not delete this account."); }
    finally { setDialogBusy(false); }
  };
  const removePaymentRow = async () => {
    setDialogBusy(true); setDialogError("");
    try { await deletePayment(deletePaymentTarget); setDeletePaymentTarget(null); }
    catch (error) { setDialogError(error?.message || "Could not delete this payment."); }
    finally { setDialogBusy(false); }
  };
  // Inside the Users tab the customer switcher above shows the name and phone, so the name stays only as a hidden
  // section heading (the module title is the page's h1) and there is no Back.
  const NameHeading = embedded ? "h2" : "h1";
  return <>{!embedded && <BackButton onClick={back} />}<div className={`toolbar${embedded ? " finance-user-head" : ""}`}><div><NameHeading className={embedded ? "ft-sr-only" : "title"}>{loan.customerName}</NameHeading>{embedded ? <p className="copy">Address: {loan.address || "Not added"}</p> : <p className="copy"><a className="phone-link" href={`tel:${loan.phone}`}>{loan.phone}</a> · {loan.address || "Address not added"}</p>}<p className="small spacer">Collection start date: <strong>{loan.startDate}</strong> · Status: <Badge status={loanStatus(loan)} />{accountOutcome(loan) && <> · {accountOutcome(loan).label} date: <strong>{accountOutcome(loan).date || "Not recorded"}</strong>{accountOutcome(loan).days ? ` · ${accountOutcome(loan).label} in ${accountOutcome(loan).days} days` : ""}</>}{isOwner && <> · User ID: <strong>{loan.portalId || "Not enabled"}</strong></>}</p></div><div className="tabs">{showCustomerStatement && <Button onClick={() => onStatement?.(loan)}>Customer Statement</Button>}{isOwner && <><Button onClick={() => edit(loan)}>Edit account</Button><Button aria-label="More actions" onClick={() => setMoreOpen(true)}>More</Button></>}{!disabled && (() => { const dueEligible = loan.kind !== "daily" || isDailyCollectionDueOn(loan); const paid = collectedOn(loan); return <Button className="primary" disabled={!dueEligible || paid} onClick={() => dueEligible && !paid && collect(loan)}>{!dueEligible ? "Starts tomorrow" : paid ? "Collected today" : "+ Record payment"}</Button>; })()}</div></div>{isOwner && <p className="small">Account opening WhatsApp: <strong>{confirmationLabel}</strong>{confirmation?.sent_at ? ` · ${formatReceiptDate(String(confirmation.sent_at).slice(0, 10))}` : ""}</p>}{confirmNotice && <p className="notice">{confirmNotice}</p>}{isOwner && <KycDetails loan={loan} kyc={kyc} edit={editKyc} />}{isOwner && <div className="grid metrics"><Metric label="User ID" value={loan.portalId || "Not enabled"} color={loan.portalId ? "gold" : ""} /></div>}{isOwner && loan.portalId && <p className="notice">Share this User ID with the customer. Use More → Reset PIN to set the PIN they will use on Customer login, then share both privately.</p>}<div className="grid metrics"><Metric label={monthly ? "Principal financed" : "Customer repays"} value={money(monthly ? loan.principal : loan.collectionAmount)} color="gold" /><Metric label={monthly ? "Principal balance" : (showDisbursedAmount ? "Paid to customer" : "Outstanding")} value={money(monthly ? monthlyBalance(loan) : (showDisbursedAmount ? loan.disbursedAmount : dailyBalance(loan)))} color="red" /><Metric label="Total received" value={money(loanPaid(loan))} color="green" />{monthly ? <Metric label="Interest pending" value={money(monthlyInterestPending(loan))} color={monthlyInterestPending(loan) ? "red" : "green"} /> : <Metric label="Daily collection" value={`${money(loan.dailyCollection)} × 100 days`} color="blue" />}</div>{isOwner && <CreditScoreCard loans={relatedLoans.length ? relatedLoans : [loan]} focusLoanId={loan.id} accountLabel={monthly ? "monthly" : "daily"} />}{loan.kind === "daily" && loanStatus(loan) === "active" && <div className="card spacer repayment-progress"><strong>Repayment progress</strong><div className="metric-value gold">{`Day ${dailyProgress(loan).completed} of 100`}</div><p className="small">Start date: {loan.startDate} · Days Completed: {dailyProgress(loan).completed} · Days Remaining: {dailyProgress(loan).remaining}</p><div className="repayment-progress-bar" style={{height:8,borderRadius:999,background:C.track,overflow:"hidden"}}><div style={{height:"100%",width:`${dailyProgress(loan).completed}%`,background:C.primary}} /></div></div>}{isOwner && <ProfitLoss loan={loan} />}{upcoming && <UpcomingPaymentCard item={upcoming} settings={orgSettings} token={authToken} reminderLog={reminderLog} onReminderSent={() => {}} />}<div className="card spacer"><strong>Payment history</strong><div className="table spacer"><table><thead><tr><th>Date</th>{monthly && <><th>Interest</th><th>Principal</th><th>Penalty</th></>}<th>Total</th><th>Mode</th><th>Reference</th><th>Notes / comments</th><th>Collected by</th><th>Receipt</th>{isOwner && <th></th>}</tr></thead><tbody>{paymentRows.map(t => <tr key={t.id}><td>{t.date}</td>{monthly && <><td>{money(t.interestAmount)}</td><td>{money(t.principalAmount)}</td><td>{money(t.penaltyAmount)}</td></>}<td className="green">{money(monthly ? (+t.interestAmount || 0) + (+t.principalAmount || 0) + (+t.penaltyAmount || 0) : t.amount)}</td><td>{paymentModeLabel(t)}</td><td>{t.ref || "—"}</td><td>{t.notes || "—"}</td><td>{t.collectorName || "Financier/Admin"}</td><td>{t.receiptNumber ? <ReceiptActions compact receipt={buildFinanceReceipt({ loan, transaction: t, settings: orgSettings, workspace })} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} /> : "—"}</td>{isOwner && <td><Button onClick={() => setNoteTransaction(t)}>Edit note</Button><Button onClick={() => setCorrectTransaction(t)}>Edit payment</Button><Button className="danger" onClick={() => { setDialogError(""); setDeletePaymentTarget(t); }}>Delete</Button></td>}</tr>)}</tbody></table></div></div>{noteTransaction && <PaymentNoteEditor transaction={noteTransaction} close={() => setNoteTransaction(null)} save={editPaymentNote} />}{correctTransaction && <PaymentCorrectionEditor loan={loan} transaction={correctTransaction} close={() => setCorrectTransaction(null)} save={correctPayment} />}{statusChange && <AccountStatusModal loan={loan} status={statusChange} close={() => setStatusChange(null)} save={changeStatus} />}{isOwner && <AccountActionsMenu open={moreOpen} close={() => setMoreOpen(false)}>
      <Button onClick={() => runMore(() => portal(loan))}>{loan.portalId ? "Reset PIN" : "Enable customer portal"}</Button>
      <Button disabled={confirmBusy} onClick={() => runMore(resendConfirmation)}>{confirmBusy ? "Opening…" : "Resend WhatsApp confirmation"}</Button>
      <Button onClick={() => runMore(() => setStatusChange(loan.status === "active" ? "closed" : "active"))}>{loan.status === "active" ? "Close account" : "Reopen account"}</Button>
      <Button className="danger" onClick={() => runMore(() => setStatusChange("bankrupt"))}>Mark bankrupt</Button>
      <Button className="danger" onClick={() => runMore(() => { setDialogError(""); setConfirmRemoveAccount(true); })}>Delete account</Button>
    </AccountActionsMenu>}{confirmRemoveAccount && <ConfirmDialog title="Delete finance account?" message={`Delete ${loan.customerName}'s finance account and all its payments? This cannot be undone.`} confirmLabel="Delete account" danger busy={dialogBusy} error={dialogError} close={() => { if (!dialogBusy) { setConfirmRemoveAccount(false); setDialogError(""); } }} onConfirm={removeAccount} />}{deletePaymentTarget && <ConfirmDialog title="Delete payment?" message="Delete this payment permanently? This cannot be undone." confirmLabel="Delete payment" danger busy={dialogBusy} error={dialogError} close={() => { if (!dialogBusy) { setDeletePaymentTarget(null); setDialogError(""); } }} onConfirm={removePaymentRow} />}</>;
}
