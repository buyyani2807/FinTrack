import { useEffect, useState } from "react";
import { deleteChitInstallmentPayment, loadChitSchemeDetails } from "../../../lib/financeRepository";
import { CustomerStatementPage } from "../../statements/CustomerStatementPage.jsx";
import { cycleNumberInRange, latestInRangeCycle, nextOpenChitMonth, winsForEnrollment } from "../model/liveBidding";
import { memberPaymentsForEnrollment } from "../model/memberPayments";
import {
  money,
  formatChitDate,
  enrollmentName,
  nextAvailableTicket,
} from "../model/chitFormat.js";
import { Button, Metric } from "../../../components/ui.jsx";
import { ChitSchemeShell } from "../components/ChitSchemeChrome.jsx";
import { CHIT_SCHEME_TABS, chitSchemeTabIds } from "../model/chitSchemeChrome.js";
import { chitLiftTimeline } from "../model/chitSchemeView.js";
import { ChitMemberPage } from "../components/ChitMemberPage.jsx";
import { ChitAddMemberModal } from "../components/ChitMemberManagement.jsx";
import { ChitSchemeMembersTable, ChitSchemeOverview, ChitSchemePaymentsTable, ChitSchemeReports, ChitSectionHead } from "../components/ChitSchemeSections.jsx";
import { ChitBidModal, ChitPaymentModal } from "./AuctionModals.jsx";
import { ChitLiveBidding } from "./ChitLiveBidding.jsx";

function ChitMemberDetails({ token, scheme, enrollment, cycles, bids, installments = [], back, toSchemes, recordPayment, deletePayment, onPortalChange, onDeleted, orgSettings = {}, workspace = {}, onLogReceipt }) {
  const wins = winsForEnrollment(cycles, bids, enrollment.id, scheme.chit_value);
  const [showStatement, setShowStatement] = useState(false);
  const payments = memberPaymentsForEnrollment(installments, enrollment.id).map(item => {
    const cycle = cycles.find(row => row.id === item.cycle_id);
    return { ...item, payment_month: item.payment_month || cycle?.cycle_number, cycle_number: cycle?.cycle_number };
  });
  if (showStatement) {
    return <CustomerStatementPage
      mode="chit"
      settings={orgSettings}
      chit={{ scheme, enrollment, payments, cycles, bids }}
      back={() => setShowStatement(false)}
    />;
  }
  const win = wins[0];
  const lift = win ? { month: win.month, date: win.bidDate, amount: win.payoutAmount, details: [["Discount bid", money(win.discountBid)]] } : null;
  return <ChitMemberPage
    token={token} scheme={scheme} enrollment={enrollment} payments={payments} liveBidding
    lift={lift}
    back={back} toSchemes={toSchemes} recordPayment={recordPayment} deletePayment={deletePayment}
    onPortalChange={onPortalChange} onDeleted={onDeleted} onStatement={() => setShowStatement(true)}
    orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt}
  />;
}
export function AuctionChitSchemeDetails({ token, scheme, back, tab: routeTab = "overview", onTabChange, memberId = null, onMemberChange, onSchemeDeleted, orgSettings = {}, workspace = {}, onReceipt, onLogReceipt, canWrite = workspace?.role === "owner" }) {
  const [data, setData] = useState({ enrollments: [], cycles: [], bids: [], installments: [] });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The open tab and member page come from the URL (/chit-fund/schemes/:schemeId/:tab, …/members/:memberId).
  const tab = chitSchemeTabIds("auction").includes(routeTab) ? routeTab : "overview";
  const setTab = next => onTabChange?.(next);
  const member = memberId ? data.enrollments.find(item => item.id === memberId) || null : null;
  const setMember = next => { const id = next?.id || null; if (id !== memberId) onMemberChange?.(id); };
  const [payment, setPayment] = useState(null);
  const [bidMonth, setBidMonth] = useState(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [finalized, setFinalized] = useState(null);
  const refresh = () => loadChitSchemeDetails(token, scheme.id).then(payload => { setData(payload); setError(""); setBusy(false); }).catch(err => { setError(err.message || "Could not load scheme details."); setBusy(false); });
  useEffect(() => {
    let ignore = false;
    loadChitSchemeDetails(token, scheme.id).then(payload => { if (!ignore) { setData(payload); setError(""); setBusy(false); } }).catch(err => { if (!ignore) { setError(err.message || "Could not load scheme details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [scheme.id, token]);
  const current = latestInRangeCycle(data.cycles, scheme.duration_months);
  const nextMonth = nextOpenChitMonth(data.cycles, scheme.duration_months);
  const eligibleForManualBid = data.enrollments.filter(item => !data.bids.some(bid => bid.enrollment_id === item.id && bid.status === "winner"));
  const nextTicket = nextAvailableTicket(data.enrollments, scheme.member_count);
  const openAuctionPayment = item => {
    const owner = data.enrollments.find(row => row.id === item.enrollment_id);
    setPayment({
      ...item,
      memberName: enrollmentName(owner),
      memberPhone: owner?.chit_members?.phone || "",
    });
  };
  const remove = async (id, reason) => {
    try { await deleteChitInstallmentPayment(token, id, reason); await refresh(); }
    catch (err) { setError(err.message || "Could not delete payment."); throw err; }
  };
  const memberRemoved = async removed => { setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); };
  const commissionAmount = Number(scheme.chit_value || 0) * Number(scheme.commission_percent || 0) / 100;
  // Months 1…duration in order (pending ones included), then any month recorded outside the scheme length.
  const timeline = chitLiftTimeline(scheme, data);
  const outside = data.cycles.filter(cycle => !cycleNumberInRange(cycle.cycle_number, scheme.duration_months));
  const liftAction = nextMonth && eligibleForManualBid.length ? <Button className="primary" onClick={() => setBidMonth(nextMonth)}>Lift Chit — Month {nextMonth}</Button> : null;
  if (member) return <><ChitMemberDetails token={token} scheme={scheme} enrollment={member} cycles={data.cycles} bids={data.bids} installments={data.installments} back={() => setMember(null)} toSchemes={back} recordPayment={canWrite ? openAuctionPayment : null} deletePayment={canWrite ? remove : null} orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt} onPortalChange={canWrite ? async () => { const details = await loadChitSchemeDetails(token, scheme.id); setData(details); setMember(details.enrollments.find(item => item.id === member.id) || member); } : null} onDeleted={canWrite ? async removed => { setMember(null); setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); } : null} />{payment && canWrite && <ChitPaymentModal token={token} installment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} />}</>;
  return <ChitSchemeShell
    scheme={scheme}
    workspace={workspace}
    enrollments={data.enrollments}
    tabs={CHIT_SCHEME_TABS.auction}
    tab={tab}
    onTabChange={setTab}
    back={back}
    canWrite={canWrite}
    onAddMember={() => setMemberOpen(true)}
    liftAction={liftAction}
    onSchemeDeleted={onSchemeDeleted}
    extra={canWrite && scheme.status === "active" && tab !== "live" ? <Button onClick={() => setTab("live")}>Live bidding</Button> : null}
    token={token}
    error={error}
    notice={notice}
    onClearError={() => setError("")}
    onClearNotice={() => setNotice("")}
    busy={busy}
    overlays={<>
      {canWrite && memberOpen && <ChitAddMemberModal token={token} scheme={scheme} nextTicket={nextTicket} close={() => setMemberOpen(false)} done={async () => { setMemberOpen(false); setNotice("Member added."); await refresh(); }} />}
      {canWrite && bidMonth && <ChitBidModal token={token} scheme={scheme} enrollments={eligibleForManualBid} nextMonth={bidMonth} orgSettings={orgSettings} workspace={workspace} close={() => setBidMonth(null)} done={async toast => { setBidMonth(null); setNotice(toast || "Lift recorded."); await refresh(); }} />}
      {canWrite && payment && <ChitPaymentModal token={token} installment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); setNotice("Payment saved."); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} />}
    </>}
  >
    {<>
      {tab === "overview" && <ChitSchemeOverview
        scheme={scheme}
        details={data}
        commissionText={`${Number(scheme.commission_percent || 0)}% (${money(commissionAmount)})`}
        typeTitle={current ? `Auction result — Month ${current.cycle_number}` : "Auction result"}
        typeMetrics={current ? [
          ["Lift amount", money(current.winning_bid_amount), "gold"],
          ["Discount bid", money(current.discount_amount), "blue"],
          ["Commission", money(current.commission_amount)],
          ["Distributable", money(current.distributable_amount)],
          ["Dividend / member", money(current.dividend_per_member), "green"],
        ] : [["Status", "No month lifted yet"]]}
        typeNote={<p className="small spacer">Live bids start above the {money(commissionAmount)} commission and go up to 30% of the chit value. The highest discount bid wins; the lift amount is the chit value minus that bid, within the scheme's payout limits of {Number(scheme.min_bid_percent)}–{Number(scheme.max_bid_percent)}%.</p>}
      />}
      {tab === "members" && <ChitSchemeMembersTable
        token={token} scheme={scheme} details={data} canWrite={canWrite}
        onAddMember={() => setMemberOpen(true)} onView={setMember} onDeleted={memberRemoved} changed={refresh}
        extraColumns={[{ header: "Discount bid", numeric: true, cell: item => { const win = winsForEnrollment(data.cycles, data.bids, item.id, scheme.chit_value)[0]; return win ? money(win.discountBid) : "—"; } }]}
      />}
      {tab === "bids" && <div className="card"><ChitSectionHead title="Bids & lifts" note="Each month is stored separately. Recording a month does not change earlier months.">{canWrite && liftAction}</ChitSectionHead><div className="table spacer"><table><thead><tr><th>Month</th><th>Lift date</th><th>Lift member</th><th className="num">Lift amount</th><th className="num">Discount bid</th><th className="num">Commission</th><th className="num">Dividend / member</th><th>Status</th><th><span className="ft-sr-only">Actions</span></th></tr></thead><tbody>{timeline.map(row => { const cycle = row.raw; const won = cycle ? data.enrollments.find(item => item.id === cycle.winning_enrollment_id) : null; return <tr key={row.id}><td>Month {row.month}</td><td>{cycle ? formatChitDate(cycle.cycle_date) : "—"}</td><td>{won ? `Ticket ${won.ticket_number} · ${enrollmentName(won)}` : "—"}</td><td className="num">{cycle ? money(cycle.winning_bid_amount) : "—"}</td><td className="num">{cycle ? money(cycle.discount_amount) : "—"}</td><td className="num">{cycle ? money(cycle.commission_amount) : "—"}</td><td className="num">{cycle ? money(cycle.dividend_per_member) : "—"}</td><td><span className={`badge ${cycle ? "completed" : ""}`}>{cycle ? "Lifted" : row.month === nextMonth ? "Next" : "Pending"}</span></td><td className="chit-row-actions">{canWrite && !cycle && scheme.status === "active" && eligibleForManualBid.length > 0 && <Button onClick={() => setBidMonth(row.month)}>Lift Chit</Button>}</td></tr>; })}{outside.map(cycle => { const won = data.enrollments.find(item => item.id === cycle.winning_enrollment_id); return <tr key={cycle.id}><td>Month {cycle.cycle_number} (outside scheme length)</td><td>{formatChitDate(cycle.cycle_date)}</td><td>{won ? `Ticket ${won.ticket_number} · ${enrollmentName(won)}` : "—"}</td><td className="num">{money(cycle.winning_bid_amount)}</td><td className="num">{money(cycle.discount_amount)}</td><td className="num">{money(cycle.commission_amount)}</td><td className="num">{money(cycle.dividend_per_member)}</td><td><span className="badge completed">Lifted</span></td><td /></tr>; })}</tbody></table>{!timeline.length && !outside.length && <p className="small spacer">No months in this scheme.</p>}</div></div>}
      {tab === "payments" && <ChitSchemePaymentsTable token={token} scheme={scheme} details={data} canWrite={canWrite} onRecord={openAuctionPayment} onDelete={remove} orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt} emptyNote={month => `No installments for Month ${month} yet. They are created when that month's lift is recorded.`} />}
      {tab === "dividends" && <div className="card"><ChitSectionHead title="Dividends" note="discount = chit value − lift amount · commission = chit value × commission % · distributable = discount − commission · dividend = distributable ÷ members" /><div className="table spacer"><table><thead><tr><th>Month</th><th className="num">Lift amount</th><th className="num">Discount</th><th className="num">Commission</th><th className="num">Distributable</th><th className="num">Dividend / member</th></tr></thead><tbody>{data.cycles.map(cycle => <tr key={cycle.id}><td>Month {cycle.cycle_number}</td><td className="num">{money(cycle.winning_bid_amount)}</td><td className="num">{money(cycle.discount_amount)}</td><td className="num">{money(cycle.commission_amount)}</td><td className="num">{money(cycle.distributable_amount)}</td><td className="num">{money(cycle.dividend_per_member)}</td></tr>)}</tbody></table>{!data.cycles.length && <p className="small spacer">No dividend records yet. Dividends appear once a month's lift is recorded.</p>}</div></div>}
      {tab === "live" && <ChitLiveBidding token={token} scheme={scheme} data={data} orgSettings={orgSettings} workspace={workspace} canWrite={canWrite} onFinalized={async toast => { const details = await loadChitSchemeDetails(token, scheme.id); setData(details); const last = latestInRangeCycle(details.cycles, scheme.duration_months); if (last) setFinalized(last); if (toast) setNotice(toast); }} />}
      {tab === "reports" && <ChitSchemeReports scheme={scheme} details={data} />}
      {finalized && tab === "live" && <div className="card spacer"><strong>Latest finalized bid — Month {finalized.cycle_number}</strong><div className="grid metrics"><Metric label="Lift amount" value={money(finalized.winning_bid_amount)} color="gold" /><Metric label="Discount" value={money(finalized.discount_amount)} color="blue" /><Metric label="Commission" value={money(finalized.commission_amount)} /><Metric label="Distributable" value={money(finalized.distributable_amount)} /><Metric label="Dividend / member" value={money(finalized.dividend_per_member)} color="green" /></div></div>}
    </>}
  </ChitSchemeShell>;
}
