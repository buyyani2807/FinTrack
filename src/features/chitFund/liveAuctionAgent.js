import { calculateDividend } from "./calculations.js";
import { createLiveAuctionHarness, TEST_AUCTION_SCHEME, TEST_DATA_MARK } from "./liveAuctionHarness.js";

const caught = async (fn) => {
  try {
    await fn();
    return { ok: false, error: "expected failure" };
  } catch (error) {
    return { ok: true, error: error.message };
  }
};

const record = async (scenarios, id, name, fn) => {
  const started = Date.now();
  try {
    const detail = await fn();
    scenarios.push({ id, name, status: "pass", ms: Date.now() - started, detail: detail || "" });
  } catch (error) {
    scenarios.push({ id, name, status: "fail", ms: Date.now() - started, detail: error.message });
    throw error;
  }
};

export async function runLiveAuctionAgentSuite() {
  const harness = createLiveAuctionHarness();
  const scenarios = [];
  const concurrency = [];
  const defects = [];
  let settlement = null;

  try {
    await record(scenarios, "S01", "Create isolated TEST DATA scheme of ₹10,00,000 with 20 members", () => {
      const { world } = harness;
      if (!world.scheme.name.includes(TEST_DATA_MARK)) throw new Error("Scheme is not marked TEST DATA");
      if (world.scheme.chitValue !== 1_000_000) throw new Error("Chit value is not ₹10,00,000");
      if (world.members.length !== 20) throw new Error("Expected 20 test members");
      if (world.members.some(member => !member.name.includes(TEST_DATA_MARK))) throw new Error("A member is not marked TEST DATA");
      const phones = new Set(world.members.map(member => member.phone));
      const portals = new Set(world.members.map(member => member.portalId));
      if (phones.size !== 20 || portals.size !== 20) throw new Error("Member identities are not unique");
      if (world.productionTouched || world.paymentGatewayCalls) throw new Error("Harness touched a live system");
      return `${world.scheme.name}; installment ₹${world.scheme.installmentAmount}`;
    });

    await record(scenarios, "S02", "Owner activates the fully enrolled draft scheme", () => {
      harness.activate(harness.world.owner);
      if (harness.world.scheme.status !== "active") throw new Error("Scheme did not activate");
    });

    const sessions = [];
    await record(scenarios, "S03", "Owner enables portals and members authenticate", async () => {
      for (const enrollment of harness.world.enrollments.values()) {
        harness.enablePortal(harness.world.owner, enrollment.id);
        const login = harness.memberLogin(enrollment.member.portalId, enrollment.member.pin);
        sessions.push(login);
      }
      if (sessions.length !== 20) throw new Error("Not all members authenticated");
      const badPin = await caught(() => harness.memberLogin(sessions[0].portalId || harness.world.members[0].portalId, "000000"));
      if (!badPin.ok) throw new Error("Bad PIN was accepted");
      return "20 portal sessions; invalid PIN rejected";
    });

    await record(scenarios, "S04", "Unauthorized roles cannot start the auction", async () => {
      const staff = await caught(() => harness.startAuction(harness.world.staff));
      const member = await caught(() => harness.startAuction({ role: "member", id: sessions[0].enrollmentId }));
      if (!staff.ok || !member.ok) throw new Error("A non-owner started the auction");
      return `${staff.error}; ${member.error}`;
    });

    await record(scenarios, "S05", "Owner starts live bidding for month 1", () => {
      const snap = harness.startAuction(harness.world.owner, { cycleNumber: 1, cycleDate: TEST_AUCTION_SCHEME.startDate });
      if (!snap.auction || snap.auction.status !== "open") throw new Error("Auction did not open");
      if (snap.auction.cycleNumber !== 1) throw new Error("Wrong cycle");
    });

    await record(scenarios, "S06", "Members cannot bid at or below commission or above 30%", async () => {
      const { commission, maxBid } = harness.limits;
      const low = await caught(() => harness.customerBid(sessions[0].sessionToken, { bidAmount: commission, nonce: "n-low" }));
      const high = await caught(() => harness.customerBid(sessions[1].sessionToken, { bidAmount: maxBid + 1, nonce: "n-high" }));
      if (!low.ok || !high.ok) throw new Error("Out-of-range bids were accepted");
      return `floor ₹${commission}; cap ₹${maxBid}`;
    });

    await record(scenarios, "S07", "First valid member bid is accepted above commission", async () => {
      const result = await harness.customerBid(sessions[0].sessionToken, { bidAmount: 60_000, nonce: "n-m01-60k" });
      if (result.duplicate || result.bid.bidAmount !== 60_000) throw new Error("Opening bid failed");
      if (harness.snapshot().leadingBid.enrollmentId !== sessions[0].enrollmentId) throw new Error("Leader mismatch");
    });

    await record(scenarios, "S08", "Decreasing or equal bids are rejected; raising the bid is allowed", async () => {
      const down = await caught(() => harness.customerBid(sessions[1].sessionToken, { bidAmount: 55_000, nonce: "n-down" }));
      const same = await caught(() => harness.customerBid(sessions[2].sessionToken, { bidAmount: 60_000, nonce: "n-same" }));
      const up = await harness.customerBid(sessions[3].sessionToken, { bidAmount: 90_000, nonce: "n-m04-90k" });
      if (!down.ok || !same.ok) throw new Error("Non-raising bids were accepted");
      if (up.bid.bidAmount !== 90_000) throw new Error("Raise failed");
      return down.error;
    });

    await record(scenarios, "S09", "Duplicate client nonce is idempotent", async () => {
      const first = await harness.customerBid(sessions[4].sessionToken, { bidAmount: 110_000, nonce: "n-dup" });
      const second = await harness.customerBid(sessions[4].sessionToken, { bidAmount: 110_000, nonce: "n-dup" });
      if (!second.duplicate || first.bid.id !== second.bid.id) throw new Error("Duplicate nonce inserted a second bid");
      const count = harness.world.bids.filter(bid => bid.clientNonce === "n-dup").length;
      if (count !== 1) throw new Error("Nonce uniqueness failed");
    });

    await record(scenarios, "S10", "Concurrent bids serialize under the auction lock", async () => {
      const started = Date.now();
      const attempts = [
        harness.customerBid(sessions[5].sessionToken, { bidAmount: 150_000, nonce: "n-race-150" }),
        harness.customerBid(sessions[6].sessionToken, { bidAmount: 140_000, nonce: "n-race-140" }),
        harness.customerBid(sessions[7].sessionToken, { bidAmount: 160_000, nonce: "n-race-160" }),
      ];
      const settled = await Promise.allSettled(attempts);
      const ms = Date.now() - started;
      const accepted = settled.filter(item => item.status === "fulfilled" && !item.value.duplicate).map(item => item.value.bid.bidAmount);
      const rejected = settled.filter(item => item.status === "rejected").length;
      if (!accepted.includes(160_000)) throw new Error("Highest concurrent bid did not land");
      if (harness.snapshot().leadingBid.bidAmount !== 160_000) throw new Error("Leader after race is wrong");
      concurrency.push({ scenario: "S10", ms, accepted, rejected, leading: 160_000 });
      return `accepted ${accepted.join(", ")}; rejected ${rejected}; ${ms}ms`;
    });

    await record(scenarios, "S11", "Concurrent identical amounts accept only the first lock winner", async () => {
      await harness.customerBid(sessions[8].sessionToken, { bidAmount: 170_000, nonce: "n-pre-170" });
      const started = Date.now();
      const settled = await Promise.allSettled([
        harness.customerBid(sessions[9].sessionToken, { bidAmount: 180_000, nonce: "n-tie-a" }),
        harness.customerBid(sessions[10].sessionToken, { bidAmount: 180_000, nonce: "n-tie-b" }),
      ]);
      const ms = Date.now() - started;
      const wins = settled.filter(item => item.status === "fulfilled");
      const losses = settled.filter(item => item.status === "rejected");
      if (wins.length !== 1 || losses.length !== 1) throw new Error("Tie race did not accept exactly one bid");
      if (harness.snapshot().leadingBid.bidAmount !== 180_000) throw new Error("Tied amount did not become leader");
      concurrency.push({ scenario: "S11", ms, accepted: 1, rejected: 1, leading: 180_000 });
      return `one accepted, one rejected in ${ms}ms`;
    });

    await record(scenarios, "S12", "Staff may record a higher bid; staff cannot be impersonated by a member", async () => {
      const staff = await harness.staffBid(harness.world.owner, {
        auctionId: harness.snapshot().auction.id,
        enrollmentId: sessions[11].enrollmentId,
        bidAmount: 200_000,
        nonce: "n-staff-200",
      });
      const asStaff = await caught(() => harness.staffBid(harness.world.staff, {
        auctionId: harness.snapshot().auction.id,
        enrollmentId: sessions[12].enrollmentId,
        bidAmount: 210_000,
        nonce: "n-staff-forbidden",
      }));
      if (staff.bid.bidAmount !== 200_000) throw new Error("Owner staff bid failed");
      if (!asStaff.ok) throw new Error("Collection staff placed a live bid");
      return asStaff.error;
    });

    await record(scenarios, "S13", "Paused auction rejects bids; resume restores bidding", async () => {
      harness.pauseAuction(harness.world.owner);
      const paused = await caught(() => harness.customerBid(sessions[13].sessionToken, { bidAmount: 220_000, nonce: "n-paused" }));
      harness.startAuction(harness.world.owner);
      const resumed = await harness.customerBid(sessions[13].sessionToken, { bidAmount: 220_000, nonce: "n-resumed-220" });
      if (!paused.ok) throw new Error("Bid accepted while paused");
      if (resumed.bid.bidAmount !== 220_000) throw new Error("Resume bid failed");
      return paused.error;
    });

    await record(scenarios, "S14", "Refresh/reconnect during an open auction keeps the same leader", () => {
      const before = harness.snapshot();
      const again = harness.reconnect(sessions[0].sessionToken);
      if (again.leadingBid.bidAmount !== before.leadingBid.bidAmount) throw new Error("Leader changed on reconnect");
      if (again.auction.id !== before.auction.id) throw new Error("Auction identity changed on reconnect");
      return `leader ₹${again.leadingBid.bidAmount}; ticket ${again.leadingBid.ticket}`;
    });

    await record(scenarios, "S15", "Expired session and unknown enrollment cannot bid", async () => {
      harness.expireSession(sessions[14].sessionToken);
      const expired = await caught(() => harness.customerBid(sessions[14].sessionToken, { bidAmount: 230_000, nonce: "n-expired" }));
      const unknown = await caught(() => harness.staffBid(harness.world.owner, {
        auctionId: harness.snapshot().auction.id,
        enrollmentId: "enroll-unknown",
        bidAmount: 230_000,
        nonce: "n-unknown",
      }));
      if (!expired.ok || !unknown.ok) throw new Error("Unauthorized bid was stored");
      return `${expired.error}; ${unknown.error}`;
    });

    await record(scenarios, "S16", "More members raise toward the cap; bid history stays ordered", async () => {
      await harness.customerBid(sessions[15].sessionToken, { bidAmount: 250_000, nonce: "n-m16-250" });
      await harness.customerBid(sessions[16].sessionToken, { bidAmount: 280_000, nonce: "n-m17-280" });
      const last = await harness.customerBid(sessions[17].sessionToken, { bidAmount: 300_000, nonce: "n-m18-300" });
      const history = harness.snapshot().bids;
      if (last.bid.bidAmount !== 300_000) throw new Error("Cap bid failed");
      if (history.length < 10) throw new Error("Bid history is incomplete");
      const ordered = [...history].sort((a, b) => b.bidAmount - a.bidAmount || String(a.submittedAt).localeCompare(String(b.submittedAt)));
      if (ordered[0].id !== harness.snapshot().leadingBid.id) throw new Error("History sort does not match leader");
      return `${history.length} bids; leader ₹300,000`;
    });

    await record(scenarios, "S17", "Finalize selects the highest discount, computes prize, and writes installments", async () => {
      const auctionId = harness.snapshot().auction.id;
      const result = await harness.endAuction(harness.world.owner, auctionId);
      const expected = calculateDividend({
        chitValue: 1_000_000,
        winningBidAmount: 700_000,
        commissionPercent: 5,
        totalMembers: 20,
      });
      if (result.leader.bidAmount !== 300_000) throw new Error("Winner is not the ₹3,00,000 bid");
      if (result.payout !== 700_000) throw new Error("Prize payout is not ₹7,00,000");
      if (result.dividend.commission !== expected.commission) throw new Error("Commission mismatch");
      if (result.dividend.discount !== expected.discount) throw new Error("Discount mismatch");
      if (result.dividend.dividendPerMember !== expected.dividendPerMember) throw new Error("Dividend mismatch");
      if (harness.world.installments.length !== 20) throw new Error("Installments were not created for every member");
      const net = harness.world.installments[0].netAmountDue;
      if (net !== 50_000 - expected.dividendPerMember) throw new Error("Net installment is wrong");
      if (harness.world.notifications.length) throw new Error("A live notification was queued");
      settlement = {
        winnerTicket: result.leader.ticket,
        winnerName: result.leader.memberName,
        discount: result.leader.bidAmount,
        prize: result.payout,
        commission: result.dividend.commission,
        distributable: result.dividend.distributable,
        dividendPerMember: result.dividend.dividendPerMember,
        remainder: result.dividend.retainedRemainder,
        installmentDue: 50_000,
        netInstallment: net,
        installmentRows: harness.world.installments.length,
      };
      return `Ticket ${settlement.winnerTicket} · prize ₹${settlement.prize} · dividend ₹${settlement.dividendPerMember}`;
    });

    await record(scenarios, "S18", "Bids after closure and a second finalize are rejected", async () => {
      const closed = await caught(() => harness.customerBid(sessions[18].sessionToken, { bidAmount: 300_000, nonce: "n-closed" }));
      const again = await caught(() => harness.endAuction(harness.world.owner, [...harness.world.auctions.keys()][0]));
      if (!closed.ok || !again.ok) throw new Error("Closed auction still accepted work");
      return `${closed.error}; ${again.error}`;
    });

    await record(scenarios, "S19", "Prior winner cannot bid in the next month", async () => {
      const next = harness.startAuction(harness.world.owner, { cycleNumber: 2, cycleDate: "2026-10-01" });
      const winnerSession = sessions.find(row => row.enrollmentId === harness.world.cycles[0].winningEnrollmentId);
      const blocked = await caught(() => harness.customerBid(winnerSession.sessionToken, { bidAmount: 80_000, nonce: "n-prior-winner" }));
      if (!next.auction || next.auction.cycleNumber !== 2) throw new Error("Month 2 did not open");
      if (!blocked.ok) throw new Error("Prior winner placed a bid");
      return blocked.error;
    });

    await record(scenarios, "S20", "Rollback removes the isolated TEST DATA world", () => {
      harness.destroy();
      if (harness.live()) throw new Error("Harness still live");
      const after = caught(() => harness.snapshot());
      if (!after.ok && after.error !== "expected failure") {
        /* caught() is sync-incompatible; destroy is sync */
      }
      try {
        harness.snapshot();
        throw new Error("Snapshot survived rollback");
      } catch (error) {
        if (!/rolled back/.test(error.message)) throw error;
      }
      return "All generated test records discarded";
    });

    defects.push({
      id: "LA-001",
      severity: "High",
      status: "Fixed — FT-035 (migration 051 + validateLiveBid payout limits)",
      title: "Ending a live auction can fail if payout falls outside min/max bid percents",
      detail: "Live discount bids now reject at place-bid time when the resulting payout % is outside scheme min/max. Finalize from live bidding skips the monthly-bid payout gate after re-validating live rules.",
    });
    defects.push({
      id: "LA-002",
      severity: "Medium",
      status: "Open — migration history",
      title: "025 originally used lowest-payout-wins; 026/027 switched to highest-discount-wins",
      detail: "If a staging database stopped at 025, live bidding would invert winner selection versus the current UI. Confirm 027 is applied before treating a live auction as production-ready.",
    });
    defects.push({
      id: "LA-003",
      severity: "Medium",
      status: "Open — environment",
      title: "Live RPC path was not executed against a staging database",
      detail: "No scheme, member, payment, report, or notification was written to the configured Supabase project. End-to-end Postgres locks, RLS, and portal RPCs remain unverified on a remote host.",
    });

    const passed = scenarios.filter(row => row.status === "pass").length;
    return {
      environment: {
        mode: "isolated-in-memory",
        productionDataModified: false,
        notificationsSent: 0,
        paymentGatewayUsed: false,
        scheme: TEST_AUCTION_SCHEME,
        limits: harness.limits,
        memberCount: 20,
        runAt: new Date().toISOString(),
      },
      scenarios,
      concurrency,
      settlement,
      defects,
      conclusion: {
        isolatedWorkflow: passed === scenarios.length ? "pass" : "fail",
        liveDatabase: "not_run",
        readyToClaimLiveSuccess: false,
        passed,
        failed: scenarios.length - passed,
        total: scenarios.length,
      },
    };
  } catch (error) {
    harness.destroy();
    const passed = scenarios.filter(row => row.status === "pass").length;
    return {
      environment: {
        mode: "isolated-in-memory",
        productionDataModified: false,
        notificationsSent: 0,
        paymentGatewayUsed: false,
        scheme: TEST_AUCTION_SCHEME,
        runAt: new Date().toISOString(),
      },
      scenarios,
      concurrency,
      settlement,
      defects,
      conclusion: {
        isolatedWorkflow: "fail",
        liveDatabase: "not_run",
        readyToClaimLiveSuccess: false,
        passed,
        failed: scenarios.length - passed,
        total: scenarios.length,
        error: error.message,
      },
    };
  }
}
