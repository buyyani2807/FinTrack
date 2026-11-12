import { useEffect, useState } from "react";
import { deletePredefinedChitPayment, loadChitSchemeDetails } from "../../../lib/financeRepository";
import { CustomerStatementPage } from "../../statements/CustomerStatementPage.jsx";
import { enrollmentPortalId } from "../model/liveBidding";
import { memberPaymentsForEnrollment } from "../model/memberPayments";
import { money, formatChitDate, enrollmentName, nextAvailableTicket, paymentsByMemberName } from "../model/chitFormat.js";
import { Button, Metric } from "../../../components/ui.jsx";
import { AccPager } from "../../accounts/components/AccUi.jsx";
import { usePagedList } from "../../accounts/model/usePagedList.js";
import { ChitDeletePaymentButton, ChitDeleteMemberControl } from "../components/ChitAdminControls.jsx";
import { ChitSchemeShell } from "../components/ChitSchemeChrome.jsx";
import { CHIT_SCHEME_TABS, chitPaymentActionLabel, chitScheduleStatusLabel } from "../model/chitSchemeChrome.js";
import { ChitReceiptCell, ChitPaymentStatus, ChitPaymentMonthPicker } from "../components/ChitMemberParts.jsx";
import { ChitMemberPage, ChitStandingTag } from "../components/ChitMemberPage.jsx";
import { ChitAddMemberModal, ChitMembersToolbar } from "../components/ChitMemberManagement.jsx";
import { PredefinedAssignModal, PredefinedScheduleEditModal, PredefinedPaymentModal } from "./PredefinedChitModals.jsx";

function PredefinedChitMemberDetails({ token, scheme, enrollment, item, payments, back, recordPayment, deletePayment, onPortalChange, onDeleted, orgSettings = {}, workspace = {}, onLogReceipt }) {
  const [showStatement, setShowStatement] = useState(false);
  if (showStatement) {
    return <CustomerStatementPage
      mode="chit"
      settings={orgSettings}
      chit={{ scheme, enrollment, payments, predefinedItem: item }}
      back={() => setShowStatement(false)}
    />;
  }
  const liftSection = item ? <div className="card spacer"><strong>Lift details</strong><div className="grid metrics"><Metric label="Manager commission" value={money(item.manager_commission)} /><Metric label="Bid amount" value={money(item.bid_amount)} /><Metric label="Lift date" value={formatChitDate(item.assigned_date)} /><Metric label="Lift amount" value={money(item.net_receivable)} color="green" /></div></div> : <p className="notice">This member has not been assigned a lift in this scheme.</p>;
  return <ChitMemberPage
    token={token} scheme={scheme} enrollment={enrollment} payments={payments}
    metrics={[["Lift month", item ? `Month ${item.month_number}` : "Not assigned", "blue"], ["Lift amount", item ? money(item.net_receivable) : "—", "gold"], ["EMI", item ? money(item.emi) : "—"]]}
    liftSection={liftSection}
    back={back} recordPayment={recordPayment} deletePayment={deletePayment}
    onPortalChange={onPortalChange} onDeleted={onDeleted} onStatement={() => setShowStatement(true)}
    orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt}
  />;
}
export function PredefinedBidSchemeDetails({ token, scheme, back, tab: routeTab = "overview", onTabChange, memberId = null, onMemberChange, onSchemeDeleted, orgSettings = {}, workspace = {}, onReceipt, onLogReceipt, canWrite = workspace?.role === "owner" }) {
  const [data, setData] = useState({ enrollments: [], predefinedSchedule: [], predefinedPayments: [] });
  // The open tab and member page come from the URL (/chit-fund/schemes/:schemeId/:tab, …/members/:memberId).
  const tab = ["overview", "schedule", "members", "payments"].includes(routeTab) ? routeTab : "overview";
  const setTab = next => onTabChange?.(next);
  const [paymentMonth, setPaymentMonth] = useState(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [assignItem, setAssignItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [payment, setPayment] = useState(null);
  const member = memberId ? data.enrollments.find(item => item.id === memberId) || null : null;
  const setMember = next => { const id = next?.id || null; if (id !== memberId) onMemberChange?.(id); };
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const refresh = () => loadChitSchemeDetails(token, scheme.id).then(payload => { setData(payload); setBusy(false); setError(""); }).catch(err => { setError(err.message || "Could not load predefined-bid details."); setBusy(false); });
  useEffect(() => {
    let ignore = false;
    loadChitSchemeDetails(token, scheme.id).then(payload => { if (!ignore) { setData(payload); setBusy(false); } }).catch(err => { if (!ignore) { setError(err.message || "Could not load predefined-bid details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [scheme.id, token]);
  const schedule = data.predefinedSchedule || [];
  const completed = schedule.filter(item => item.status === "completed");
  const current = schedule.find(item => item.status === "pending");
  const selectedPaymentMonth = paymentMonth ?? Number(current?.month_number || scheme.duration_months);
  const visiblePredefinedPayments = paymentsByMemberName(data.predefinedPayments.filter(item => Number(item.payment_month) === selectedPaymentMonth), data.enrollments);
  const usedEnrollmentIds = new Set(completed.map(item => item.enrollment_id));
  const nextTicket = nextAvailableTicket(data.enrollments, scheme.member_count);
  const openPredefinedPayment = item => {
    const owner = data.enrollments.find(row => row.id === item.enrollment_id);
    setPayment({ ...item, memberName: enrollmentName(owner), memberPhone: owner?.chit_members?.phone || "" });
  };
  const removePayment = async (id, reason) => {
    try { await deletePredefinedChitPayment(token, id, reason); await refresh(); }
    catch (err) { setError(err.message || "Could not delete payment."); throw err; }
  };
  const paymentModal = payment ? <PredefinedPaymentModal token={token} payment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} /> : null;
  const pagedMembers = usePagedList(data.enrollments, `${scheme.id}|${tab}|members`);
  const pagedPayments = usePagedList(visiblePredefinedPayments, `${scheme.id}|${selectedPaymentMonth}|payments`);
  if (member) {
    const assigned = completed.find(row => row.enrollment_id === member.id);
    return <><PredefinedChitMemberDetails token={token} scheme={scheme} enrollment={member} item={assigned} payments={memberPaymentsForEnrollment(data.predefinedPayments, member.id)} back={() => setMember(null)} recordPayment={canWrite ? openPredefinedPayment : null} deletePayment={canWrite ? removePayment : null} orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt} onPortalChange={canWrite ? async () => { const payload = await loadChitSchemeDetails(token, scheme.id); setData(payload); setMember(payload.enrollments.find(item => item.id === member.id) || member); } : null} onDeleted={canWrite ? async removed => { setMember(null); setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); } : null} />{paymentModal}</>;
  }
  return <ChitSchemeShell
    scheme={scheme}
    workspace={workspace}
    enrollments={data.enrollments}
    tabs={CHIT_SCHEME_TABS.predefined}
    tab={tab}
    onTabChange={setTab}
    back={back}
    canWrite={canWrite}
    onAddMember={() => setMemberOpen(true)}
    onSchemeDeleted={onSchemeDeleted}
    extra={null}
    token={token}
    error={error}
    notice={notice}
    busy={busy}
    overlays={<>
      {memberOpen && <ChitAddMemberModal token={token} scheme={scheme} nextTicket={nextTicket} close={() => setMemberOpen(false)} done={async () => { setMemberOpen(false); await refresh(); }} />}
      {assignItem && <PredefinedAssignModal token={token} scheme={scheme} item={assignItem} enrollments={data.enrollments} usedEnrollmentIds={usedEnrollmentIds} orgSettings={orgSettings} workspace={workspace} close={() => setAssignItem(null)} done={async toast => { setAssignItem(null); if (toast) setNotice(toast); await refresh(); }} />}
      {editItem && <PredefinedScheduleEditModal token={token} item={editItem} close={() => setEditItem(null)} done={async () => { setEditItem(null); await refresh(); }} />}
      {paymentModal}
    </>}
  >
    <>
      {tab === "overview" && <div className="grid metrics"><Metric label="Chit type" value="Fixed Predefined Bid" color="blue" /><Metric label="Chit value" value={money(scheme.chit_value)} color="gold" /><Metric label="Members" value={`${data.enrollments.length}/${scheme.member_count}`} /><Metric label="Duration" value={`${scheme.duration_months} months`} /><Metric label="Commission" value={`${scheme.predefined_manager_commission_percent}%`} /><Metric label="Current month" value={current ? `Month ${current.month_number}` : "Completed"} color="blue" /><Metric label="Current bid" value={current ? money(current.bid_amount) : "—"} color="gold" /><Metric label="Lift amount" value={current ? money(current.net_receivable) : "—"} color="green" /></div>}
      {tab === "members" && <div className="card"><ChitMembersToolbar scheme={scheme} enrollments={data.enrollments} onAddMember={canWrite ? () => setMemberOpen(true) : null} token={token} changed={refresh} /><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Lift Month</th><th>EMI</th><th>Bid Amount</th><th>Lift Amount</th><th>Payment Status</th><th>Portal</th><th></th></tr></thead><tbody>{pagedMembers.items.map(owner => { const item = completed.find(row => row.enrollment_id === owner.id); const payments = data.predefinedPayments.filter(row => row.enrollment_id === owner.id); const balance = payments.reduce((sum, row) => sum + Number(row.amount_due) - Number(row.amount_paid), 0); return <tr key={owner.id}><td>{owner.ticket_number}</td><td>{enrollmentName(owner)}<ChitStandingTag enrollment={owner} /></td><td>{item ? `Month ${item.month_number}` : "—"}</td><td>{item ? money(item.emi) : "—"}</td><td>{item ? money(item.bid_amount) : "—"}</td><td>{item ? money(item.net_receivable) : "—"}</td><td>{item ? (balance > 0 ? `${money(balance)} due` : "Paid") : "Not assigned"}</td><td>{enrollmentPortalId(owner) || "Not enabled"}</td><td><Button onClick={() => setMember(owner)}>View details</Button>{canWrite ? <ChitDeleteMemberControl token={token} scheme={scheme} enrollment={owner} onDeleted={async removed => { setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); }} /> : null}</td></tr>; })}</tbody></table><AccPager page={pagedMembers.page} pages={pagedMembers.pages} total={pagedMembers.total} from={pagedMembers.from} to={pagedMembers.to} onPage={pagedMembers.setPage} noun="members" />{!data.enrollments.length && <p className="small">No members in this scheme yet.</p>}</div></div>}
      {tab === "schedule" && <div className="card"><div className="toolbar"><strong>Schedule</strong><span className="small">{completed.length}/{schedule.length} finalized</span></div><div className="table spacer"><table><thead><tr><th>Month</th><th>EMI</th><th>COMM</th><th>Auction Amount</th><th>Bid Amount</th><th>Manager Commission</th><th>Lift Amount</th><th>Member</th><th>Status</th><th></th></tr></thead><tbody>{schedule.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>Month {item.month_number}</td><td>{money(item.emi)}</td><td>{money(item.comm_amount)}</td><td>{money(item.auction_amount)}</td><td>{money(item.bid_amount)}</td><td>{money(item.manager_commission)} ({item.manager_commission_percent}%)</td><td>{money(item.net_receivable)}</td><td>{owner ? `Ticket ${owner.ticket_number} · ${enrollmentName(owner)}` : "—"}</td><td>{chitScheduleStatusLabel(item.status)}</td><td>{canWrite && item.status === "pending" && <Button onClick={() => setEditItem(item)}>Edit</Button>}{canWrite && item.status === "pending" && scheme.status === "active" && <Button className="primary" onClick={() => setAssignItem(item)}>Lift Chit</Button>}</td></tr>; })}</tbody></table></div></div>}
      {tab === "payments" && <div className="card"><div className="toolbar"><strong>Payments — Month {selectedPaymentMonth}</strong><ChitPaymentMonthPicker duration={scheme.duration_months} value={selectedPaymentMonth} onChange={setPaymentMonth} /></div><div className="table spacer chit-member-payments"><table><thead><tr><th>Member</th><th>Ticket</th><th>Month</th><th>Due date</th><th>Payment date</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Mode</th><th>Status</th><th>Receipt</th><th></th></tr></thead><tbody>{pagedPayments.items.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>{owner?.ticket_number || "—"}</td><td>Month {item.payment_month}</td><td>{formatChitDate(item.due_date)}</td><td>{formatChitDate(item.paid_date)}</td><td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td className="red">{money(Math.max(0, Number(item.amount_due) - Number(item.amount_paid)))}</td><td>{item.payment_mode || "—"}</td><td><ChitPaymentStatus row={item} /></td><td><ChitReceiptCell source="chit_predefined" paymentRow={item} memberName={enrollmentName(owner)} memberPhone={owner?.chit_members?.phone || ""} scheme={scheme} orgSettings={orgSettings} workspace={workspace} token={token} onLogAction={onLogReceipt} /></td><td>{canWrite ? <Button onClick={() => openPredefinedPayment(item)}>{chitPaymentActionLabel(item.amount_paid)}</Button> : null}{Number(item.amount_paid) > 0 && <ChitDeletePaymentButton allowed={canWrite} memberName={enrollmentName(owner)} schemeName={scheme.name} amount={money(item.amount_paid)} paidDate={formatChitDate(item.paid_date)} mode={item.payment_mode} reference={item.payment_reference} onConfirm={reason => removePayment(item.id, reason)} />}</td></tr>; })}</tbody></table><AccPager page={pagedPayments.page} pages={pagedPayments.pages} total={pagedPayments.total} from={pagedPayments.from} to={pagedPayments.to} onPage={pagedPayments.setPage} noun="payments" />{!visiblePredefinedPayments.length && <p className="small spacer">No payments are scheduled for Month {selectedPaymentMonth}.</p>}</div></div>}
    </>
  </ChitSchemeShell>;
}
