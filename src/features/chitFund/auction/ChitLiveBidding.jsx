import { useEffect, useMemo, useState } from "react";
import { Select } from "../../../components/Select.jsx";
import { endChitLiveAuction, loadChitLiveAuction, pauseChitLiveAuction, startChitLiveAuction } from "../../../lib/financeRepository";
import { buildAuctionLiftPayload } from "../../receipts/io/transactionConfirmations.js";
import { LIVE_BID_MODEL, cycleNumberInRange, enrollmentPortalId, liveAuctionLimits, liveBidPayout, nextOpenChitMonth } from "../model/liveBidding";
import { AnomalyReviewCard } from "../../intelligence/AnomalyReviewCard.jsx";
import { buildAnomalyReview } from "../../intelligence/anomalyReview.js";
import { disbursementPayoutError, disbursementPayoutSplit } from "../../finance/model/disbursementMode";
import { today, money, formatTime, byMemberName } from "../model/chitFormat.js";
import { fireChitLiftWhatsApp } from "../io/chitNotifications.js";
import { Button, Field, Metric } from "../../../components/ui.jsx";
import { Modal } from "../components/ChitUi.jsx";

export function ChitLiveBidding({ token, scheme, data, onFinalized, orgSettings = {}, workspace = {} }) {
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [payoutMode, setPayoutMode] = useState("cash");
  const [payoutCash, setPayoutCash] = useState("");
  const [payoutUpi, setPayoutUpi] = useState("");
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
  const auctionReview = useMemo(() => buildAnomalyReview({
    today: today(),
    now: new Date().toISOString(),
    auctions: live ? [{
      id: auction?.id,
      name: scheme.name,
      status: auction?.status,
      startedAt: auction?.started_at,
      bids: live.bids || [],
    }] : [],
  }), [live, auction?.id, auction?.status, auction?.started_at, scheme.name]);
  const liveMembers = [...(live?.members || [])].sort(byMemberName);
  const eligible = liveMembers.filter(member => member.eligible);
  const leading = live?.leading_bid;
  const latest = live?.latest_bid;
  const leadingMember = liveMembers.find(member => member.enrollment_id === leading?.enrollment_id);
  const latestMember = liveMembers.find(member => member.enrollment_id === latest?.enrollment_id);
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
  const nextMonth = nextOpenChitMonth(data.cycles, scheme.duration_months);
  const shownMonth = auction
    ? (cycleNumberInRange(auction.cycle_number, scheme.duration_months) ? `Month ${auction.cycle_number}` : "—")
    : (nextMonth ? `Month ${nextMonth}` : "—");
  const start = () => {
    if (auction?.status === "paused") return run(() => startChitLiveAuction(token, scheme.id, auction.cycle_number, today()));
    if (!nextMonth) {
      setError("All months for this scheme already have bids.");
      return false;
    }
    return run(() => startChitLiveAuction(token, scheme.id, nextMonth, today()));
  };
  const stop = () => run(() => pauseChitLiveAuction(token, scheme.id));
  const endAuction = () => run(async () => {
    const payoutErr = disbursementPayoutError(payoutMode, winnerPayout, payoutCash, payoutUpi);
    if (payoutErr) throw new Error(payoutErr);
    const split = disbursementPayoutSplit(payoutMode, winnerPayout, payoutCash, payoutUpi);
    const result = await endChitLiveAuction(token, auction.id, {
      payoutMode: split.mode,
      payoutCashAmount: split.cashAmount,
      payoutUpiAmount: split.upiAmount,
    });
    setConfirmEnd(false);
    const cycleId = result?.finalized_cycle_id || result?.cycle_id || null;
    const toast = cycleId ? await fireChitLiftWhatsApp({
      token,
      settings: orgSettings,
      workspace,
      sourceId: cycleId,
      payload: buildAuctionLiftPayload({
        scheme,
        enrollment: data.enrollments.find(item => item.id === leading?.enrollment_id) || leadingMember,
        cycleNumber: auction.cycle_number,
        cycleDate: today(),
        winningBidAmount: winnerPayout,
        commission: limits.commission,
        discount: leading?.bid_amount,
        dividend: null,
        installment: scheme.installment_amount,
      }),
    }) : "";
    await onFinalized(toast);
    return result;
  });
  return <>
    {scheme.status !== "active" && <p className="notice">Live bidding is available after the scheme is activated.</p>}
    <p className="copy">Start live bidding on the auction date (for example the 25th of each month). First deduct the fund manager commission ({scheme.commission_percent}% = {money(limits.commission)}). Members then bid <strong>above {money(limits.commission)}</strong>, up to <strong>30% of the chit value ({money(limits.maxBid)})</strong>. Highest bid wins. The winner receives chit value minus that bid. Bids that would leave a payout outside {scheme.min_bid_percent}–{scheme.max_bid_percent}% are rejected.</p>
    {error && <p className="red small">{error}</p>}
    <div className="grid metrics">
      <Metric label="Scheme" value={scheme.name} />
      <Metric label="Chit value" value={money(scheme.chit_value)} color="gold" />
      <Metric label="Manager commission" value={money(limits.commission)} />
      <Metric label="Bidding starts above" value={money(limits.commission)} color="blue" />
      <Metric label="Max bid (30%)" value={money(limits.maxBid)} />
      <Metric label="Current month" value={shownMonth} color="blue" />
      <Metric label="Total members" value={`${data.enrollments.length}/${scheme.member_count}`} />
      <Metric label="Eligible members" value={eligible.length} color="green" />
      <Metric label="Leading discount bid" value={leading ? money(leading.bid_amount) : "—"} color="gold" />
      <Metric label="Winner receives (payout)" value={winnerPayout != null ? money(winnerPayout) : "—"} color="green" />
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
    {LIVE_BID_MODEL === "highest_bid_wins" && leadingMember && <p className="notice">Leading discount bid: Ticket {leadingMember.ticket_number} · {leadingMember.full_name} · {money(leading.bid_amount)} · Winner receives {money(winnerPayout)}</p>}
    {auction?.status === "open" && <p className="notice">Waiting for members to post bids from Chit customer login. You monitor here and end bidding when ready. The highest bid is recorded as that month’s winner.</p>}
    {live && <AnomalyReviewCard review={auctionReview} />}
    <div className="grid two spacer">
      <div className="card"><strong>Participants</strong><div className="table spacer"><table><thead><tr><th>Ticket</th><th>Member</th><th>Status</th><th>Portal</th></tr></thead><tbody>{liveMembers.map(member => { const enrolled = data.enrollments.find(item => item.id === member.enrollment_id); return <tr key={member.enrollment_id}><td>{member.ticket_number}</td><td>{member.full_name}</td><td>{member.status === "eligible" ? "Eligible" : member.status === "already_won" ? "Already won" : member.status}</td><td>{enrollmentPortalId(enrolled) || "Not enabled"}</td></tr>; })}</tbody></table>{!liveMembers.length && <p className="small">No members in this scheme.</p>}</div></div>
      <div className="card"><strong>Bid history</strong><div className="table spacer"><table><thead><tr><th>Time</th><th>Member</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(live?.bids || []).map(bid => <tr key={bid.id}><td>{formatTime(bid.submitted_at)}</td><td>Ticket {bid.ticket_number} · {bid.member_name}</td><td>{money(bid.bid_amount)}</td><td>{bid.status === "winner" ? "Winner" : bid.status === "not_selected" ? "Not selected" : "Valid"}</td></tr>)}</tbody></table>{!(live?.bids || []).length && <p className="small">No live bids yet.</p>}</div></div>
    </div>
    {confirmEnd && <Modal close={() => setConfirmEnd(false)}><h2 className="title">End live bidding?</h2><p className="copy">This will finalize Month {auction.cycle_number} using the highest discount bid, then create the monthly bid, dividend, and installment records. Previous months will not change.</p><div className="notice">Winning member: Ticket {leadingMember?.ticket_number} · {leadingMember?.full_name}<br />Discount bid: {money(leading?.bid_amount)}<br />Winner receives (payout): {money(winnerPayout)} (chit value − discount)<br />Manager commission: {money(limits.commission)}</div><div className="form spacer"><Field label="Prize payout mode"><Select value={payoutMode} onChange={e => setPayoutMode(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="cash_upi">Cash + UPI</option></Select></Field>{payoutMode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={payoutCash} onChange={e => setPayoutCash(e.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={payoutUpi} onChange={e => setPayoutUpi(e.target.value)} /></Field></>}</div><div className="row spacer"><Button className="primary" disabled={busy} onClick={endAuction}>{busy ? "Finalizing…" : "Confirm and finalize"}</Button></div></Modal>}
  </>;
}
