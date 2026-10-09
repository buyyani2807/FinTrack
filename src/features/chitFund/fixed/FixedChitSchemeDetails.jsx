import { useEffect, useState } from "react";
import { deleteFixedChitPayment, loadChitSchemeDetails } from "../../../lib/financeRepository";
import { buildFixedLiftPayload } from "../../receipts/io/transactionConfirmations.js";
import { CustomerStatementPage } from "../../statements/CustomerStatementPage.jsx";
import { CreditScoreCard } from "../../creditScore/CreditScoreCard.jsx";
import { enrollmentPortalId } from "../model/liveBidding";
import { fixedChitScheduleDisplayPayment, formatFixedManagerCommissionSummary, resolveFixedManagerCommission } from "../model/fixedChit";
import { money, formatChitDate, schemeStatusLabel, enrollmentName, nextAvailableTicket, paymentsByMemberName } from "../model/chitFormat.js";
import { fireChitLiftWhatsApp } from "../io/chitNotifications.js";
import { BackButton, Button, Metric, Spinner } from "../../../components/ui.jsx";
import { ChitDeletePaymentButton, ChitDeleteMemberControl, ChitSchemeHeaderActions } from "../components/ChitAdminControls.jsx";
import { ChitPaymentStatus, ChitPortalAccess, ChitPaymentMonthPicker } from "../components/ChitMemberParts.jsx";
import { ChitAddMemberModal, ChitMembersToolbar } from "../components/ChitMemberManagement.jsx";
import { FixedChitLiftModal, FixedChitPaymentModal } from "./FixedChitModals.jsx";

function FixedChitMemberDetails({ token, scheme, enrollment, lift, payments, back, recordPayment, deletePayment, onPortalChange, onDeleted, orgSettings = {}, workspace = {} }) {
  const paid = payments.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);
  const due = payments.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);
  const portalId = enrollmentPortalId(enrollment);
  const [showStatement, setShowStatement] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const managerCommission = lift ? resolveFixedManagerCommission({
    chitValue: scheme.chit_value,
    fixedCommissionAmount: scheme.fixed_commission_amount,
    commissionPercent: scheme.commission_percent,
    lifts: [lift],
  }).amount : 0;
  if (showStatement) {
    return <CustomerStatementPage
      mode="chit"
      settings={orgSettings}
      chit={{ scheme, enrollment, payments, lift }}
      back={() => setShowStatement(false)}
    />;
  }
  return <main className="shell"><BackButton onClick={back} /><div className="toolbar"><div><h1 className="title">{enrollmentName(enrollment)}</h1><p className="copy">{scheme.name} · Ticket {enrollment.ticket_number} · Fixed Chit · User ID: {portalId || "Not enabled"}</p></div><div className="row"><Button onClick={() => setShowStatement(true)}>Customer Statement</Button>{lift && <Button disabled={confirmBusy} onClick={async () => {
    setConfirmBusy(true); setConfirmNotice("");
    const managerCommission = resolveFixedManagerCommission({
      chitValue: scheme.chit_value,
      fixedCommissionAmount: scheme.fixed_commission_amount,
      commissionPercent: scheme.commission_percent,
      lifts: [lift],
    }).amount;
    const toast = await fireChitLiftWhatsApp({
      token, settings: orgSettings, workspace, sourceId: lift.id, resend: true,
      payload: buildFixedLiftPayload({ scheme, lift, enrollment, liftDate: lift.lift_date, managerCommission }),
    });
    setConfirmNotice(toast || "WhatsApp confirmation opened.");
    setConfirmBusy(false);
  }}>{confirmBusy ? "Opening…" : "Resend WhatsApp confirmation"}</Button>}<ChitPortalAccess token={token} enrollment={enrollment} onChange={onPortalChange} /><ChitDeleteMemberControl token={token} scheme={scheme} enrollment={enrollment} onDeleted={onDeleted} /></div></div>{confirmNotice && <p className="notice">{confirmNotice}</p>}<div className="grid metrics"><Metric label="Lift month" value={lift ? `Month ${lift.month_number}` : "Not assigned"} color="blue" /><Metric label="Lift amount" value={lift ? money(lift.lift_amount) : "—"} color="gold" /><Metric label="Monthly payment" value={lift ? money(lift.monthly_payment) : "—"} /><Metric label="Remaining months" value={lift?.remaining_months ?? "—"} /><Metric label="Outstanding" value={money(Math.max(0, due - paid))} color="red" /><Metric label="User ID" value={portalId || "Not enabled"} color={portalId ? "gold" : ""} /></div><CreditScoreCard chitPayments={payments} accountLabel="chit" />{portalId && <p className="notice">Share this User ID with the member. Use Reset PIN to set the PIN they will use on Chit customer login, then share both privately.</p>}{lift && <div className="card spacer"><strong>Lift details</strong><div className="grid metrics"><Metric label="Manager commission" value={money(managerCommission)} /><Metric label="Amount paid to member" value={money(lift.amount_paid_to_member)} color="green" /><Metric label="Lift date" value={formatChitDate(lift.lift_date)} /><Metric label="Total remaining payment" value={money(lift.total_remaining_payment)} /></div></div>}<div className="card spacer"><strong>Payment history</strong><div className="table spacer chit-member-payments"><table><thead><tr><th>Month</th><th>Due date</th><th>Payment date</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Late fee</th><th>Reference</th><th>Status</th><th></th></tr></thead><tbody>{payments.map(item => <tr key={item.id}><td>Month {item.payment_month}</td><td>{formatChitDate(item.due_date)}</td><td>{formatChitDate(item.paid_date)}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td className="red">{money(Math.max(0, Number(item.amount_due) - Number(item.amount_paid)))}</td><td>{item.late_penalty ? money(item.late_penalty) : "—"}</td><td>{item.payment_reference || "—"}</td><td><ChitPaymentStatus row={item} /></td><td><Button onClick={() => recordPayment(item)}>{item.amount_paid ? "Edit payment" : "Record payment"}</Button>{Number(item.amount_paid) > 0 && <ChitDeletePaymentButton allowed={workspace?.role !== "staff"} memberName={enrollmentName(enrollment)} schemeName={scheme.name} amount={money(item.amount_paid)} paidDate={formatChitDate(item.paid_date)} mode={item.payment_mode} reference={item.payment_reference} onConfirm={reason => deletePayment(item.id, reason)} />}</td></tr>)}</tbody></table>{!payments.length && <p className="small spacer">Payment rows appear after this scheme is activated.</p>}</div></div></main>;
}
export function FixedChitSchemeDetails({ token, scheme, back, tab: routeTab = "overview", onTabChange, memberId = null, onMemberChange, onSchemeDeleted, orgSettings = {}, workspace = {}, onReceipt }) {
  const [data, setData] = useState({ enrollments: [], fixedLifts: [], fixedPayments: [] });
  // The open tab and member page come from the URL (/chit-fund/schemes/:schemeId/:tab, …/members/:memberId).
  const tab = ["overview", "schedule", "members", "payments"].includes(routeTab) ? routeTab : "overview";
  const setTab = next => onTabChange?.(next);
  const [paymentMonth, setPaymentMonth] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [memberOpen, setMemberOpen] = useState(false);
  const [lift, setLift] = useState(null);
  const [payment, setPayment] = useState(null);
  const member = memberId ? data.enrollments.find(item => item.id === memberId) || null : null;
  const setMember = next => { const id = next?.id || null; if (id !== memberId) onMemberChange?.(id); };
  const refresh = () => loadChitSchemeDetails(token, scheme.id).then(payload => { setData(payload); setBusy(false); setError(""); }).catch(err => { setError(err.message || "Could not load Fixed Chit details."); setBusy(false); });
  useEffect(() => {
    let ignore = false;
    loadChitSchemeDetails(token, scheme.id)
      .then(payload => { if (!ignore) { setData(payload); setBusy(false); setError(""); } })
      .catch(err => { if (!ignore) { setError(err.message || "Could not load Fixed Chit details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [scheme.id, token]);
  const nextTicket = nextAvailableTicket(data.enrollments, scheme.member_count);
  const completed = data.fixedLifts.filter(item => item.status === "completed");
  const monthlyManagerCommission = resolveFixedManagerCommission({
    chitValue: scheme.chit_value,
    fixedCommissionAmount: scheme.fixed_commission_amount,
    commissionPercent: scheme.commission_percent,
    lifts: data.fixedLifts,
  }).amount;
  const pending = data.fixedLifts.find(item => item.status === "pending");
  const selectedPaymentMonth = paymentMonth ?? Number(pending?.month_number || scheme.duration_months);
  const visibleFixedPayments = paymentsByMemberName(data.fixedPayments.filter(item => Number(item.payment_month) === selectedPaymentMonth), data.enrollments);
  const usedEnrollmentIds = new Set(completed.map(item => item.enrollment_id));
  const openFixedPayment = item => {
    const owner = data.enrollments.find(row => row.id === item.enrollment_id);
    setPayment({ ...item, memberName: enrollmentName(owner), memberPhone: owner?.chit_members?.phone || "" });
  };
  const removePayment = async (id, reason) => {
    try { await deleteFixedChitPayment(token, id, reason); await refresh(); }
    catch (err) { setError(err.message || "Could not delete payment."); throw err; }
  };
  if (member) {
    const memberLift = completed.find(item => item.enrollment_id === member.id);
    return <><FixedChitMemberDetails token={token} scheme={scheme} enrollment={member} lift={memberLift} payments={data.fixedPayments.filter(item => item.enrollment_id === member.id)} back={() => setMember(null)} recordPayment={openFixedPayment} deletePayment={removePayment} orgSettings={orgSettings} workspace={workspace} onPortalChange={async () => { const payload = await loadChitSchemeDetails(token, scheme.id); setData(payload); setMember(payload.enrollments.find(item => item.id === member.id) || member); }} onDeleted={async removed => { setMember(null); setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); }} />{payment && <FixedChitPaymentModal token={token} payment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} />}</>;
  }
  if (tab === "payments") {
    return <main className="shell"><BackButton onClick={back} /><div className="toolbar"><div><p className="page-company-name">{workspace?.businessName || "My Finance Business"}</p><h1 className="title">{scheme.name}</h1><p className="copy">Fixed Chit · {scheme.duration_months} months · {data.enrollments.length}/{scheme.member_count} members · {schemeStatusLabel(scheme.status)}</p></div><ChitSchemeHeaderActions token={token} scheme={scheme} memberCount={data.enrollments.length} onSchemeDeleted={onSchemeDeleted} /></div><div className="tabs spacer">{[["overview", "Overview"], ["schedule", "Fixed Schedule"], ["members", "Members"], ["payments", "Payments"]].map(([id, label]) => <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</Button>)}</div>{error && <p className="red small">{error}</p>}{notice && <p className="green small">{notice}</p>}{busy ? <Spinner label="Loading Fixed Chit" /> : <div className="card"><div className="toolbar"><strong>Fixed Chit Payments — Month {selectedPaymentMonth}</strong><ChitPaymentMonthPicker duration={scheme.duration_months} value={selectedPaymentMonth} onChange={setPaymentMonth} /></div><div className="table spacer"><table><thead><tr><th>Member</th><th>Month</th><th>Due date</th><th>Expected</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>{visibleFixedPayments.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>Month {item.payment_month}</td><td>{formatChitDate(item.due_date)}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td><ChitPaymentStatus row={item} /></td><td><Button onClick={() => openFixedPayment(item)}>{item.amount_paid ? "Edit payment" : "Record payment"}</Button>{Number(item.amount_paid) > 0 && <ChitDeletePaymentButton allowed={workspace?.role !== "staff"} memberName={enrollmentName(owner)} schemeName={scheme.name} amount={money(item.amount_paid)} paidDate={formatChitDate(item.paid_date)} mode={item.payment_mode} reference={item.payment_reference} onConfirm={reason => removePayment(item.id, reason)} />}</td></tr>; })}</tbody></table>{!visibleFixedPayments.length && <p className="small spacer">No payments are scheduled for Month {selectedPaymentMonth}.</p>}</div></div>}{payment && <FixedChitPaymentModal token={token} payment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} />}</main>;
  }
  return <main className="shell"><BackButton onClick={back} /><div className="toolbar"><div><p className="page-company-name">{workspace?.businessName || "My Finance Business"}</p><h1 className="title">{scheme.name}</h1><p className="copy">Fixed Chit · {scheme.duration_months} months · {data.enrollments.length}/{scheme.member_count} members · {schemeStatusLabel(scheme.status)}</p></div><ChitSchemeHeaderActions token={token} scheme={scheme} memberCount={data.enrollments.length} onAddMember={() => setMemberOpen(true)} onSchemeDeleted={onSchemeDeleted} /></div><div className="tabs spacer">{[["overview", "Overview"], ["schedule", "Fixed Schedule"], ["members", "Members"], ["payments", "Payments"]].map(([id, label]) => <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</Button>)}</div>{error && <p className="red small">{error}</p>}{notice && <p className="green small">{notice}</p>}{busy ? <Spinner label="Loading Fixed Chit" /> : <>{tab === "overview" && <><div className="grid metrics"><Metric label="Chit type" value="Fixed" color="blue" /><Metric label="Chit value" value={money(scheme.chit_value)} color="gold" /><Metric label="Members" value={`${data.enrollments.length}/${scheme.member_count}`} /><Metric label="Monthly contribution" value={money(scheme.installment_amount)} /><Metric label="Manager commission" value={formatFixedManagerCommissionSummary({ chitValue: scheme.chit_value, fixedCommissionAmount: scheme.fixed_commission_amount, commissionPercent: scheme.commission_percent, lifts: data.fixedLifts }, money)} /><Metric label="Monthly lift increment" value={money(scheme.fixed_monthly_increment)} /><Metric label="Current month" value={pending ? `Month ${pending.month_number}` : "Completed"} color="blue" /><Metric label="Remaining months" value={data.fixedLifts.filter(item => item.status === "pending").length} /></div>{pending && <div className="notice">Current lift amount: <strong>{money(pending.lift_amount)}</strong></div>}</>}{tab === "schedule" && <div className="card"><div className="toolbar"><strong>Fixed Chit Schedule</strong><span className="small">{completed.length}/{scheme.duration_months} completed</span></div><div className="table spacer"><table><thead><tr><th>Month</th><th>Lift amount</th><th>Monthly commission</th><th>Monthly payment</th><th>Member</th><th>Status</th><th></th></tr></thead><tbody>{data.fixedLifts.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>Month {item.month_number}</td><td>{money(item.lift_amount)}</td><td>{money(monthlyManagerCommission)}</td><td>{money(fixedChitScheduleDisplayPayment(item, scheme.installment_amount))}</td><td>{owner ? enrollmentName(owner) : "—"}</td><td>{item.status}</td><td>{item.status === "pending" && scheme.status === "active" && <Button className="primary" onClick={() => setLift(item)}>Lift Chit</Button>}</td></tr>; })}</tbody></table></div></div>}{tab === "members" && <div className="card"><ChitMembersToolbar scheme={scheme} enrollments={data.enrollments} onAddMember={() => setMemberOpen(true)} token={token} changed={refresh} /><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Lift month</th><th>Lift amount</th><th>Monthly payment</th><th>Remaining</th><th>Payment status</th><th>Portal</th><th></th></tr></thead><tbody>{data.enrollments.map(item => { const memberLift = completed.find(row => row.enrollment_id === item.id); const payments = data.fixedPayments.filter(row => row.enrollment_id === item.id); const outstanding = payments.reduce((sum, row) => sum + Number(row.amount_due) - Number(row.amount_paid), 0); return <tr key={item.id}><td>{item.ticket_number}</td><td>{enrollmentName(item)}</td><td>{memberLift ? `Month ${memberLift.month_number}` : "—"}</td><td>{memberLift ? money(memberLift.lift_amount) : "—"}</td><td>{memberLift ? money(memberLift.monthly_payment) : "—"}</td><td>{memberLift?.remaining_months ?? "—"}</td><td>{memberLift ? (outstanding > 0 ? `${money(outstanding)} due` : "Paid") : "Not lifted"}</td><td>{enrollmentPortalId(item) || "Not enabled"}</td><td><Button onClick={() => setMember(item)}>View details</Button>{!memberLift && scheme.status === "active" && pending && <Button onClick={() => setLift(pending)}>Lift Chit</Button>}<ChitDeleteMemberControl token={token} scheme={scheme} enrollment={item} onDeleted={async removed => { setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); }} /></td></tr>; })}</tbody></table></div></div>}{tab === "payments" && <div className="card"><strong>Fixed Chit Payments</strong><div className="table spacer"><table><thead><tr><th>Member</th><th>Month</th><th>Due date</th><th>Expected</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>{paymentsByMemberName(data.fixedPayments, data.enrollments).map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>Month {item.payment_month}</td><td>{formatChitDate(item.due_date)}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td><ChitPaymentStatus row={item} /></td><td><Button onClick={() => setPayment(item)}>{item.amount_paid ? "Edit payment" : "Record payment"}</Button>{Number(item.amount_paid) > 0 && <ChitDeletePaymentButton allowed={workspace?.role !== "staff"} memberName={enrollmentName(owner)} schemeName={scheme.name} amount={money(item.amount_paid)} paidDate={formatChitDate(item.paid_date)} mode={item.payment_mode} reference={item.payment_reference} onConfirm={reason => removePayment(item.id, reason)} />}</td></tr>; })}</tbody></table>{!data.fixedPayments.length && <p className="small spacer">Payment schedules are created when members lift the chit.</p>}</div></div>}</>}{memberOpen && <ChitAddMemberModal token={token} scheme={scheme} nextTicket={nextTicket} close={() => setMemberOpen(false)} done={async () => { setMemberOpen(false); await refresh(); }} />}{lift && <FixedChitLiftModal token={token} scheme={scheme} lift={lift} enrollments={data.enrollments} usedEnrollmentIds={usedEnrollmentIds} orgSettings={orgSettings} workspace={workspace} close={() => setLift(null)} done={async toast => { setLift(null); if (toast) setNotice(toast); await refresh(); }} />}{payment && <FixedChitPaymentModal token={token} payment={payment} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} />}</main>;
}
