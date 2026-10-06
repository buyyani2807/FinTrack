import test from "node:test";
import assert from "node:assert/strict";
import { buildAnomalyReview } from "../src/features/intelligence/anomalyReview.js";

const today = "2026-10-06";
const rent = { id: "rent", code: "5000", name: "Rent", groupType: "expense" };
const salary = { id: "salary", code: "5010", name: "Salary", groupType: "expense" };
const posted = (extra) => ({ status: "posted", lines: [], ...extra });

test("matching receipts are a possible duplicate and nothing is posted or labelled as fraud", () => {
  const vouchers = [
    posted({ id: "a", voucherType: "receipt", voucherNumber: "RCT-1", date: "2026-10-01", partyId: "p1", lines: [{ debit: 500 }] }),
    posted({ id: "b", voucherType: "receipt", voucherNumber: "RCT-2", date: "2026-10-01", partyId: "p1", lines: [{ debit: 500 }] }),
  ];
  const before = JSON.stringify(vouchers);
  const review = buildAnomalyReview({ vouchers, parties: [{ id: "p1", name: "Ravi" }], today });
  assert.equal(JSON.stringify(vouchers), before);
  assert.equal(review.items[0].label, "Possible duplicate");
  assert.match(review.items[0].detail, /Ravi/);
  assert.equal(review.disclaimer.includes("fraudulent"), true);
  assert.equal(JSON.stringify(review).includes("is fraudulent"), false);
});

test("three identical purchases are a possible duplicate", () => {
  const purchase = number => ({
    status: "posted",
    voucherType: "purchase",
    voucherNumber: number,
    date: "2026-09-15",
    partyId: "p1",
    lines: [{ debit: 12614.8 }],
  });
  const review = buildAnomalyReview({
    today,
    parties: [{ id: "p1", name: "Initial Coatings" }],
    vouchers: [purchase("PUR-000002"), purchase("PUR-000003"), purchase("PUR-000004")],
  });
  assert.equal(review.items[0].label, "Possible duplicate");
  assert.match(review.items[0].title, /PUR-000002, PUR-000003, PUR-000004/);
  assert.match(review.items[0].detail, /purchases/);
  assert.match(review.items[0].detail, /Initial Coatings/);
});

test("a voucher far above the earlier amounts, a late recording, reversals, and a lock are flagged", () => {
  const usual = [100, 100, 120, 110].map((amount, index) => posted({
    id: `u${index}`,
    voucherType: "payment",
    voucherNumber: `PMT-${index}`,
    date: `2026-09-0${index + 1}`,
    partyId: "p1",
    lines: [{ debit: amount }],
  }));
  const review = buildAnomalyReview({
    today,
    parties: [{ id: "p1", name: "City Supplies" }],
    vouchers: [
      ...usual,
      posted({ id: "big", voucherType: "payment", voucherNumber: "PMT-9", date: "2026-10-02", partyId: "p1", lines: [{ debit: 9000 }] }),
      posted({ id: "old", voucherType: "payment", voucherNumber: "PMT-OLD", date: "2026-08-01", createdAt: "2026-09-20T10:00:00Z", lines: [{ debit: 50 }] }),
      { id: "r1", status: "reversed", partyId: "p1", voucherNumber: "PMT-R1" },
      { id: "r2", status: "reversed", partyId: "p1", voucherNumber: "PMT-R2" },
      { id: "r3", status: "reversed", partyId: "p1", voucherNumber: "PMT-R3" },
      posted({ id: "locked", voucherType: "payment", voucherNumber: "PMT-L", date: "2026-09-15", createdAt: "2026-10-05T10:00:00Z", lines: [{ debit: 20 }] }),
    ],
    locks: [{ isLocked: true, periodFrom: "2026-09-01", periodTo: "2026-09-30", lockedAt: "2026-10-02T00:00:00Z" }],
  });
  const labels = review.items.map(item => `${item.label} ${item.title}`);
  assert.ok(labels.some(line => /Unusual pattern detected/.test(line) && /PMT-9/.test(line)));
  assert.ok(labels.some(line => /Requires review/.test(line) && /PMT-OLD/.test(line)));
  assert.ok(review.items.some(item => /reversed vouchers/.test(item.title) && /City Supplies/.test(item.detail)));
  assert.ok(review.items.some(item => item.title === "PMT-L" && /locked period/.test(item.detail)));
});

test("an expense spike, a missing monthly expense, a bank mismatch, and a cashbook amount difference are flagged", () => {
  const line = (date, amount) => posted({
    date,
    lines: [{ debit: amount, code: "5000" }],
  });
  const review = buildAnomalyReview({
    today,
    accounts: [rent, salary],
    vouchers: [
      posted({ date: "2026-07-03", lines: [{ debit: 1000, code: "5010" }] }),
      posted({ date: "2026-08-03", lines: [{ debit: 1000, code: "5010" }] }),
      posted({ date: "2026-09-03", lines: [{ debit: 1000, code: "5010" }] }),
      line("2026-09-03", 1000),
      line("2026-09-10", 4000),
      line("2026-10-02", 20000),
      posted({
        id: "cb",
        voucherNumber: "RCT-CB",
        voucherType: "receipt",
        date: "2026-10-01",
        sourceModule: "cashbook",
        sourceType: "manual",
        sourceTransactionId: "row-1",
        lines: [{ debit: 800 }],
      }),
    ],
    statements: [{
      id: "st1",
      accountName: "HDFC",
      openingBalance: 1000,
      closingBalance: 1000,
      lines: [{ id: "l1", lineDate: "2026-10-01", amount: 500, direction: "in", description: "NEFT" }],
    }],
    cashbookEntries: [{ sourceType: "manual", sourceId: "row-1", moneyIn: 500, moneyOut: 0 }],
  });
  assert.ok(review.items.some(item => item.title === "Rent" && item.label === "Unusual pattern detected"));
  assert.ok(review.items.some(item => item.id === "missing-expense-5010"));
  assert.ok(review.items.some(item => item.label === "Data mismatch found" && /HDFC/.test(item.title)));
  assert.ok(review.items.some(item => item.label === "Data mismatch found" && /RCT-CB/.test(item.title)));
});

test("a collection drop, a repeated collection, a broken daily pattern, and a large agent day are flagged", () => {
  const days = [];
  for (let offset = 14; offset >= 1; offset -= 1) {
    const date = new Date("2026-10-06T12:00:00");
    date.setDate(date.getDate() - offset);
    days.push(date.toISOString().slice(0, 10));
  }
  const streak = days.filter((_, index) => index < 12).map(date => ({ date, amount: 100, collectorName: "Sai" }));
  const review = buildAnomalyReview({
    today,
    loans: [
      {
        id: "drop",
        kind: "daily",
        status: "active",
        startDate: "2026-01-01",
        customerName: "Old route",
        transactions: [
          { date: "2026-09-24", amount: 8000 },
          { date: "2026-09-25", amount: 1000 },
          { date: "2026-09-26", amount: 1000 },
          { date: "2026-09-27", amount: 1000 },
        ],
      },
      {
        id: "twice",
        kind: "daily",
        status: "active",
        startDate: "2026-01-01",
        customerName: "Meena",
        transactions: [
          { date: "2026-10-04", amount: 200 },
          { date: "2026-10-04", amount: 200 },
        ],
      },
      {
        id: "streak",
        kind: "daily",
        status: "active",
        startDate: "2026-01-01",
        customerName: "Ravi",
        transactions: streak,
      },
      {
        id: "agent",
        kind: "monthly",
        status: "active",
        customerName: "Office",
        transactions: [
          { date: "2026-09-20", amount: 1000, collectorName: "Sai" },
          { date: "2026-09-21", amount: 1000, collectorName: "Sai" },
          { date: "2026-09-22", amount: 1000, collectorName: "Sai" },
          { date: "2026-10-04", amount: 8000, collectorName: "Sai" },
        ],
      },
    ],
  });
  assert.ok(review.items.some(item => item.id === "collection-drop"));
  assert.ok(review.items.some(item => item.label === "Possible duplicate" && item.title === "Meena"));
  assert.ok(review.items.some(item => item.title === "Ravi" && /previous 14 days/.test(item.detail)));
  assert.ok(review.items.some(item => item.title === "Sai" && /2026-10-04/.test(item.detail)));
});

test("auction history and live bids are explained without changing the winner", () => {
  const cycles = [100, 100, 100, 400].map((amount, index) => ({
    id: `c${index}`,
    scheme_id: "s1",
    cycle_number: index + 1,
    winning_bid_amount: amount,
    winning_enrollment_id: index === 3 ? "winner" : "other",
  }));
  cycles.push({ id: "c-dup", scheme_id: "s1", cycle_number: 4, winning_bid_amount: 400, winning_enrollment_id: "winner" });
  const before = cycles.map(cycle => cycle.winning_enrollment_id).join(",");
  const review = buildAnomalyReview({
    today,
    now: "2026-10-06T12:30:00Z",
    schemes: [{ id: "s1", name: "Gold", chit_type: "auction" }],
    cycles,
    auctions: [{
      id: "live",
      name: "Gold",
      status: "open",
      startedAt: "2026-10-06T12:00:00Z",
      bids: [
        { id: "b1", enrollment_id: "m1", member_name: "Anita", bid_amount: 1000, submitted_at: "2026-10-06T12:10:00Z", status: "valid" },
        { id: "b2", enrollment_id: "m1", member_name: "Anita", bid_amount: 1000, submitted_at: "2026-10-06T12:10:20Z", status: "valid" },
        { id: "b3", enrollment_id: "m1", member_name: "Anita", bid_amount: 1100, submitted_at: "2026-10-06T12:10:40Z", status: "rejected", reason: "Bid must be higher than the current leading bid" },
        { id: "b4", enrollment_id: "m2", member_name: "Kiran", bid_amount: 1200, submitted_at: "2026-10-06T12:11:00Z", received_at: "2026-10-06T12:11:40Z", status: "valid" },
      ],
    }],
  });
  assert.equal(cycles.map(cycle => cycle.winning_enrollment_id).join(","), before);
  assert.ok(review.items.some(item => /Gold/.test(item.title) && /unchanged/.test(item.detail)));
  assert.ok(review.items.some(item => /Month 4 is recorded 2 times/.test(item.detail)));
  assert.ok(review.items.some(item => item.label === "Possible duplicate" && /Anita/.test(item.title)));
  assert.ok(review.items.some(item => /higher than the current leading bid/.test(item.detail)));
  assert.ok(review.items.some(item => /seconds to record/.test(item.detail)));
  assert.ok(review.notes.some(note => /does not select a winner/.test(note)));
  assert.equal(review.items.some(item => item.winningEnrollmentId), false);
});
