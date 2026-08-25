import test from "node:test";
import assert from "node:assert/strict";
import { leadingLiveBid, validateLiveBid, winsForEnrollment } from "../src/features/chitFund/liveBidding.js";

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

test("rejects a live bid that is not higher than the leader", () => {
  assert.throws(
    () => validateLiveBid({ bidAmount: 85000, chitValue: 100000, minBidPercent: 70, maxBidPercent: 95, leadingBidAmount: 85000 }),
    /higher/
  );
  assert.deepEqual(
    validateLiveBid({ bidAmount: 86000, chitValue: 100000, minBidPercent: 70, maxBidPercent: 95, leadingBidAmount: 85000 }),
    { bidAmount: 86000, bidPercent: 86 }
  );
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
