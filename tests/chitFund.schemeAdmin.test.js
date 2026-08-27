import test from "node:test";
import assert from "node:assert/strict";
import { memberHasBlockingActivity, memberRemovalCopy, schemeRemovalCopy } from "../src/features/chitFund/schemeAdmin.js";

test("member removal copy names the member and scheme", () => {
  const copy = memberRemovalCopy("Anita", "Festival Auction");
  assert.match(copy.title, /Anita/);
  assert.match(copy.body, /Anita/);
  assert.match(copy.body, /Festival Auction/);
  assert.equal(copy.confirm, "Remove member");
});

test("scheme removal copy names the scheme and member count", () => {
  const copy = schemeRemovalCopy("Office Fixed", 12);
  assert.match(copy.title, /Office Fixed/);
  assert.match(copy.body, /Office Fixed/);
  assert.match(copy.body, /12 enrolled members/);
  assert.equal(copy.confirm, "Delete scheme");
});

test("member history is blocking across auction, fixed, and predefined records", () => {
  assert.equal(memberHasBlockingActivity({ cycles: [{ winning_enrollment_id: "e1" }] }, "e1"), true);
  assert.equal(memberHasBlockingActivity({ bids: [{ enrollment_id: "e1" }] }, "e1"), true);
  assert.equal(memberHasBlockingActivity({ lifts: [{ enrollment_id: "e1", status: "completed" }] }, "e1"), true);
  assert.equal(memberHasBlockingActivity({ predefinedSchedule: [{ enrollment_id: "e1", status: "completed" }] }, "e1"), true);
  assert.equal(memberHasBlockingActivity({ payments: [{ enrollment_id: "e1", amount_paid: 500 }] }, "e1"), true);
  assert.equal(memberHasBlockingActivity({
    payments: [{ enrollment_id: "e1", amount_paid: 0 }],
    lifts: [{ enrollment_id: "e1", status: "pending" }],
  }, "e1"), false);
});
