const MONEY_SCALE = 100;

export const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;

export function validateBid({ bidAmount, chitValue, minBidPercent, maxBidPercent }) {
  const amount = Number(bidAmount);
  const value = Number(chitValue);
  const min = Number(minBidPercent);
  const max = Number(maxBidPercent);
  if (![amount, value, min, max].every(Number.isFinite) || value <= 0) throw new Error("Invalid bid values");
  if (min < 0 || max > 100 || min > max) throw new Error("Invalid bid limits");
  const percent = amount / value * 100;
  if (amount <= 0 || percent < min || percent > max) throw new Error("Bid is outside the permitted payout range");
  return { bidAmount: roundMoney(amount), bidPercent: roundMoney(percent) };
}

export function calculateDividend({ chitValue, winningBidAmount, commissionPercent, totalMembers }) {
  const value = Number(chitValue);
  const winningBid = Number(winningBidAmount);
  const commissionRate = Number(commissionPercent);
  const members = Number(totalMembers);
  if (![value, winningBid, commissionRate, members].every(Number.isFinite) || value <= 0 || winningBid <= 0 || members <= 0) throw new Error("Invalid dividend inputs");
  if (commissionRate < 0 || commissionRate > 7) throw new Error("Commission cannot exceed 7%");
  if (winningBid > value) throw new Error("Winning bid cannot exceed the chit value");
  const discount = roundMoney(value - winningBid);
  const commission = roundMoney(value * commissionRate / 100);
  const distributable = roundMoney(discount - commission);
  if (distributable < 0) throw new Error("Commission cannot exceed the discount");
  const dividendPerMember = roundMoney(distributable / members);
  const distributed = roundMoney(dividendPerMember * members);
  return { discount, commission, distributable, dividendPerMember, retainedRemainder: roundMoney(distributable - distributed) };
}

export function selectWinningBid({ bids, previousWinnerIds = [], tieBreak }) {
  if (!Array.isArray(bids) || bids.length === 0) throw new Error("At least one valid bid is required");
  const previous = new Set(previousWinnerIds);
  const eligible = bids.filter(bid => !previous.has(bid.enrollmentId));
  if (!eligible.length) throw new Error("No eligible member bid remains");
  const lowest = Math.min(...eligible.map(bid => Number(bid.bidAmount)));
  const tied = eligible.filter(bid => Number(bid.bidAmount) === lowest);
  if (tied.length === 1) return tied[0];
  if (typeof tieBreak !== "function") throw new Error("A server-side tie-break function is required");
  const winner = tieBreak(tied);
  if (!tied.includes(winner)) throw new Error("Tie-break function returned an invalid bid");
  return winner;
}

export function closeCycle({ scheme, bids, previousWinnerIds = [], tieBreak }) {
  if (!scheme || Number(scheme.memberCount) <= 0) throw new Error("Invalid scheme");
  if (Number(scheme.enrolledMemberCount) !== Number(scheme.memberCount)) throw new Error("Scheme must have exactly the configured member count before activation");
  const winner = selectWinningBid({ bids, previousWinnerIds, tieBreak });
  const dividend = calculateDividend({ chitValue: scheme.chitValue, winningBidAmount: winner.bidAmount, commissionPercent: scheme.commissionPercent, totalMembers: scheme.memberCount });
  return { winner, ...dividend };
}
