import { calculateDividend, roundMoney } from "./calculations.js";
import { leadingLiveBid, liveAuctionLimits, validateLiveBid } from "./liveBidding.js";

export const TEST_DATA_MARK = "[TEST DATA]";

export const TEST_AUCTION_SCHEME = {
  name: `${TEST_DATA_MARK} Auction ₹10L · 20 members · isolated harness`,
  chitValue: 1_000_000,
  durationMonths: 20,
  memberCount: 20,
  installmentAmount: 50_000,
  commissionPercent: 5,
  minBidPercent: 70,
  maxBidPercent: 95,
  startDate: "2026-09-01",
  latePenaltyAmount: 0,
  securityDepositAmount: 0,
};

const pad = n => String(n).padStart(2, "0");

export function testMemberIdentity(ticket) {
  return {
    ticket,
    name: `${TEST_DATA_MARK} Auction Member ${pad(ticket)}`,
    phone: `00000${String(10000 + ticket).slice(-5)}`,
    address: `${TEST_DATA_MARK} isolated lab seat ${ticket}`,
    portalId: `CF-TEST-${pad(ticket)}`,
    pin: `1${String(10000 + ticket).slice(-5)}`,
  };
}

class Mutex {
  constructor() {
    this.tail = Promise.resolve();
  }
  run(fn) {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(() => undefined, () => undefined);
    return next;
  }
}

function fail(message) {
  const error = new Error(message);
  error.testOnly = true;
  throw error;
}

export function createLiveAuctionHarness({ scheme = TEST_AUCTION_SCHEME, now = Date.now() } = {}) {
  let clock = Number(now);
  let seq = 0;
  const nextId = prefix => `${prefix}-${++seq}`;
  const lock = new Mutex();
  const notifications = [];
  const audit = [];
  const destroyed = { value: false };

  const world = {
    isolated: true,
    productionTouched: false,
    paymentGatewayCalls: 0,
    scheme: {
      id: nextId("scheme"),
      ...scheme,
      status: "draft",
      organizationId: "org-test-isolated",
    },
    owner: { id: "actor-owner", role: "owner" },
    staff: { id: "actor-staff", role: "staff" },
    members: [],
    enrollments: new Map(),
    sessions: new Map(),
    auctions: new Map(),
    bids: [],
    cycles: [],
    monthlyBids: [],
    installments: [],
    notifications,
    audit,
  };

  for (let ticket = 1; ticket <= scheme.memberCount; ticket += 1) {
    const identity = testMemberIdentity(ticket);
    const member = { id: nextId("member"), ...identity, testData: true };
    const enrollment = {
      id: nextId("enroll"),
      memberId: member.id,
      ticket,
      status: "active",
      schemeId: world.scheme.id,
    };
    world.members.push(member);
    world.enrollments.set(enrollment.id, { ...enrollment, member });
  }

  const stamp = () => {
    clock += 1;
    return new Date(clock).toISOString();
  };

  const log = (action, data = {}) => {
    audit.push({ at: stamp(), action, ...data });
  };

  const requireAlive = () => {
    if (destroyed.value) fail("Harness has been rolled back");
  };

  const requireOwner = actor => {
    if (!actor || actor.role !== "owner") fail("Only a financier can manage Chit Fund live bidding");
  };

  const leading = auctionId => leadingLiveBid(world.bids.filter(bid => bid.auctionId === auctionId));

  const snapshot = () => {
    requireAlive();
    const open = [...world.auctions.values()].find(item => item.status === "open" || item.status === "paused") || null;
    const leader = open ? leading(open.id) : null;
    return {
      scheme: { ...world.scheme },
      auction: open ? { ...open } : null,
      leadingBid: leader ? { ...leader } : null,
      bids: world.bids.filter(bid => !open || bid.auctionId === open.id).map(bid => ({ ...bid })),
      members: [...world.enrollments.values()].map(row => ({
        enrollmentId: row.id,
        ticket: row.ticket,
        name: row.member.name,
        status: row.status,
        eligible: row.status === "active" && !world.monthlyBids.some(item => item.enrollmentId === row.id && item.status === "winner"),
      })),
      notifications: [...notifications],
      auditCount: audit.length,
    };
  };

  const activate = actor => {
    requireAlive();
    requireOwner(actor);
    if (world.enrollments.size !== world.scheme.memberCount) fail("Scheme must have exactly its configured members");
    world.scheme.status = "active";
    log("scheme_activated", { schemeId: world.scheme.id });
    return snapshot();
  };

  const enablePortal = (actor, enrollmentId) => {
    requireAlive();
    requireOwner(actor);
    const enrollment = world.enrollments.get(enrollmentId);
    if (!enrollment) fail("Chit Fund member not found");
    enrollment.portalEnabled = true;
    log("portal_enabled", { enrollmentId });
    return { portalId: enrollment.member.portalId };
  };

  const memberLogin = (portalId, pin) => {
    requireAlive();
    const enrollment = [...world.enrollments.values()].find(row => row.member.portalId === portalId);
    if (!enrollment || !enrollment.portalEnabled) fail("Your Chit session has expired. Sign in again.");
    if (enrollment.member.pin !== pin) fail("Invalid Chit customer PIN");
    const token = nextId("session");
    world.sessions.set(token, { enrollmentId: enrollment.id, expiresAt: clock + 60 * 60 * 1000 });
    log("member_login", { enrollmentId: enrollment.id, portalId });
    return { sessionToken: token, enrollmentId: enrollment.id, ticket: enrollment.ticket, name: enrollment.member.name };
  };

  const sessionEnrollment = token => {
    const session = world.sessions.get(token);
    if (!session || session.expiresAt <= clock) fail("Your Chit session has expired. Sign in again.");
    const enrollment = world.enrollments.get(session.enrollmentId);
    if (!enrollment) fail("Your Chit session has expired. Sign in again.");
    return enrollment;
  };

  const startAuction = (actor, { cycleNumber, cycleDate } = {}) => {
    requireAlive();
    requireOwner(actor);
    if (world.scheme.status !== "active") fail("Only active schemes can start live bidding");
    const paused = [...world.auctions.values()].find(item => item.status === "paused");
    if (paused) {
      paused.status = "open";
      paused.updatedAt = stamp();
      log("auction_resumed", { auctionId: paused.id });
      return snapshot();
    }
    if ([...world.auctions.values()].some(item => item.status === "open")) fail("This scheme already has a live bidding session");
    const nextCycle = cycleNumber || (world.cycles.reduce((max, row) => Math.max(max, row.cycleNumber), 0) + 1);
    if (nextCycle > world.scheme.durationMonths) fail("All months for this scheme already have bids");
    if (world.cycles.some(row => row.cycleNumber === nextCycle)) fail("This month already has a finalized bid");
    const auction = {
      id: nextId("auction"),
      schemeId: world.scheme.id,
      cycleNumber: nextCycle,
      cycleDate: cycleDate || world.scheme.startDate,
      status: "open",
      startedAt: stamp(),
      startedBy: actor.id,
    };
    world.auctions.set(auction.id, auction);
    log("auction_started", { auctionId: auction.id, cycleNumber: nextCycle });
    return snapshot();
  };

  const pauseAuction = actor => {
    requireAlive();
    requireOwner(actor);
    const open = [...world.auctions.values()].find(item => item.status === "open");
    if (!open) fail("No open live bidding session to stop");
    open.status = "paused";
    open.updatedAt = stamp();
    log("auction_paused", { auctionId: open.id });
    return snapshot();
  };

  const insertBid = ({ auction, enrollment, bidAmount, nonce, actorId }) => {
    const existing = world.bids.find(bid => bid.auctionId === auction.id && bid.clientNonce === nonce);
    if (existing) return { duplicate: true, bid: existing };
    if (auction.status !== "open") fail("Live bidding is not open");
    if (enrollment.status !== "active") fail("Member is not eligible to bid in this scheme");
    if (world.monthlyBids.some(item => item.enrollmentId === enrollment.id && item.status === "winner")) {
      fail("This member has already won a month in this scheme");
    }
    const leader = leading(auction.id);
    const accepted = validateLiveBid({
      bidAmount,
      chitValue: world.scheme.chitValue,
      commissionPercent: world.scheme.commissionPercent,
      leadingBidAmount: leader?.bidAmount,
      minBidPercent: world.scheme.minBidPercent,
      maxBidPercent: world.scheme.maxBidPercent,
    });
    const bid = {
      id: nextId("bid"),
      auctionId: auction.id,
      enrollmentId: enrollment.id,
      ticket: enrollment.ticket,
      memberName: enrollment.member.name,
      bidAmount: accepted.bidAmount,
      bidPercent: accepted.bidPercent,
      payoutAmount: accepted.payoutAmount,
      clientNonce: nonce,
      status: "valid",
      submittedAt: stamp(),
      createdBy: actorId || null,
    };
    world.bids.push(bid);
    auction.updatedAt = bid.submittedAt;
    log("bid_accepted", { bidId: bid.id, enrollmentId: enrollment.id, bidAmount: bid.bidAmount });
    return { duplicate: false, bid };
  };

  const staffBid = (actor, { auctionId, enrollmentId, bidAmount, nonce }) => lock.run(async () => {
    requireAlive();
    requireOwner(actor);
    if (!String(nonce || "").trim()) fail("Bid could not be submitted");
    const auction = world.auctions.get(auctionId);
    if (!auction) fail("Live bidding session not found");
    const enrollment = world.enrollments.get(enrollmentId);
    if (!enrollment) fail("Member is not eligible to bid in this scheme");
    return insertBid({ auction, enrollment, bidAmount, nonce: String(nonce).trim(), actorId: actor.id });
  });

  const customerBid = (sessionToken, { bidAmount, nonce }) => lock.run(async () => {
    requireAlive();
    if (!String(nonce || "").trim()) fail("Bid could not be submitted");
    const enrollment = sessionEnrollment(sessionToken);
    const auction = [...world.auctions.values()].find(item => item.schemeId === enrollment.schemeId && item.status === "open");
    if (!auction) fail("Live bidding is not open yet");
    return insertBid({ auction, enrollment, bidAmount, nonce: String(nonce).trim(), actorId: null });
  });

  const endAuction = (actor, auctionId) => lock.run(async () => {
    requireAlive();
    requireOwner(actor);
    const auction = world.auctions.get(auctionId);
    if (!auction) fail("Live bidding session not found");
    if (auction.status === "finalized") fail("This month is already finalized");
    if (auction.status === "cancelled") fail("This live bidding session was cancelled");
    if (auction.status !== "open" && auction.status !== "paused") fail("Live bidding cannot be ended");
    if (world.cycles.some(row => row.cycleNumber === auction.cycleNumber)) fail("This month already has a finalized bid");
    const leader = leading(auction.id);
    if (!leader) fail("At least one valid bid is required before ending");
    // Re-check live rules (including payout %). Settle path skips the monthly-bid gate.
    const accepted = validateLiveBid({
      bidAmount: leader.bidAmount,
      chitValue: world.scheme.chitValue,
      commissionPercent: world.scheme.commissionPercent,
      minBidPercent: world.scheme.minBidPercent,
      maxBidPercent: world.scheme.maxBidPercent,
    });
    const payout = accepted.payoutAmount;
    const dividend = calculateDividend({
      chitValue: world.scheme.chitValue,
      winningBidAmount: payout,
      commissionPercent: world.scheme.commissionPercent,
      totalMembers: world.scheme.memberCount,
    });
    const cycle = {
      id: nextId("cycle"),
      cycleNumber: auction.cycleNumber,
      cycleDate: auction.cycleDate,
      winningEnrollmentId: leader.enrollmentId,
      winningBidAmount: payout,
      discountAmount: dividend.discount,
      commissionAmount: dividend.commission,
      distributableAmount: dividend.distributable,
      dividendPerMember: dividend.dividendPerMember,
      retainedRemainder: dividend.retainedRemainder,
      notes: "Finalized from live bidding",
    };
    world.cycles.push(cycle);
    world.monthlyBids.push({ enrollmentId: leader.enrollmentId, cycleId: cycle.id, bidAmount: payout, status: "winner" });
    world.installments = [...world.enrollments.values()].map(row => ({
      cycleId: cycle.id,
      enrollmentId: row.id,
      amountDue: world.scheme.installmentAmount,
      dividendCredit: dividend.dividendPerMember,
      netAmountDue: roundMoney(Math.max(0, world.scheme.installmentAmount - dividend.dividendPerMember)),
      dueDate: auction.cycleDate,
      amountPaid: 0,
    }));
    world.bids.forEach(bid => {
      if (bid.auctionId === auction.id) bid.status = bid.id === leader.id ? "winner" : "not_selected";
    });
    auction.status = "finalized";
    auction.winningEnrollmentId = leader.enrollmentId;
    auction.winningBidAmount = leader.bidAmount;
    auction.payoutAmount = payout;
    auction.finalizedCycleId = cycle.id;
    auction.endedAt = stamp();
    auction.endedBy = actor.id;
    log("auction_finalized", { auctionId: auction.id, winner: leader.enrollmentId, discount: leader.bidAmount, payout });
    return { snapshot: snapshot(), cycle, dividend, leader, payout };
  });

  const reconnect = sessionToken => {
    requireAlive();
    const enrollment = sessionEnrollment(sessionToken);
    return { ...snapshot(), self: { enrollmentId: enrollment.id, ticket: enrollment.ticket, name: enrollment.member.name } };
  };

  const expireSession = sessionToken => {
    const session = world.sessions.get(sessionToken);
    if (session) session.expiresAt = clock - 1;
  };

  const destroy = () => {
    destroyed.value = true;
    world.sessions.clear();
    world.auctions.clear();
    world.enrollments.clear();
    world.members.length = 0;
    world.bids.length = 0;
    world.cycles.length = 0;
    world.monthlyBids.length = 0;
    world.installments.length = 0;
    notifications.length = 0;
    audit.length = 0;
  };

  return {
    world,
    limits: liveAuctionLimits(scheme),
    snapshot,
    activate,
    enablePortal,
    memberLogin,
    startAuction,
    pauseAuction,
    staffBid,
    customerBid,
    endAuction,
    reconnect,
    expireSession,
    destroy,
    live: () => !destroyed.value,
  };
}
