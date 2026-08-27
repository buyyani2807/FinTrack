import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  activateChitScheme,
  chitCustomerLiveState,
  chitCustomerPlaceLiveBid,
  createChitMember,
  createChitScheme,
  createFixedChitScheme,
  createPredefinedBidChitScheme,
  deleteEnrolledChitMember,
  deleteChitInstallmentPayment,
  deleteFixedChitPayment,
  deletePredefinedChitPayment,
  enableChitMemberPortal,
  endChitLiveAuction,
  enrollChitMember,
  finalizeFixedChitLift,
  finalizePredefinedChitMonth,
  loadChitDashboard,
  loadChitLiveAuction,
  loadChitSchemeDetails,
  pauseChitLiveAuction,
  recordChitMonthlyBid,
  resetChitMemberPortalPin,
  startChitLiveAuction,
  updateChitInstallmentPayment,
  updateFixedChitPayment,
  updateFixedChitScheme,
  updateEnrolledChitMember,
  updatePredefinedChitPayment,
  updatePredefinedChitScheduleMonth,
  updateChitScheme,
} from "../../lib/financeRepository";
import { LIVE_BID_MODEL, enrollmentPortalId, liveAuctionLimits, liveBidPayout, validateLiveBid, winsForEnrollment } from "./liveBidding";
import { CHIT_TYPES, validateFixedChit } from "./fixedChit";
import { validatePredefinedBidChit } from "./predefinedBidChit";

const indiaCalendarDate = date => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const today = () => indiaCalendarDate(new Date());
const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const formatChitDate = iso => {
  if (!iso) return "—";
  const [year, month, day] = String(iso).slice(0, 10).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day}-${months[Number(month) - 1]}-${year}`;
};
const formatTime = iso => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }); }
  catch { return String(iso); }
};
const schemeStatusLabel = status => status === "closed" ? "Completed" : status === "active" ? "Active" : "Draft";
const Button = ({ children, className = "", ...props }) => <button className={`btn ${className}`} {...props}>{children}</button>;
const Field = ({ label, children, className = "" }) => <div className={`field ${className}`}><label>{label}</label>{children}</div>;
const Metric = ({ label, value, color = "" }) => <div className="card"><div className="metric-label">{label}</div><div className={`metric-value ${color}`}>{value}</div></div>;
const Badge = ({ status }) => <span className={`badge ${status === "Completed" ? "completed" : status === "Draft" ? "active" : status}`}>{status}</span>;
const Modal = ({ children }) => <div className="modal-bg"><div className="modal">{children}</div></div>;
const enrollmentName = enrollment => enrollment?.chit_members?.full_name || "Member";
const latestCycle = cycles => cycles.length ? [...cycles].sort((a, b) => a.cycle_number - b.cycle_number).at(-1) : null;

function ChitSchemeForm({ title, form, setForm, busy, error, onClose, onSubmit, submitLabel }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  return <Modal><h2 className="title">{title}</h2><form onSubmit={onSubmit}><div className="form spacer"><Field label="Scheme name *"><input required value={form.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Start date *"><input required type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} /></Field><Field label="Chit value (₹) *"><input required type="number" min="1" value={form.chitValue} onChange={e => set("chitValue", e.target.value)} /></Field><Field label="Duration (months) *"><input required type="number" min="1" value={form.durationMonths} onChange={e => set("durationMonths", e.target.value)} /></Field><Field label="Member count *"><input required type="number" min="1" value={form.memberCount} onChange={e => set("memberCount", e.target.value)} /></Field><Field label="Installment amount (₹) *"><input required type="number" min="1" value={form.installmentAmount} onChange={e => set("installmentAmount", e.target.value)} /></Field><Field label="Commission (%) *"><input required type="number" min="0" max="7" step=".01" value={form.commissionPercent} onChange={e => set("commissionPercent", e.target.value)} /></Field><Field label="Min payout (%)"><input type="number" min="0" max="100" value={form.minBidPercent} onChange={e => set("minBidPercent", e.target.value)} /></Field><Field label="Max payout (%)"><input type="number" min="0" max="100" value={form.maxBidPercent} onChange={e => set("maxBidPercent", e.target.value)} /></Field><Field label="Late penalty per installment (₹)"><input type="number" min="0" value={form.latePenaltyAmount} onChange={e => set("latePenaltyAmount", e.target.value)} /></Field><Field label="Security deposit per member (₹)"><input type="number" min="0" value={form.securityDepositAmount} onChange={e => set("securityDepositAmount", e.target.value)} /></Field></div><p className="notice">Installment × member count must equal the chit value. Commission is capped at 7%. Live bidding starts after deducting the fund manager commission. Members bid above that commission, up to 30% of the chit value. The highest bid wins, and the winner receives chit value minus the winning bid.</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={onClose}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : submitLabel}</Button></div></form></Modal>;
}

function ChitTypeChooser({ close, choose }) {
  return <Modal><h2 className="title">Choose Chit type</h2><p className="copy">Each Chit type uses an independent calculation and monthly workflow.</p><div className="grid spacer"><button className="card" onClick={() => choose(CHIT_TYPES.AUCTION)}><strong>Auction Chit</strong><p className="small spacer">Existing auction, discount, dividend, and live-bidding model.</p></button><button className="card" onClick={() => choose(CHIT_TYPES.FIXED)}><strong>Fixed Chit</strong><p className="small spacer">Predetermined lift amounts that increase each month.</p></button><button className="card" onClick={() => choose(CHIT_TYPES.FIXED_PREDEFINED_BID)}><strong>Fixed Predefined Bid Chit</strong><p className="small spacer">Generated EMI, COMM, auction amount, bid amount, commission, and net-receivable schedule without live bidding.</p></button></div><div className="row spacer"><Button onClick={close}>Cancel</Button></div></Modal>;
}

function FixedChitSchemeForm({ title, form, setForm, busy, error, onClose, onSubmit, submitLabel }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const derivedInitial = Number(form.chitValue || 0) - Number(form.fixedCommissionAmount || 0);
  return <Modal><h2 className="title">{title}</h2><form onSubmit={onSubmit}><div className="form spacer"><Field label="Scheme name *"><input required value={form.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Chit type"><input value="Fixed" disabled /></Field><Field label="Start date *"><input required type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} /></Field><Field label="Chit value (₹) *"><input required type="number" min="1" value={form.chitValue} onChange={e => set("chitValue", e.target.value)} /></Field><Field label="Duration (months) *"><input required type="number" min="1" value={form.durationMonths} onChange={e => set("durationMonths", e.target.value)} /></Field><Field label="Member count *"><input required type="number" min="1" value={form.memberCount} onChange={e => set("memberCount", e.target.value)} /></Field><Field label="Base monthly contribution (₹) *"><input required type="number" min="0.01" step="0.01" value={form.installmentAmount} onChange={e => set("installmentAmount", e.target.value)} /></Field><Field label="Manager commission (₹) *"><input required type="number" min="0" step="0.01" value={form.fixedCommissionAmount} onChange={e => set("fixedCommissionAmount", e.target.value)} /></Field><Field label="Initial lift amount (₹) *"><input required type="number" min="0" step="0.01" value={form.fixedInitialLiftAmount === "" && derivedInitial >= 0 ? derivedInitial : form.fixedInitialLiftAmount} onChange={e => set("fixedInitialLiftAmount", e.target.value)} /></Field><Field label="Monthly lift increment (₹) *"><input required type="number" min="0" step="0.01" value={form.fixedMonthlyIncrement} onChange={e => set("fixedMonthlyIncrement", e.target.value)} /></Field><Field label="Post-lift monthly payment"><input disabled value={money(Number(form.installmentAmount || 0) + Number(form.fixedMonthlyIncrement || 0))} /></Field><Field label="Late penalty per payment (₹)"><input type="number" min="0" value={form.latePenaltyAmount} onChange={e => set("latePenaltyAmount", e.target.value)} /></Field><Field label="Security deposit per member (₹)"><input type="number" min="0" value={form.securityDepositAmount} onChange={e => set("securityDepositAmount", e.target.value)} /></Field></div><p className="notice">Initial lift defaults to chit value minus manager commission, but remains configurable. Each later month adds the configured increment. Post-lift monthly payment is base contribution plus that increment.</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={onClose}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : submitLabel}</Button></div></form></Modal>;
}

function PredefinedBidSchemeForm({ form, setForm, busy, error, onClose, onSubmit }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const managerFee = Number(form.chitValue || 0) * Number(form.predefinedManagerCommissionPercent || 0) / 100;
  return <Modal><h2 className="title">Create Fixed Predefined Bid Chit</h2><form onSubmit={onSubmit}><div className="form spacer"><Field label="Scheme name *"><input required value={form.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Chit type"><input value="Fixed Predefined Bid" disabled /></Field><Field label="Start date *"><input required type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} /></Field><Field label="Chit value (₹) *"><input required type="number" min="1" value={form.chitValue} onChange={e => set("chitValue", e.target.value)} /></Field><Field label="Duration (months) *"><input required type="number" min="1" value={form.durationMonths} onChange={e => set("durationMonths", e.target.value)} /></Field><Field label="Member count *"><input required type="number" min="1" value={form.memberCount} onChange={e => set("memberCount", e.target.value)} /></Field><Field label="Starting EMI (₹) *"><input required type="number" min="0" value={form.predefinedStartingEmi} onChange={e => set("predefinedStartingEmi", e.target.value)} /></Field><Field label="EMI increment (₹) *"><input required type="number" min="0" value={form.predefinedEmiIncrement} onChange={e => set("predefinedEmiIncrement", e.target.value)} /></Field><Field label="Starting COMM (₹) *"><input required type="number" min="0" value={form.predefinedStartingComm} onChange={e => set("predefinedStartingComm", e.target.value)} /></Field><Field label="COMM decrement (₹) *"><input required type="number" min="0" value={form.predefinedCommDecrement} onChange={e => set("predefinedCommDecrement", e.target.value)} /></Field><Field label="Starting auction amount (₹) *"><input required type="number" min="0" value={form.predefinedStartingAuctionAmount} onChange={e => set("predefinedStartingAuctionAmount", e.target.value)} /></Field><Field label="Auction decrement (₹) *"><input required type="number" min="0" value={form.predefinedAuctionDecrement} onChange={e => set("predefinedAuctionDecrement", e.target.value)} /></Field><Field label="Starting bid amount (₹) *"><input required type="number" min="0" value={form.predefinedStartingBidAmount} onChange={e => set("predefinedStartingBidAmount", e.target.value)} /></Field><Field label="Bid increment (₹) *"><input required type="number" min="0" value={form.predefinedBidIncrement} onChange={e => set("predefinedBidIncrement", e.target.value)} /></Field><Field label="Manager commission (%) *"><input required type="number" min="0" max="100" step=".01" value={form.predefinedManagerCommissionPercent} onChange={e => set("predefinedManagerCommissionPercent", e.target.value)} /></Field><Field label="Calculated manager fee"><input disabled value={money(managerFee)} /></Field><Field label="Late penalty (₹)"><input type="number" min="0" value={form.latePenaltyAmount} onChange={e => set("latePenaltyAmount", e.target.value)} /></Field><Field label="Security deposit (₹)"><input type="number" min="0" value={form.securityDepositAmount} onChange={e => set("securityDepositAmount", e.target.value)} /></Field></div><p className="notice">FinTrack generates every month from these values. Net receivable is always calculated as bid amount minus manager commission and cannot be entered manually. Pending months can be edited before finalization.</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={onClose}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Create draft"}</Button></div></form></Modal>;
}

function ChitAddMemberModal({ token, scheme, nextTicket, close, done }) {
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
  return <Modal><h2 className="title">Add member to {scheme.name}</h2><p className="copy">This member will be stored against this scheme only.</p><form onSubmit={submit}><div className="form spacer"><Field label="Member name"><input required value={f.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Mobile number"><input required value={f.phone} onChange={e => set("phone", e.target.value)} /></Field><Field className="span" label="Address"><input value={f.address} onChange={e => set("address", e.target.value)} /></Field><Field label="Ticket number"><input required type="number" min="1" value={f.ticket} onChange={e => set("ticket", e.target.value)} /></Field><Field label="Guarantor name"><input required value={f.guarantorName} onChange={e => set("guarantorName", e.target.value)} /></Field><Field label="Guarantor phone"><input required value={f.guarantorPhone} onChange={e => set("guarantorPhone", e.target.value)} /></Field><Field className="span" label="Guarantor address"><input value={f.guarantorAddress} onChange={e => set("guarantorAddress", e.target.value)} /></Field><Field label="Security deposit (₹)"><input type="number" min="0" value={f.deposit} onChange={e => set("deposit", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Add member"}</Button></div></form></Modal>;
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
  return <Modal><h2 className="title">Edit Chit member</h2><form onSubmit={submit}><div className="form spacer"><Field label="Member name"><input required value={form.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Mobile number"><input required value={form.phone} onChange={e => set("phone", e.target.value)} /></Field><Field className="span" label="Address"><input value={form.address} onChange={e => set("address", e.target.value)} /></Field><Field label="Guarantor name"><input required value={form.guarantorName} onChange={e => set("guarantorName", e.target.value)} /></Field><Field label="Guarantor phone"><input required value={form.guarantorPhone} onChange={e => set("guarantorPhone", e.target.value)} /></Field><Field className="span" label="Guarantor address"><input value={form.guarantorAddress} onChange={e => set("guarantorAddress", e.target.value)} /></Field><Field label="Security deposit (₹)"><input type="number" min="0" value={form.securityDeposit} onChange={e => set("securityDeposit", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save member"}</Button></div></form></Modal>;
}

function ChitMemberActions({ scheme, enrollment, edit, remove }) {
  const canDelete = scheme.status === "draft";
  return <><Button onClick={() => edit(enrollment)}>Edit</Button><Button className="danger" disabled={!canDelete} title={canDelete ? "Delete member" : "Members with active or historical schemes cannot be deleted"} onClick={() => canDelete && remove(enrollment)}>Delete</Button></>;
}

function ChitMemberManager({ token, scheme, enrollments, changed }) {
  const [open, setOpen] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [error, setError] = useState("");
  const remove = async enrollment => {
    if (!window.confirm(`Delete ${enrollmentName(enrollment)} from this draft scheme?`)) return;
    try { await deleteEnrolledChitMember(token, enrollment.id); await changed(); }
    catch (err) { setError(err.message || "Could not delete this member."); }
  };
  return <><Button onClick={() => setOpen(true)}>Manage members</Button>{open && <Modal><div className="toolbar"><h2 className="title">Manage members</h2><Button onClick={() => setOpen(false)}>Close</Button></div>{error && <p className="red small">{error}</p>}<div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Phone</th><th>Guarantor</th><th></th></tr></thead><tbody>{enrollments.map(enrollment => <tr key={enrollment.id}><td>{enrollment.ticket_number}</td><td>{enrollmentName(enrollment)}</td><td>{enrollment.chit_members?.phone || "—"}</td><td>{enrollment.guarantor_name || "—"}</td><td><ChitMemberActions scheme={scheme} enrollment={enrollment} edit={setEditMember} remove={remove} /></td></tr>)}</tbody></table></div>{!enrollments.length && <p className="small spacer">No members in this scheme.</p>}</Modal>}{editMember && <ChitEditMemberModal token={token} enrollment={editMember} close={() => setEditMember(null)} done={async () => { setEditMember(null); await changed(); }} />}</>;
}

function useChitMemberManagerPortal({ enabled, token, scheme, enrollments, changed }) {
  useEffect(() => {
    if (!enabled) return undefined;
    const toolbar = [...document.querySelectorAll(".shell .card .toolbar")]
      .find(node => node.querySelector("strong")?.textContent.trim() === "Members");
    if (!toolbar) return undefined;
    const host = document.createElement("div");
    toolbar.appendChild(host);
    const root = createRoot(host);
    root.render(<ChitMemberManager token={token} scheme={scheme} enrollments={enrollments} changed={changed} />);
    return () => { root.unmount(); host.remove(); };
  }, [enabled, token, scheme, enrollments, changed]);
}

function ChitBidModal({ token, scheme, enrollments, nextMonth, close, done }) {
  const [f, setF] = useState({ month: nextMonth, date: today(), winner: "", amount: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const winner = enrollments.find(item => item.id === f.winner);
    if (!winner || !(Number(f.amount) > 0)) return setError("Select a winning member and enter a valid bid amount.");
    setBusy(true); setError("");
    try {
      await recordChitMonthlyBid(token, { schemeId: scheme.id, cycleNumber: Number(f.month), cycleDate: f.date, winningEnrollmentId: winner.id, winningBidAmount: Number(f.amount), notes: f.notes });
      done();
    } catch (err) { setError(err.message || "Could not save bid."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">Record monthly bid</h2><form onSubmit={submit}><div className="form spacer"><Field label="Month number"><input type="number" min="1" required value={f.month} onChange={e => set("month", e.target.value)} /></Field><Field label="Bid date"><input type="date" required value={f.date} onChange={e => set("date", e.target.value)} /></Field><Field className="span" label="Winning member"><select required value={f.winner} onChange={e => set("winner", e.target.value)}><option value="">Select member</option>{enrollments.map(item => <option key={item.id} value={item.id}>Ticket {item.ticket_number} — {enrollmentName(item)}</option>)}</select></Field><Field className="span" label="Winning bid / payout amount (₹)"><input type="number" min="0.01" step="0.01" required value={f.amount} onChange={e => set("amount", e.target.value)} /></Field><Field className="span" label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save bid"}</Button></div></form></Modal>;
}

function ChitPaymentModal({ token, installment, close, done }) {
  const [f, setF] = useState({ amount: String(installment.amount_paid || installment.net_amount_due), mode: installment.payment_mode || "upi", date: installment.paid_date || today(), cash: String(installment.cash_amount || ""), upi: String(installment.upi_amount || ""), ref: installment.payment_reference || "", notes: installment.notes || "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const amount = Number(f.amount);
    const cash = f.mode === "cash" ? amount : f.mode === "upi" ? 0 : Number(f.cash || 0);
    const upi = f.mode === "upi" ? amount : f.mode === "cash" ? 0 : Number(f.upi || 0);
    if (!(amount > 0) || amount > Number(installment.net_amount_due)) return setError("Enter a valid amount within the installment balance.");
    if (f.mode === "cash_upi" && (cash <= 0 || upi <= 0 || Math.abs(cash + upi - amount) > 0.001)) return setError("Cash + UPI must equal the total.");
    setBusy(true); setError("");
    try {
      await updateChitInstallmentPayment(token, { id: installment.id, amountPaid: amount, paidDate: f.date, paymentMode: f.mode, paymentReference: f.ref, cashAmount: cash, upiAmount: upi, notes: f.notes });
      done();
    } catch (err) { setError(err.message || "Could not save payment."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">{installment.amount_paid ? "Edit payment" : "Record payment"}</h2><div className="form spacer"><Field label="Payment date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field><Field label="Payment mode"><select value={f.mode} onChange={e => set("mode", e.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="cash_upi">Cash + UPI</option></select></Field><Field className="span" label="Amount paid (₹)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field>{f.mode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={f.cash} onChange={e => set("cash", e.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={f.upi} onChange={e => set("upi", e.target.value)} /></Field></>}<Field label="UPI / bank reference"><input value={f.ref} onChange={e => set("ref", e.target.value)} /></Field><Field label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save payment"}</Button></div></Modal>;
}

function ChitMemberPortalSetup({ enrollment, close, save }) {
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
  return <Modal><h2 className="title">Chit customer portal</h2>{portalId ? <><p className="copy">Portal ID: <strong className="gold">{portalId}</strong></p><p className="notice">Give this portal ID and PIN to {enrollmentName(enrollment)} privately. They sign in with Chit customer on the FinTrack login page and post their own live bids.</p>{createdPortalId ? <div className="row spacer"><span className="small">Portal enabled successfully.</span><Button className="primary" onClick={close}>Done</Button></div> : <form onSubmit={submit}><div className="tool-stack spacer"><Field label="New Chit customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Reset PIN"}</Button></div></form>}</> : <form onSubmit={submit}><p className="copy">Enable private Chit dashboard access for {enrollmentName(enrollment)}.</p><p className="notice">Choose a unique PIN and share it privately. FinTrack will create a CF- portal ID for this member.</p><div className="tool-stack spacer"><Field label="New Chit customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Enable Chit portal"}</Button></div></form>}</Modal>;
}

function ChitMemberDetails({ token, scheme, enrollment, cycles, bids, back, onPortalChange }) {
  const [portalOpen, setPortalOpen] = useState(false);
  const wins = winsForEnrollment(cycles, bids, enrollment.id);
  const portalId = enrollmentPortalId(enrollment);
  const savePortal = async pin => {
    if (portalId) { await resetChitMemberPortalPin(token, enrollment.id, pin); await onPortalChange(); return ""; }
    const created = await enableChitMemberPortal(token, enrollment.id, pin);
    await onPortalChange();
    return created;
  };
  return <main className="shell"><div className="toolbar"><div><Button onClick={back}>← Members</Button><h1 className="title spacer">{enrollmentName(enrollment)}</h1><p className="copy">{scheme.name} · Ticket {enrollment.ticket_number} · User ID: {portalId || "Not enabled"}</p></div><Button onClick={() => setPortalOpen(true)}>{portalId ? "Reset PIN" : "Enable Chit portal"}</Button></div><div className="grid metrics"><Metric label="Ticket" value={enrollment.ticket_number} color="blue" /><Metric label="Phone" value={enrollment.chit_members?.phone || "—"} /><Metric label="Bid winner" value={wins.length ? "Yes" : "No"} color={wins.length ? "green" : ""} /><Metric label="User ID" value={portalId || "Not enabled"} color={portalId ? "gold" : ""} /></div>{portalId && <p className="notice">Share this User ID with the member. Use Reset PIN to set the PIN they will use on Chit customer login, then share both privately.</p>}{wins.length ? <><div className="grid metrics"><Metric label="Winning month" value={`Month ${wins[0].month}`} color="gold" /><Metric label="Winning bid amount" value={money(wins[0].bidAmount)} color="gold" /><Metric label="Bid date" value={formatChitDate(wins[0].bidDate)} /></div><div className="card spacer"><strong>Bid history</strong><div className="table spacer"><table><thead><tr><th>Month</th><th>Bid amount</th><th>Bid date</th><th>Status</th></tr></thead><tbody>{wins.map(win => <tr key={win.month}><td>Month {win.month}</td><td>{money(win.bidAmount)}</td><td>{formatChitDate(win.bidDate)}</td><td>{win.status}</td></tr>)}</tbody></table></div></div></> : <p className="notice">Bid Winner: No. This member has not won a monthly bid in this scheme.</p>}<div className="card spacer"><strong>Member details</strong><p className="small spacer">{enrollment.chit_members?.address || "Address not added"}</p><p className="small">Guarantor: {enrollment.guarantor_name} · {enrollment.guarantor_phone}</p></div>{portalOpen && <ChitMemberPortalSetup enrollment={enrollment} close={() => setPortalOpen(false)} save={savePortal} />}</main>;
}

function ChitLiveBidding({ token, scheme, data, onFinalized }) {
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const refresh = () => loadChitLiveAuction(token, scheme.id).then(payload => { setLive(payload); setError(""); }).catch(err => setError(err.message || "Could not load live bidding."));
  useEffect(() => {
    let ignore = false;
    loadChitLiveAuction(token, scheme.id).then(payload => { if (!ignore) { setLive(payload); setError(""); } }).catch(err => { if (!ignore) setError(err.message || "Could not load live bidding."); });
    return () => { ignore = true; };
  }, [scheme.id, token]);
  useEffect(() => {
    if (!live?.auction || !["open", "paused"].includes(live.auction.status)) return undefined;
    const timer = setInterval(() => {
      loadChitLiveAuction(token, scheme.id).then(payload => { setLive(payload); setError(""); }).catch(err => setError(err.message || "Could not load live bidding."));
    }, 2000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- live.auction identity is represented by id and status
  }, [live?.auction?.id, live?.auction?.status, scheme.id, token]);
  const auction = live?.auction;
  const eligible = (live?.members || []).filter(member => member.eligible);
  const leading = live?.leading_bid;
  const latest = live?.latest_bid;
  const leadingMember = (live?.members || []).find(member => member.enrollment_id === leading?.enrollment_id);
  const latestMember = (live?.members || []).find(member => member.enrollment_id === latest?.enrollment_id);
  const limits = liveAuctionLimits({
    chitValue: scheme.chit_value,
    commissionPercent: scheme.commission_percent,
    commissionAmount: live?.commission_amount ?? live?.scheme?.commission_amount,
    liveMaxBidAmount: live?.live_max_bid_amount ?? live?.scheme?.live_max_bid_amount,
  });
  const winnerPayout = leading ? liveBidPayout({ chitValue: scheme.chit_value, bidAmount: leading.bid_amount }) : null;
  const run = async action => {
    if (busy) return false;
    setBusy(true); setError("");
    try {
      const next = await action();
      if (next) setLive(next);
      else await refresh();
      return true;
    } catch (err) { setError(err.message || "Live bidding request failed."); return false; }
    finally { setBusy(false); }
  };
  const start = () => run(() => startChitLiveAuction(token, scheme.id, live?.next_cycle_number, today()));
  const stop = () => run(() => pauseChitLiveAuction(token, scheme.id));
  const endAuction = () => run(async () => {
    const result = await endChitLiveAuction(token, auction.id);
    setConfirmEnd(false);
    await onFinalized();
    return result;
  });
  return <>
    {scheme.status !== "active" && <p className="notice">Live bidding is available after the scheme is activated.</p>}
    <p className="copy">Start live bidding on the auction date (for example the 25th of each month). First deduct the fund manager commission ({scheme.commission_percent}% = {money(limits.commission)}). Members then bid <strong>above {money(limits.commission)}</strong>, up to <strong>30% of the chit value ({money(limits.maxBid)})</strong>. Highest bid wins. The winner receives chit value minus that bid.</p>
    {error && <p className="red small">{error}</p>}
    <div className="grid metrics">
      <Metric label="Scheme" value={scheme.name} />
      <Metric label="Chit value" value={money(scheme.chit_value)} color="gold" />
      <Metric label="Manager commission" value={money(limits.commission)} />
      <Metric label="Bidding starts above" value={money(limits.commission)} color="blue" />
      <Metric label="Max bid (30%)" value={money(limits.maxBid)} />
      <Metric label="Current month" value={auction ? `Month ${auction.cycle_number}` : `Month ${live?.next_cycle_number || data.cycles.length + 1}`} color="blue" />
      <Metric label="Total members" value={`${data.enrollments.length}/${scheme.member_count}`} />
      <Metric label="Eligible members" value={eligible.length} color="green" />
      <Metric label="Leading bid (highest)" value={leading ? money(leading.bid_amount) : "—"} color="gold" />
      <Metric label="Winner receives" value={winnerPayout != null ? money(winnerPayout) : "—"} color="green" />
      <Metric label="Current bidder" value={latestMember?.full_name || "—"} />
      <Metric label="Current bid amount" value={latest ? money(latest.bid_amount) : "—"} />
      <Metric label="Status" value={auction ? auction.status : "Not started"} color={auction?.status === "open" ? "green" : ""} />
      <Metric label="Started" value={auction?.started_at ? formatTime(auction.started_at) : "—"} />
    </div>
    <div className="row spacer">
      {(!auction || auction.status === "paused") && scheme.status === "active" && <Button className="primary" disabled={busy} onClick={start}>{auction?.status === "paused" ? "Resume live bidding" : "Start live bidding"}</Button>}
      {auction?.status === "open" && <Button disabled={busy} onClick={stop}>Stop bidding</Button>}
      {auction && ["open", "paused"].includes(auction.status) && <Button className="danger" disabled={busy || !leading} onClick={() => setConfirmEnd(true)}>End bidding</Button>}
    </div>
    {LIVE_BID_MODEL === "highest_bid_wins" && leadingMember && <p className="notice">Leading: Ticket {leadingMember.ticket_number} · {leadingMember.full_name} · {money(leading.bid_amount)}</p>}
    {auction?.status === "open" && <p className="notice">Waiting for members to post bids from Chit customer login. You monitor here and end bidding when ready. The highest bid is recorded as that month’s winner.</p>}
    <div className="grid two spacer">
      <div className="card"><strong>Participants</strong><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Status</th><th>Portal</th></tr></thead><tbody>{(live?.members || []).map(member => { const enrolled = data.enrollments.find(item => item.id === member.enrollment_id); return <tr key={member.enrollment_id}><td>{member.ticket_number}</td><td>{member.full_name}</td><td>{member.status === "eligible" ? "Eligible" : member.status === "already_won" ? "Already won" : member.status}</td><td>{enrollmentPortalId(enrolled) || "Not enabled"}</td></tr>; })}</tbody></table>{!(live?.members || []).length && <p className="small">No members in this scheme.</p>}</div></div>
      <div className="card"><strong>Bid history</strong><div className="table spacer"><table><thead><tr><th>Time</th><th>Member</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(live?.bids || []).map(bid => <tr key={bid.id}><td>{formatTime(bid.submitted_at)}</td><td>Ticket {bid.ticket_number} · {bid.member_name}</td><td>{money(bid.bid_amount)}</td><td>{bid.status === "winner" ? "Winner" : bid.status === "not_selected" ? "Not selected" : "Valid"}</td></tr>)}</tbody></table>{!(live?.bids || []).length && <p className="small">No live bids yet.</p>}</div></div>
    </div>
    {confirmEnd && <Modal><h2 className="title">End live bidding?</h2><p className="copy">This will finalize Month {auction.cycle_number} using the highest bid, then create the monthly bid, dividend, and installment records. Previous months will not change.</p><div className="notice">Winning member: Ticket {leadingMember?.ticket_number} · {leadingMember?.full_name}<br />Winning bid: {money(leading?.bid_amount)}<br />Winner receives: {money(winnerPayout)} (chit value − bid)<br />Manager commission: {money(limits.commission)}</div><div className="row spacer"><Button onClick={() => setConfirmEnd(false)}>Cancel</Button><Button className="primary" disabled={busy} onClick={endAuction}>{busy ? "Finalizing…" : "Confirm and finalize"}</Button></div></Modal>}
  </>;
}

function FixedChitLiftModal({ token, scheme, lift, enrollments, usedEnrollmentIds, close, done }) {
  const [enrollmentId, setEnrollmentId] = useState("");
  const [liftDate, setLiftDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = enrollments.filter(item => item.status === "active" && !usedEnrollmentIds.has(item.id));
  const submit = async event => {
    event.preventDefault();
    if (!enrollmentId) return setError("Select a member.");
    setBusy(true); setError("");
    try {
      await finalizeFixedChitLift(token, { schemeId: scheme.id, monthNumber: lift.month_number, enrollmentId, liftDate });
      done();
    } catch (err) { setError(err.message || "Could not finalize this Fixed Chit lift."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">Lift Chit — Month {lift.month_number}</h2><div className="grid metrics"><Metric label="Lift amount" value={money(lift.lift_amount)} color="gold" /><Metric label="Manager commission" value={money(lift.manager_commission)} /><Metric label="Monthly payment" value={money(lift.monthly_payment)} /><Metric label="Remaining months" value={Number(scheme.duration_months) - Number(lift.month_number)} /></div><form onSubmit={submit}><div className="form spacer"><Field className="span" label="Member"><select required value={enrollmentId} onChange={event => setEnrollmentId(event.target.value)}><option value="">Select member</option>{eligible.map(item => <option key={item.id} value={item.id}>Ticket {item.ticket_number} — {enrollmentName(item)}</option>)}</select></Field><Field label="Lift date"><input required type="date" value={liftDate} onChange={event => setLiftDate(event.target.value)} /></Field></div>{!eligible.length && <p className="notice">No eligible member remains for this lift.</p>}{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" type="submit" disabled={busy || !eligible.length}>{busy ? "Finalizing…" : "Finalize lift"}</Button></div></form></Modal>;
}

function FixedChitPaymentModal({ token, payment, close, done }) {
  const [amount, setAmount] = useState(String(payment.amount_paid || payment.amount_due));
  const [date, setDate] = useState(payment.paid_date || today());
  const [mode, setMode] = useState(payment.payment_mode || "upi");
  const [reference, setReference] = useState(payment.payment_reference || "");
  const [notes, setNotes] = useState(payment.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountDue = roundMoney(payment.amount_due);
  const submit = async event => {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0) || value > Number(payment.amount_due)) return setError("Enter an amount within the scheduled payment.");
    setBusy(true); setError("");
    try {
      await updateFixedChitPayment(token, { id: payment.id, amountPaid: value, paidDate: date, paymentMode: mode, paymentReference: reference, notes });
      done();
    } catch (err) { setError(err.message || "Could not save this Fixed Chit payment."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">{payment.amount_paid ? "Edit" : "Record"} Fixed Chit payment</h2><form onSubmit={submit}><div className="form spacer"><Field label="Payment month"><input disabled value={`Month ${payment.payment_month}`} /></Field><Field label="Amount due"><input disabled value={money(amountDue)} /></Field><Field label="Amount paid (₹)"><input required type="number" min="0.01" max={amountDue} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></Field><Field label="Paid date"><input required type="date" value={date} onChange={event => setDate(event.target.value)} /></Field><Field label="Payment mode"><select value={mode} onChange={event => setMode(event.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="cash_upi">Cash + UPI</option></select></Field><Field label="Reference"><input value={reference} onChange={event => setReference(event.target.value)} /></Field><Field className="span" label="Notes"><input value={notes} onChange={event => setNotes(event.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button></div></form></Modal>;
}

function ChitPaymentMonthPicker({ duration, value, onChange }) {
  return <Field label="Payment month"><select value={value} onChange={event => onChange(Number(event.target.value))}>{Array.from({ length: Number(duration) }, (_, index) => index + 1).map(month => <option key={month} value={month}>Month {month}</option>)}</select></Field>;
}

function FixedChitMemberDetails({ scheme, enrollment, lift, payments, back, recordPayment, deletePayment }) {
  const paid = payments.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);
  const due = payments.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);
  return <main className="shell"><div className="toolbar"><div><Button onClick={back}>← Members</Button><h1 className="title spacer">{enrollmentName(enrollment)}</h1><p className="copy">{scheme.name} · Ticket {enrollment.ticket_number} · Fixed Chit</p></div></div><div className="grid metrics"><Metric label="Lift month" value={lift ? `Month ${lift.month_number}` : "Not assigned"} color="blue" /><Metric label="Lift amount" value={lift ? money(lift.lift_amount) : "—"} color="gold" /><Metric label="Monthly payment" value={lift ? money(lift.monthly_payment) : "—"} /><Metric label="Remaining months" value={lift?.remaining_months ?? "—"} /><Metric label="Outstanding" value={money(Math.max(0, due - paid))} color="red" /></div>{lift && <div className="card spacer"><strong>Lift details</strong><div className="grid metrics"><Metric label="Manager commission" value={money(lift.manager_commission)} /><Metric label="Amount paid to member" value={money(lift.amount_paid_to_member)} color="green" /><Metric label="Lift date" value={formatChitDate(lift.lift_date)} /><Metric label="Total remaining payment" value={money(lift.total_remaining_payment)} /></div></div>}<div className="card spacer"><strong>Payment history</strong><div className="table spacer"><table><thead><tr><th>Month</th><th>Due date</th><th>Expected</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>{payments.map(item => <tr key={item.id}><td>Month {item.payment_month}</td><td>{formatChitDate(item.due_date)}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td>{item.status}</td><td><Button onClick={() => recordPayment(item)}>{item.amount_paid ? "Edit payment" : "Record payment"}</Button>{Number(item.amount_paid) > 0 && <Button className="danger" onClick={() => deletePayment(item.id)}>Delete</Button>}</td></tr>)}</tbody></table>{!payments.length && <p className="small spacer">{lift ? "No remaining payments for this lift." : "Assign this member to a lift month to create a payment schedule."}</p>}</div></div></main>;
}

function FixedChitSchemeDetails({ token, scheme, back }) {
  const [data, setData] = useState({ enrollments: [], fixedLifts: [], fixedPayments: [] });
  const [tab, setTab] = useState("overview");
  const [paymentMonth, setPaymentMonth] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [memberOpen, setMemberOpen] = useState(false);
  const [lift, setLift] = useState(null);
  const [payment, setPayment] = useState(null);
  const [member, setMember] = useState(null);
  const refresh = () => loadChitSchemeDetails(token, scheme.id).then(payload => { setData(payload); setBusy(false); setError(""); }).catch(err => { setError(err.message || "Could not load Fixed Chit details."); setBusy(false); });
  useEffect(() => {
    let ignore = false;
    loadChitSchemeDetails(token, scheme.id)
      .then(payload => { if (!ignore) { setData(payload); setBusy(false); setError(""); } })
      .catch(err => { if (!ignore) { setError(err.message || "Could not load Fixed Chit details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [scheme.id, token]);
  useChitMemberManagerPortal({ enabled: tab === "members" && !member, token, scheme, enrollments: data.enrollments, changed: refresh });
  const nextTicket = Math.max(0, ...data.enrollments.map(item => Number(item.ticket_number) || 0)) + 1;
  const completed = data.fixedLifts.filter(item => item.status === "completed");
  const pending = data.fixedLifts.find(item => item.status === "pending");
  const selectedPaymentMonth = paymentMonth ?? Number(pending?.month_number || scheme.duration_months);
  const visibleFixedPayments = data.fixedPayments.filter(item => Number(item.payment_month) === selectedPaymentMonth);
  const usedEnrollmentIds = new Set(completed.map(item => item.enrollment_id));
  const removePayment = async id => {
    if (!window.confirm("Delete this Fixed Chit payment?")) return;
    try { await deleteFixedChitPayment(token, id); await refresh(); }
    catch (err) { setError(err.message || "Could not delete payment."); }
  };
  if (member) {
    const memberLift = completed.find(item => item.enrollment_id === member.id);
    return <><FixedChitMemberDetails scheme={scheme} enrollment={member} lift={memberLift} payments={data.fixedPayments.filter(item => item.enrollment_id === member.id)} back={() => setMember(null)} recordPayment={setPayment} deletePayment={removePayment} />{payment && <FixedChitPaymentModal token={token} payment={payment} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} />}</>;
  }
  if (tab === "payments") {
    return <main className="shell"><div className="toolbar"><div><Button onClick={back}>← Schemes</Button><h1 className="title spacer">{scheme.name}</h1><p className="copy">Fixed Chit · {scheme.duration_months} months · {data.enrollments.length}/{scheme.member_count} members · {schemeStatusLabel(scheme.status)}</p></div></div><div className="tabs spacer">{[["overview", "Overview"], ["schedule", "Fixed Schedule"], ["members", "Members"], ["payments", "Payments"]].map(([id, label]) => <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</Button>)}</div>{error && <p className="red small">{error}</p>}{busy ? <p className="small spacer">Loading Fixed Chit…</p> : <div className="card"><div className="toolbar"><strong>Fixed Chit Payments — Month {selectedPaymentMonth}</strong><ChitPaymentMonthPicker duration={scheme.duration_months} value={selectedPaymentMonth} onChange={setPaymentMonth} /></div><div className="table spacer"><table><thead><tr><th>Member</th><th>Month</th><th>Due date</th><th>Expected</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>{visibleFixedPayments.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>Month {item.payment_month}</td><td>{formatChitDate(item.due_date)}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td>{item.status}</td><td><Button onClick={() => setPayment(item)}>{item.amount_paid ? "Edit payment" : "Record payment"}</Button>{Number(item.amount_paid) > 0 && <Button className="danger" onClick={() => removePayment(item.id)}>Delete</Button>}</td></tr>; })}</tbody></table>{!visibleFixedPayments.length && <p className="small spacer">No payments are scheduled for Month {selectedPaymentMonth}.</p>}</div></div>}{payment && <FixedChitPaymentModal token={token} payment={payment} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} />}</main>;
  }
  return <main className="shell"><div className="toolbar"><div><Button onClick={back}>← Schemes</Button><h1 className="title spacer">{scheme.name}</h1><p className="copy">Fixed Chit · {scheme.duration_months} months · {data.enrollments.length}/{scheme.member_count} members · {schemeStatusLabel(scheme.status)}</p></div>{scheme.status === "draft" && <Button onClick={() => setMemberOpen(true)}>+ Add member</Button>}</div><div className="tabs spacer">{[["overview", "Overview"], ["schedule", "Fixed Schedule"], ["members", "Members"], ["payments", "Payments"]].map(([id, label]) => <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</Button>)}</div>{error && <p className="red small">{error}</p>}{busy ? <p className="small spacer">Loading Fixed Chit…</p> : <>{tab === "overview" && <><div className="grid metrics"><Metric label="Chit type" value="Fixed" color="blue" /><Metric label="Chit value" value={money(scheme.chit_value)} color="gold" /><Metric label="Members" value={`${data.enrollments.length}/${scheme.member_count}`} /><Metric label="Monthly contribution" value={money(scheme.installment_amount)} /><Metric label="Manager commission" value={money(scheme.fixed_commission_amount)} /><Metric label="Monthly lift increment" value={money(scheme.fixed_monthly_increment)} /><Metric label="Current month" value={pending ? `Month ${pending.month_number}` : "Completed"} color="blue" /><Metric label="Remaining months" value={data.fixedLifts.filter(item => item.status === "pending").length} /></div>{pending && <div className="notice">Current lift amount: <strong>{money(pending.lift_amount)}</strong></div>}</>}{tab === "schedule" && <div className="card"><div className="toolbar"><strong>Fixed Chit Schedule</strong><span className="small">{completed.length}/{scheme.duration_months} completed</span></div><div className="table spacer"><table><thead><tr><th>Month</th><th>Lift amount</th><th>Commission</th><th>Monthly payment</th><th>Member</th><th>Status</th><th></th></tr></thead><tbody>{data.fixedLifts.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>Month {item.month_number}</td><td>{money(item.lift_amount)}</td><td>{money(item.manager_commission)}</td><td>{money(item.monthly_payment)}</td><td>{owner ? enrollmentName(owner) : "—"}</td><td>{item.status}</td><td>{item.status === "pending" && scheme.status === "active" && <Button className="primary" onClick={() => setLift(item)}>Lift Chit</Button>}</td></tr>; })}</tbody></table></div></div>}{tab === "members" && <div className="card"><div className="toolbar"><strong>Members</strong>{scheme.status === "draft" && <Button className="primary" onClick={() => setMemberOpen(true)}>+ Add member</Button>}</div><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Lift month</th><th>Lift amount</th><th>Monthly payment</th><th>Remaining</th><th>Payment status</th><th></th></tr></thead><tbody>{data.enrollments.map(item => { const memberLift = completed.find(row => row.enrollment_id === item.id); const payments = data.fixedPayments.filter(row => row.enrollment_id === item.id); const outstanding = payments.reduce((sum, row) => sum + Number(row.amount_due) - Number(row.amount_paid), 0); return <tr key={item.id}><td>{item.ticket_number}</td><td>{enrollmentName(item)}</td><td>{memberLift ? `Month ${memberLift.month_number}` : "—"}</td><td>{memberLift ? money(memberLift.lift_amount) : "—"}</td><td>{memberLift ? money(memberLift.monthly_payment) : "—"}</td><td>{memberLift?.remaining_months ?? "—"}</td><td>{memberLift ? (outstanding > 0 ? `${money(outstanding)} due` : "Paid") : "Not lifted"}</td><td><Button onClick={() => setMember(item)}>View details</Button>{!memberLift && scheme.status === "active" && pending && <Button onClick={() => setLift(pending)}>Lift Chit</Button>}</td></tr>; })}</tbody></table></div></div>}{tab === "payments" && <div className="card"><strong>Fixed Chit Payments</strong><div className="table spacer"><table><thead><tr><th>Member</th><th>Month</th><th>Due date</th><th>Expected</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>{data.fixedPayments.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>Month {item.payment_month}</td><td>{formatChitDate(item.due_date)}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td>{item.status}</td><td><Button onClick={() => setPayment(item)}>{item.amount_paid ? "Edit payment" : "Record payment"}</Button>{Number(item.amount_paid) > 0 && <Button className="danger" onClick={() => removePayment(item.id)}>Delete</Button>}</td></tr>; })}</tbody></table>{!data.fixedPayments.length && <p className="small spacer">Payment schedules are created when members lift the chit.</p>}</div></div>}</>}{memberOpen && <ChitAddMemberModal token={token} scheme={scheme} nextTicket={nextTicket} close={() => setMemberOpen(false)} done={async () => { setMemberOpen(false); await refresh(); }} />}{lift && <FixedChitLiftModal token={token} scheme={scheme} lift={lift} enrollments={data.enrollments} usedEnrollmentIds={usedEnrollmentIds} close={() => setLift(null)} done={async () => { setLift(null); await refresh(); }} />}{payment && <FixedChitPaymentModal token={token} payment={payment} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} />}</main>;
}

function PredefinedAssignModal({ token, item, enrollments, usedEnrollmentIds, close, done }) {
  const [enrollmentId, setEnrollmentId] = useState("");
  const [assignedDate, setAssignedDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = enrollments.filter(row => row.status === "active" && !usedEnrollmentIds.has(row.id));
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { await finalizePredefinedChitMonth(token, { id: item.id, enrollmentId, assignedDate }); done(); }
    catch (err) { setError(err.message || "Could not finalize this predefined month."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">Assign Member — Month {item.month_number}</h2><div className="grid metrics"><Metric label="EMI" value={money(item.emi)} /><Metric label="Bid amount" value={money(item.bid_amount)} color="gold" /><Metric label="Manager commission" value={money(item.manager_commission)} /><Metric label="Net receivable" value={money(item.net_receivable)} color="green" /></div><form onSubmit={submit}><div className="form spacer"><Field className="span" label="Member"><select required value={enrollmentId} onChange={event => setEnrollmentId(event.target.value)}><option value="">Select member</option>{eligible.map(row => <option key={row.id} value={row.id}>Ticket {row.ticket_number} — {enrollmentName(row)}</option>)}</select></Field><Field label="Finalized date"><input required type="date" value={assignedDate} onChange={event => setAssignedDate(event.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy || !eligible.length} type="submit">{busy ? "Finalizing…" : "Finalize assignment"}</Button></div></form></Modal>;
}

function PredefinedScheduleEditModal({ token, item, close, done }) {
  const [form, setForm] = useState({ emi: item.emi, commAmount: item.comm_amount, auctionAmount: item.auction_amount, bidAmount: item.bid_amount, managerCommissionPercent: item.manager_commission_percent });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { await updatePredefinedChitScheduleMonth(token, { id: item.id, ...form }); done(); }
    catch (err) { setError(err.message || "Could not update this schedule month."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">Edit Month {item.month_number}</h2><form onSubmit={submit}><div className="form spacer"><Field label="EMI (₹)"><input required type="number" min="0" value={form.emi} onChange={e => set("emi", e.target.value)} /></Field><Field label="COMM (₹)"><input required type="number" min="0" value={form.commAmount} onChange={e => set("commAmount", e.target.value)} /></Field><Field label="Auction amount (₹)"><input required type="number" min="0" value={form.auctionAmount} onChange={e => set("auctionAmount", e.target.value)} /></Field><Field label="Bid amount (₹)"><input required type="number" min="0" value={form.bidAmount} onChange={e => set("bidAmount", e.target.value)} /></Field><Field label="Manager commission (%)"><input required type="number" min="0" max="100" step=".01" value={form.managerCommissionPercent} onChange={e => set("managerCommissionPercent", e.target.value)} /></Field></div><p className="notice">Manager commission and net receivable are recalculated by the backend. Finalized months cannot be edited.</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save month"}</Button></div></form></Modal>;
}

function PredefinedPaymentModal({ token, payment, close, done }) {
  const [form, setForm] = useState({ amountPaid: payment.amount_paid || payment.amount_due, paidDate: payment.paid_date || today(), paymentMode: payment.payment_mode || "upi", paymentReference: payment.payment_reference || "", notes: payment.notes || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountDue = roundMoney(payment.amount_due);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { await updatePredefinedChitPayment(token, { id: payment.id, ...form }); done(); }
    catch (err) { setError(err.message || "Could not save this payment."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">{payment.amount_paid ? "Edit" : "Record"} EMI payment</h2><form onSubmit={submit}><div className="form spacer"><Field label="Expected EMI"><input disabled value={money(amountDue)} /></Field><Field label="Amount paid (₹)"><input required type="number" min="0.01" max={amountDue} step="0.01" value={form.amountPaid} onChange={e => set("amountPaid", e.target.value)} /></Field><Field label="Payment date"><input required type="date" value={form.paidDate} onChange={e => set("paidDate", e.target.value)} /></Field><Field label="Payment mode"><select value={form.paymentMode} onChange={e => set("paymentMode", e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="cash_upi">Cash + UPI</option></select></Field><Field label="Reference"><input value={form.paymentReference} onChange={e => set("paymentReference", e.target.value)} /></Field><Field label="Notes"><input value={form.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save payment"}</Button></div></form></Modal>;
}

function PredefinedBidSchemeDetails({ token, scheme, back }) {
  const [data, setData] = useState({ enrollments: [], predefinedSchedule: [], predefinedPayments: [] });
  const [tab, setTab] = useState("overview");
  const [paymentMonth, setPaymentMonth] = useState(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [assignItem, setAssignItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const refresh = () => loadChitSchemeDetails(token, scheme.id).then(payload => { setData(payload); setBusy(false); setError(""); }).catch(err => { setError(err.message || "Could not load predefined-bid details."); setBusy(false); });
  useEffect(() => {
    let ignore = false;
    loadChitSchemeDetails(token, scheme.id).then(payload => { if (!ignore) { setData(payload); setBusy(false); } }).catch(err => { if (!ignore) { setError(err.message || "Could not load predefined-bid details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [scheme.id, token]);
  useChitMemberManagerPortal({ enabled: tab === "members", token, scheme, enrollments: data.enrollments, changed: refresh });
  const schedule = data.predefinedSchedule || [];
  const completed = schedule.filter(item => item.status === "completed");
  const current = schedule.find(item => item.status === "pending");
  const selectedPaymentMonth = paymentMonth ?? Number(current?.month_number || scheme.duration_months);
  const visiblePredefinedPayments = data.predefinedPayments.filter(item => Number(item.payment_month) === selectedPaymentMonth);
  const usedEnrollmentIds = new Set(completed.map(item => item.enrollment_id));
  const nextTicket = Math.max(0, ...data.enrollments.map(item => Number(item.ticket_number) || 0)) + 1;
  const removePayment = async id => {
    if (!window.confirm("Delete this payment?")) return;
    try { await deletePredefinedChitPayment(token, id); await refresh(); }
    catch (err) { setError(err.message || "Could not delete payment."); }
  };
  if (tab === "payments") {
    return <main className="shell"><div className="toolbar"><div><Button onClick={back}>← Schemes</Button><h1 className="title spacer">{scheme.name}</h1><p className="copy">Fixed Predefined Bid · {scheme.duration_months} months · {data.enrollments.length}/{scheme.member_count} members · {schemeStatusLabel(scheme.status)}</p></div></div><div className="tabs spacer">{[["overview", "Overview"], ["schedule", "Monthly Schedule"], ["members", "Members"], ["payments", "Payments"]].map(([id, label]) => <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</Button>)}</div>{error && <p className="red small">{error}</p>}{busy ? <p className="small spacer">Loading schedule…</p> : <div className="card"><div className="toolbar"><strong>Member EMI Payments — Month {selectedPaymentMonth}</strong><ChitPaymentMonthPicker duration={scheme.duration_months} value={selectedPaymentMonth} onChange={setPaymentMonth} /></div><div className="table spacer"><table><thead><tr><th>Member</th><th>Month</th><th>Expected EMI</th><th>Paid</th><th>Balance</th><th>Date</th><th>Mode</th><th>Status</th><th></th></tr></thead><tbody>{visiblePredefinedPayments.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>{item.payment_month}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td>{money(Number(item.amount_due) - Number(item.amount_paid))}</td><td>{formatChitDate(item.paid_date || item.due_date)}</td><td>{item.payment_mode || "—"}</td><td>{item.status}</td><td><Button onClick={() => setPayment(item)}>{item.amount_paid ? "Edit" : "Record"} Payment</Button>{Number(item.amount_paid) > 0 && <Button className="danger" onClick={() => removePayment(item.id)}>Delete</Button>}</td></tr>; })}</tbody></table>{!visiblePredefinedPayments.length && <p className="small spacer">No payments are scheduled for Month {selectedPaymentMonth}.</p>}</div></div>}{payment && <PredefinedPaymentModal token={token} payment={payment} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} />}</main>;
  }
  return <main className="shell"><div className="toolbar"><div><Button onClick={back}>← Schemes</Button><h1 className="title spacer">{scheme.name}</h1><p className="copy">Fixed Predefined Bid · {scheme.duration_months} months · {data.enrollments.length}/{scheme.member_count} members · {schemeStatusLabel(scheme.status)}</p></div>{scheme.status === "draft" && <Button onClick={() => setMemberOpen(true)}>+ Add member</Button>}</div><div className="tabs spacer">{[["overview", "Overview"], ["schedule", "Monthly Schedule"], ["members", "Members"], ["payments", "Payments"]].map(([id, label]) => <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</Button>)}</div>{error && <p className="red small">{error}</p>}{busy ? <p className="small spacer">Loading schedule…</p> : <>{tab === "overview" && <div className="grid metrics"><Metric label="Chit type" value="Fixed Predefined Bid" color="blue" /><Metric label="Chit value" value={money(scheme.chit_value)} color="gold" /><Metric label="Members" value={`${data.enrollments.length}/${scheme.member_count}`} /><Metric label="Duration" value={`${scheme.duration_months} months`} /><Metric label="Commission" value={`${scheme.predefined_manager_commission_percent}%`} /><Metric label="Current month" value={current ? `Month ${current.month_number}` : "Completed"} color="blue" /><Metric label="Current bid" value={current ? money(current.bid_amount) : "—"} color="gold" /><Metric label="Net receivable" value={current ? money(current.net_receivable) : "—"} color="green" /></div>}{tab === "schedule" && <div className="card"><div className="toolbar"><strong>Monthly Schedule</strong><span className="small">{completed.length}/{schedule.length} finalized</span></div><div className="table spacer"><table><thead><tr><th>Month</th><th>EMI</th><th>COMM</th><th>Auction Amount</th><th>Bid Amount</th><th>Manager Commission</th><th>Net Receivable</th><th>Member</th><th>Status</th><th></th></tr></thead><tbody>{schedule.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>{item.month_number}</td><td>{money(item.emi)}</td><td>{money(item.comm_amount)}</td><td>{money(item.auction_amount)}</td><td>{money(item.bid_amount)}</td><td>{money(item.manager_commission)} ({item.manager_commission_percent}%)</td><td>{money(item.net_receivable)}</td><td>{owner ? `Ticket ${owner.ticket_number} · ${enrollmentName(owner)}` : "—"}</td><td>{item.status}</td><td>{item.status === "pending" && <Button onClick={() => setEditItem(item)}>Edit</Button>}{item.status === "pending" && scheme.status === "active" && <Button className="primary" onClick={() => setAssignItem(item)}>Assign Member</Button>}</td></tr>; })}</tbody></table></div></div>}{tab === "members" && <div className="card"><div className="toolbar"><strong>Members</strong>{scheme.status === "draft" && <Button className="primary" onClick={() => setMemberOpen(true)}>+ Add member</Button>}</div><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Lift Month</th><th>EMI</th><th>Bid Amount</th><th>Net Receivable</th><th>Payment Status</th></tr></thead><tbody>{data.enrollments.map(owner => { const item = completed.find(row => row.enrollment_id === owner.id); const payments = data.predefinedPayments.filter(row => row.enrollment_id === owner.id); const balance = payments.reduce((sum, row) => sum + Number(row.amount_due) - Number(row.amount_paid), 0); return <tr key={owner.id}><td>{owner.ticket_number}</td><td>{enrollmentName(owner)}</td><td>{item ? `Month ${item.month_number}` : "—"}</td><td>{item ? money(item.emi) : "—"}</td><td>{item ? money(item.bid_amount) : "—"}</td><td>{item ? money(item.net_receivable) : "—"}</td><td>{item ? (balance > 0 ? `${money(balance)} due` : "Paid") : "Not assigned"}</td></tr>; })}</tbody></table></div></div>}{tab === "payments" && <div className="card"><strong>Member EMI Payments</strong><div className="table spacer"><table><thead><tr><th>Member</th><th>Month</th><th>Expected EMI</th><th>Paid</th><th>Balance</th><th>Date</th><th>Mode</th><th>Status</th><th></th></tr></thead><tbody>{data.predefinedPayments.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>{item.payment_month}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td>{money(Number(item.amount_due) - Number(item.amount_paid))}</td><td>{formatChitDate(item.paid_date || item.due_date)}</td><td>{item.payment_mode || "—"}</td><td>{item.status}</td><td><Button onClick={() => setPayment(item)}>{item.amount_paid ? "Edit" : "Record"} Payment</Button>{Number(item.amount_paid) > 0 && <Button className="danger" onClick={() => removePayment(item.id)}>Delete</Button>}</td></tr>; })}</tbody></table>{!data.predefinedPayments.length && <p className="small spacer">Payment schedules appear after a member is assigned to a finalized month.</p>}</div></div>}</>}{memberOpen && <ChitAddMemberModal token={token} scheme={scheme} nextTicket={nextTicket} close={() => setMemberOpen(false)} done={async () => { setMemberOpen(false); await refresh(); }} />}{assignItem && <PredefinedAssignModal token={token} item={assignItem} enrollments={data.enrollments} usedEnrollmentIds={usedEnrollmentIds} close={() => setAssignItem(null)} done={async () => { setAssignItem(null); await refresh(); }} />}{editItem && <PredefinedScheduleEditModal token={token} item={editItem} close={() => setEditItem(null)} done={async () => { setEditItem(null); await refresh(); }} />}{payment && <PredefinedPaymentModal token={token} payment={payment} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} />}</main>;
}

function AuctionChitSchemeDetails({ token, scheme, back }) {
  const [data, setData] = useState({ enrollments: [], cycles: [], bids: [], installments: [] });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [member, setMember] = useState(null);
  const [payment, setPayment] = useState(null);
  const [bidOpen, setBidOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [finalized, setFinalized] = useState(null);
  const refresh = () => loadChitSchemeDetails(token, scheme.id).then(payload => { setData(payload); setError(""); setBusy(false); }).catch(err => { setError(err.message || "Could not load scheme details."); setBusy(false); });
  useEffect(() => {
    let ignore = false;
    loadChitSchemeDetails(token, scheme.id).then(payload => { if (!ignore) { setData(payload); setError(""); setBusy(false); } }).catch(err => { if (!ignore) { setError(err.message || "Could not load scheme details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [scheme.id, token]);
  useChitMemberManagerPortal({ enabled: tab === "members" && !member, token, scheme, enrollments: data.enrollments, changed: refresh });
  const current = latestCycle(data.cycles);
  const winner = data.enrollments.find(item => item.id === current?.winning_enrollment_id);
  const eligibleForManualBid = data.enrollments.filter(item => !data.bids.some(bid => bid.enrollment_id === item.id && bid.status === "winner"));
  const nextTicket = Math.max(0, ...data.enrollments.map(item => Number(item.ticket_number) || 0)) + 1;
  const calc = current ? {
    winningBid: current.winning_bid_amount,
    discount: current.discount_amount,
    commission: current.commission_amount,
    distributable: current.distributable_amount,
    dividend: current.dividend_per_member,
  } : null;
  const remove = async id => {
    if (!window.confirm("Delete/reverse this payment?")) return;
    try { await deleteChitInstallmentPayment(token, id); await refresh(); }
    catch (err) { setError(err.message || "Could not delete payment."); }
  };
  if (member) return <ChitMemberDetails token={token} scheme={scheme} enrollment={member} cycles={data.cycles} bids={data.bids} back={() => setMember(null)} onPortalChange={async () => { const details = await loadChitSchemeDetails(token, scheme.id); setData(details); setMember(details.enrollments.find(item => item.id === member.id) || member); }} />;
  return <main className="shell">
    <div className="toolbar"><div><Button onClick={back}>← Schemes</Button><h1 className="title spacer">{scheme.name}</h1><p className="copy">{scheme.duration_months} months · {data.enrollments.length}/{scheme.member_count} members · {schemeStatusLabel(scheme.status)}</p></div>
      {scheme.status === "draft" && <Button onClick={() => setMemberOpen(true)}>+ Add member</Button>}
      {scheme.status === "active" && <Button className="primary" onClick={() => setTab("live")}>Start live bidding</Button>}
    </div>
    <div className="tabs spacer">
      {[["overview", "Overview"], ["members", "Members"], ["bids", "Monthly Bids"], ["payments", "Payments"], ["dividends", "Dividends"], ["live", "Live Bidding"]].map(([id, label]) => <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</Button>)}
    </div>
    {error && <p className="red small">{error}</p>}
    {busy ? <p className="small spacer">Loading scheme details…</p> : <>
      {tab === "overview" && <><div className="grid metrics"><Metric label="Chit value" value={money(scheme.chit_value)} color="gold" /><Metric label="Monthly installment" value={money(scheme.installment_amount)} /><Metric label="Current month" value={current ? `Month ${current.cycle_number}` : "Not started"} color="blue" /><Metric label="Latest bid" value={current ? money(current.winning_bid_amount) : "—"} color="gold" /><Metric label="Latest winner" value={winner ? enrollmentName(winner) : "—"} color="green" /></div>{calc && <div className="grid metrics"><Metric label="Winning bid" value={money(calc.winningBid)} color="gold" /><Metric label="Discount" value={money(calc.discount)} color="blue" /><Metric label="Commission" value={money(calc.commission)} /><Metric label="Distributable" value={money(calc.distributable)} /><Metric label="Dividend / member" value={money(calc.dividend)} color="green" /></div>}</>}
      {tab === "members" && <div className="card"><div className="toolbar"><strong>Members</strong>{scheme.status === "draft" && <Button className="primary" onClick={() => setMemberOpen(true)}>+ Add member</Button>}</div><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Phone</th><th>Bid winner</th><th>Portal</th><th></th></tr></thead><tbody>{data.enrollments.map(item => { const wins = winsForEnrollment(data.cycles, data.bids, item.id); return <tr key={item.id}><td>{item.ticket_number}</td><td>{enrollmentName(item)}</td><td>{item.chit_members?.phone || "—"}</td><td>{wins.length ? `Yes · Month ${wins.map(win => win.month).join(", ")}` : "No"}</td><td>{enrollmentPortalId(item) || "Not enabled"}</td><td><Button onClick={() => setMember(item)}>View details</Button></td></tr>; })}</tbody></table>{!data.enrollments.length && <p className="small">No members in this scheme yet.</p>}</div></div>}
      {tab === "bids" && <div className="card"><div className="toolbar"><strong>Monthly bids</strong>{scheme.status === "active" && <Button onClick={() => setBidOpen(true)}>+ Record monthly bid</Button>}</div><p className="small">Each month is stored separately. Recording a new month does not change previous months.</p><div className="table spacer"><table><thead><tr><th>Month</th><th>Bid date</th><th>Winner</th><th>Winning bid</th><th>Discount</th><th>Commission</th><th>Dividend / member</th></tr></thead><tbody>{data.cycles.map(cycle => { const won = data.enrollments.find(item => item.id === cycle.winning_enrollment_id); return <tr key={cycle.id}><td>Month {cycle.cycle_number}</td><td>{formatChitDate(cycle.cycle_date)}</td><td>{won ? `Ticket ${won.ticket_number} · ${enrollmentName(won)}` : "—"}</td><td>{money(cycle.winning_bid_amount)}</td><td>{money(cycle.discount_amount)}</td><td>{money(cycle.commission_amount)}</td><td>{money(cycle.dividend_per_member)}</td></tr>; })}</tbody></table>{!data.cycles.length && <p className="small">No monthly bids recorded yet.</p>}</div></div>}
      {tab === "payments" && <div className="card"><strong>Payments</strong><div className="table spacer"><table><thead><tr><th>Member</th><th>Ticket</th><th>Month due</th><th>Expected</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>{data.installments.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); const cycle = data.cycles.find(row => row.id === item.cycle_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>{owner?.ticket_number || "—"}</td><td>{cycle ? `Month ${cycle.cycle_number}` : "—"}</td><td>{money(item.net_amount_due)}</td><td>{money(item.amount_paid)} {item.payment_mode || ""}</td><td>{item.status}</td><td><Button onClick={() => setPayment(item)}>{item.amount_paid ? "Edit payment" : "Record payment"}</Button>{item.amount_paid > 0 && <Button className="danger" onClick={() => remove(item.id)}>Delete</Button>}</td></tr>; })}</tbody></table>{!data.installments.length && <p className="small">Record a monthly bid first to create member installments.</p>}</div></div>}
      {tab === "dividends" && <div className="card"><strong>Dividends</strong><p className="small">discount = chit value − winning bid · commission = chit value × commission % · distributable = discount − commission · dividend = distributable ÷ members</p><div className="table spacer"><table><thead><tr><th>Month</th><th>Winning bid</th><th>Discount</th><th>Commission</th><th>Distributable</th><th>Dividend / member</th></tr></thead><tbody>{data.cycles.map(cycle => <tr key={cycle.id}><td>Month {cycle.cycle_number}</td><td>{money(cycle.winning_bid_amount)}</td><td>{money(cycle.discount_amount)}</td><td>{money(cycle.commission_amount)}</td><td>{money(cycle.distributable_amount)}</td><td>{money(cycle.dividend_per_member)}</td></tr>)}</tbody></table>{!data.cycles.length && <p className="small">No dividend records yet.</p>}</div></div>}
      {tab === "live" && <ChitLiveBidding token={token} scheme={scheme} data={data} onFinalized={async () => { const details = await loadChitSchemeDetails(token, scheme.id); setData(details); const last = latestCycle(details.cycles); if (last) setFinalized(last); }} />}
      {finalized && <div className="card spacer"><strong>Latest finalized bid</strong><div className="grid metrics"><Metric label="Winning bid" value={money(finalized.winning_bid_amount)} color="gold" /><Metric label="Discount" value={money(finalized.discount_amount)} color="blue" /><Metric label="Commission" value={money(finalized.commission_amount)} /><Metric label="Distributable" value={money(finalized.distributable_amount)} /><Metric label="Dividend / member" value={money(finalized.dividend_per_member)} color="green" /></div></div>}
    </>}
    {memberOpen && <ChitAddMemberModal token={token} scheme={scheme} nextTicket={nextTicket} close={() => setMemberOpen(false)} done={async () => { setMemberOpen(false); await refresh(); }} />}
    {bidOpen && <ChitBidModal token={token} scheme={scheme} enrollments={eligibleForManualBid} nextMonth={data.cycles.length + 1} close={() => setBidOpen(false)} done={async () => { setBidOpen(false); await refresh(); }} />}
    {payment && <ChitPaymentModal token={token} installment={payment} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} />}
  </main>;
}

function ChitSchemeDetails(props) {
  if (props.scheme.chit_type === CHIT_TYPES.FIXED) return <FixedChitSchemeDetails {...props} />;
  if (props.scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID) return <PredefinedBidSchemeDetails {...props} />;
  return <AuctionChitSchemeDetails {...props} />;
}

const emptySchemeForm = (chitType = CHIT_TYPES.AUCTION) => ({ chitType, name: "", chitValue: "", durationMonths: "", memberCount: "", installmentAmount: "", commissionPercent: "", fixedCommissionAmount: "", fixedInitialLiftAmount: "", fixedMonthlyIncrement: "", predefinedStartingEmi: "", predefinedEmiIncrement: "", predefinedStartingComm: "", predefinedCommDecrement: "", predefinedStartingAuctionAmount: "", predefinedAuctionDecrement: "", predefinedStartingBidAmount: "", predefinedBidIncrement: "", predefinedManagerCommissionPercent: "", startDate: today(), minBidPercent: "70", maxBidPercent: "95", latePenaltyAmount: "0", securityDepositAmount: "0" });

function ChitSchemeDashboardSection({ title, rows, busy, open, edit, activate }) {
  return <div className="card spacer"><div className="toolbar"><strong>{title}</strong><span className="small">{rows.length} schemes</span></div><div className="table spacer"><table><thead><tr><th>Scheme</th><th>Chit value</th><th>Members</th><th>Duration</th><th>Current month</th><th>Current bid / lift</th><th>Current member</th><th>Net receivable</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(({ scheme, current, members, winner, fixedCurrent, fixedWinner, predefinedCurrent, predefinedWinner }) => { const fixed = scheme.chit_type === CHIT_TYPES.FIXED; const predefined = scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID; const activeRow = predefined ? predefinedCurrent : fixed ? fixedCurrent : current; const activeMember = predefined ? predefinedWinner : fixed ? fixedWinner : winner; return <tr key={scheme.id}><td><button className="link-button" onClick={() => open(scheme)}>{scheme.name}</button></td><td>{money(scheme.chit_value)}</td><td>{members.length}/{scheme.member_count}</td><td>{scheme.duration_months} months</td><td>{activeRow ? `Month ${activeRow.month_number || activeRow.cycle_number}` : "—"}</td><td>{activeRow ? money(predefined ? activeRow.bid_amount : fixed ? activeRow.lift_amount : activeRow.winning_bid_amount) : "—"}</td><td>{activeMember ? enrollmentName(activeMember) : "—"}</td><td>{predefined && activeRow ? money(activeRow.net_receivable) : "—"}</td><td><Badge status={schemeStatusLabel(scheme.status)} /></td><td>{scheme.status === "draft" && <>{!predefined && <Button onClick={() => edit(scheme)}>Edit</Button>}<Button className="primary" onClick={() => activate(scheme)}>Activate</Button></>}</td></tr>; })}</tbody></table></div>{!rows.length && !busy && <p className="small">No {title} schemes yet.</p>}</div>;
}

export function ChitFundPage({ token, close }) {
  const [schemes, setSchemes] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [fixedLifts, setFixedLifts] = useState([]);
  const [predefinedSchedule, setPredefinedSchedule] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null);
  const [schemeForm, setSchemeForm] = useState(emptySchemeForm);
  const refresh = () => loadChitDashboard(token).then(payload => {
    setSchemes(payload.schemes);
    setCycles(payload.cycles);
    setEnrollments(payload.enrollments);
    setFixedLifts(payload.fixedLifts || []);
    setPredefinedSchedule(payload.predefinedSchedule || []);
    setError("");
    setBusy(false);
  }).catch(err => { setError(err.message || "Could not load Chit Fund schemes."); setBusy(false); });
  useEffect(() => {
    let ignore = false;
    loadChitDashboard(token).then(payload => {
      if (ignore) return;
      setSchemes(payload.schemes);
      setCycles(payload.cycles);
      setEnrollments(payload.enrollments);
      setFixedLifts(payload.fixedLifts || []);
      setPredefinedSchedule(payload.predefinedSchedule || []);
      setError("");
      setBusy(false);
    }).catch(err => { if (!ignore) { setError(err.message || "Could not load Chit Fund schemes."); setBusy(false); } });
    return () => { ignore = true; };
  }, [token]);
  const rows = useMemo(() => schemes.map(scheme => {
    const schemeCycles = cycles.filter(cycle => cycle.scheme_id === scheme.id).sort((a, b) => a.cycle_number - b.cycle_number);
    const current = schemeCycles.at(-1);
    const members = enrollments.filter(item => item.scheme_id === scheme.id);
    const winner = members.find(item => item.id === current?.winning_enrollment_id);
    const schemeFixedLifts = fixedLifts.filter(item => item.scheme_id === scheme.id);
    const fixedCurrent = schemeFixedLifts.find(item => item.status === "pending") || schemeFixedLifts.at(-1);
    const fixedWinner = members.find(item => item.id === fixedCurrent?.enrollment_id);
    const schemePredefined = predefinedSchedule.filter(item => item.scheme_id === scheme.id);
    const predefinedCurrent = schemePredefined.find(item => item.status === "pending") || schemePredefined.at(-1);
    const predefinedWinner = members.find(item => item.id === predefinedCurrent?.enrollment_id);
    return { scheme, current, members, winner, fixedCurrent, fixedWinner, predefinedCurrent, predefinedWinner };
  }), [schemes, cycles, enrollments, fixedLifts, predefinedSchedule]);
  const submitScheme = async event => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      if (schemeForm.chitType === CHIT_TYPES.FIXED_PREDEFINED_BID) {
        validatePredefinedBidChit({
          chitValue: Number(schemeForm.chitValue), memberCount: Number(schemeForm.memberCount),
          durationMonths: Number(schemeForm.durationMonths), startingEmi: Number(schemeForm.predefinedStartingEmi),
          emiIncrement: Number(schemeForm.predefinedEmiIncrement), startingComm: Number(schemeForm.predefinedStartingComm),
          commDecrement: Number(schemeForm.predefinedCommDecrement),
          startingAuctionAmount: Number(schemeForm.predefinedStartingAuctionAmount),
          auctionAmountDecrement: Number(schemeForm.predefinedAuctionDecrement),
          startingBidAmount: Number(schemeForm.predefinedStartingBidAmount),
          bidAmountIncrement: Number(schemeForm.predefinedBidIncrement),
          managerCommissionPercent: Number(schemeForm.predefinedManagerCommissionPercent),
        });
        await createPredefinedBidChitScheme(token, schemeForm);
      } else if (schemeForm.chitType === CHIT_TYPES.FIXED) {
        const fixedForm = {
          ...schemeForm,
          fixedInitialLiftAmount: schemeForm.fixedInitialLiftAmount === ""
            ? Number(schemeForm.chitValue) - Number(schemeForm.fixedCommissionAmount)
            : schemeForm.fixedInitialLiftAmount,
        };
        validateFixedChit({
          chitValue: fixedForm.chitValue, memberCount: Number(fixedForm.memberCount),
          durationMonths: Number(fixedForm.durationMonths), monthlyContribution: fixedForm.installmentAmount,
          commissionAmount: fixedForm.fixedCommissionAmount,
          initialLiftAmount: fixedForm.fixedInitialLiftAmount,
          monthlyLiftIncrement: fixedForm.fixedMonthlyIncrement,
        });
        if (modal === "edit-scheme") await updateFixedChitScheme(token, fixedForm);
        else await createFixedChitScheme(token, fixedForm);
      } else if (modal === "edit-scheme") await updateChitScheme(token, schemeForm);
      else await createChitScheme(token, schemeForm);
      setNotice(modal === "edit-scheme" ? "Scheme updated." : "Scheme created as Draft.");
      setModal(null); setSchemeForm(emptySchemeForm()); await refresh();
    } catch (err) { setError(err.message || "Could not save scheme."); }
    finally { setBusy(false); }
  };
  const activate = async scheme => {
    if (!window.confirm(`Activate ${scheme.name}? It must have exactly ${scheme.member_count} active members.`)) return;
    setBusy(true); setError("");
    try { await activateChitScheme(token, scheme.id); setNotice("Scheme activated."); await refresh(); }
    catch (err) { setError(err.message || "Could not activate scheme."); }
    finally { setBusy(false); }
  };
  const editScheme = scheme => {
    setSchemeForm({
      id: scheme.id, chitType: scheme.chit_type || CHIT_TYPES.AUCTION, name: scheme.name, chitValue: scheme.chit_value, durationMonths: scheme.duration_months,
      memberCount: scheme.member_count, installmentAmount: scheme.installment_amount, commissionPercent: scheme.commission_percent,
      startDate: scheme.start_date, minBidPercent: scheme.min_bid_percent, maxBidPercent: scheme.max_bid_percent,
      latePenaltyAmount: scheme.late_penalty_amount, securityDepositAmount: scheme.security_deposit_amount,
      fixedCommissionAmount: scheme.fixed_commission_amount ?? "",
      fixedInitialLiftAmount: scheme.fixed_initial_lift_amount ?? "",
      fixedMonthlyIncrement: scheme.fixed_monthly_increment ?? "",
    });
    setModal("edit-scheme");
  };
  if (selected) return <ChitSchemeDetails token={token} scheme={selected} back={() => { setSelected(null); refresh(); }} />;
  return <main className="shell">
    <div className="toolbar"><div><Button onClick={close}>← Dashboard</Button><h1 className="title spacer">Chit Fund</h1><p className="copy">Schemes only. Auction Chits use live bidding, Fixed Chits use fixed lifts, and Fixed Predefined Bid Chits use an editable generated schedule.</p></div><Button className="primary" onClick={() => setModal("choose-type")}>+ New scheme</Button></div>
    {error && <p className="red small">{error}</p>}
    {notice && <p className="green small">{notice}</p>}
    {busy && <p className="small spacer">Loading Chit Fund schemes…</p>}
    <ChitSchemeDashboardSection title="Auction" rows={rows.filter(row => (row.scheme.chit_type || CHIT_TYPES.AUCTION) === CHIT_TYPES.AUCTION)} busy={busy} open={setSelected} edit={editScheme} activate={activate} />
    <ChitSchemeDashboardSection title="Fixed" rows={rows.filter(row => row.scheme.chit_type === CHIT_TYPES.FIXED)} busy={busy} open={setSelected} edit={editScheme} activate={activate} />
    <ChitSchemeDashboardSection title="Fixed Predefined Bid" rows={rows.filter(row => row.scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID)} busy={busy} open={setSelected} edit={editScheme} activate={activate} />
    {modal === "choose-type" && <ChitTypeChooser close={() => setModal(null)} choose={type => { setSchemeForm(emptySchemeForm(type)); setModal("scheme"); }} />}
    {(modal === "scheme" || modal === "edit-scheme") && (schemeForm.chitType === CHIT_TYPES.FIXED_PREDEFINED_BID
      ? <PredefinedBidSchemeForm form={schemeForm} setForm={setSchemeForm} busy={busy} error={error} onClose={() => setModal(null)} onSubmit={submitScheme} />
      : schemeForm.chitType === CHIT_TYPES.FIXED
        ? <FixedChitSchemeForm title={modal === "edit-scheme" ? "Edit Fixed Chit scheme" : "Create Fixed Chit scheme"} form={schemeForm} setForm={setSchemeForm} busy={busy} error={error} onClose={() => setModal(null)} onSubmit={submitScheme} submitLabel={modal === "edit-scheme" ? "Save changes" : "Create draft"} />
        : <ChitSchemeForm title={modal === "edit-scheme" ? "Edit Auction Chit scheme" : "Create Auction Chit scheme"} form={schemeForm} setForm={setSchemeForm} busy={busy} error={error} onClose={() => setModal(null)} onSubmit={submitScheme} submitLabel={modal === "edit-scheme" ? "Save changes" : "Create draft"} />)}
  </main>;
}

function FixedChitCustomerPortal({ state, logout }) {
  const scheme = state.scheme || {};
  const lift = state.fixedLift;
  const payments = state.fixedPayments || [];
  const paid = payments.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);
  const due = payments.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);
  return <main className="shell" style={{ maxWidth: 760 }}><header className="top"><div><div className="brand">FinTrack</div><div className="sub">Fixed Chit customer dashboard</div></div><Button onClick={logout}>Log out</Button></header><h1 className="title">Hello, {state.memberName || "Member"}</h1><p className="copy">{scheme.name || "Fixed Chit"} · Ticket {state.ticketNumber} · Portal {state.portalId}</p><p className="notice">This is a Fixed Chit. Lift amounts follow the predetermined schedule; live bidding is not used.</p><div className="grid metrics"><Metric label="Chit value" value={money(scheme.chit_value)} color="gold" /><Metric label="Monthly contribution" value={money(scheme.installment_amount)} /><Metric label="Your lift month" value={lift ? `Month ${lift.month_number}` : "Not assigned"} color="blue" /><Metric label="Your lift amount" value={lift ? money(lift.lift_amount) : "—"} color="gold" /><Metric label="Monthly payment" value={lift ? money(lift.monthly_payment) : "—"} /><Metric label="Remaining payments" value={lift?.remaining_months ?? "—"} /><Metric label="Outstanding" value={money(Math.max(0, due - paid))} color="red" /></div><div className="card spacer"><strong>Your Fixed Chit payment schedule</strong><div className="table spacer"><table><thead><tr><th>Month</th><th>Due date</th><th>Expected</th><th>Paid</th><th>Status</th></tr></thead><tbody>{payments.map(item => <tr key={item.id}><td>Month {item.payment_month}</td><td>{formatChitDate(item.due_date)}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td>{item.status}</td></tr>)}</tbody></table>{!payments.length && <p className="small spacer">{lift ? "No remaining payments." : "Your payment schedule will appear after your lift is finalized."}</p>}</div></div></main>;
}

function PredefinedBidCustomerPortal({ state, logout }) {
  const scheme = state.scheme || {};
  const item = state.predefinedMonth;
  const payments = state.predefinedPayments || [];
  const balance = payments.reduce((sum, row) => sum + Number(row.amount_due) - Number(row.amount_paid), 0);
  return <main className="shell" style={{ maxWidth: 800 }}><header className="top"><div><div className="brand">FinTrack</div><div className="sub">Fixed Predefined Bid customer dashboard</div></div><Button onClick={logout}>Log out</Button></header><h1 className="title">Hello, {state.memberName || "Member"}</h1><p className="copy">{scheme.name} · Ticket {state.ticketNumber}</p><p className="notice">This Chit uses a predefined monthly schedule. Live bidding is not used.</p><div className="grid metrics"><Metric label="Lift month" value={item ? `Month ${item.month_number}` : "Not assigned"} color="blue" /><Metric label="EMI" value={item ? money(item.emi) : "—"} /><Metric label="COMM" value={item ? money(item.comm_amount) : "—"} /><Metric label="Auction amount" value={item ? money(item.auction_amount) : "—"} /><Metric label="Bid amount" value={item ? money(item.bid_amount) : "—"} color="gold" /><Metric label="Manager commission" value={item ? money(item.manager_commission) : "—"} /><Metric label="Net receivable" value={item ? money(item.net_receivable) : "—"} color="green" /><Metric label="Payment balance" value={money(balance)} color="red" /></div><div className="card spacer"><strong>Payment history</strong><div className="table spacer"><table><thead><tr><th>Month</th><th>Expected EMI</th><th>Paid</th><th>Balance</th><th>Date</th><th>Mode</th><th>Status</th></tr></thead><tbody>{payments.map(row => <tr key={row.id}><td>{row.payment_month}</td><td>{money(row.amount_due)}</td><td>{money(row.amount_paid)}</td><td>{money(Number(row.amount_due) - Number(row.amount_paid))}</td><td>{formatChitDate(row.paid_date || row.due_date)}</td><td>{row.payment_mode || "—"}</td><td>{row.status}</td></tr>)}</tbody></table>{!payments.length && <p className="small spacer">No payment schedule is available yet.</p>}</div></div></main>;
}

export function ChitCustomerPortal({ session, logout }) {
  const [state, setState] = useState(session || {});
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const token = session?.sessionToken;
  useEffect(() => {
    if (!token) return undefined;
    const timer = setInterval(() => {
      chitCustomerLiveState(token).then(payload => setState({ ...payload, sessionToken: token })).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [token]);
  const scheme = state.scheme || {};
  if (scheme.chit_type === CHIT_TYPES.FIXED) return <FixedChitCustomerPortal state={state} logout={logout} />;
  if (scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID) return <PredefinedBidCustomerPortal state={state} logout={logout} />;
  const auction = state.auction;
  const leading = state.leadingBid || state.leading_bid;
  const bids = state.bids || [];
  const wins = state.wins || [];
  const eligible = state.eligible === true;
  const chitValue = Number(scheme.chit_value || 0);
  const limits = liveAuctionLimits({
    chitValue,
    commissionPercent: scheme.commission_percent,
    commissionAmount: scheme.commission_amount ?? state.commission_amount,
    liveMaxBidAmount: scheme.live_max_bid_amount ?? state.live_max_bid_amount,
  });
  const submit = async event => {
    event.preventDefault();
    if (!auction || auction.status !== "open") return;
    try {
      validateLiveBid({
        bidAmount: amount, chitValue, commissionPercent: scheme.commission_percent,
        commissionAmount: limits.commission, liveMaxBidAmount: limits.maxBid,
        leadingBidAmount: leading?.bid_amount,
      });
    } catch (err) { setError(err.message); return; }
    setBusy(true); setError("");
    try {
      const nonce = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const next = await chitCustomerPlaceLiveBid(token, amount, nonce);
      setState({ ...next, sessionToken: token });
      setAmount("");
    } catch (err) { setError(err.message || "Could not submit your bid."); }
    finally { setBusy(false); }
  };
  const statusLabel = !auction ? "Not started" : auction.status;
  return <main className="shell" style={{ maxWidth: 760 }}>
    <header className="top"><div><div className="brand">FinTrack</div><div className="sub">Chit customer dashboard</div></div><Button onClick={logout}>Log out</Button></header>
    <h1 className="title">Hello, {state.memberName || "Member"}</h1>
    <p className="copy">{scheme.name || "Chit scheme"} · Ticket {state.ticketNumber} · Portal {state.portalId}</p>
    {auction?.status === "open" ? <p className="notice">Live bidding is open for month {auction.cycle_number}. Fund manager commission of {money(limits.commission)} is already deducted. Bid above {money(limits.commission)}, up to {money(limits.maxBid)} (30% of the chit value). Highest bid wins.</p> : auction?.status === "paused" ? <p className="notice">Live bidding is paused. Wait for your financier to resume, then post a higher bid.</p> : <p className="notice">Your financier has not started this month’s live bidding yet. Bidding is usually opened on the auction date, for example the 25th. Sign in again that day to post your bid.</p>}
    {error && <p className="red small">{error}</p>}
    <div className="grid metrics">
      <Metric label="Chit value" value={money(chitValue)} color="gold" />
      <Metric label="Manager commission" value={money(limits.commission)} />
      <Metric label="Bid from above" value={money(limits.commission)} color="blue" />
      <Metric label="Max bid (30%)" value={money(limits.maxBid)} />
      <Metric label="Monthly installment" value={money(scheme.installment_amount)} />
      <Metric label="Your ticket" value={state.ticketNumber || "—"} color="blue" />
      <Metric label="Auction status" value={statusLabel} color={auction?.status === "open" ? "green" : ""} />
      <Metric label="Leading bid" value={leading ? money(leading.bid_amount) : "—"} color="gold" />
      <Metric label="You can bid" value={eligible && auction?.status === "open" ? "Yes" : "No"} color={eligible && auction?.status === "open" ? "green" : "red"} />
    </div>
    {auction?.status === "open" && eligible && <form className="card spacer" onSubmit={submit}><strong>Post your bid</strong><p className="small">Enter an amount above {money(limits.commission)} and at most {money(limits.maxBid)}. A new bid must be higher than {leading ? money(leading.bid_amount) : "any previous bid"}.{amount && Number(amount) > limits.commission ? ` If you win at ${money(amount)}, you receive ${money(liveBidPayout({ chitValue, bidAmount: amount }))}.` : ""}</p><div className="form spacer"><Field className="span" label="Your bid amount (₹)"><input required type="number" min={limits.commission + 0.01} max={limits.maxBid} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></Field></div><Button className="primary" disabled={busy} type="submit">{busy ? "Submitting…" : "Submit bid"}</Button></form>}
    {auction?.status === "open" && !eligible && <p className="notice">You are not eligible to bid this month. Members who already won a month cannot bid again.</p>}
    <div className="card spacer"><strong>Live bids</strong><div className="table spacer"><table><thead><tr><th>Time</th><th>Member</th><th>Amount</th></tr></thead><tbody>{bids.map(bid => <tr key={bid.id}><td>{formatTime(bid.submitted_at)}</td><td>Ticket {bid.ticket_number} · {bid.member_name}</td><td>{money(bid.bid_amount)}</td></tr>)}</tbody></table>{!bids.length && <p className="small">No live bids yet.</p>}</div></div>
    <div className="card spacer"><strong>Your winning months</strong>{wins.length ? <div className="table spacer"><table><thead><tr><th>Month</th><th>Winning bid</th><th>Bid date</th><th>Status</th></tr></thead><tbody>{wins.map(win => <tr key={win.month}><td>Month {win.month}</td><td>{money(win.bidAmount)}</td><td>{formatChitDate(win.bidDate)}</td><td>{win.status}</td></tr>)}</tbody></table></div> : <p className="small spacer">You have not won a monthly bid in this scheme yet.</p>}</div>
  </main>;
}
