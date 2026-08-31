import { roundMoney } from "./calculations.js";

export const LIVE_BID_MODEL = "highest_bid_wins";
export const LIVE_MAX_DISCOUNT_PERCENT = 30;

export function liveAuctionLimits({ chitValue, commissionPercent, commissionAmount, liveMaxBidAmount } = {}) {
  const value = Number(chitValue);
  const commission = Number.isFinite(Number(commissionAmount))
    ? roundMoney(Number(commissionAmount))
    : roundMoney(value * Number(commissionPercent || 0) / 100);
  const maxBid = Number.isFinite(Number(liveMaxBidAmount))
    ? roundMoney(Number(liveMaxBidAmount))
    : roundMoney(value * LIVE_MAX_DISCOUNT_PERCENT / 100);
  return { commission, maxBid, maxPercent: LIVE_MAX_DISCOUNT_PERCENT };
}

export function liveBidPayout({ chitValue, bidAmount }) {
  return roundMoney(Number(chitValue) - Number(bidAmount));
}

export function leadingLiveBid(bids = []) {
  if (!Array.isArray(bids) || bids.length === 0) return null;
  return [...bids].sort((a, b) => {
    const amount = Number(b.bidAmount ?? b.bid_amount) - Number(a.bidAmount ?? a.bid_amount);
    if (amount !== 0) return amount;
    return String(a.submittedAt ?? a.submitted_at).localeCompare(String(b.submittedAt ?? b.submitted_at));
  })[0];
}

export function validateLiveBid({
  bidAmount,
  chitValue,
  commissionPercent,
  commissionAmount,
  liveMaxBidAmount,
  leadingBidAmount,
  minBidPercent = 70,
  maxBidPercent = 95,
}) {
  const value = Number(chitValue);
  const amount = roundMoney(Number(bidAmount));
  const { commission, maxBid } = liveAuctionLimits({ chitValue: value, commissionPercent, commissionAmount, liveMaxBidAmount });
  if (![amount, value, commission, maxBid].every(Number.isFinite) || value <= 0) throw new Error("Invalid bid values");
  if (amount <= commission) throw new Error("Bid must start above the fund manager commission");
  if (amount > maxBid) throw new Error("Bid cannot exceed 30% of the chit value");
  if (leadingBidAmount != null && Number.isFinite(Number(leadingBidAmount)) && amount <= Number(leadingBidAmount)) {
    throw new Error("A new bid must be higher than the current leading bid");
  }
  const payoutAmount = liveBidPayout({ chitValue: value, bidAmount: amount });
  const payoutPercent = Math.round((payoutAmount * 10000) / value) / 100;
  const minPayout = Number(minBidPercent);
  const maxPayout = Number(maxBidPercent);
  if (Number.isFinite(minPayout) && Number.isFinite(maxPayout) && (payoutPercent < minPayout || payoutPercent > maxPayout)) {
    throw new Error(`This discount would leave a payout outside the scheme payout limits (${minPayout}–${maxPayout})`);
  }
  return { bidAmount: amount, bidPercent: roundMoney(amount / value * 100), payoutAmount, payoutPercent };
}

export function winsForEnrollment(cycles = [], bids = [], enrollmentId, chitValue) {
  const cycleById = Object.fromEntries(cycles.map(cycle => [cycle.id, cycle]));
  const value = Number(chitValue);
  return bids
    .filter(bid => bid.enrollment_id === enrollmentId && bid.status === "winner")
    .map(bid => {
      const cycle = cycleById[bid.cycle_id];
      const storedPayout = Number(cycle?.winning_bid_amount);
      const liveDiscount = Number(bid.bid_amount);
      const payoutAmount = Number.isFinite(storedPayout) && storedPayout > 0 ? storedPayout : (Number.isFinite(value) && value > 0 ? liveBidPayout({ chitValue: value, bidAmount: liveDiscount }) : liveDiscount);
      const discountBid = Number.isFinite(value) && value > 0 ? roundMoney(value - payoutAmount) : liveDiscount;
      return {
        month: cycle?.cycle_number,
        bidAmount: payoutAmount,
        payoutAmount,
        discountBid,
        bidDate: cycle?.cycle_date,
        status: "Winner",
      };
    })
    .filter(row => row.month != null)
    .sort((a, b) => a.month - b.month);
}

export function enrollmentPortalId(enrollment) {
  const credential = enrollment?.chit_member_portal_credentials;
  const row = Array.isArray(credential) ? credential[0] : credential;
  return row?.portal_id || "";
}
