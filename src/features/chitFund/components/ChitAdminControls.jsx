import { useState } from "react";
import { deleteChitScheme, deleteEnrolledChitMember } from "../../../lib/financeRepository";
import { chitTypeLabel } from "../model/memberPortal";
import { memberRemovalCopy, schemeRemovalCopy } from "../model/schemeAdmin";
import { schemeStatusLabel, enrollmentName } from "../model/chitFormat.js";
import { Button } from "../../../components/ui.jsx";
import { Modal } from "./ChitUi.jsx";

function ConfirmDangerModal({ title, children, confirmLabel, busy, error, onCancel, onConfirm }) {
  return <Modal close={() => !busy && onCancel()}>
    <h2 className="title">{title}</h2>
    {children}
    {error && <p className="red small">{error}</p>}
    <div className="row spacer">
      
      <Button className="danger" disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</Button>
    </div>
  </Modal>;
}
export function ChitDeletePaymentButton({ title, body, confirmLabel = "Delete payment", onConfirm }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => {
    setBusy(true); setError("");
    try { await onConfirm(); setOpen(false); }
    catch (err) { setError(err?.message || "Could not delete payment."); }
    finally { setBusy(false); }
  };
  return <>
    <Button className="danger" onClick={() => { setError(""); setOpen(true); }}>Delete</Button>
    {open && <ConfirmDangerModal title={title} confirmLabel={confirmLabel} busy={busy} error={error} onCancel={() => !busy && setOpen(false)} onConfirm={confirm}>
      <p className="copy">{body}</p>
    </ConfirmDangerModal>}
  </>;
}
export function ChitActivateSchemeModal({ scheme, memberCount, busy, error, onCancel, onConfirm }) {
  return <Modal close={() => !busy && onCancel()}>
    <h2 className="title">Activate {scheme.name}?</h2>
    <p className="copy">Activation locks the member list and starts the scheme. You need exactly {scheme.member_count} active members before continuing.</p>
    <p className="notice">Members enrolled: {memberCount} / {scheme.member_count}</p>
    {error && <p className="red small">{error}</p>}
    <div className="row spacer">
      
      <Button className="primary" disabled={busy} onClick={onConfirm}>{busy ? "Activating…" : "Activate scheme"}</Button>
    </div>
  </Modal>;
}
export function ChitDeleteMemberControl({ token, scheme, enrollment, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = memberRemovalCopy(enrollmentName(enrollment), scheme?.name);
  const confirm = async () => {
    setBusy(true); setError("");
    try {
      await deleteEnrolledChitMember(token, enrollment.id);
      setOpen(false);
      onDeleted?.(enrollment);
    } catch (err) {
      setError(err.message || "Could not delete this member.");
    } finally { setBusy(false); }
  };
  return <>
    <Button className="danger" onClick={() => { setError(""); setOpen(true); }}>Delete</Button>
    {open && <ConfirmDangerModal title={copy.title} confirmLabel={copy.confirm} busy={busy} error={error} onCancel={() => !busy && setOpen(false)} onConfirm={confirm}>
      <p className="copy">{copy.body}</p>
      <p className="notice">Member: {enrollmentName(enrollment)} · Ticket {enrollment.ticket_number}<br />Scheme: {scheme?.name} · {schemeStatusLabel(scheme?.status)}</p>
    </ConfirmDangerModal>}
  </>;
}
function ChitDeleteSchemeControl({ token, scheme, memberCount = 0, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = schemeRemovalCopy(scheme?.name, memberCount);
  const confirm = async () => {
    setBusy(true); setError("");
    try {
      await deleteChitScheme(token, scheme.id);
      setOpen(false);
      onDeleted?.(scheme);
    } catch (err) {
      setError(err.message || "Could not delete this scheme.");
    } finally { setBusy(false); }
  };
  return <>
    <Button className="danger" onClick={() => { setError(""); setOpen(true); }}>Delete scheme</Button>
    {open && <ConfirmDangerModal title={copy.title} confirmLabel={copy.confirm} busy={busy} error={error} onCancel={() => !busy && setOpen(false)} onConfirm={confirm}>
      <p className="copy">{copy.body}</p>
      <p className="notice">Scheme: {scheme?.name}<br />Type: {chitTypeLabel(scheme?.chit_type)} · Status: {schemeStatusLabel(scheme?.status)}<br />Members: {memberCount}/{scheme?.member_count}</p>
    </ConfirmDangerModal>}
  </>;
}
export function ChitSchemeHeaderActions({ token, scheme, memberCount, onAddMember, onSchemeDeleted, extra }) {
  const canAdd = onAddMember && ["draft", "active"].includes(scheme.status) && Number(memberCount) < Number(scheme.member_count || 0);
  return <div className="row">
    {extra}
    {canAdd && <Button className="primary" onClick={onAddMember}>+ Add member</Button>}
    <ChitDeleteSchemeControl token={token} scheme={scheme} memberCount={memberCount} onDeleted={onSchemeDeleted} />
  </div>;
}
