import { useState } from "react";
import { Select } from "../../../components/Select.jsx";
import { enableChitMemberPortal, resetChitMemberPortalPin } from "../../../lib/financeRepository";
import { buildChitReceipt } from "../../receipts/model/receiptModel.js";
import { ReceiptActions } from "../../receipts/components/ReceiptActions.jsx";
import { enrollmentPortalId } from "../model/liveBidding";
import { chitPaymentDisplayStatus, normalizeMemberPayment } from "../model/memberPayments";
import { chitTypeLabel, membershipEnrollmentId, portalMemberships } from "../model/memberPortal";
import { today, money, formatChitDate, enrollmentName, paymentStatusClass } from "../model/chitFormat.js";
import { Button, Field } from "../../../components/ui.jsx";
import { Modal } from "./ChitUi.jsx";

export function ChitReceiptCell({ source, paymentRow, memberName, memberPhone, scheme, orgSettings, workspace, token, onLogAction }) {
  const receiptNumber = paymentRow?.receipt_number || paymentRow?.receiptNumber;
  if (!receiptNumber) return <span className="small">—</span>;
  return <ReceiptActions
    compact
    receipt={buildChitReceipt({
      source,
      paymentRow,
      memberName,
      memberPhone,
      schemeName: scheme?.name || "",
      schemeDuration: scheme?.duration_months || 0,
      schemeStartDate: scheme?.start_date || "",
      settings: orgSettings,
      workspace,
    })}
    settings={orgSettings}
    token={token}
    onLogAction={onLogAction}
  />;
}
export const ChitPaymentStatus = ({ row, asOfDate = today() }) => {
  const status = chitPaymentDisplayStatus(row, asOfDate);
  return <span className={`badge ${paymentStatusClass(status)}`}>{status}</span>;
};
export const ChitMemberPaymentHistory = ({ title, rows, empty }) => {
  const payments = (rows || []).map(normalizeMemberPayment).sort((a, b) => a.month - b.month);
  return <div className="card spacer"><strong>{title}</strong><div className="table spacer chit-member-payments"><table><thead><tr><th>Month</th><th>Due date</th><th>Payment date</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Late fee</th><th>Reference</th><th>Status</th></tr></thead><tbody>{payments.map(item => <tr key={item.id}><td>Month {item.month}</td><td>{formatChitDate(item.dueDate)}</td><td>{formatChitDate(item.paidDate)}</td><td>{money(item.expected)}</td><td>{money(item.paid)}</td><td className="red">{money(item.balance)}</td><td>{item.lateFee ? money(item.lateFee) : "—"}</td><td>{item.reference || "—"}</td><td><ChitPaymentStatus row={{ ...item, amount_due: item.expected, amount_paid: item.paid, due_date: item.dueDate, status: item.storedStatus }} /></td></tr>)}</tbody></table>{!payments.length && <p className="small spacer">{empty}</p>}</div></div>;
};
export const ChitMembershipSwitcher = ({ memberships, selectedId, onSelect, disabled }) => {
  const rows = portalMemberships({ memberships });
  if (rows.length < 2) return null;
  return <div className="card spacer chit-scheme-switch"><strong>Your schemes</strong><p className="small">You are enrolled in {rows.length} schemes. Open one to see its payments and bids.</p><div className="tabs spacer">{rows.map(row => { const id = membershipEnrollmentId(row); return <Button key={id} className={`tab ${id === selectedId ? "active" : ""}`} disabled={disabled || id === selectedId} onClick={() => onSelect(id)}>{row.schemeName || "Chit scheme"}<span className="small"> · {chitTypeLabel(row.chitType || row.chit_type)} · Ticket {row.ticketNumber || row.ticket_number}</span></Button>; })}</div></div>;
};
export const ChitPortalAccess = ({ token, enrollment, onChange, liveBidding }) => {
  const [open, setOpen] = useState(false);
  const portalId = enrollmentPortalId(enrollment);
  const save = async pin => {
    if (portalId) { await resetChitMemberPortalPin(token, enrollment.id, pin); await onChange(); return ""; }
    const created = await enableChitMemberPortal(token, enrollment.id, pin);
    await onChange();
    return created;
  };
  return <><Button onClick={() => setOpen(true)}>{portalId ? "Reset PIN" : "Enable Chit portal"}</Button>{open && <ChitMemberPortalSetup enrollment={enrollment} liveBidding={liveBidding} close={() => setOpen(false)} save={save} />}</>;
};
function ChitMemberPortalSetup({ enrollment, liveBidding = false, close, save }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdPortalId, setCreatedPortalId] = useState("");
  const existingId = enrollmentPortalId(enrollment);
  const submit = async event => {
    event.preventDefault();
    if (!/^\d{6,}$/.test(pin)) return setError("Use a PIN with at least 6 digits.");
    if (pin !== confirm) return setError("The two PINs do not match.");
    setBusy(true); setError("");
    try {
      const portalId = await save(pin);
      if (portalId) { setCreatedPortalId(portalId); setPin(""); setConfirm(""); }
      else close();
    } catch (err) { setError(err.message || "Could not save the Chit customer portal PIN."); }
    finally { setBusy(false); }
  };
  const portalId = createdPortalId || existingId;
  return <Modal close={close}><h2 className="title">Chit customer portal</h2>{portalId ? <><p className="copy">Portal ID: <strong className="gold">{portalId}</strong></p><p className="notice">Give this portal ID and PIN to {enrollmentName(enrollment)} privately. They sign in with Chit customer on the FinTrack login page to view their scheme and payment history{liveBidding ? " and post their own live bids" : ""}.</p>{createdPortalId ? <div className="row spacer"><span className="small">Portal enabled successfully.</span><Button className="primary" onClick={close}>Done</Button></div> : <form onSubmit={submit}><div className="tool-stack spacer"><Field label="New Chit customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Reset PIN"}</Button></div></form>}</> : <form onSubmit={submit}><p className="copy">Enable private Chit dashboard access for {enrollmentName(enrollment)}.</p><p className="notice">Choose a unique PIN and share it privately. FinTrack will create a CF- portal ID for this member.</p><div className="tool-stack spacer"><Field label="New Chit customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Enable Chit portal"}</Button></div></form>}</Modal>;
}
export function ChitPaymentMonthPicker({ duration, value, onChange }) {
  return <Field label="Payment month"><Select value={value} onChange={event => onChange(Number(event.target.value))}>{Array.from({ length: Number(duration) }, (_, index) => index + 1).map(month => <option key={month} value={month}>Month {month}</option>)}</Select></Field>;
}
