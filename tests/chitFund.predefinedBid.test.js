import test from "node:test";
import assert from "node:assert/strict";
import { predefinedBidSchedule, validatePredefinedBidChit } from "../src/features/chitFund/predefinedBidChit.js";

const example = {
  chitValue: 5_000_000,
  memberCount: 25,
  durationMonths: 25,
  startingEmi: 152_000,
  emiIncrement: 2_000,
  startingComm: 48_000,
  commDecrement: 2_000,
  startingAuctionAmount: 1_200_000,
  auctionAmountDecrement: 50_000,
  startingBidAmount: 3_800_000,
  bidAmountIncrement: 50_000,
  managerCommissionPercent: 3,
};

test("generates the required 50 Lakh predefined-bid schedule", () => {
  const schedule = predefinedBidSchedule(example);
  assert.deepEqual(schedule[0], {
    month: 1, emi: 152_000, comm: 48_000, auctionAmount: 1_200_000,
    bidAmount: 3_800_000, managerCommissionPercent: 3,
    managerCommission: 150_000, netReceivable: 3_650_000,
  });
  assert.deepEqual(schedule[1], {
    month: 2, emi: 154_000, comm: 46_000, auctionAmount: 1_150_000,
    bidAmount: 3_850_000, managerCommissionPercent: 3,
    managerCommission: 150_000, netReceivable: 3_700_000,
  });
  assert.deepEqual(schedule[24], {
    month: 25, emi: 200_000, comm: 0, auctionAmount: 0,
    bidAmount: 5_000_000, managerCommissionPercent: 3,
    managerCommission: 150_000, netReceivable: 4_850_000,
  });
});

test("supports configurations other than the reference example", () => {
  const schedule = validatePredefinedBidChit({
    ...example, chitValue: 1_000_000, memberCount: 10, durationMonths: 10,
    startingEmi: 80_000, emiIncrement: 1_000, startingComm: 20_000,
    commDecrement: 1_000, startingAuctionAmount: 200_000,
    auctionAmountDecrement: 10_000, startingBidAmount: 800_000,
    bidAmountIncrement: 10_000, managerCommissionPercent: 2.5,
  }).schedule;
  assert.equal(schedule[0].managerCommission, 25_000);
  assert.equal(schedule[0].netReceivable, 775_000);
});

test("rejects invalid predefined-bid configurations", () => {
  assert.throws(() => validatePredefinedBidChit({ ...example, durationMonths: 26 }), /Duration/);
  assert.throws(() => validatePredefinedBidChit({ ...example, managerCommissionPercent: -1 }), /commission/);
});
