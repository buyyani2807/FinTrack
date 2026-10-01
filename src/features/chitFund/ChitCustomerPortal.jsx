import { useEffect, useState } from "react";
import {
  chitCustomerLiveState,
  chitCustomerPaymentHistory,
  chitCustomerPlaceLiveBid,
  chitCustomerSelectMembership,
} from "../../lib/financeRepository";
import { liveAuctionLimits, liveBidPayout, validateLiveBid } from "./model/liveBidding";
import { CHIT_TYPES } from "./model/fixedChit";
import { chitPaymentOutstanding, portalPaymentRows } from "./model/memberPayments";
import { money, formatChitDate, formatTime } from "./model/chitFormat.js";
import { Button, Field, Metric } from "../../components/ui.jsx";
import { ChitMemberPaymentHistory, ChitMembershipSwitcher } from "./components/ChitMemberParts.jsx";

function FixedChitCustomerPortal({ state, logout, loadError, switcher }) {
  const scheme = state.scheme || {};
  const lift = state.fixedLift;
  const payments = portalPaymentRows(state);
  const outstanding = chitPaymentOutstanding(payments);
  return <main className="shell" style={{ maxWidth: 960 }}><header className="top"><div><div className="brand">FinTrack</div><div className="sub">Fixed Chit customer dashboard</div></div><Button onClick={logout}>Log out</Button></header><h1 className="title">Hello, {state.memberName || "Member"}</h1><p className="copy">{scheme.name || "Fixed Chit"} · Ticket {state.ticketNumber} · Portal {state.portalId}</p>{switcher}{loadError && <p className="red small">{loadError}</p>}{!scheme.name && !loadError && <p className="small">Loading your chit dashboard…</p>}<p className="notice">This is a Fixed Chit. Lift amounts follow the predetermined schedule; live bidding is not used.</p><div className="grid metrics"><Metric label="Chit value" value={money(scheme.chit_value)} color="gold" /><Metric label="Monthly contribution" value={money(scheme.installment_amount)} /><Metric label="Your lift month" value={lift ? `Month ${lift.month_number}` : "Not assigned"} color="blue" /><Metric label="Your lift amount" value={lift ? money(lift.lift_amount) : "—"} color="gold" /><Metric label="Monthly payment" value={lift ? money(lift.monthly_payment) : "—"} /><Metric label="Remaining payments" value={lift?.remaining_months ?? "—"} /><Metric label="Outstanding" value={money(outstanding)} color="red" /></div><ChitMemberPaymentHistory title="Your payment history" rows={payments} empty="Your month-wise payment schedule will appear after this scheme is activated." /></main>;
}
function PredefinedBidCustomerPortal({ state, logout, loadError, switcher }) {
  const scheme = state.scheme || {};
  const item = state.predefinedMonth;
  const payments = portalPaymentRows(state);
  const outstanding = chitPaymentOutstanding(payments);
  return <main className="shell" style={{ maxWidth: 960 }}><header className="top"><div><div className="brand">FinTrack</div><div className="sub">Fixed Predefined Bid customer dashboard</div></div><Button onClick={logout}>Log out</Button></header><h1 className="title">Hello, {state.memberName || "Member"}</h1><p className="copy">{scheme.name || "Fixed Predefined Bid"} · Ticket {state.ticketNumber} · Portal {state.portalId}</p>{switcher}{loadError && <p className="red small">{loadError}</p>}{!scheme.name && !loadError && <p className="small">Loading your chit dashboard…</p>}<p className="notice">This Chit uses a predefined monthly schedule. Live bidding is not used.</p><div className="grid metrics"><Metric label="Lift month" value={item ? `Month ${item.month_number}` : "Not assigned"} color="blue" /><Metric label="EMI" value={item ? money(item.emi) : "—"} /><Metric label="COMM" value={item ? money(item.comm_amount) : "—"} /><Metric label="Auction amount" value={item ? money(item.auction_amount) : "—"} /><Metric label="Bid amount" value={item ? money(item.bid_amount) : "—"} color="gold" /><Metric label="Manager commission" value={item ? money(item.manager_commission) : "—"} /><Metric label="Net receivable" value={item ? money(item.net_receivable) : "—"} color="green" /><Metric label="Outstanding" value={money(outstanding)} color="red" /></div><ChitMemberPaymentHistory title="Your payment history" rows={payments} empty="Your month-wise payment schedule will appear after this scheme is activated." /></main>;
}
export function ChitCustomerPortal({ session, logout }) {
  const [state, setState] = useState(session || {});
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const token = session?.sessionToken;
  useEffect(() => {
    if (!token) return undefined;
    let ignore = false;
    const merge = payload => {
      if (ignore || !payload) return;
      setState(current => {
        const nextEnrollment = payload.enrollmentId || payload.enrollment_id;
        const currentEnrollment = current.enrollmentId || current.enrollment_id;
        if (nextEnrollment && currentEnrollment && nextEnrollment !== currentEnrollment) {
          return { ...payload, sessionToken: token };
        }
        return {
          ...current,
          ...payload,
          sessionToken: token,
          memberships: payload.memberships ?? current.memberships ?? [],
          installments: payload.installments ?? current.installments ?? [],
          payments: payload.payments ?? current.payments ?? [],
          fixedPayments: payload.fixedPayments ?? current.fixedPayments ?? [],
          predefinedPayments: payload.predefinedPayments ?? current.predefinedPayments ?? [],
        };
      });
    };
    const load = isPoll => chitCustomerLiveState(token)
      .then(payload => { merge(payload); if (!isPoll) setLoadError(""); })
      .catch(err => { if (!ignore && !isPoll) setLoadError(err.message || "Could not load your chit dashboard."); });
    load(false);
    chitCustomerPaymentHistory(token).then(merge).catch(() => {});
    const timer = setInterval(() => load(true), 2000);
    return () => { ignore = true; clearInterval(timer); };
  }, [token]);
  const openMembership = async enrollmentId => {
    if (!token || enrollmentId === (state.enrollmentId || state.enrollment_id)) return;
    setBusy(true); setError("");
    try {
      const next = await chitCustomerSelectMembership(token, enrollmentId);
      setState({ ...next, sessionToken: token });
      setAmount("");
    } catch (err) { setError(err.message || "Could not open that scheme."); }
    finally { setBusy(false); }
  };
  const scheme = state.scheme || {};
  const switcher = <>
    <ChitMembershipSwitcher memberships={state.memberships} selectedId={state.enrollmentId || state.enrollment_id} onSelect={openMembership} disabled={busy} />
    {error && scheme.chit_type && scheme.chit_type !== CHIT_TYPES.AUCTION && <p className="red small">{error}</p>}
  </>;
  if (!scheme.chit_type && !scheme.name) {
    return <main className="shell" style={{ maxWidth: 960 }}><header className="top"><div><div className="brand">FinTrack</div><div className="sub">Chit customer dashboard</div></div><Button onClick={logout}>Log out</Button></header>{loadError ? <p className="red small">{loadError}</p> : <p className="small">Loading your chit dashboard…</p>}</main>;
  }
  if (scheme.chit_type === CHIT_TYPES.FIXED) return <FixedChitCustomerPortal state={state} logout={logout} loadError={loadError} switcher={switcher} />;
  if (scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID) return <PredefinedBidCustomerPortal state={state} logout={logout} loadError={loadError} switcher={switcher} />;
  const auction = state.auction;
  const leading = state.leadingBid || state.leading_bid;
  const bids = state.bids || [];
  const wins = state.wins || [];
  const installments = portalPaymentRows(state);
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
        minBidPercent: scheme.min_bid_percent, maxBidPercent: scheme.max_bid_percent,
      });
    } catch (err) { setError(err.message); return; }
    setBusy(true); setError("");
    try {
      const nonce = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const next = await chitCustomerPlaceLiveBid(token, amount, nonce);
      setState(current => ({
        ...current,
        ...next,
        sessionToken: token,
        installments: next.installments ?? current.installments ?? [],
        payments: next.payments ?? current.payments ?? [],
      }));
      setAmount("");
    } catch (err) { setError(err.message || "Could not submit your bid."); }
    finally { setBusy(false); }
  };
  const statusLabel = !auction ? "Not started" : auction.status;
  return <main className="shell" style={{ maxWidth: 960 }}>
    <header className="top"><div><div className="brand">FinTrack</div><div className="sub">Chit customer dashboard</div></div><Button onClick={logout}>Log out</Button></header>
    <h1 className="title">Hello, {state.memberName || "Member"}</h1>
    <p className="copy">{scheme.name || "Chit scheme"} · Ticket {state.ticketNumber} · Portal {state.portalId}</p>
    {switcher}
    {loadError && <p className="red small">{loadError}</p>}
    {!scheme.name && !loadError && <p className="small">Loading your chit dashboard…</p>}
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
      <Metric label="Leading discount bid" value={leading ? money(leading.bid_amount) : "—"} color="gold" />
      <Metric label="Winner receives (payout)" value={leading ? money(liveBidPayout({ chitValue, bidAmount: leading.bid_amount })) : "—"} color="green" />
      <Metric label="Outstanding" value={money(chitPaymentOutstanding(installments))} color="red" />
      <Metric label="You can bid" value={eligible && auction?.status === "open" ? "Yes" : "No"} color={eligible && auction?.status === "open" ? "green" : "red"} />
    </div>
    <ChitMemberPaymentHistory title="Your payment history" rows={installments} empty="Month-wise installments appear after your financier records a monthly bid." />
    {auction?.status === "open" && eligible && <form className="card spacer" onSubmit={submit}><strong>Post your bid</strong><p className="small">Enter an amount above {money(limits.commission)} and at most {money(limits.maxBid)}. A new bid must be higher than {leading ? money(leading.bid_amount) : "any previous bid"}.{amount && Number(amount) > limits.commission ? ` If you win at ${money(amount)}, you receive ${money(liveBidPayout({ chitValue, bidAmount: amount }))}.` : ""}</p><div className="form spacer"><Field className="span" label="Your bid amount (₹)"><input required type="number" min={limits.commission + 0.01} max={limits.maxBid} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></Field></div><Button className="primary" disabled={busy} type="submit">{busy ? "Submitting…" : "Submit bid"}</Button></form>}
    {auction?.status === "open" && !eligible && <p className="notice">You are not eligible to bid this month. Members who already won a month cannot bid again.</p>}
    <div className="card spacer"><strong>Live bids</strong><div className="table spacer"><table><thead><tr><th>Time</th><th>Member</th><th>Amount</th></tr></thead><tbody>{bids.map(bid => <tr key={bid.id}><td>{formatTime(bid.submitted_at)}</td><td>Ticket {bid.ticket_number} · {bid.member_name}</td><td>{money(bid.bid_amount)}</td></tr>)}</tbody></table>{!bids.length && <p className="small">No live bids yet.</p>}</div></div>
    <div className="card spacer"><strong>Your winning months</strong>{wins.length ? <div className="table spacer"><table><thead><tr><th>Month</th><th>Discount bid</th><th>Payout</th><th>Bid date</th><th>Status</th></tr></thead><tbody>{wins.map(win => {
      const discount = Number(win.discountBid ?? win.bidAmount ?? 0);
      const payout = Number.isFinite(Number(win.payoutAmount)) ? Number(win.payoutAmount) : liveBidPayout({ chitValue, bidAmount: discount });
      return <tr key={win.month}><td>Month {win.month}</td><td>{money(discount)}</td><td>{money(payout)}</td><td>{formatChitDate(win.bidDate)}</td><td>{win.status}</td></tr>;
    })}</tbody></table></div> : <p className="small spacer">You have not won a monthly bid in this scheme yet.</p>}</div>
  </main>;
}
