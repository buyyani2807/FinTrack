import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_CHART_OF_ACCOUNTS, SYSTEM_CODES, dateIsLocked, ledgerBalances, purchaseLines, receiptLines, saleLines } from "../src/features/accounts/model/accountingModel.js";
import { invoiceRegister } from "../src/features/accounts/model/accountingReports.js";
import { advisory, assertAdvisoryText } from "../src/features/intelligence/ai/aiCommon.js";
import { buildExpenseComparisons, buildSupplierPriceInsights } from "../src/features/intelligence/ai/expenseIntelligence.js";
import { buildCashFlowForecast } from "../src/features/intelligence/ai/cashFlowForecast.js";
import { buildReceivablesCollectionPlan, scopeCustomersForViewer } from "../src/features/intelligence/ai/receivablesAgent.js";
import { buildAnomalyAlerts } from "../src/features/intelligence/ai/anomalyDetection.js";
import { GST_DISCLAIMER, buildGstWarnings } from "../src/features/intelligence/ai/gstAssistant.js";
import { buildMonthEndReadiness, defaultCloseMonth } from "../src/features/intelligence/ai/monthEndReadiness.js";
import { buildBankReconciliationSuggestions } from "../src/features/intelligence/ai/bankReconciliationAgent.js";
import { buildInventoryForecast } from "../src/features/intelligence/ai/inventoryForecast.js";
import { insightRunPayload, latestDecisions, reviewActionPayload } from "../src/features/intelligence/ai/aiReviewAudit.js";
import { buildChitSchemeHealth } from "../src/features/chitFund/model/chitSchemeHealth.js";
import { calculateDividend } from "../src/features/chitFund/model/calculations.js";

const AS_OF = "2026-10-09";
const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code, isSystem: true, isActive: true }));
const ravi = { id: "ravi", name: "Ravi Traders", partyType: "customer", phone: "9876543210" };
const sita = { id: "sita", name: "Sita Stores", partyType: "customer" };
const supplier = { id: "sup", name: "Kaveri Supplies", partyType: "supplier" };
const parties = [ravi, sita, supplier];

let seq = 0;
const posted = (voucherType, date, lines, { partyId = null, dueDate = null, settlements = [], createdAt = null, status = "posted" } = {}) => {
  seq += 1;
  const id = `${voucherType}-${seq}`;
  return {
    id,
    voucherType,
    voucherNumber: `${voucherType.slice(0, 3).toUpperCase()}-${String(seq).padStart(4, "0")}`,
    date,
    dueDate,
    partyId,
    status,
    narration: "",
    createdAt: createdAt || `${date}T10:00:00+05:30`,
    settlements,
    lines: lines.map((line, index) => ({ ...line, id: `${id}-l${index}`, coaId: line.coaId || line.code })),
  };
};
const expense = (date, amount, code = "5000") => posted("expense", date, [
  { code, debit: amount, credit: 0 },
  { code: SYSTEM_CODES.cash, debit: 0, credit: amount },
]);
const opening = (date, amount) => posted("journal", date, [
  { code: SYSTEM_CODES.cash, debit: amount, credit: 0 },
  { code: "3000", debit: 0, credit: amount },
]);
const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
};
const allText = rows => rows.map(row => `${row.title || ""} ${row.explanation || ""} ${row.status || ""}`).join(" ");

test("expense comparison: current month vs previous, 3-month average, and explanation", () => {
  const vouchers = deepFreeze([expense("2026-07-05", 10000), expense("2026-08-05", 10000), expense("2026-09-05", 10000), expense("2026-10-05", 25000)]);
  const result = buildExpenseComparisons({ accounts, vouchers, asOf: AS_OF });
  assert.equal(result.insufficientHistory, false);
  const rent = result.insights.find(row => row.category === "Rent");
  assert.ok(rent, "rent increase is reported");
  assert.equal(rent.currentAmount, 25000);
  assert.equal(rent.comparisonAmount, 10000);
  assert.equal(rent.difference, 15000);
  assert.equal(rent.changePct, 150);
  assert.equal(rent.period, "2026-10-01 to 2026-10-09");
  assert.ok(["Increased", "Requires review", "Unusual change"].includes(rent.status));
  assert.ok(rent.comparisons.some(row => row.id === "previous_month" && row.amount === 10000));
  assert.ok(rent.comparisons.some(row => row.id === "three_month_average" && row.amount === 10000));
  assert.match(rent.explanation, /₹25,000/);
  assert.deepEqual(rent.source, { section: "ledger", label: "Open ledger", ledgerId: "5000" });
  assert.equal(rent.writeAction, "none");
});

test("expense comparison: insufficient history shows no trend", () => {
  const result = buildExpenseComparisons({ accounts, vouchers: [expense("2026-10-03", 9000)], asOf: AS_OF });
  assert.equal(result.insufficientHistory, true);
  assert.equal(result.insights.length, 0);
  assert.ok(result.insufficient.some(row => row.accountName === "Rent"));
});

test("supplier price: latest rate vs 30/60/90-day averages is a possible price increase", () => {
  const bills = [posted("purchase", "2026-08-20", [], { partyId: "sup" }), posted("purchase", "2026-09-15", [], { partyId: "sup" }), posted("purchase", "2026-10-05", [], { partyId: "sup" })];
  const itemLines = [
    { voucherId: bills[0].id, itemId: "rice", itemName: "Rice 25kg", quantity: 10, rate: 1000 },
    { voucherId: bills[1].id, itemId: "rice", itemName: "Rice 25kg", quantity: 10, rate: 1000 },
    { voucherId: bills[2].id, itemId: "rice", itemName: "Rice 25kg", quantity: 10, rate: 1250 },
  ];
  const { insights } = buildSupplierPriceInsights({ vouchers: bills, voucherItemLines: itemLines, parties, asOf: AS_OF });
  assert.equal(insights.length, 1);
  const row = insights[0];
  assert.equal(row.status, "Possible price increase");
  assert.equal(row.currentAmount, 1250);
  assert.equal(row.comparisonAmount, 1000);
  assert.equal(row.changePct, 25);
  assert.deepEqual(row.windows.map(window => window.days), [30, 60, 90]);
  assert.doesNotMatch(allText(insights), /fraud|cheat|scam/i);
});

test("cash forecast: horizons, receivables within 10 days, assumptions, actual vs predicted", () => {
  const sale = posted("sales", "2026-10-01", saleLines({ accounts, amount: 50000, settlement: "credit", partyId: "ravi" }), { partyId: "ravi", dueDate: "2026-10-15" });
  const bill = posted("purchase", "2026-10-02", purchaseLines({ accounts, amount: 80000, settlement: "credit", partyId: "sup" }), { partyId: "sup", dueDate: "2026-10-20" });
  const vouchers = deepFreeze([opening("2026-10-01", 100000), sale, bill]);
  const forecast = buildCashFlowForecast({ accounts, vouchers, parties, asOf: AS_OF });
  assert.equal(forecast.currentBalance, 100000);
  assert.deepEqual(forecast.horizons.map(row => row.label), ["Today", "7 days", "30 days", "60 days"]);
  const h30 = forecast.horizons.find(row => row.days === 30);
  assert.equal(h30.inflows, 50000);
  assert.equal(h30.outflows, 80000);
  assert.equal(h30.projectedBalance, 70000);
  assert.equal(forecast.receivablesWithin10Days, 50000);
  assert.match(forecast.explanation, /Cash may fall by ₹30,000/);
  assert.match(forecast.explanation, /₹50,000 of receivables expected within 10 days/);
  assert.equal(forecast.insufficientHistory, true, "under 30 days of history");
  assert.ok(forecast.assumptions.some(line => /not a guarantee/i.test(line)));
  assert.ok(forecast.actualLast30Days, "actual figures are reported separately");
  assert.ok(forecast.drivers.every(row => row.source));
  assert.equal(forecast.writeAction, "none");
});

test("receivables agent: risk, reason, action, channel, sources; agents see only their customers", () => {
  const old = posted("sales", "2026-07-01", saleLines({ accounts, amount: 150000, settlement: "credit", partyId: "ravi" }), { partyId: "ravi", dueDate: "2026-07-31" });
  const fresh = posted("sales", "2026-10-05", saleLines({ accounts, amount: 8000, settlement: "credit", partyId: "sita" }), { partyId: "sita", dueDate: "2026-10-30" });
  const vouchers = deepFreeze([old, fresh]);
  const plan = buildReceivablesCollectionPlan({ accounts, vouchers, parties, asOf: AS_OF });
  const top = plan[0];
  assert.equal(top.customer, "Ravi Traders");
  assert.equal(top.risk, "high");
  assert.equal(top.daysOverdue, 70);
  assert.equal(top.channel, "Phone call");
  assert.equal(top.recommendedAction, "Call Ravi Traders today.");
  assert.match(top.reason, /70 day\(s\) overdue/);
  assert.equal(top.sourceRecords[0].voucherId, old.id);
  assert.equal(plan.find(row => row.customer === "Sita Stores").risk, "low");

  const routes = { routes: [{ id: "r1", name: "North", agent_id: "agent-1" }], stops: [{ route_id: "r1", party_id: "sita" }] };
  const scoped = buildReceivablesCollectionPlan({ accounts, vouchers, parties, asOf: AS_OF, collectionRoutes: routes, role: "agent", agentId: "agent-1" });
  assert.deepEqual(scoped.map(row => row.partyId), ["sita"]);
  assert.equal(scoped[0].assignedAgent, "Route: North");
  assert.equal(scopeCustomersForViewer(plan, { role: "agent", agentId: "agent-2", collectionRoutes: routes }).length, 0);
  assert.equal(scopeCustomersForViewer(plan, { role: "stranger" }).length, 0);
  assert.equal(scopeCustomersForViewer(plan, { role: "owner" }).length, 2);
});

const chitScheme = { id: "s1", name: "Gold 1L", chit_type: "auction", chit_value: 100000, commission_percent: 5, member_count: 10, installment_amount: 10000, status: "active" };
const chitDetails = () => {
  const enrollments = [{ id: "e1", status: "active", chit_members: { name: "Asha" } }, { id: "e2", status: "active", chit_members: { name: "Bala" } }];
  const cycles = [1, 2, 3, 4].map(number => {
    const winning = 80000;
    const { dividendPerMember } = calculateDividend({ chitValue: 100000, winningBidAmount: winning, commissionPercent: 5, totalMembers: 10 });
    return { id: `c${number}`, cycle_number: number, winning_bid_amount: winning, dividend_per_member: number === 4 ? dividendPerMember + 100 : dividendPerMember, commission_amount: 5000 };
  });
  const due = ["2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10"];
  const installments = [];
  due.forEach((date, index) => {
    installments.push({ id: `a${index}`, enrollment_id: "e1", cycle_id: `c${index + 1}`, due_date: date, net_amount_due: 8500, amount_paid: 8500, paid_date: date });
    const delay = [2, 6, 12][index];
    const paid = index < 3;
    installments.push({ id: `b${index}`, enrollment_id: "e2", cycle_id: `c${index + 1}`, due_date: date, net_amount_due: 8500, amount_paid: paid ? 8500 : 0, paid_date: paid ? `2026-${String(6 + index).padStart(2, "0")}-${String(10 + delay).padStart(2, "0")}` : null });
  });
  installments.push({ id: "future", enrollment_id: "e1", cycle_id: "c5", due_date: "2026-10-10", net_amount_due: 8500, amount_paid: 0 });
  return { enrollments, cycles, installments, bids: [] };
};

test("chit scheme health: collection rate on due rows only, delay trend, overdue, dividend evidence", () => {
  const details = deepFreeze(chitDetails());
  const health = buildChitSchemeHealth({ scheme: chitScheme, details, asOf: AS_OF });
  assert.equal(health.available, true);
  assert.equal(health.collectionRate, 87.5, "future installment is not counted");
  assert.equal(health.overdueAmount, 8500);
  assert.equal(health.increasingDelayMembers, 1);
  assert.equal(health.expectedNextMonth.amount, 8500);
  const dividend = health.insights.find(row => row.type === "dividend_anomaly");
  assert.ok(dividend, "dividend mismatch is raised with evidence");
  assert.match(dividend.explanation, /was not changed/);
  assert.equal(health.insights.some(row => row.type === "unusual_bidding"), false, "identical bids are not an anomaly");
  assert.ok(health.insights.every(row => row.writeAction === "none" && row.reviewAction && row.source?.schemeId === "s1"));
});

test("anomalies: duplicates, partial payment, supplier bill outlier — advisory wording only", () => {
  const bills = [5000, 5200, 4800, 5100, 4900].map((amount, index) => posted("purchase", `2026-0${5 + Math.floor(index / 2)}-1${index}`, purchaseLines({ accounts, amount, settlement: "credit", partyId: "sup" }), { partyId: "sup" }));
  const big = posted("purchase", "2026-10-01", purchaseLines({ accounts, amount: 40000, settlement: "credit", partyId: "sup" }), { partyId: "sup" });
  const dupA = posted("payment", "2026-10-03", [{ code: SYSTEM_CODES.payable, debit: 7000, credit: 0 }, { code: SYSTEM_CODES.cash, debit: 0, credit: 7000 }], { partyId: "sup" });
  const dupB = posted("payment", "2026-10-04", [{ code: SYSTEM_CODES.payable, debit: 7000, credit: 0 }, { code: SYSTEM_CODES.cash, debit: 0, credit: 7000 }], { partyId: "sup" });
  const sale = posted("sales", "2026-09-20", saleLines({ accounts, amount: 30000, settlement: "credit", partyId: "ravi" }), { partyId: "ravi", dueDate: "2026-09-30" });
  const part = posted("receipt", "2026-09-25", receiptLines({ accounts, cash: 10000, partyId: "ravi" }), { partyId: "ravi", settlements: [{ invoiceVoucherId: sale.id, amount: 10000 }] });
  const vouchers = deepFreeze([...bills, big, dupA, dupB, sale, part]);
  const before = JSON.stringify(vouchers);
  const alerts = buildAnomalyAlerts({ accounts, vouchers, parties, asOf: AS_OF });
  assert.equal(JSON.stringify(vouchers), before);
  const patterns = alerts.map(row => row.pattern);
  assert.ok(patterns.includes("supplier_invoice_above_average"));
  assert.ok(patterns.includes("possible_duplicate_transaction"));
  assert.ok(patterns.includes("customer_partial_payment"));
  for (const alert of alerts) {
    assert.ok(alert.title && alert.severity && alert.module && alert.record && alert.explanation && alert.recommendedAction && alert.source);
    assert.equal(alert.writeAction, "none");
  }
  assert.doesNotMatch(allText(alerts), /fraud|theft|scam|cheat|embezzl|criminal/i);
});

test("advisory guard rejects accusatory wording", () => {
  assert.throws(() => assertAdvisoryText("Supplier fraud detected"));
  assert.throws(() => advisory({ title: "Possible theft", explanation: "x" }));
  assert.doesNotThrow(() => advisory({ title: "Possible duplicate", explanation: "Requires review" }));
});

test("GST assistant: invalid GSTIN and line vs ledger mismatch require review; no filing claims", () => {
  const badParty = { id: "bad", name: "Bad GST Co", partyType: "customer", gstin: "29ABCDE1234F1Z0" };
  const voucher = posted("sales", "2026-10-02", [
    { code: SYSTEM_CODES.receivable, debit: 11800, credit: 0 },
    { code: "4300", debit: 0, credit: 10000 },
    { code: "2210", debit: 0, credit: 900 },
    { code: "2211", debit: 0, credit: 900 },
  ], { partyId: "bad" });
  voucher.gstLines = [{ hsnSac: "1006", taxable: 10000, rate: 18, cgst: 800, sgst: 800, igst: 0 }];
  const review = buildGstWarnings({ vouchers: [voucher], parties: [badParty], company: { gstRegistration: "regular", gstin: "", stateCode: "29" }, asOf: AS_OF });
  assert.equal(review.documentsChecked, 1);
  assert.equal(review.disclaimer, GST_DISCLAIMER);
  const { warnings } = review;
  const checks = warnings.map(row => row.check);
  assert.ok(checks.includes("company_gstin"));
  assert.ok(checks.includes("party_gstin"));
  assert.ok(checks.includes("line_total_mismatch"));
  assert.ok(warnings.every(row => row.requiresReview && row.source && row.confidence));
  assert.doesNotMatch(allText(warnings), /\bfiled\b|\bIRN\b|acknowledg/i);
  assert.match(GST_DISCLAIMER, /do not file returns, generate IRNs, or create acknowledgements/);
});

test("month-end readiness: counts, readiness %, resolve links, never closes the period", () => {
  const vouchers = [posted("sales", "2026-09-05", saleLines({ accounts, amount: 1000, settlement: "credit", partyId: "ravi" }), { partyId: "ravi" })];
  const statements = [{ id: "st", lines: [
    { id: "l1", lineDate: "2026-09-10", amount: 500, direction: "out", matchStatus: "matched" },
    { id: "l2", lineDate: "2026-09-11", amount: 590, direction: "out", matchStatus: "unmatched" },
  ] }];
  const items = [{ id: "it", name: "Widget", itemType: "goods" }];
  const stockMovements = [{ itemId: "it", movementDate: "2026-09-02", quantityDelta: -3, reason: "sale" }];
  const locks = deepFreeze([]);
  const result = buildMonthEndReadiness({ month: "2026-09", asOf: AS_OF, accounts, vouchers, parties, items, stockMovements, locks, statements });
  const bank = result.checks.find(check => check.key === "bank_reconciliation");
  assert.equal(bank.value, "50% reconciled");
  assert.equal(result.checks.find(check => check.key === "negative_inventory").count, 1);
  assert.ok(result.readinessPct < 100);
  assert.ok(result.checks.every(check => check.link?.label === "Resolve issues"));
  assert.equal(result.locked, false);
  assert.match(result.note, /does not close or lock/);
  const resolved = buildMonthEndReadiness({ month: "2026-09", asOf: AS_OF, accounts, vouchers, parties, items, stockMovements, locks, statements, resolvedKeys: new Set(["2026-09:negative_inventory"]) });
  assert.equal(resolved.resolved, 1);
  assert.equal(resolved.remaining, result.remaining - 1);
  assert.equal(defaultCloseMonth("2026-10-09"), "2026-09");
  assert.equal(defaultCloseMonth("2026-10-20"), "2026-10");
});

test("bank reconciliation agent: ₹590 bank charges → Bank Charges, exact match suggestion, nothing posted", () => {
  const receipt = posted("receipt", "2026-10-03", receiptLines({ accounts, bank: 25000, partyId: "ravi" }), { partyId: "ravi" });
  const vouchers = deepFreeze([receipt]);
  const statements = deepFreeze([{ id: "st", coaId: SYSTEM_CODES.bank, accountName: "Bank", lines: [
    { id: "b1", lineDate: "2026-10-05", description: "SMS CHARGES GST", amount: 590, direction: "out", matchStatus: "unmatched" },
    { id: "b2", lineDate: "2026-10-03", description: "NEFT RAVI TRADERS", amount: 25000, direction: "in", matchStatus: "unmatched" },
  ] }]);
  const before = JSON.stringify({ vouchers, statements });
  const result = buildBankReconciliationSuggestions({ statements, accounts, vouchers, parties });
  assert.equal(JSON.stringify({ vouchers, statements }), before);
  const charge = result.suggestions.find(row => row.lineId === "b1");
  assert.equal(charge.likelyLedger, "Bank Charges");
  assert.equal(charge.transactionType, "Bank charges");
  assert.equal(charge.actionKind, "create_entry");
  assert.equal(charge.entrySuggestion.expenseCode, "5100");
  assert.ok(charge.confidencePct >= 80);
  const match = result.suggestions.find(row => row.lineId === "b2");
  assert.equal(match.actionKind, "match");
  assert.equal(match.voucherLineId, receipt.lines.find(line => line.code === SYSTEM_CODES.bank).id);
  assert.equal(match.likelyParty, "Ravi Traders");
  assert.ok(result.suggestions.every(row => row.writeAction === "none" && row.explanation && row.suggestedAction));
});

test("bank reconciliation agent learns only from this company's approved matches", () => {
  const pay = n => posted("expense", `2026-09-0${n}`, [{ code: "5040", debit: 1200, credit: 0 }, { code: SYSTEM_CODES.bank, debit: 0, credit: 1200 }]);
  const v1 = pay(1);
  const v2 = pay(2);
  const bankLine = voucher => voucher.lines.find(line => line.code === SYSTEM_CODES.bank).id;
  const statements = [{ id: "st", coaId: SYSTEM_CODES.bank, accountName: "Bank", lines: [
    { id: "h1", lineDate: "2026-09-01", description: "BESCOM POWER BILL", amount: 1200, direction: "out", matchStatus: "matched", matchedVoucherLineId: bankLine(v1) },
    { id: "h2", lineDate: "2026-09-02", description: "BESCOM POWER BILL", amount: 1200, direction: "out", matchStatus: "matched", matchedVoucherLineId: bankLine(v2) },
    { id: "new", lineDate: "2026-10-02", description: "BESCOM POWER BILL OCT", amount: 1350, direction: "out", matchStatus: "unmatched" },
  ] }];
  const result = buildBankReconciliationSuggestions({ statements, accounts, vouchers: [v1, v2], parties, matchedLineIds: new Set([bankLine(v1), bankLine(v2)]) });
  const row = result.suggestions.find(item => item.lineId === "new");
  assert.equal(row.likelyLedger, "Electricity");
  assert.equal(row.learnedFromHistory, true);
  assert.equal(result.reconciledPct, 66.7);
  const otherCompany = buildBankReconciliationSuggestions({ statements: [{ ...statements[0], lines: [statements[0].lines[2]] }], accounts, vouchers: [], parties });
  assert.notEqual(otherCompany.suggestions[0].learnedFromHistory, true);
});

test("inventory forecast: stockout, insufficient history, reorder quantity; never edits stock", () => {
  const items = deepFreeze([{ id: "soap", name: "Soap", unit: "pcs", itemType: "goods" }, { id: "new", name: "New item", unit: "pcs", itemType: "goods" }]);
  const movements = [{ itemId: "soap", movementDate: "2026-07-20", quantityDelta: 150, reason: "purchase" }];
  for (let week = 0; week < 10; week += 1) {
    const day = new Date(Date.UTC(2026, 9, 8 - week * 7)).toISOString().slice(0, 10);
    movements.push({ itemId: "soap", movementDate: day, quantityDelta: -14, reason: "sale" });
  }
  movements.push({ itemId: "new", movementDate: "2026-10-01", quantityDelta: 10, reason: "purchase" });
  deepFreeze(movements);
  const rows = buildInventoryForecast({ items, stockMovements: movements, asOf: AS_OF });
  const soap = rows.find(row => row.itemId === "soap");
  assert.equal(soap.currentStock, 10);
  assert.equal(soap.averageWeeklySales, 14);
  assert.equal(soap.daysOfCover, 5);
  assert.equal(soap.stockoutDate, "2026-10-14");
  assert.equal(soap.status, "Likely stockout");
  assert.equal(soap.leadTimeAssumed, true);
  assert.ok(soap.stockoutDate && soap.suggestedReorderQty > 0);
  assert.equal(rows.find(row => row.itemId === "new").status, "Insufficient history");
  assert.ok(rows.every(row => row.writeAction === "none" && row.explanation && row.source));
});

test("audit payloads strip PII and validate inputs; decisions are deduplicated by key", () => {
  const payload = reviewActionPayload({ feature: "bank_reconciliation", insightKey: "bank-b1", action: "approved", sourceId: "b1", recordDate: "2026-10-05T00:00:00Z", suggestion: { actionKind: "match", voucherLineId: "x", partyName: "Ravi", phone: "98765", message: "Hello", nested: { a: 1 } } });
  assert.deepEqual(payload.input_suggestion, { actionKind: "match", voucherLineId: "x" });
  assert.equal(payload.input_record_date, "2026-10-05");
  assert.throws(() => reviewActionPayload({ feature: "chat", insightKey: "x", action: "approved" }), /Unknown AI feature/);
  assert.throws(() => reviewActionPayload({ feature: "gst", insightKey: "x", action: "post" }), /Unknown review action/);
  assert.throws(() => reviewActionPayload({ module: "payroll", feature: "gst", insightKey: "x", action: "reviewed" }), /Unknown AI module/);
  assert.deepEqual(insightRunPayload({ feature: "gst", insights: [{ severity: "high", title: "secret" }, { severity: "high" }] }).input_summary, { bySeverity: { high: 2 } });
  const decisions = latestDecisions([
    { feature: "gst", insightKey: "k", action: "reviewed", createdAt: "2026-10-01" },
    { feature: "gst", insightKey: "k", action: "dismissed", createdAt: "2026-10-02" },
  ]);
  assert.equal(decisions.get("gst:k").action, "dismissed");
});

test("locked periods block bank approvals and show on month-end", () => {
  const locks = [{ periodFrom: "2026-09-01", periodTo: "2026-09-30", isLocked: true }];
  const charge = buildBankReconciliationSuggestions({
    statements: [{ id: "st", coaId: SYSTEM_CODES.bank, accountName: "Bank", lines: [{ id: "b1", lineDate: "2026-09-15", description: "BANK CHARGES", amount: 590, direction: "out", matchStatus: "unmatched" }] }],
    accounts, vouchers: [], parties,
  }).suggestions[0];
  assert.equal(dateIsLocked(charge.date, locks), true, "the workspace disables Approve for this line");
  assert.equal(dateIsLocked("2026-10-01", locks), false);
  assert.equal(buildMonthEndReadiness({ month: "2026-09", asOf: AS_OF, accounts, locks }).locked, true);
});

test("existing calculations are unchanged by AI review", () => {
  const sale = posted("sales", "2026-10-01", saleLines({ accounts, amount: 50000, settlement: "credit", partyId: "ravi" }), { partyId: "ravi", dueDate: "2026-10-15" });
  const vouchers = deepFreeze([opening("2026-10-01", 100000), sale]);
  const balancesBefore = JSON.stringify(ledgerBalances(accounts, vouchers, { to: AS_OF }));
  const registerBefore = JSON.stringify(invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: AS_OF }));
  buildCashFlowForecast({ accounts, vouchers, parties, asOf: AS_OF });
  buildReceivablesCollectionPlan({ accounts, vouchers, parties, asOf: AS_OF });
  buildAnomalyAlerts({ accounts, vouchers, parties, asOf: AS_OF });
  buildExpenseComparisons({ accounts, vouchers, asOf: AS_OF });
  assert.equal(JSON.stringify(ledgerBalances(accounts, vouchers, { to: AS_OF })), balancesBefore);
  assert.equal(JSON.stringify(invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: AS_OF })), registerBefore);
});

test("migration 099 enforces roles, company scope, period locks, and one decision per insight", () => {
  const sql = readFileSync(new URL("../supabase/099_ai_review_audit.sql", import.meta.url), "utf8");
  assert.match(sql, /accounts_access_role\(\), ''\) not in \('owner', 'accountant'\)/);
  assert.match(sql, /chit_is_owner\(\)/);
  assert.match(sql, /collection_agent_id = auth\.uid\(\)/);
  assert.match(sql, /acc_assert_period_open\(org_id, input_record_date, company\)/);
  assert.match(sql, /ai_review_actions_one_decision_idx/);
  assert.match(sql, /exception when unique_violation/);
  assert.match(sql, /revoke insert, update, delete on public\.ai_review_actions from anon, authenticated/);
  assert.match(sql, /ai_module_enabled\(org_id\)/);
  assert.doesNotMatch(sql, /drop table|delete from public\.(acc_|chit_|finance_)/i);
});
