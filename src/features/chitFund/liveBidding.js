import { validateBid } from "./calculations.js";

export const LIVE_BID_MODEL = "lowest_payout_wins";

export function leadingLiveBid(bids = []) {
  if (!Array.isArray(bids) || bids.length === 0) return null;
  return [...bids].sort((a, b) => {
    const amount = Number(a.bidAmount ?? a.bid_amount) - Number(b.bidAmount ?? b.bid_amount);
    if (amount !== 0) return amount;
    return String(a.submittedAt ?? a.submitted_at).localeCompare(String(b.submittedAt ?? b.submitted_at));
  })[0];
}

export function validateLiveBid({ bidAmount, chitValue, minBidPercent, maxBidPercent, leadingBidAmount }) {
  const validated = validateBid({ bidAmount, chitValue, minBidPercent, maxBidPercent });
  if (leadingBidAmount != null && Number.isFinite(Number(leadingBidAmount)) && validated.bidAmount >= Number(leadingBidAmount)) {
    throw new Error("A new bid must be lower than the current leading bid");
  }
  return validated;
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
