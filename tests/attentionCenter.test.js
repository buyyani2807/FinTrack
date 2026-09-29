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
