import { useEffect, useState } from "react";
import { deleteChitInstallmentPayment, loadChitSchemeDetails } from "../../../lib/financeRepository";
import { CustomerStatementPage } from "../../statements/CustomerStatementPage.jsx";
import { CreditScoreCard } from "../../creditScore/CreditScoreCard.jsx";
import { enrollmentPortalId, winsForEnrollment } from "../model/liveBidding";
import { chitPaymentOutstanding, filterPaymentsForMonth, memberPaymentsForEnrollment } from "../model/memberPayments";
import {
  money,
  formatChitDate,
  schemeStatusLabel,
  enrollmentName,
  nextAvailableTicket,
  paymentsByMemberName,
  latestCycle,
} from "../model/chitFormat.js";
import { Button, Metric } from "../../../components/ui.jsx";
import { ChitDeletePaymentButton, ChitDeleteMemberControl, ChitSchemeHeaderActions } from "../components/ChitAdminControls.jsx";
import { ChitPaymentStatus, ChitMemberPaymentHistory, ChitPortalAccess, ChitPaymentMonthPicker } from "../components/ChitMemberParts.jsx";
import { ChitAddMemberModal, ChitMembersToolbar } from "../components/ChitMemberManagement.jsx";
import { ChitBidModal, ChitPaymentModal } from "./AuctionModals.jsx";
import { ChitLiveBidding } from "./ChitLiveBidding.jsx";

function ChitMemberDetails({ token, scheme, enrollment, cycles, bids, installments = [], back, onPortalChange, onDeleted, orgSettings = {} }) {
  const wins = winsForEnrollment(cycles, bids, enrollment.id, scheme.chit_value);
  const portalId = enrollmentPortalId(enrollment);
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
  return <main className="shell"><div className="toolbar"><div><Button onClick={back}>← Members</Button><h1 className="title spacer">{enrollmentName(enrollment)}</h1><p className="copy">{scheme.name} · Ticket {enrollment.ticket_number} · User ID: {portalId || "Not enabled"}</p></div><div className="row"><Button onClick={() => setShowStatement(true)}>Customer Statement</Button><ChitPortalAccess token={token} enrollment={enrollment} liveBidding onChange={onPortalChange} /><ChitDeleteMemberControl token={token} scheme={scheme} enrollment={enrollment} onDeleted={onDeleted} /></div></div><div className="grid metrics"><Metric label="Ticket" value={enrollment.ticket_number} color="blue" /><Metric label="Phone" value={enrollment.chit_members?.phone || "—"} /><Metric label="Bid winner" value={wins.length ? "Yes" : "No"} color={wins.length ? "green" : ""} /><Metric label="Outstanding" value={money(chitPaymentOutstanding(payments))} color="red" /><Metric label="User ID" value={portalId || "Not enabled"} color={portalId ? "gold" : ""} /></div><CreditScoreCard chitPayments={payments} accountLabel="chit" />{portalId && <p className="notice">Share this User ID with the member. Use Reset PIN to set the PIN they will use on Chit customer login, then share both privately.</p>}{wins.length ? <><div className="grid metrics"><Metric label="Winning month" value={`Month ${wins[0].month}`} color="gold" /><Metric label="Discount bid" value={money(wins[0].discountBid)} color="blue" /><Metric label="Payout (winner receives)" value={money(wins[0].payoutAmount)} color="gold" /><Metric label="Bid date" value={formatChitDate(wins[0].bidDate)} /></div><div className="card spacer"><strong>Bid history</strong><div className="table spacer"><table><thead><tr><th>Month</th><th>Discount bid</th><th>Payout</th><th>Bid date</th><th>Status</th></tr></thead><tbody>{wins.map(win => <tr key={win.month}><td>Month {win.month}</td><td>{money(win.discountBid)}</td><td>{money(win.payoutAmount)}</td><td>{formatChitDate(win.bidDate)}</td><td>{win.status}</td></tr>)}</tbody></table></div></div></> : <p className="notice">Bid Winner: No. This member has not won a monthly bid in this scheme.</p>}<ChitMemberPaymentHistory title="Payment history" rows={payments} empty="Installments appear after a monthly bid is recorded." /><div className="card spacer"><strong>Member details</strong><p className="small spacer">{enrollment.chit_members?.address || "Address not added"}</p><p className="small">Guarantor: {enrollment.guarantor_name} · {enrollment.guarantor_phone}</p></div></main>;
}
export function AuctionChitSchemeDetails({ token, scheme, back, onSchemeDeleted, orgSettings = {}, workspace = {}, onReceipt }) {
  const [data, setData] = useState({ enrollments: [], cycles: [], bids: [], installments: [] });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("overview");
  const [member, setMember] = useState(null);
  const [payment, setPayment] = useState(null);
  const [paymentMonth, setPaymentMonth] = useState(null);
  const [bidOpen, setBidOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [finalized, setFinalized] = useState(null);
  const refresh = () => loadChitSchemeDetails(token, scheme.id).then(payload => { setData(payload); setError(""); setBusy(false); }).catch(err => { setError(err.message || "Could not load scheme details."); setBusy(false); });
  useEffect(() => {
    let ignore = false;
    loadChitSchemeDetails(token, scheme.id).then(payload => { if (!ignore) { setData(payload); setError(""); setBusy(false); } }).catch(err => { if (!ignore) { setError(err.message || "Could not load scheme details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [scheme.id, token]);
  const current = latestCycle(data.cycles);
  const winner = data.enrollments.find(item => item.id === current?.winning_enrollment_id);
  const eligibleForManualBid = data.enrollments.filter(item => !data.bids.some(bid => bid.enrollment_id === item.id && bid.status === "winner"));
  const nextTicket = nextAvailableTicket(data.enrollments, scheme.member_count);
  const selectedPaymentMonth = paymentMonth ?? Number(current?.cycle_number || 1);
  const visibleAuctionPayments = paymentsByMemberName(filterPaymentsForMonth(data.installments, selectedPaymentMonth, data.cycles), data.enrollments, data.cycles);
  const openAuctionPayment = item => {
    const owner = data.enrollments.find(row => row.id === item.enrollment_id);
    setPayment({
      ...item,
      memberName: enrollmentName(owner),
      memberPhone: owner?.chit_members?.phone || "",
    });
  };
  const calc = current ? {
    winningBid: current.winning_bid_amount,
    discount: current.discount_amount,
    commission: current.commission_amount,
    distributable: current.distributable_amount,
    dividend: current.dividend_per_member,
  } : null;
  const remove = async id => {
    try { await deleteChitInstallmentPayment(token, id); await refresh(); }
    catch (err) { setError(err.message || "Could not delete payment."); throw err; }
  };
  if (member) return <ChitMemberDetails token={token} scheme={scheme} enrollment={member} cycles={data.cycles} bids={data.bids} installments={data.installments} back={() => setMember(null)} orgSettings={orgSettings} onPortalChange={async () => { const details = await loadChitSchemeDetails(token, scheme.id); setData(details); setMember(details.enrollments.find(item => item.id === member.id) || member); }} onDeleted={async removed => { setMember(null); setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); }} />;
  return <main className="shell">
    <div className="toolbar"><div><Button onClick={back}>← Schemes</Button><h1 className="title spacer">{scheme.name}</h1><p className="copy">{scheme.duration_months} months · {data.enrollments.length}/{scheme.member_count} members · {schemeStatusLabel(scheme.status)}</p></div>
      <ChitSchemeHeaderActions token={token} scheme={scheme} memberCount={data.enrollments.length} onAddMember={() => setMemberOpen(true)} onSchemeDeleted={onSchemeDeleted} extra={scheme.status === "active" ? <Button className="primary" onClick={() => setTab("live")}>Start live bidding</Button> : null} />
    </div>
    <div className="tabs spacer">
      {[["overview", "Overview"], ["members", "Members"], ["bids", "Monthly Bids"], ["payments", "Payments"], ["dividends", "Dividends"], ["live", "Live Bidding"]].map(([id, label]) => <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</Button>)}
    </div>
    {error && <p className="red small">{error}</p>}
    {notice && <p className="green small">{notice}</p>}
    {busy ? <p className="small spacer">Loading scheme details…</p> : <>
      {tab === "overview" && <><div className="grid metrics"><Metric label="Chit value" value={money(scheme.chit_value)} color="gold" /><Metric label="Monthly installment" value={money(scheme.installment_amount)} /><Metric label="Current month" value={current ? `Month ${current.cycle_number}` : "Not started"} color="blue" /><Metric label="Latest bid" value={current ? money(current.winning_bid_amount) : "—"} color="gold" /><Metric label="Latest winner" value={winner ? enrollmentName(winner) : "—"} color="green" /></div>{calc && <div className="grid metrics"><Metric label="Winning bid" value={money(calc.winningBid)} color="gold" /><Metric label="Discount" value={money(calc.discount)} color="blue" /><Metric label="Commission" value={money(calc.commission)} /><Metric label="Distributable" value={money(calc.distributable)} /><Metric label="Dividend / member" value={money(calc.dividend)} color="green" /></div>}</>}
      {tab === "members" && <div className="card"><ChitMembersToolbar scheme={scheme} enrollments={data.enrollments} onAddMember={() => setMemberOpen(true)} token={token} changed={refresh} /><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Phone</th><th>Bid winner</th><th>Portal</th><th></th></tr></thead><tbody>{data.enrollments.map(item => { const wins = winsForEnrollment(data.cycles, data.bids, item.id, scheme.chit_value); return <tr key={item.id}><td>{item.ticket_number}</td><td>{enrollmentName(item)}</td><td>{item.chit_members?.phone || "—"}</td><td>{wins.length ? `Yes · Month ${wins.map(win => win.month).join(", ")}` : "No"}</td><td>{enrollmentPortalId(item) || "Not enabled"}</td><td><Button onClick={() => setMember(item)}>View details</Button><ChitDeleteMemberControl token={token} scheme={scheme} enrollment={item} onDeleted={async removed => { setNotice(`${enrollmentName(removed)} was removed from ${scheme.name}.`); await refresh(); }} /></td></tr>; })}</tbody></table>{!data.enrollments.length && <p className="small">No members in this scheme yet.</p>}</div></div>}
      {tab === "bids" && <div className="card"><div className="toolbar"><strong>Monthly bids</strong>{scheme.status === "active" && <Button onClick={() => setBidOpen(true)}>+ Record monthly bid</Button>}</div><p className="small">Each month is stored separately. Recording a new month does not change previous months.</p><div className="table spacer"><table><thead><tr><th>Month</th><th>Bid date</th><th>Winner</th><th>Winning bid</th><th>Discount</th><th>Commission</th><th>Dividend / member</th></tr></thead><tbody>{data.cycles.map(cycle => { const won = data.enrollments.find(item => item.id === cycle.winning_enrollment_id); return <tr key={cycle.id}><td>Month {cycle.cycle_number}</td><td>{formatChitDate(cycle.cycle_date)}</td><td>{won ? `Ticket ${won.ticket_number} · ${enrollmentName(won)}` : "—"}</td><td>{money(cycle.winning_bid_amount)}</td><td>{money(cycle.discount_amount)}</td><td>{money(cycle.commission_amount)}</td><td>{money(cycle.dividend_per_member)}</td></tr>; })}</tbody></table>{!data.cycles.length && <p className="small">No monthly bids recorded yet.</p>}</div></div>}
      {tab === "payments" && <div className="card"><div className="toolbar"><strong>Payments — Month {selectedPaymentMonth}</strong><ChitPaymentMonthPicker duration={scheme.duration_months} value={selectedPaymentMonth} onChange={setPaymentMonth} /></div><div className="table spacer chit-member-payments"><table><thead><tr><th>Member</th><th>Ticket</th><th>Month</th><th>Due date</th><th>Payment date</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Late fee</th><th>Reference</th><th>Status</th><th></th></tr></thead><tbody>{visibleAuctionPayments.map(item => { const owner = data.enrollments.find(row => row.id === item.enrollment_id); const cycle = data.cycles.find(row => row.id === item.cycle_id); return <tr key={item.id}><td>{enrollmentName(owner)}</td><td>{owner?.ticket_number || "—"}</td><td>{cycle ? `Month ${cycle.cycle_number}` : "—"}</td><td>{formatChitDate(item.due_date)}</td><td>{formatChitDate(item.paid_date)}</td><td>{money(item.net_amount_due)}</td><td>{money(item.amount_paid)}</td><td className="red">{money(Math.max(0, Number(item.net_amount_due) - Number(item.amount_paid)))}</td><td>{item.late_penalty ? money(item.late_penalty) : "—"}</td><td>{item.payment_reference || "—"}</td><td><ChitPaymentStatus row={item} /></td><td><Button onClick={() => openAuctionPayment(item)}>{item.amount_paid ? "Edit payment" : "Record payment"}</Button>{item.amount_paid > 0 && <ChitDeletePaymentButton title="Delete payment?" body="This permanently deletes or reverses the recorded payment." onConfirm={() => remove(item.id)} />}</td></tr>; })}</tbody></table>{!visibleAuctionPayments.length && <p className="small">No payments are scheduled for Month {selectedPaymentMonth}. Record a monthly bid first to create member installments.</p>}</div></div>}
      {tab === "dividends" && <div className="card"><strong>Dividends</strong><p className="small">discount = chit value − winning bid · commission = chit value × commission % · distributable = discount − commission · dividend = distributable ÷ members</p><div className="table spacer"><table><thead><tr><th>Month</th><th>Winning bid</th><th>Discount</th><th>Commission</th><th>Distributable</th><th>Dividend / member</th></tr></thead><tbody>{data.cycles.map(cycle => <tr key={cycle.id}><td>Month {cycle.cycle_number}</td><td>{money(cycle.winning_bid_amount)}</td><td>{money(cycle.discount_amount)}</td><td>{money(cycle.commission_amount)}</td><td>{money(cycle.distributable_amount)}</td><td>{money(cycle.dividend_per_member)}</td></tr>)}</tbody></table>{!data.cycles.length && <p className="small">No dividend records yet.</p>}</div></div>}
      {tab === "live" && <ChitLiveBidding token={token} scheme={scheme} data={data} orgSettings={orgSettings} workspace={workspace} onFinalized={async toast => { const details = await loadChitSchemeDetails(token, scheme.id); setData(details); const last = latestCycle(details.cycles); if (last) setFinalized(last); if (toast) setNotice(toast); }} />}
      {finalized && <div className="card spacer"><strong>Latest finalized bid</strong><div className="grid metrics"><Metric label="Winning bid" value={money(finalized.winning_bid_amount)} color="gold" /><Metric label="Discount" value={money(finalized.discount_amount)} color="blue" /><Metric label="Commission" value={money(finalized.commission_amount)} /><Metric label="Distributable" value={money(finalized.distributable_amount)} /><Metric label="Dividend / member" value={money(finalized.dividend_per_member)} color="green" /></div></div>}
    </>}
    {memberOpen && <ChitAddMemberModal token={token} scheme={scheme} nextTicket={nextTicket} close={() => setMemberOpen(false)} done={async () => { setMemberOpen(false); await refresh(); }} />}
    {bidOpen && <ChitBidModal token={token} scheme={scheme} enrollments={eligibleForManualBid} nextMonth={data.cycles.length + 1} orgSettings={orgSettings} workspace={workspace} close={() => setBidOpen(false)} done={async toast => { setBidOpen(false); if (toast) setNotice(toast); await refresh(); }} />}
    {payment && <ChitPaymentModal token={token} installment={payment} memberName={payment.memberName} memberPhone={payment.memberPhone} scheme={scheme} close={() => setPayment(null)} done={async () => { setPayment(null); await refresh(); }} orgSettings={orgSettings} workspace={workspace} onReceipt={onReceipt} />}
  </main>;
}
