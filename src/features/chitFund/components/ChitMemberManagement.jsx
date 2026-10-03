import { useState } from "react";
import { createChitMember, enableChitMemberPortal, enrollChitMember, updateEnrolledChitMember } from "../../../lib/financeRepository";
import { enrollmentName, canEnrollMoreMembers } from "../model/chitFormat.js";
import { Button, Field } from "../../../components/ui.jsx";
import { Modal } from "./ChitUi.jsx";
import { ChitDeleteMemberControl } from "./ChitAdminControls.jsx";

export function ChitAddMemberModal({ token, scheme, nextTicket, close, done }) {
  const [f, setF] = useState({ name: "", phone: "", address: "", ticket: String(nextTicket || ""), guarantorName: "", guarantorPhone: "", guarantorAddress: "", deposit: String(scheme.security_deposit_amount || 0) });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const memberId = await createChitMember(token, { name: f.name, phone: f.phone, address: f.address });
      const enrollmentId = await enrollChitMember(token, {
        schemeId: scheme.id, memberId, ticketNumber: f.ticket, guarantorName: f.guarantorName,
        guarantorPhone: f.guarantorPhone, guarantorAddress: f.guarantorAddress, securityDeposit: f.deposit,
      });
      const pin = String(100000 + Math.floor(Math.random() * 900000));
      try { await enableChitMemberPortal(token, enrollmentId, pin); } catch { /* Member is saved even if portal setup fails; enable it from member details. */ }
      done();
    } catch (err) { setError(err.message || "Could not add member to this scheme."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Add member to {scheme.name}</h2><p className="copy">If this mobile number already belongs to a Chit member, they are enrolled in this scheme with their existing profile and can use the same portal login.</p><form onSubmit={submit}><div className="form spacer"><Field label="Member name"><input required value={f.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Mobile number"><input required value={f.phone} onChange={e => set("phone", e.target.value)} /></Field><Field className="span" label="Address"><input value={f.address} onChange={e => set("address", e.target.value)} /></Field><Field label="Ticket number"><input required type="number" min="1" value={f.ticket} onChange={e => set("ticket", e.target.value)} /></Field><Field label="Guarantor name"><input required value={f.guarantorName} onChange={e => set("guarantorName", e.target.value)} /></Field><Field label="Guarantor phone"><input required value={f.guarantorPhone} onChange={e => set("guarantorPhone", e.target.value)} /></Field><Field className="span" label="Guarantor address"><input value={f.guarantorAddress} onChange={e => set("guarantorAddress", e.target.value)} /></Field><Field label="Security deposit (₹)"><input type="number" min="0" value={f.deposit} onChange={e => set("deposit", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Add member"}</Button></div></form></Modal>;
}
function ChitEditMemberModal({ token, enrollment, close, done }) {
  const [form, setForm] = useState({
    name: enrollmentName(enrollment), phone: enrollment.chit_members?.phone || "",
    address: enrollment.chit_members?.address || "", guarantorName: enrollment.guarantor_name || "",
    guarantorPhone: enrollment.guarantor_phone || "", guarantorAddress: enrollment.guarantor_address || "",
    securityDeposit: String(enrollment.security_deposit_amount || 0),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { await updateEnrolledChitMember(token, { id: enrollment.id, ...form }); done(); }
    catch (err) { setError(err.message || "Could not update this member."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Edit Chit member</h2><form onSubmit={submit}><div className="form spacer"><Field label="Member name"><input required value={form.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Mobile number"><input required value={form.phone} onChange={e => set("phone", e.target.value)} /></Field><Field className="span" label="Address"><input value={form.address} onChange={e => set("address", e.target.value)} /></Field><Field label="Guarantor name"><input required value={form.guarantorName} onChange={e => set("guarantorName", e.target.value)} /></Field><Field label="Guarantor phone"><input required value={form.guarantorPhone} onChange={e => set("guarantorPhone", e.target.value)} /></Field><Field className="span" label="Guarantor address"><input value={form.guarantorAddress} onChange={e => set("guarantorAddress", e.target.value)} /></Field><Field label="Security deposit (₹)"><input type="number" min="0" value={form.securityDeposit} onChange={e => set("securityDeposit", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save member"}</Button></div></form></Modal>;
}
function ChitMemberActions({ token, scheme, enrollment, edit, onDeleted }) {
  return <><Button onClick={() => edit(enrollment)}>Edit</Button><ChitDeleteMemberControl token={token} scheme={scheme} enrollment={enrollment} onDeleted={onDeleted} /></>;
}
function ChitMemberManager({ token, scheme, enrollments, changed }) {
  const [open, setOpen] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [notice, setNotice] = useState("");
  return <><Button onClick={() => setOpen(true)}>Manage members</Button>{open && <Modal close={() => setOpen(false)}><div className="toolbar"><h2 className="title">Manage members</h2></div>{notice && <p className="green small">{notice}</p>}<div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Phone</th><th>Guarantor</th><th></th></tr></thead><tbody>{enrollments.map(enrollment => <tr key={enrollment.id}><td>{enrollment.ticket_number}</td><td>{enrollmentName(enrollment)}</td><td>{enrollment.chit_members?.phone || "—"}</td><td>{enrollment.guarantor_name || "—"}</td><td><ChitMemberActions token={token} scheme={scheme} enrollment={enrollment} edit={setEditMember} onDeleted={async removed => { setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await changed(); }} /></td></tr>)}</tbody></table></div>{!enrollments.length && <p className="small spacer">No members in this scheme.</p>}</Modal>}{editMember && <ChitEditMemberModal token={token} enrollment={editMember} close={() => setEditMember(null)} done={async () => { setEditMember(null); await changed(); }} />}</>;
}
export function ChitMembersToolbar({ scheme, enrollments, onAddMember, token, changed }) {
  return <div className="toolbar">
    <strong>Members</strong>
    <div className="row">
      {canEnrollMoreMembers(scheme, enrollments) && onAddMember && <Button className="primary" onClick={onAddMember}>+ Add member</Button>}
      <ChitMemberManager token={token} scheme={scheme} enrollments={enrollments} changed={changed} />
    </div>
  </div>;
}
