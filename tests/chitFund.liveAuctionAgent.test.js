import test from "node:test";
import assert from "node:assert/strict";
import { runLiveAuctionAgentSuite } from "../src/features/chitFund/liveAuctionAgent.js";
import { TEST_AUCTION_SCHEME, TEST_DATA_MARK, createLiveAuctionHarness, testMemberIdentity } from "../src/features/chitFund/liveAuctionHarness.js";

test("test identities are unique and marked TEST DATA", () => {
  const rows = Array.from({ length: 20 }, (_, index) => testMemberIdentity(index + 1));
  assert.equal(new Set(rows.map(row => row.phone)).size, 20);
  assert.equal(new Set(rows.map(row => row.portalId)).size, 20);
  assert.ok(rows.every(row => row.name.startsWith(TEST_DATA_MARK)));
  assert.equal(TEST_AUCTION_SCHEME.chitValue, 1_000_000);
  assert.equal(TEST_AUCTION_SCHEME.memberCount, 20);
  assert.equal(TEST_AUCTION_SCHEME.installmentAmount * TEST_AUCTION_SCHEME.memberCount, TEST_AUCTION_SCHEME.chitValue);
});

test("isolated harness rolls back generated records", () => {
  const harness = createLiveAuctionHarness();
  harness.activate(harness.world.owner);
  harness.destroy();
  assert.equal(harness.live(), false);
  assert.throws(() => harness.snapshot(), /rolled back/);
});

test("live auction agent covers the 20-member TEST DATA workflow", async () => {
  const report = await runLiveAuctionAgentSuite();
  const failed = report.scenarios.filter(row => row.status === "fail");
  assert.equal(failed.length, 0, failed.map(row => `${row.id}: ${row.detail}`).join(" | "));
  assert.equal(report.conclusion.isolatedWorkflow, "pass");
  assert.equal(report.conclusion.liveDatabase, "not_run");
  assert.equal(report.conclusion.readyToClaimLiveSuccess, false);
  assert.equal(report.environment.productionDataModified, false);
  assert.equal(report.environment.notificationsSent, 0);
  assert.equal(report.settlement.discount, 300_000);
  assert.equal(report.settlement.prize, 700_000);
  assert.equal(report.settlement.commission, 50_000);
  assert.equal(report.settlement.dividendPerMember, 12_500);
  assert.equal(report.settlement.netInstallment, 37_500);
  assert.equal(report.settlement.installmentRows, 20);
});
