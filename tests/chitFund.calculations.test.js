import test from "node:test";
import assert from "node:assert/strict";
import { calculateDividend, closeCycle, selectWinningBid, validateBid } from "../src/features/chitFund/calculations.js";

test("accepts a payout bid within configured percentage limits", () => {
  assert.deepEqual(validateBid({ bidAmount: 80000, chitValue: 100000, minBidPercent: 70, maxBidPercent: 95 }), { bidAmount: 80000, bidPercent: 80 });
});

test("rejects a payout bid outside configured limits", () => {
  assert.throws(() => validateBid({ bidAmount: 60000, chitValue: 100000, minBidPercent: 70, maxBidPercent: 95 }), /outside/);
});

test("selects the lowest payout and excludes prior winners", () => {
  const winner = selectWinningBid({ bids: [{ enrollmentId: "a", bidAmount: 85000 }, { enrollmentId: "b", bidAmount: 80000 }], previousWinnerIds: ["a"] });
  assert.equal(winner.enrollmentId, "b");
});

test("uses the supplied server tie-break result", () => {
  const winner = selectWinningBid({ bids: [{ enrollmentId: "a", bidAmount: 80000 }, { enrollmentId: "b", bidAmount: 80000 }], tieBreak: tied => tied[1] });
  assert.equal(winner.enrollmentId, "b");
});

test("calculates commission before dividend distribution and retains rounding remainder", () => {
  assert.deepEqual(calculateDividend({ chitValue: 100000, winningBidAmount: 80000, commissionPercent: 5, totalMembers: 3 }), {
    discount: 20000, commission: 5000, distributable: 15000, dividendPerMember: 5000, retainedRemainder: 0
  });
  assert.equal(calculateDividend({ chitValue: 100000, winningBidAmount: 80001, commissionPercent: 0, totalMembers: 3 }).retainedRemainder, 0.01);
});

test("closes a fully enrolled cycle and rejects incomplete schemes", () => {
  const result = closeCycle({ scheme: { chitValue: 100000, memberCount: 2, enrolledMemberCount: 2, commissionPercent: 5 }, bids: [{ enrollmentId: "a", bidAmount: 80000 }], tieBreak: tied => tied[0] });
  assert.equal(result.winner.enrollmentId, "a");
  assert.throws(() => closeCycle({ scheme: { chitValue: 100000, memberCount: 2, enrolledMemberCount: 1, commissionPercent: 5 }, bids: [{ enrollmentId: "a", bidAmount: 80000 }] }), /exactly/);
});
