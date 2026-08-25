import { useEffect, useMemo, useState } from "react";
import {
  activateChitScheme,
  createChitMember,
  createChitScheme,
  deleteChitInstallmentPayment,
  endChitLiveAuction,
  enrollChitMember,
  loadChitDashboard,
  loadChitLiveAuction,
  loadChitSchemeDetails,
  pauseChitLiveAuction,
  placeChitLiveBid,
  recordChitMonthlyBid,
  startChitLiveAuction,
  updateChitInstallmentPayment,
  updateChitScheme,
} from "../../lib/financeRepository";
import { LIVE_BID_MODEL, validateLiveBid, winsForEnrollment } from "./liveBidding";

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
  return <Modal><h2 className="title">{title}</h2><form onSubmit={onSubmit}><div className="form spacer"><Field label="Scheme name *"><input required value={form.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Start date *"><input required type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} /></Field><Field label="Chit value (₹) *"><input required type="number" min="1" value={form.chitValue} onChange={e => set("chitValue", e.target.value)} /></Field><Field label="Duration (months) *"><input required type="number" min="1" value={form.durationMonths} onChange={e => set("durationMonths", e.target.value)} /></Field><Field label="Member count *"><input required type="number" min="1" value={form.memberCount} onChange={e => set("memberCount", e.target.value)} /></Field><Field label="Installment amount (₹) *"><input required type="number" min="1" value={form.installmentAmount} onChange={e => set("installmentAmount", e.target.value)} /></Field><Field label="Commission (%) *"><input required type="number" min="0" max="7" step=".01" value={form.commissionPercent} onChange={e => set("commissionPercent", e.target.value)} /></Field><Field label="Min payout (%)"><input type="number" min="0" max="100" value={form.minBidPercent} onChange={e => set("minBidPercent", e.target.value)} /></Field><Field label="Max payout (%)"><input type="number" min="0" max="100" value={form.maxBidPercent} onChange={e => set("maxBidPercent", e.target.value)} /></Field><Field label="Late penalty per installment (₹)"><input type="number" min="0" value={form.latePenaltyAmount} onChange={e => set("latePenaltyAmount", e.target.value)} /></Field><Field label="Security deposit per member (₹)"><input type="number" min="0" value={form.securityDepositAmount} onChange={e => set("securityDepositAmount", e.target.value)} /></Field></div><p className="notice">Installment × member count must equal the chit value. Commission is capped at 7%. Live bidding uses the lowest payout as the winning bid.</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={onClose}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : submitLabel}</Button></div></form></Modal>;
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
      await enrollChitMember(token, {
        schemeId: scheme.id, memberId, ticketNumber: f.ticket, guarantorName: f.guarantorName,
        guarantorPhone: f.guarantorPhone, guarantorAddress: f.guarantorAddress, securityDeposit: f.deposit,
      });
      done();
    } catch (err) { setError(err.message || "Could not add member to this scheme."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">Add member to {scheme.name}</h2><p className="copy">This member will be stored against this scheme only.</p><form onSubmit={submit}><div className="form spacer"><Field label="Member name"><input required value={f.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Mobile number"><input required value={f.phone} onChange={e => set("phone", e.target.value)} /></Field><Field className="span" label="Address"><input value={f.address} onChange={e => set("address", e.target.value)} /></Field><Field label="Ticket number"><input required type="number" min="1" value={f.ticket} onChange={e => set("ticket", e.target.value)} /></Field><Field label="Guarantor name"><input required value={f.guarantorName} onChange={e => set("guarantorName", e.target.value)} /></Field><Field label="Guarantor phone"><input required value={f.guarantorPhone} onChange={e => set("guarantorPhone", e.target.value)} /></Field><Field className="span" label="Guarantor address"><input value={f.guarantorAddress} onChange={e => set("guarantorAddress", e.target.value)} /></Field><Field label="Security deposit (₹)"><input type="number" min="0" value={f.deposit} onChange={e => set("deposit", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Add member"}</Button></div></form></Modal>;
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

function ChitMemberDetails({ scheme, enrollment, cycles, bids, back }) {
  const wins = winsForEnrollment(cycles, bids, enrollment.id);
  return <main className="shell"><div className="toolbar"><div><Button onClick={back}>← Members</Button><h1 className="title spacer">{enrollmentName(enrollment)}</h1><p className="copy">{scheme.name} · Ticket {enrollment.ticket_number}</p></div></div><div className="grid metrics"><Metric label="Ticket" value={enrollment.ticket_number} color="blue" /><Metric label="Phone" value={enrollment.chit_members?.phone || "—"} /><Metric label="Bid winner" value={wins.length ? "Yes" : "No"} color={wins.length ? "green" : ""} /></div>{wins.length ? <><div className="grid metrics"><Metric label="Winning month" value={`Month ${wins[0].month}`} color="gold" /><Metric label="Winning bid amount" value={money(wins[0].bidAmount)} color="gold" /><Metric label="Bid date" value={formatChitDate(wins[0].bidDate)} /></div><div className="card spacer"><strong>Bid history</strong><div className="table spacer"><table><thead><tr><th>Month</th><th>Bid amount</th><th>Bid date</th><th>Status</th></tr></thead><tbody>{wins.map(win => <tr key={win.month}><td>Month {win.month}</td><td>{money(win.bidAmount)}</td><td>{formatChitDate(win.bidDate)}</td><td>{win.status}</td></tr>)}</tbody></table></div></div></> : <p className="notice">Bid Winner: No. This member has not won a monthly bid in this scheme.</p>}<div className="card spacer"><strong>Member details</strong><p className="small spacer">{enrollment.chit_members?.address || "Address not added"}</p><p className="small">Guarantor: {enrollment.guarantor_name} · {enrollment.guarantor_phone}</p></div></main>;
}

function ChitLiveBidding({ token, scheme, data, onFinalized }) {
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [bidder, setBidder] = useState("");
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
  const submitBid = async event => {
    event.preventDefault();
    if (!auction || auction.status !== "open") return;
    try {
      validateLiveBid({
        bidAmount: amount, chitValue: scheme.chit_value, minBidPercent: scheme.min_bid_percent,
        maxBidPercent: scheme.max_bid_percent, leadingBidAmount: leading?.bid_amount,
      });
    } catch (err) { setError(err.message); return; }
    const nonce = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const ok = await run(() => placeChitLiveBid(token, auction.id, bidder, amount, nonce));
    if (ok) setAmount("");
  };
  const endAuction = () => run(async () => {
    const result = await endChitLiveAuction(token, auction.id);
    setConfirmEnd(false);
    await onFinalized();
    return result;
  });
  return <>
    {scheme.status !== "active" && <p className="notice">Live bidding is available after the scheme is activated.</p>}
    <p className="copy">This scheme uses <strong>lowest payout wins</strong>. A member bids the amount they will receive. The lowest valid bid within {scheme.min_bid_percent}%–{scheme.max_bid_percent}% of the chit value leads.</p>
    {error && <p className="red small">{error}</p>}
    <div className="grid metrics">
      <Metric label="Scheme" value={scheme.name} />
      <Metric label="Chit value" value={money(scheme.chit_value)} color="gold" />
      <Metric label="Current month" value={auction ? `Month ${auction.cycle_number}` : `Month ${live?.next_cycle_number || data.cycles.length + 1}`} color="blue" />
      <Metric label="Total members" value={`${data.enrollments.length}/${scheme.member_count}`} />
      <Metric label="Eligible members" value={eligible.length} color="green" />
      <Metric label="Leading bid (lowest)" value={leading ? money(leading.bid_amount) : "—"} color="gold" />
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
    {LIVE_BID_MODEL === "lowest_payout_wins" && leadingMember && <p className="notice">Leading: Ticket {leadingMember.ticket_number} · {leadingMember.full_name} · {money(leading.bid_amount)}</p>}
    {auction?.status === "open" && <form className="card spacer" onSubmit={submitBid}><strong>Place a bid</strong><div className="form spacer"><Field className="span" label="Eligible member"><select required value={bidder} onChange={e => setBidder(e.target.value)}><option value="">Select member</option>{eligible.map(member => <option key={member.enrollment_id} value={member.enrollment_id}>Ticket {member.ticket_number} — {member.full_name}</option>)}</select></Field><Field label="Bid / payout amount (₹)"><input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field></div><Button className="primary" disabled={busy || !bidder} type="submit">{busy ? "Saving…" : "Submit bid"}</Button></form>}
    <div className="grid two spacer">
      <div className="card"><strong>Participants</strong><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Status</th></tr></thead><tbody>{(live?.members || []).map(member => <tr key={member.enrollment_id}><td>{member.ticket_number}</td><td>{member.full_name}</td><td>{member.status === "eligible" ? "Eligible" : member.status === "already_won" ? "Already won" : member.status}</td></tr>)}</tbody></table>{!(live?.members || []).length && <p className="small">No members in this scheme.</p>}</div></div>
      <div className="card"><strong>Bid history</strong><div className="table spacer"><table><thead><tr><th>Time</th><th>Member</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(live?.bids || []).map(bid => <tr key={bid.id}><td>{formatTime(bid.submitted_at)}</td><td>Ticket {bid.ticket_number} · {bid.member_name}</td><td>{money(bid.bid_amount)}</td><td>{bid.status === "winner" ? "Winner" : bid.status === "not_selected" ? "Not selected" : "Valid"}</td></tr>)}</tbody></table>{!(live?.bids || []).length && <p className="small">No live bids yet.</p>}</div></div>
    </div>
    {confirmEnd && <Modal><h2 className="title">End live bidding?</h2><p className="copy">This will finalize Month {auction.cycle_number} and create the monthly bid, dividend, and installment records. Previous months will not change.</p><div className="notice">Winning member: Ticket {leadingMember?.ticket_number} · {leadingMember?.full_name}<br />Winning bid: {money(leading?.bid_amount)}</div><div className="row spacer"><Button onClick={() => setConfirmEnd(false)}>Cancel</Button><Button className="primary" disabled={busy} onClick={endAuction}>{busy ? "Finalizing…" : "Confirm and finalize"}</Button></div></Modal>}
  </>;
}

function ChitSchemeDetails({ token, scheme, back }) {
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
  if (member) return <ChitMemberDetails scheme={scheme} enrollment={member} cycles={data.cycles} bids={data.bids} back={() => setMember(null)} />;
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
      {tab === "members" && <div className="card"><div className="toolbar"><strong>Members</strong>{scheme.status === "draft" && <Button className="primary" onClick={() => setMemberOpen(true)}>+ Add member</Button>}</div><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Phone</th><th>Bid winner</th><th></th></tr></thead><tbody>{data.enrollments.map(item => { const wins = winsForEnrollment(data.cycles, data.bids, item.id); return <tr key={item.id}><td>{item.ticket_number}</td><td>{enrollmentName(item)}</td><td>{item.chit_members?.phone || "—"}</td><td>{wins.length ? `Yes · Month ${wins.map(win => win.month).join(", ")}` : "No"}</td><td><Button onClick={() => setMember(item)}>View details</Button></td></tr>; })}</tbody></table>{!data.enrollments.length && <p className="small">No members in this scheme yet.</p>}</div></div>}
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

const emptySchemeForm = () => ({ name: "", chitValue: "", durationMonths: "", memberCount: "", installmentAmount: "", commissionPercent: "", startDate: today(), minBidPercent: "70", maxBidPercent: "95", latePenaltyAmount: "0", securityDepositAmount: "0" });

export function ChitFundPage({ token, close }) {
  const [schemes, setSchemes] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
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
    return { scheme, current, members, winner };
  }), [schemes, cycles, enrollments]);
  const submitScheme = async event => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      if (modal === "edit-scheme") { await updateChitScheme(token, schemeForm); setNotice("Scheme updated."); }
      else { await createChitScheme(token, schemeForm); setNotice("Scheme created as Draft."); }
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
      id: scheme.id, name: scheme.name, chitValue: scheme.chit_value, durationMonths: scheme.duration_months,
      memberCount: scheme.member_count, installmentAmount: scheme.installment_amount, commissionPercent: scheme.commission_percent,
      startDate: scheme.start_date, minBidPercent: scheme.min_bid_percent, maxBidPercent: scheme.max_bid_percent,
      latePenaltyAmount: scheme.late_penalty_amount, securityDepositAmount: scheme.security_deposit_amount,
    });
    setModal("edit-scheme");
  };
  if (selected) return <ChitSchemeDetails token={token} scheme={selected} back={() => { setSelected(null); refresh(); }} />;
  return <main className="shell">
    <div className="toolbar"><div><Button onClick={close}>← Dashboard</Button><h1 className="title spacer">Chit Fund</h1><p className="copy">Schemes only. Open a scheme to manage members, monthly bids, payments, and live bidding.</p></div><Button className="primary" onClick={() => { setSchemeForm(emptySchemeForm()); setModal("scheme"); }}>+ New scheme</Button></div>
    {error && <p className="red small">{error}</p>}
    {notice && <p className="green small">{notice}</p>}
    {busy && <p className="small spacer">Loading Chit Fund schemes…</p>}
    <div className="card spacer"><div className="toolbar"><strong>Schemes</strong><span className="small">{schemes.length} schemes</span></div>
      <div className="table spacer"><table><thead><tr><th>Scheme</th><th>Chit value</th><th>Monthly installment</th><th>Members</th><th>Current month</th><th>Latest bid</th><th>Latest winner</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(({ scheme, current, members, winner }) => <tr key={scheme.id}><td><button className="link-button" onClick={() => setSelected(scheme)}>{scheme.name}</button></td><td>{money(scheme.chit_value)}</td><td>{money(scheme.installment_amount)}</td><td>{members.length}/{scheme.member_count}</td><td>{current ? `Month ${current.cycle_number}` : "—"}</td><td>{current ? money(current.winning_bid_amount) : "—"}</td><td>{winner ? enrollmentName(winner) : "—"}</td><td><Badge status={schemeStatusLabel(scheme.status)} /></td><td>{scheme.status === "draft" && <><Button onClick={() => editScheme(scheme)}>Edit</Button><Button className="primary" onClick={() => activate(scheme)}>Activate</Button></>}</td></tr>)}</tbody></table></div>
      {!schemes.length && !busy && <p className="small">No Chit Fund schemes yet.</p>}
    </div>
    {(modal === "scheme" || modal === "edit-scheme") && <ChitSchemeForm title={modal === "edit-scheme" ? "Edit Chit Fund scheme" : "Create Chit Fund scheme"} form={schemeForm} setForm={setSchemeForm} busy={busy} error={error} onClose={() => setModal(null)} onSubmit={submitScheme} submitLabel={modal === "edit-scheme" ? "Save changes" : "Create draft"} />}
  </main>;
}
