import test from "node:test";
import assert from "node:assert/strict";
import { calculateDividend, validateBid } from "../src/features/chitFund/calculations.js";
import { liveBidPayout, validateLiveBid } from "../src/features/chitFund/liveBidding.js";

test("Auction live discount converts to payout before existing dividend calculations", () => {
  const chitValue = 1_000_000;
  const discountBid = 200_000;
  const payout = liveBidPayout({ chitValue, bidAmount: discountBid });
  assert.equal(payout, 800_000);
  assert.deepEqual(calculateDividend({
    chitValue,
    winningBidAmount: payout,
    commissionPercent: 5,
    totalMembers: 20,
  }), {
    discount: 200_000,
    commission: 50_000,
    distributable: 150_000,
    dividendPerMember: 7_500,
    retainedRemainder: 0,
  });
});

test("Auction payout limits remain compatible with the 30 percent live-bid cap", () => {
  const chitValue = 1_000_000;
  const live = validateLiveBid({
    bidAmount: 300_000,
    chitValue,
    commissionPercent: 5,
  });
  assert.equal(live.payoutAmount, 700_000);
  assert.deepEqual(validateBid({
    bidAmount: live.payoutAmount,
    chitValue,
    minBidPercent: 70,
    maxBidPercent: 95,
  }), { bidAmount: 700_000, bidPercent: 70 });
});
