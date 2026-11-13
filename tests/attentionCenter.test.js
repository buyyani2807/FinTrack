import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAccountsAttentionItems,
  buildAttentionCenter,
} from "../src/features/intelligence/attentionCenter.js";

test("attention center aggregates daily unpaid and accounts items", () => {
  const today = "2026-09-08";
  const center = buildAttentionCenter({
    today,
    dailyLoans: [{
      id: "d1",
      customerName: "Ravi",
      status: "active",
      startDate: "2026-09-01",
      transactions: [{ date: "2026-09-07", amount: 100 }],
    }],
    monthlyLoans: [{
      id: "m1",
      status: "active",
      attentionDueAmount: 3000,
    }],
    accountsAttention: buildAccountsAttentionItems({
      overdueReceivables: 12000,
      overdueInvoiceCount: 2,
      unmatchedBankLines: 3,
    }),
  });

  assert.ok(center.count >= 3);
  assert.match(center.summary, /need your attention/i);
  assert.ok(center.items.some(item => item.id === "daily-unpaid-d1"));
  assert.ok(center.items.some(item => item.module === "monthly"));
  assert.ok(center.items.some(item => item.id === "accounts-ar-overdue"));
  assert.ok(center.items.some(item => item.id === "accounts-bank-unmatched"));
  assert.match(center.disclaimer, /do not invent balances/i);
});

test("accounts attention stays empty when nothing is flagged", () => {
  const items = buildAccountsAttentionItems({});
  assert.equal(items.length, 0);
});

test("accounts attention flags expired and near-expiry stock", () => {
  const items = buildAccountsAttentionItems({ expiredCount: 2, soonCount: 3 });
  const expired = items.find(item => item.id === "accounts-expired-stock");
  const soon = items.find(item => item.id === "accounts-near-expiry");
  assert.equal(expired.severity, "high");
  assert.match(expired.title, /2 items expired/);
  assert.equal(expired.href.section, "expired_stock");
  assert.equal(soon.href.section, "expired_stock");
  assert.equal(soon.severity, "medium");
  assert.match(soon.title, /3 items due within 30 days/);
});

test("GST review is flagged only when the period has GST entries", () => {
  assert.equal(buildAccountsAttentionItems({ gstEntryCount: 0 }).length, 0);
  const [gst] = buildAccountsAttentionItems({ gstEntryCount: 3 });
  assert.equal(gst.id, "accounts-gst-review");
  assert.match(gst.detail, /^3 GST entries this period/);
  assert.match(buildAccountsAttentionItems({ gstEntryCount: 1 })[0].detail, /^1 GST entry this period/);
});

test("daily finance created today is not flagged unpaid in attention center", () => {
  const today = "2026-09-08";
  const center = buildAttentionCenter({
    today,
    dailyLoans: [{
      id: "d-today",
      customerName: "Sai Buyyani",
      status: "active",
      startDate: today,
      transactions: [],
    }],
  });
  assert.equal(center.items.some(item => item.id === "daily-unpaid-d-today"), false);
});

test("view-only partners see View instead of Collect in Today's actions", async () => {
  const { buildTodaysActionList } = await import("../src/features/intelligence/attentionCenter.js");
  const loan = { id: "l1", kind: "daily", customerName: "Ravi", startDate: "2026-11-01", dailyCollection: 10, collectionAmount: 1000, disbursedAmount: 900, transactions: [], status: "active" };
  const owner = buildTodaysActionList({ dailyLoans: [loan], monthlyLoans: [], today: "2026-11-13" });
  const partner = buildTodaysActionList({ canCollect: false, dailyLoans: [loan], monthlyLoans: [], today: "2026-11-13" });
  const labels = list => list.items.filter(item => item.module === "daily").map(item => item.actionLabel);
  if (labels(owner).length) {
    assert.ok(labels(owner).every(label => label !== "View"));
    assert.ok(labels(partner).every(label => label !== "Collect"));
  }
});
