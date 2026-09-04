import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/accountingModel.js";
import { buildAccountsFacts, interpretAccountsFacts, previousComparisonRange } from "../src/features/accounts/accountsIntelligence.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));

const sale = (id, date, amount, partyId = "p1") => ({
  id,
  voucherType: "sales",
  voucherNumber: id,
  date,
  status: "posted",
  partyId,
  dueDate: date,
  lines: [
    { coaId: "1100", code: "1100", partyId, debit: amount, credit: 0 },
    { coaId: "4300", code: "4300", debit: 0, credit: amount },
  ],
});

test("previous FY comparison uses last FY when current range is this FY", () => {
  const range = previousComparisonRange({
    from: "2026-04-01",
    to: "2027-03-31",
    fy: { from: "2026-04-01", to: "2027-03-31", label: "FY 2026–27" },
    lastFy: { from: "2025-04-01", to: "2026-03-31", label: "FY 2025–26" },
  });
  assert.equal(range.from, "2025-04-01");
  assert.equal(range.label, "FY 2025–26");
});

test("intelligence uses provided company data only and does not invent a trend without history", () => {
  const facts = buildAccountsFacts({
    accounts,
    vouchers: [sale("SALE-1", "2026-04-10", 10000)],
    parties: [{ id: "p1", name: "ABC Traders", partyType: "customer" }],
    range: { from: "2026-04-01", to: "2026-04-30" },
    previousRange: { from: "2026-03-01", to: "2026-03-31", label: "previous month" },
    today: "2026-04-15",
    companyId: "co-a",
    companyName: "SriHitha Infra",
  });
  assert.equal(facts.companyId, "co-a");
  assert.equal(facts.hasPriorActivity, false);
  assert.equal(facts.income, 10000);
  const report = interpretAccountsFacts(facts);
  assert.match(report.brief.join(" "), /Not enough historical data|Receivables currently stand/);
  assert.ok(!report.brief.some(line => /up \d+%/.test(line)));
});

test("intelligence reports verified income change from existing P&L values", () => {
  const facts = buildAccountsFacts({
    accounts,
    vouchers: [
      sale("SALE-1", "2026-03-10", 10000),
      sale("SALE-2", "2026-04-10", 12000),
    ],
    parties: [{ id: "p1", name: "ABC Traders", partyType: "customer" }],
    range: { from: "2026-04-01", to: "2026-04-30" },
    previousRange: { from: "2026-03-01", to: "2026-03-31", label: "previous month" },
    today: "2026-04-15",
    companyId: "co-a",
    companyName: "SriHitha Infra",
  });
  assert.equal(facts.income, 12000);
  assert.equal(facts.priorIncome, 10000);
  const report = interpretAccountsFacts(facts);
  assert.match(report.brief.join(" "), /up 20%/);
  assert.equal(report.categories.profitability.verified[0].value.includes("12,000"), true);
});

test("possible similar entries are flagged without changing data", () => {
  const facts = buildAccountsFacts({
    accounts,
    vouchers: [
      sale("SALE-1", "2026-04-10", 5000, "p1"),
      sale("SALE-2", "2026-04-10", 5000, "p1"),
    ],
    parties: [{ id: "p1", name: "ABC Traders", partyType: "customer" }],
    range: { from: "2026-04-01", to: "2026-04-30" },
    previousRange: { from: "2026-03-01", to: "2026-03-31", label: "previous month" },
    today: "2026-04-15",
    companyId: "co-a",
  });
  const report = interpretAccountsFacts(facts);
  assert.ok(report.anomalies.some(row => /similar entries/i.test(row.title)));
});
