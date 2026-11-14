import { useState } from "react";
import { setChitMemberStanding } from "../../../lib/financeRepository";
import { Badge, Button, Field, Metric, Modal } from "../../../components/ui.jsx";
import { ChitBreadcrumb } from "./ChitUi.jsx";
import { CreditScoreCard } from "../../creditScore/CreditScoreCard.jsx";
import { enrollmentPortalId } from "../model/liveBidding";
import { chitPaymentAmounts, chitPaymentOutstanding } from "../model/memberPayments";
import { chitTypeLabel } from "../model/memberPortal";
import { MEMBER_STANDINGS, chitPaymentModeLabel, memberStanding, memberStandingAction, memberStandingError } from "../model/chitLabels.js";
import { money, formatChitDate, enrollmentName, today } from "../model/chitFormat.js";
import { ChitDeletePaymentButton, ChitDeleteMemberControl } from "./ChitAdminControls.jsx";
import { ChitPaymentStatus, ChitPortalAccess, ChitReceiptCell } from "./ChitMemberParts.jsx";

const RECEIPT_SOURCE = { auction: "chit_auction", fixed: "chit_fixed", fixed_predefined_bid: "chit_predefined" };

export function ChitStandingTag({ enrollment }) {
  const standing = memberStanding(enrollment);
  if (standing === "regular") return null;
  const meta = MEMBER_STANDINGS[standing];
  return <> <Badge status={meta.label} tone={meta.tone} /></>;
}

function MemberStandingModal({ token, enrollment, standing, close, done }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const copy = memberStandingAction(standing);
  const submit = async () => {
    const message = memberStandingError(standing, note);
    if (message) return setError(message);
    setBusy(true); setError("");
    try { await setChitMemberStanding(token, enrollment.id, standing, note); await done(); close(); }
    catch (err) { setError(err?.message || "Could not update the member's standing."); }
    finally { setBusy(false); }
  };
  return <Modal close={() => !busy && close()}>
    <h2 className="title">{copy.title}</h2>
    <p className="copy">{enrollmentName(enrollment)} · Ticket {enrollment.ticket_number} · {copy.description}</p>
    {copy.noteLabel && <Field className="spacer" label={copy.noteLabel}><textarea rows={4} value={note} onChange={event => setNote(event.target.value)} /></Field>}
    {error && <p className="red small">{error}</p>}
    <div className="row spacer"><Button className={standing === "regular" ? "primary" : "danger primary"} disabled={busy} onClick={submit}>{busy ? "Saving…" : copy.title}</Button></div>
  </Modal>;
}

// The same member page for every type. `lift` is the member's stored lift, or null:
// { month, date, amount, details: [[label, value, color]] } where details are the type's own figures.
// `typeMetrics` are type-specific figures shown after the shared ones (e.g. Fixed monthly payment, Predefined EMI).
function ChitLiftDetails({ lift }) {
  if (!lift) return <p className="notice spacer">This member has not lifted in this scheme yet.</p>;
  return <div className="card spacer"><strong>Lift details</strong><div className="grid metrics spacer">
    <Metric label="Lift month" value={`Month ${lift.month}`} color="blue" />
    <Metric label="Lift date" value={formatChitDate(lift.date)} />
    <Metric label="Lift amount" value={money(lift.amount)} color="green" />
    {(lift.details || []).map(([label, value, color]) => <Metric key={label} label={label} value={value} color={color} />)}
  </div></div>;
}

export function ChitMemberPage({
  token, scheme, enrollment, payments = [], lift = null, typeMetrics = [], extraActions = null, notice = "",
  back, toSchemes, recordPayment, deletePayment, onPortalChange, onDeleted, onStandingChange, onStatement,
  orgSettings = {}, workspace = {}, onLogReceipt, liveBidding = false,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [standingChange, setStandingChange] = useState(null);
  const isOwner = workspace?.role === "owner";
  const portalId = enrollmentPortalId(enrollment);
  const standing = memberStanding(enrollment);
  const standingMeta = MEMBER_STANDINGS[standing];
  const chitType = scheme.chit_type || "auction";
  const member = enrollment.chit_members || {};
  const rows = [...payments].sort((a, b) => Number(a.payment_month || a.cycle_number || 0) - Number(b.payment_month || b.cycle_number || 0));
  const paid = rows.reduce((sum, row) => sum + chitPaymentAmounts(row).paid, 0);
  const nextOpen = rows.find(row => chitPaymentAmounts(row).balance > 0 && row.status !== "waived");
  return <main className="shell chit-member-page">
    <ChitBreadcrumb onBack={back} items={[{ label: "Chit Fund", onClick: toSchemes || back }, { label: scheme.name, onClick: back }, { label: enrollmentName(enrollment) }]} />
    <div className="toolbar chit-scheme-head">
      <div>
        <p className="page-company-name">{workspace?.businessName || "My Finance Business"}</p>
        <h1 className="title">{enrollmentName(enrollment)}</h1>
        <p className="copy">{member.phone ? <a className="phone-link" href={`tel:${member.phone}`}>{member.phone}</a> : "Phone not added"} · {member.address || "Address not added"}</p>
        <p className="small spacer">{scheme.name} · {chitTypeLabel(chitType)} · Ticket <strong>{enrollment.ticket_number}</strong> · Standing: <Badge status={standingMeta.label} tone={standingMeta.tone} />{isOwner && <> · User ID: <strong>{portalId || "Not enabled"}</strong></>}</p>
      </div>
      <div className="tabs">
        <Button onClick={onStatement}>Member statement</Button>
        {isOwner && <Button aria-label="More actions" onClick={() => setMoreOpen(true)}>More</Button>}
        {recordPayment && nextOpen && <Button className="primary" onClick={() => recordPayment(nextOpen)}>Record payment</Button>}
      </div>
    </div>
    {notice && <p className="notice">{notice}</p>}
    {standing !== "regular" && <p className="notice"><strong>{standingMeta.label.toUpperCase()}</strong> · Recorded {enrollment.standing_changed_at ? formatChitDate(String(enrollment.standing_changed_at).slice(0, 10)) : "—"}<br /><strong>Reason:</strong> {enrollment.standing_note || "No reason recorded."}</p>}
    <div className="grid metrics">
      <Metric label="Lift month" value={lift ? `Month ${lift.month}` : "Not lifted"} color="blue" />
      <Metric label="Lift amount" value={lift ? money(lift.amount) : "—"} color="gold" />
      {typeMetrics.map(([label, value, color]) => <Metric key={label} label={label} value={value} color={color} />)}
      <Metric label="Total paid" value={money(paid)} color="green" />
      <Metric label="Outstanding (past due)" value={money(chitPaymentOutstanding(rows, today()))} color="red" />
    </div>
    {isOwner && <CreditScoreCard chitPayments={rows} accountLabel="chit" />}
    {isOwner && portalId && <p className="notice">Share this User ID with the member. Use More → Reset PIN to set the PIN they will use on Chit customer login, then share both privately.</p>}
    <ChitLiftDetails lift={lift} />
    <div className="card spacer"><strong>Payment history</strong><div className="table spacer chit-member-payments"><table><thead><tr><th>Month</th><th>Due date</th><th>Paid on</th><th className="num">Expected</th><th className="num">Paid</th><th className="num">Balance</th><th>Mode</th><th>Reference</th><th>Status</th><th>Receipt</th><th></th></tr></thead><tbody>
      {rows.map(row => { const amounts = chitPaymentAmounts(row); return <tr key={row.id}>
        <td>Month {row.payment_month || row.cycle_number || "—"}</td>
        <td>{formatChitDate(row.due_date)}</td>
        <td>{formatChitDate(row.paid_date)}</td>
        <td className="num">{money(amounts.expected)}</td>
        <td className="num">{money(amounts.paid)}</td>
        <td className={`num${amounts.balance > 0 ? " red" : ""}`}>{money(amounts.balance)}</td>
        <td>{row.payment_mode && amounts.paid > 0 ? chitPaymentModeLabel(row.payment_mode) : "—"}</td>
        <td>{row.payment_reference || "—"}</td>
        <td><ChitPaymentStatus row={row} /></td>
        <td><ChitReceiptCell source={RECEIPT_SOURCE[chitType] || "chit_auction"} paymentRow={row} memberName={enrollmentName(enrollment)} memberPhone={member.phone || ""} scheme={scheme} orgSettings={orgSettings} workspace={workspace} token={token} onLogAction={onLogReceipt} /></td>
        <td className="chit-row-actions">{recordPayment && <Button onClick={() => recordPayment(row)}>{amounts.paid > 0 ? "Edit payment" : "Record payment"}</Button>}{deletePayment && amounts.paid > 0 && <ChitDeletePaymentButton allowed={isOwner} memberName={enrollmentName(enrollment)} schemeName={scheme.name} amount={money(amounts.paid)} paidDate={formatChitDate(row.paid_date)} mode={row.payment_mode} reference={row.payment_reference} onConfirm={reason => deletePayment(row.id, reason)} />}</td>
      </tr>; })}
    </tbody></table>{!rows.length && <p className="small spacer">{chitType === "auction" ? "Installments appear after a monthly bid is recorded." : "Payment rows appear after this scheme is activated."}</p>}</div></div>
    <div className="card spacer"><strong>Member details</strong><div className="grid metrics spacer">
      <Metric label="Address" value={member.address || "Not added"} />
      <Metric label="Guarantor" value={enrollment.guarantor_name ? `${enrollment.guarantor_name}${enrollment.guarantor_phone ? ` · ${enrollment.guarantor_phone}` : ""}` : "—"} />
      <Metric label="Security deposit" value={money(enrollment.security_deposit_amount || 0)} />
    </div></div>
    {moreOpen && <Modal close={() => setMoreOpen(false)}>
      <h2 className="title">More actions</h2>
      <p className="copy">Portal, WhatsApp, and member standing.</p>
      <div className="account-actions-menu">
        <ChitPortalAccess token={token} enrollment={enrollment} liveBidding={liveBidding} onChange={onPortalChange} />
        {extraActions}
        {standing !== "defaulter" && <Button className="danger" onClick={() => { setMoreOpen(false); setStandingChange("defaulter"); }}>Mark defaulter</Button>}
        {standing !== "bankrupt" && <Button className="danger" onClick={() => { setMoreOpen(false); setStandingChange("bankrupt"); }}>Mark bankrupt</Button>}
        {standing !== "regular" && <Button onClick={() => { setMoreOpen(false); setStandingChange("regular"); }}>Mark regular</Button>}
        <ChitDeleteMemberControl token={token} scheme={scheme} enrollment={enrollment} onDeleted={onDeleted} />
      </div>
    </Modal>}
    {standingChange && <MemberStandingModal token={token} enrollment={enrollment} standing={standingChange} close={() => setStandingChange(null)} done={onStandingChange || onPortalChange} />}
  </main>;
}
