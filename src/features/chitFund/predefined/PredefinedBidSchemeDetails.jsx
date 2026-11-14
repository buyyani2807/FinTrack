import { useEffect, useState } from "react";
import { deletePredefinedChitPayment, loadChitSchemeDetails } from "../../../lib/financeRepository";
import { CustomerStatementPage } from "../../statements/CustomerStatementPage.jsx";
import { memberPaymentsForEnrollment } from "../model/memberPayments";
import { money, formatChitDate, enrollmentName, nextAvailableTicket } from "../model/chitFormat.js";
import { Button } from "../../../components/ui.jsx";
import { ChitSchemeShell } from "../components/ChitSchemeChrome.jsx";
import { CHIT_SCHEME_TABS, chitSchemeTabIds, chitScheduleStatusLabel } from "../model/chitSchemeChrome.js";
import { ChitMemberPage } from "../components/ChitMemberPage.jsx";
import { ChitAddMemberModal } from "../components/ChitMemberManagement.jsx";
import { ChitSchemeMembersTable, ChitSchemeOverview, ChitSchemePaymentsTable, ChitSchemeReports, ChitSectionHead } from "../components/ChitSchemeSections.jsx";
import { PredefinedAssignModal, PredefinedScheduleEditModal, PredefinedPaymentModal } from "./PredefinedChitModals.jsx";

function PredefinedChitMemberDetails({ token, scheme, enrollment, item, payments, back, toSchemes, recordPayment, deletePayment, onPortalChange, onDeleted, orgSettings = {}, workspace = {}, onLogReceipt }) {
  const [showStatement, setShowStatement] = useState(false);
  if (showStatement) {
    return <CustomerStatementPage
      mode="chit"
      settings={orgSettings}
      chit={{ scheme, enrollment, payments, predefinedItem: item }}
      back={() => setShowStatement(false)}
    />;
  }
  const lift = item ? { month: item.month_number, date: item.assigned_date, amount: item.net_receivable, details: [["Bid amount", money(item.bid_amount)], ["Manager commission", money(item.manager_commission)]] } : null;
  return <ChitMemberPage
    token={token} scheme={scheme} enrollment={enrollment} payments={payments}
    lift={lift}
    typeMetrics={[["EMI", item ? money(item.emi) : "—"]]}
    back={back} toSchemes={toSchemes} recordPayment={recordPayment} deletePayment={deletePayment}
    onPortalChange={onPortalChange} onDeleted={onDeleted} onStatement={() => setShowStatement(true)}
    orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt}
  />;
}
export function PredefinedBidSchemeDetails({ token, scheme, back, tab: routeTab = "overview", onTabChange, memberId = null, onMemberChange, onSchemeDeleted, orgSettings = {}, workspace = {}, onReceipt, onLogReceipt, canWrite = workspace?.role === "owner" }) {
  const [data, setData] = useState({ enrollments: [], predefinedSchedule: [], predefinedPayments: [] });
  // The open tab and member page come from the URL (/chit-fund/schemes/:schemeId/:tab, …/members/:memberId).
  const tab = chitSchemeTabIds("predefined").includes(routeTab) ? routeTab : "overview";
  const setTab = next => onTabChange?.(next);
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
  const memberRemoved = async removed => { setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); };
  const paymentModal = canWrite && payment ? <PredefinedPaymentModal token={token} payment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); setNotice("Payment saved."); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} /> : null;
  const liftAction = current ? <Button className="primary" onClick={() => setAssignItem(current)}>Lift Chit — Month {current.month_number}</Button> : null;
  if (member) {
    const assigned = completed.find(row => row.enrollment_id === member.id);
    return <><PredefinedChitMemberDetails token={token} scheme={scheme} enrollment={member} item={assigned} payments={memberPaymentsForEnrollment(data.predefinedPayments, member.id)} back={() => setMember(null)} toSchemes={back} recordPayment={canWrite ? openPredefinedPayment : null} deletePayment={canWrite ? removePayment : null} orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt} onPortalChange={canWrite ? async () => { const payload = await loadChitSchemeDetails(token, scheme.id); setData(payload); setMember(payload.enrollments.find(item => item.id === member.id) || member); } : null} onDeleted={canWrite ? async removed => { setMember(null); setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); } : null} />{paymentModal}</>;
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
    liftAction={liftAction}
    onSchemeDeleted={onSchemeDeleted}
    extra={null}
    token={token}
    error={error}
    notice={notice}
    onClearError={() => setError("")}
    onClearNotice={() => setNotice("")}
    busy={busy}
    overlays={<>
      {canWrite && memberOpen && <ChitAddMemberModal token={token} scheme={scheme} nextTicket={nextTicket} close={() => setMemberOpen(false)} done={async () => { setMemberOpen(false); setNotice("Member added."); await refresh(); }} />}
      {canWrite && assignItem && <PredefinedAssignModal token={token} scheme={scheme} item={assignItem} enrollments={data.enrollments} usedEnrollmentIds={usedEnrollmentIds} orgSettings={orgSettings} workspace={workspace} close={() => setAssignItem(null)} done={async toast => { setAssignItem(null); setNotice(toast || "Lift recorded."); await refresh(); }} />}
      {canWrite && editItem && <PredefinedScheduleEditModal token={token} item={editItem} close={() => setEditItem(null)} done={async () => { setEditItem(null); setNotice(`Month ${editItem.month_number} updated.`); await refresh(); }} />}
      {paymentModal}
    </>}
  >
    <>
      {tab === "overview" && <ChitSchemeOverview
        scheme={scheme}
        details={data}
        commissionText={`${Number(scheme.predefined_manager_commission_percent || 0)}% (${money(Number(scheme.chit_value || 0) * Number(scheme.predefined_manager_commission_percent || 0) / 100)})`}
        typeTitle={current ? `Scheduled bid — Month ${current.month_number}` : "Scheduled bid"}
        typeMetrics={current ? [
          ["EMI", money(current.emi)],
          ["Bid amount", money(current.bid_amount), "gold"],
          ["Manager commission", money(current.manager_commission)],
          ["Lift amount", money(current.net_receivable), "green"],
        ] : [["Status", "All months lifted"]]}
        typeNote={<p className="small spacer">Every month is generated when the scheme is created. Lift amount = bid amount − manager commission. Pending months can be edited before they are lifted.</p>}
      />}
      {tab === "members" && <ChitSchemeMembersTable
        token={token} scheme={scheme} details={data} canWrite={canWrite}
        onAddMember={() => setMemberOpen(true)} onView={setMember} onDeleted={memberRemoved} changed={refresh}
        extraColumns={[
          { header: "EMI", numeric: true, cell: owner => { const row = completed.find(entry => entry.enrollment_id === owner.id); return row ? money(row.emi) : "—"; } },
          { header: "Bid amount", numeric: true, cell: owner => { const row = completed.find(entry => entry.enrollment_id === owner.id); return row ? money(row.bid_amount) : "—"; } },
        ]}
      />}
      {tab === "schedule" && <div className="card"><ChitSectionHead title="Lift schedule" note={`${completed.length}/${schedule.length} months lifted. Lift amount = bid amount − manager commission.`}>{canWrite && scheme.status === "active" && liftAction}</ChitSectionHead><div className="table spacer"><table><thead><tr><th>Month</th><th>Lift date</th><th>Lift member</th><th className="num">EMI</th><th className="num">COMM</th><th className="num">Auction amount</th><th className="num">Bid amount</th><th className="num">Manager commission</th><th className="num">Lift amount</th><th>Status</th><th><span className="ft-sr-only">Actions</span></th></tr></thead><tbody>{schedule.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>Month {item.month_number}</td><td>{formatChitDate(item.assigned_date)}</td><td>{owner ? `Ticket ${owner.ticket_number} · ${enrollmentName(owner)}` : "—"}</td><td className="num">{money(item.emi)}</td><td className="num">{money(item.comm_amount)}</td><td className="num">{money(item.auction_amount)}</td><td className="num">{money(item.bid_amount)}</td><td className="num">{money(item.manager_commission)} ({item.manager_commission_percent}%)</td><td className="num">{money(item.net_receivable)}</td><td><span className={`badge ${item.status === "completed" ? "completed" : ""}`}>{item.status === "pending" && item.id === current?.id ? "Next" : chitScheduleStatusLabel(item.status)}</span></td><td className="chit-row-actions">{canWrite && item.status === "pending" && <Button onClick={() => setEditItem(item)}>Edit</Button>}{canWrite && item.status === "pending" && scheme.status === "active" && <Button onClick={() => setAssignItem(item)}>Lift Chit</Button>}</td></tr>; })}</tbody></table>{!schedule.length && <p className="small spacer">No schedule months found for this scheme.</p>}</div></div>}
      {tab === "payments" && <ChitSchemePaymentsTable token={token} scheme={scheme} details={data} canWrite={canWrite} onRecord={openPredefinedPayment} onDelete={removePayment} orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt} emptyNote={month => `No payments are scheduled for Month ${month}.`} />}
      {tab === "reports" && <ChitSchemeReports scheme={scheme} details={data} />}
    </>
  </ChitSchemeShell>;
}
