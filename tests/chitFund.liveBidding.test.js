import test from "node:test";
import assert from "node:assert/strict";
import { leadingLiveBid, liveAuctionLimits, liveBidPayout, validateLiveBid, winsForEnrollment } from "../src/features/chitFund/liveBidding.js";

test("live bidding follows highest bid wins", () => {
  const leader = leadingLiveBid([
    { enrollmentId: "b", bidAmount: 85000, submittedAt: "2026-08-25T10:00:00Z" },
    { enrollmentId: "a", bidAmount: 82000, submittedAt: "2026-08-25T10:01:00Z" },
  ]);
  assert.equal(leader.enrollmentId, "b");
});

test("earlier bid wins a tie at the same amount", () => {
  const leader = leadingLiveBid([
    { enrollmentId: "a", bidAmount: 90000, submittedAt: "2026-08-25T10:00:00Z" },
    { enrollmentId: "b", bidAmount: 90000, submittedAt: "2026-08-25T10:01:00Z" },
  ]);
  assert.equal(leader.enrollmentId, "a");
});

test("live bidding starts above commission and caps at 30 percent of chit value", () => {
  const base = { chitValue: 1000000, commissionPercent: 5 };
  assert.deepEqual(liveAuctionLimits(base), { commission: 50000, maxBid: 300000, maxPercent: 30 });
  assert.throws(() => validateLiveBid({ ...base, bidAmount: 50000 }), /commission/);
  assert.throws(() => validateLiveBid({ ...base, bidAmount: 300001 }), /30%/);
  assert.deepEqual(
    validateLiveBid({ ...base, bidAmount: 50000.01 }),
    { bidAmount: 50000.01, bidPercent: 5, payoutAmount: 949999.99 }
  );
  assert.deepEqual(
    validateLiveBid({ ...base, bidAmount: 200000 }),
    { bidAmount: 200000, bidPercent: 20, payoutAmount: 800000 }
  );
  assert.equal(liveBidPayout({ chitValue: 1000000, bidAmount: 300000 }), 700000);
});

test("rejects a live bid that is not higher than the leader", () => {
  const base = { chitValue: 1000000, commissionPercent: 5, leadingBidAmount: 200000 };
  assert.throws(() => validateLiveBid({ ...base, bidAmount: 200000 }), /higher/);
  assert.equal(validateLiveBid({ ...base, bidAmount: 200001 }).bidAmount, 200001);
});

test("member win history is joined by enrollment id, not name", () => {
  const wins = winsForEnrollment(
    [{ id: "c1", cycle_number: 5, cycle_date: "2026-08-25" }, { id: "c2", cycle_number: 2, cycle_date: "2026-05-25" }],
    [
      { enrollment_id: "e1", cycle_id: "c1", bid_amount: 820000, status: "winner" },
      { enrollment_id: "e2", cycle_id: "c2", bid_amount: 400000, status: "winner" },
    ],
    "e1"
  );
  assert.deepEqual(wins, [{ month: 5, bidAmount: 820000, bidDate: "2026-08-25", status: "Winner" }]);
});
