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

export function validateLiveBid({ bidAmount, chitValue, commissionPercent, commissionAmount, liveMaxBidAmount, leadingBidAmount }) {
  const value = Number(chitValue);
  const amount = roundMoney(Number(bidAmount));
  const { commission, maxBid } = liveAuctionLimits({ chitValue: value, commissionPercent, commissionAmount, liveMaxBidAmount });
  if (![amount, value, commission, maxBid].every(Number.isFinite) || value <= 0) throw new Error("Invalid bid values");
  if (amount <= commission) throw new Error("Bid must start above the fund manager commission");
  if (amount > maxBid) throw new Error("Bid cannot exceed 30% of the chit value");
  if (leadingBidAmount != null && Number.isFinite(Number(leadingBidAmount)) && amount <= Number(leadingBidAmount)) {
    throw new Error("A new bid must be higher than the current leading bid");
  }
  return { bidAmount: amount, bidPercent: roundMoney(amount / value * 100), payoutAmount: liveBidPayout({ chitValue: value, bidAmount: amount }) };
}

export function winsForEnrollment(cycles = [], bids = [], enrollmentId) {
  const cycleById = Object.fromEntries(cycles.map(cycle => [cycle.id, cycle]));
  return bids
    .filter(bid => bid.enrollment_id === enrollmentId && bid.status === "winner")
    .map(bid => {
      const cycle = cycleById[bid.cycle_id];
      return {
        month: cycle?.cycle_number,
        bidAmount: bid.bid_amount,
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
