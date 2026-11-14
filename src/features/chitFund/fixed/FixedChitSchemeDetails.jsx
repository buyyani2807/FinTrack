import { useEffect, useState } from "react";
import { deleteFixedChitPayment, loadChitSchemeDetails } from "../../../lib/financeRepository";
import { buildFixedLiftPayload } from "../../receipts/io/transactionConfirmations.js";
import { CustomerStatementPage } from "../../statements/CustomerStatementPage.jsx";
import { fixedChitScheduleDisplayPayment, resolveFixedManagerCommission } from "../model/fixedChit";
import { money, formatChitDate, enrollmentName, nextAvailableTicket } from "../model/chitFormat.js";
import { fireChitLiftWhatsApp } from "../io/chitNotifications.js";
import { Button } from "../../../components/ui.jsx";
import { ChitSchemeShell } from "../components/ChitSchemeChrome.jsx";
import { CHIT_SCHEME_TABS, chitSchemeTabIds, chitScheduleStatusLabel } from "../model/chitSchemeChrome.js";
import { ChitMemberPage } from "../components/ChitMemberPage.jsx";
import { ChitAddMemberModal } from "../components/ChitMemberManagement.jsx";
import { ChitSchemeMembersTable, ChitSchemeOverview, ChitSchemePaymentsTable, ChitSchemeReports, ChitSectionHead } from "../components/ChitSchemeSections.jsx";
import { FixedChitLiftModal, FixedChitPaymentModal } from "./FixedChitModals.jsx";

function FixedChitMemberDetails({ token, scheme, enrollment, lift, payments, back, toSchemes, recordPayment, deletePayment, onPortalChange, onDeleted, orgSettings = {}, workspace = {}, onLogReceipt }) {
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
  const resendConfirmation = async () => {
    setConfirmBusy(true); setConfirmNotice("");
    const toast = await fireChitLiftWhatsApp({
      token, settings: orgSettings, workspace, sourceId: lift.id, resend: true,
      payload: buildFixedLiftPayload({ scheme, lift, enrollment, liftDate: lift.lift_date, managerCommission }),
    });
    setConfirmNotice(toast || "WhatsApp confirmation opened.");
    setConfirmBusy(false);
  };
  const liftView = lift ? { month: lift.month_number, date: lift.lift_date, amount: lift.amount_paid_to_member ?? lift.lift_amount, details: [["Manager commission", money(managerCommission)], ["Monthly payment after lift", money(lift.monthly_payment)], ["Remaining months", lift.remaining_months ?? "—"], ["Total remaining payment", money(lift.total_remaining_payment)]] } : null;
  return <ChitMemberPage
    token={token} scheme={scheme} enrollment={enrollment} payments={payments} notice={confirmNotice}
    lift={liftView}
    typeMetrics={[["Monthly payment", lift ? money(lift.monthly_payment) : money(scheme.installment_amount)]]}
    extraActions={lift ? <Button disabled={confirmBusy} onClick={resendConfirmation}>{confirmBusy ? "Opening…" : "Resend WhatsApp confirmation"}</Button> : null}
    back={back} toSchemes={toSchemes} recordPayment={recordPayment} deletePayment={deletePayment}
    onPortalChange={onPortalChange} onDeleted={onDeleted} onStatement={() => setShowStatement(true)}
    orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt}
  />;
}
export function FixedChitSchemeDetails({ token, scheme, back, tab: routeTab = "overview", onTabChange, memberId = null, onMemberChange, onSchemeDeleted, orgSettings = {}, workspace = {}, onReceipt, onLogReceipt, canWrite = workspace?.role === "owner" }) {
  const [data, setData] = useState({ enrollments: [], fixedLifts: [], fixedPayments: [] });
  // The open tab and member page come from the URL (/chit-fund/schemes/:schemeId/:tab, …/members/:memberId).
  const tab = chitSchemeTabIds("fixed").includes(routeTab) ? routeTab : "overview";
  const setTab = next => onTabChange?.(next);
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
  const fixedCommission = resolveFixedManagerCommission({
    chitValue: scheme.chit_value,
    fixedCommissionAmount: scheme.fixed_commission_amount,
    commissionPercent: scheme.commission_percent,
    lifts: data.fixedLifts,
  });
  const monthlyManagerCommission = fixedCommission.amount;
  const pending = data.fixedLifts.find(item => item.status === "pending");
  const usedEnrollmentIds = new Set(completed.map(item => item.enrollment_id));
  const openFixedPayment = item => {
    const owner = data.enrollments.find(row => row.id === item.enrollment_id);
    setPayment({ ...item, memberName: enrollmentName(owner), memberPhone: owner?.chit_members?.phone || "" });
  };
  const removePayment = async (id, reason) => {
    try { await deleteFixedChitPayment(token, id, reason); await refresh(); }
    catch (err) { setError(err.message || "Could not delete payment."); throw err; }
  };
  const memberRemoved = async removed => { setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); };
  const liftAction = pending ? <Button className="primary" onClick={() => setLift(pending)}>Lift Chit — Month {pending.month_number}</Button> : null;
  if (member) {
    const memberLift = completed.find(item => item.enrollment_id === member.id);
    return <><FixedChitMemberDetails token={token} scheme={scheme} enrollment={member} lift={memberLift} payments={data.fixedPayments.filter(item => item.enrollment_id === member.id)} back={() => setMember(null)} toSchemes={back} recordPayment={canWrite ? openFixedPayment : null} deletePayment={canWrite ? removePayment : null} orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt} onPortalChange={canWrite ? async () => { const payload = await loadChitSchemeDetails(token, scheme.id); setData(payload); setMember(payload.enrollments.find(item => item.id === member.id) || member); } : null} onDeleted={canWrite ? async removed => { setMember(null); setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); } : null} />{payment && <FixedChitPaymentModal token={token} payment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} />}</>;
  }
  return <ChitSchemeShell
    scheme={scheme}
    workspace={workspace}
    enrollments={data.enrollments}
    tabs={CHIT_SCHEME_TABS.fixed}
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
      {canWrite && lift && <FixedChitLiftModal token={token} scheme={scheme} lift={lift} enrollments={data.enrollments} usedEnrollmentIds={usedEnrollmentIds} orgSettings={orgSettings} workspace={workspace} close={() => setLift(null)} done={async toast => { setLift(null); setNotice(toast || "Lift recorded."); await refresh(); }} />}
      {canWrite && payment && <FixedChitPaymentModal token={token} payment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); setNotice("Payment saved."); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} />}
    </>}
  >
    <>
      {tab === "overview" && <ChitSchemeOverview
        scheme={scheme}
        details={data}
        commissionText={fixedCommission.percent ? `${fixedCommission.percent}% (${money(fixedCommission.amount)})` : money(fixedCommission.amount)}
        typeTitle="Fixed lift terms"
        typeMetrics={[
          ["Initial lift amount", money(scheme.fixed_initial_lift_amount ?? data.fixedLifts[0]?.lift_amount ?? 0), "gold"],
          ["Monthly lift increment", money(scheme.fixed_monthly_increment)],
          ["Monthly payment after lift", money(Number(scheme.installment_amount || 0) + Number(scheme.fixed_monthly_increment || 0))],
        ]}
      />}
      {tab === "members" && <ChitSchemeMembersTable
        token={token} scheme={scheme} details={data} canWrite={canWrite}
        onAddMember={() => setMemberOpen(true)} onView={setMember} onDeleted={memberRemoved} changed={refresh}
        extraColumns={[
          { header: "Monthly payment", numeric: true, cell: item => { const row = completed.find(entry => entry.enrollment_id === item.id); return row ? money(row.monthly_payment) : "—"; } },
          { header: "Remaining months", numeric: true, cell: item => completed.find(entry => entry.enrollment_id === item.id)?.remaining_months ?? "—" },
        ]}
      />}
      {tab === "schedule" && <div className="card"><ChitSectionHead title="Lift schedule" note={`${completed.length}/${scheme.duration_months} months lifted. Lift amounts are fixed when the scheme is created.`}>{canWrite && scheme.status === "active" && liftAction}</ChitSectionHead><div className="table spacer"><table><thead><tr><th>Month</th><th>Lift date</th><th>Lift member</th><th className="num">Lift amount</th><th className="num">Manager commission</th><th className="num">Monthly payment</th><th>Status</th><th><span className="ft-sr-only">Actions</span></th></tr></thead><tbody>{data.fixedLifts.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); return <tr key={item.id}><td>Month {item.month_number}</td><td>{formatChitDate(item.lift_date)}</td><td>{owner ? `Ticket ${owner.ticket_number} · ${enrollmentName(owner)}` : "—"}</td><td className="num">{money(item.lift_amount)}</td><td className="num">{money(monthlyManagerCommission)}</td><td className="num">{money(fixedChitScheduleDisplayPayment(item, scheme.installment_amount))}</td><td><span className={`badge ${item.status === "completed" ? "completed" : ""}`}>{item.status === "pending" && item.id === pending?.id ? "Next" : chitScheduleStatusLabel(item.status)}</span></td><td className="chit-row-actions">{canWrite && item.status === "pending" && scheme.status === "active" && <Button onClick={() => setLift(item)}>Lift Chit</Button>}</td></tr>; })}</tbody></table>{!data.fixedLifts.length && <p className="small spacer">The lift schedule is created when the scheme is activated.</p>}</div></div>}
      {tab === "payments" && <ChitSchemePaymentsTable token={token} scheme={scheme} details={data} canWrite={canWrite} onRecord={openFixedPayment} onDelete={removePayment} orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt} emptyNote={month => `No payments are scheduled for Month ${month}.`} />}
      {tab === "reports" && <ChitSchemeReports scheme={scheme} details={data} />}
    </>
  </ChitSchemeShell>;
}
