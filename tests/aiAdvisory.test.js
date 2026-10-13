import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentScopedReceivablesPriorities, buildAnomalyInsights, buildBankMatchSuggestions, buildCashFlowForecast, buildCashFlowForecastSeries, buildChitHealthInsights, buildExpenseChangeInsights, buildExpenseHistoryWindows, buildGstHealthInsights, buildInventoryForecast, buildMonthEndReadiness, buildReceivablesPriorities, createAdvisoryAuditEntry } from "../src/features/intelligence/aiAdvisory.js";

test("expense insight compares against available history and flags material changes", () => {
  const rows = buildExpenseChangeInsights({ current: [{ category: "Travel", amount: 138 }], previous: [{ category: "Travel", amount: 100 }] });
  assert.equal(rows[0].changePercent, 38);
  assert.equal(rows[0].advisory, true);
});

test("expense insight does not invent a trend without a baseline", () => assert.deepEqual(buildExpenseChangeInsights({ current: [{ category: "Travel", amount: 138 }] }), []));
test("expense history windows use current, previous and available three-month history", () => { const result = buildExpenseHistoryWindows([{ date: "2026-10-03", amount: 100 }, { date: "2026-09-03", amount: 90 }, { date: "2026-08-03", amount: 80 }], { asOf: "2026-10-13" }); assert.equal(result.current.length, 1); assert.equal(result.previous.length, 1); assert.equal(result.historyMonths, 2); });

test("cash forecast is explicit about assumptions and confidence", () => {
  const result = buildCashFlowForecast({ currentBalance: 820000, inflows: [{ amount: 100000 }], outflows: [{ amount: 30000 }], horizonDays: 7 });
  assert.equal(result.projectedBalance, 890000);
  assert.equal(result.advisory, undefined);
  assert.equal(result.confidence, "low");
});
test("cash forecast series provides stable 7, 30 and 60 day horizons", () => assert.deepEqual(buildCashFlowForecastSeries({ currentBalance: 100, horizons: { 7: { inflows: [{ amount: 20 }] } } }).map(row => row.horizonDays), [7, 30, 60]));

test("receivables priorities rank overdue accounts without changing source data", () => {
  const source = [{ id: "a", partyName: "ABC", outstanding: 180000, daysOverdue: 40 }];
  const result = buildReceivablesPriorities(source);
  assert.equal(result[0].risk, "high");
  assert.equal(source[0].outstanding, 180000);
});
test("agent receivables are limited to assigned customer ids", () => assert.equal(buildAgentScopedReceivablesPriorities([{ id: "a", outstanding: 10 }, { id: "b", outstanding: 20 }], { role: "agent", assignedIds: ["a"] }).length, 1));
test("advisory audit metadata is non-writing and deduplicates source ids", () => { const entry = createAdvisoryAuditEntry({ feature: "gst", sourceIds: ["i1", "i1"] }); assert.deepEqual(entry.sourceIds, ["i1"]); assert.equal(entry.writeAction, "none"); });

test("advisory anomaly detection only flags unusual records", () => assert.equal(buildAnomalyInsights({ transactions: [{ id: "x", status: "posted", amount: 1 }, { id: "y", status: "posted", amount: 1 }, { id: "z", status: "posted", amount: 1000 }] }).length, 1));

test("month end readiness is a summary and not a write operation", () => { const result = buildMonthEndReadiness({ unreconciled: 2, gstIssues: 1 }); assert.deepEqual(result.issues, { unreconciled: 2, uncategorized: 0, duplicateCandidates: 0, missingInvoices: 0, gstIssues: 1, negativeInventory: 0 }); assert.equal(result.criticalCount, 1); });

test("inventory forecast recommends only when stockout reaches lead time", () => assert.equal(buildInventoryForecast({ stock: 12, averageWeeklySales: 14, leadTimeDays: 7 }).reorderRecommended, true));

test("GST advisory flags mismatches without changing invoices", () => assert.equal(buildGstHealthInsights({ invoices: [{ id: "i1", gstin: "A", partyGstin: "B" }] }).length, 1));
test("bank suggestions remain suggestions until approved", () => assert.equal(buildBankMatchSuggestions({ transactions: [{ id: "b1", narration: "ABC Traders", amount: 100 }], parties: [{ id: "p1", name: "ABC Traders" }], invoices: [{ id: "inv1", partyId: "p1", amount: 100 }] })[0].confidence, "high"));
test("chit health reports delayed members and preserves advisory status", () => { const result = buildChitHealthInsights({ scheme: { id: "s1" }, installments: [{ expected: 100, paid: 0, daysOverdue: 2 }] }); assert.equal(result.delayedMembers, 1); assert.equal(result.advisory, true); });
