import { roundMoney } from "../accounts/model/accountingModel.js";

const n = value => Number(value || 0);
const pctChange = (current, baseline) => baseline ? roundMoney(((current - baseline) / Math.abs(baseline)) * 100) : null;
const posted = rows => (rows || []).filter(row => row.status === "posted");
const monthKey = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; };

export function buildExpenseHistoryWindows(rows = [], { asOf = new Date() } = {}) {
  const end = new Date(asOf); const currentKey = monthKey(end); const previous = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1)); const previousKey = monthKey(previous);
  const averageKeys = Array.from({ length: 3 }, (_, index) => monthKey(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (index + 1), 1))));
  const current = []; const prior = []; const average = [];
  for (const row of rows || []) { const key = monthKey(row.date || row.postedOn || row.createdAt); if (key === currentKey) current.push(row); else if (key === previousKey) prior.push(row); if (averageKeys.includes(key)) average.push(row); }
  return { current, previous: prior, average, historyMonths: averageKeys.filter(key => (rows || []).some(row => monthKey(row.date || row.postedOn || row.createdAt) === key)).length, advisory: true };
}

export function buildSupplierPriceInsights(rows = [], { minimumSamples = 2 } = {}) {
  const groups = new Map();
  for (const row of rows || []) { const key = row.supplierId || row.partyId || row.supplierName; if (!key) continue; const list = groups.get(key) || []; list.push(row); groups.set(key, list); }
  return [...groups.entries()].flatMap(([supplierId, list]) => {
    const sorted = [...list].sort((a, b) => new Date(a.date || a.postedOn || 0) - new Date(b.date || b.postedOn || 0));
    if (sorted.length < minimumSamples) return [];
    const recent = Number(sorted.at(-1).unitPrice ?? sorted.at(-1).price ?? 0); const prior = Number(sorted.at(-2).unitPrice ?? sorted.at(-2).price ?? 0);
    if (!prior || !recent) return [];
    const change = roundMoney(((recent - prior) / Math.abs(prior)) * 100);
    if (Math.abs(change) < 10) return [];
    return [{ id: `supplier-price-${supplierId}`, supplierId, supplierName: sorted.at(-1).supplierName || supplierId, currentPrice: roundMoney(recent), comparisonPrice: roundMoney(prior), changePercent: change, severity: Math.abs(change) >= 20 ? "high" : "medium", explanation: "Possible supplier price change; review source purchases before taking action.", sourceIds: sorted.slice(-2).map(row => row.id).filter(Boolean), advisory: true }];
  });
}

export function buildExpenseChangeInsights({ current = [], previous = [], average = [], minimumHistory = 2 } = {}) {
  const sums = rows => rows.reduce((map, row) => { const key = row.category || row.accountName || row.ledgerName || "Uncategorised"; map[key] = (map[key] || 0) + n(row.amount || row.debit); return map; }, {});
  const now = sums(current); const prior = sums(previous); const avg = sums(average);
  return Object.entries(now).map(([category, amount]) => {
    const baseline = average.length >= minimumHistory ? (avg[category] || 0) : (prior[category] || 0);
    const change = pctChange(amount, baseline);
    if (change == null || Math.abs(change) < 20) return null;
    return { id: `expense-${category}`, title: `${category} expenses ${change > 0 ? "increased" : "decreased"} ${Math.abs(change)}%`, category, currentAmount: roundMoney(amount), comparisonAmount: roundMoney(baseline), changePercent: change, severity: Math.abs(change) >= 50 ? "high" : "medium", explanation: "Requires review against the source expense entries.", recommendation: "Review the category ledger and recent transactions.", confidence: average.length >= minimumHistory ? "medium" : "low", advisory: true };
  }).filter(Boolean);
}

export function buildCashFlowForecast({ currentBalance = 0, inflows = [], outflows = [], horizonDays = 30 } = {}) {
  const sum = rows => rows.reduce((total, row) => total + n(row.amount || row.value), 0);
  const expectedInflows = sum(inflows); const expectedOutflows = sum(outflows);
  const projectedBalance = roundMoney(n(currentBalance) + expectedInflows - expectedOutflows);
  return { currentBalance: roundMoney(currentBalance), expectedInflows: roundMoney(expectedInflows), expectedOutflows: roundMoney(expectedOutflows), projectedBalance, horizonDays, confidence: inflows.length + outflows.length >= 5 ? "medium" : "low", assumptions: ["Uses saved receivable, payable, cashbook and recurring entries only.", "Predictions are not guaranteed and exclude unknown future transactions."], insufficientHistory: inflows.length + outflows.length < 2 };
}

export function buildCashFlowForecastSeries({ currentBalance = 0, horizons = {} } = {}) {
  return [7, 30, 60].map(days => {
    const data = horizons[days] || {};
    return { horizonDays: days, ...buildCashFlowForecast({ currentBalance, inflows: data.inflows || [], outflows: data.outflows || [], horizonDays: days }) };
  });
}

export function buildReceivablesPriorities(rows = []) {
  return rows.filter(row => n(row.outstanding) > 0).map(row => {
    const overdue = n(row.daysOverdue); const score = overdue * 2 + Math.min(100, n(row.outstanding) / 1000);
    const risk = score >= 80 ? "high" : score >= 30 ? "medium" : "low";
    return { id: row.id || row.partyId, customer: row.partyName || row.customerName || "Customer", outstanding: roundMoney(row.outstanding), daysOverdue: overdue, risk, recommendedAction: risk === "high" ? "Call today" : risk === "medium" ? "Send WhatsApp" : "Reminder", reason: overdue ? `${overdue} days overdue` : "Open receivable", sourceId: row.id, advisory: true };
  }).sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.risk] - ({ high: 3, medium: 2, low: 1 }[a.risk]) || b.outstanding - a.outstanding));
}

export function buildAgentScopedReceivablesPriorities(rows = [], { role = "owner", assignedIds = [] } = {}) {
  const scoped = role === "agent" ? rows.filter(row => assignedIds.includes(row.id || row.accountId || row.customerId)) : rows;
  return buildReceivablesPriorities(scoped).map(row => ({ ...row, scope: role === "agent" ? "assigned-customers" : "company", advisory: true }));
}

export function createAdvisoryAuditEntry({ feature, sourceIds = [], companyId = null, generatedAt = new Date().toISOString(), confidence = "low" } = {}) {
  return { feature, sourceIds: [...new Set(sourceIds.filter(Boolean))], companyId, generatedAt, confidence, advisory: true, writeAction: "none" };
}

export function buildAiReviewSummary(groups = {}) {
  const insights = Object.entries(groups).flatMap(([feature, rows]) => (rows || []).map(row => ({ ...row, feature, advisory: true })));
  const severity = insights.reduce((result, row) => { const key = row.severity || "info"; result[key] = (result[key] || 0) + 1; return result; }, {});
  return { total: insights.length, severity, features: Object.fromEntries(Object.entries(groups).map(([feature, rows]) => [feature, (rows || []).length])), insights, writeAction: "none", advisory: true };
}

export function buildAnomalyInsights({ transactions = [], expenses = [], inventory = [] } = {}) {
  const result = [];
  const amounts = posted(transactions).map(row => n(row.amount || row.total));
  const average = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  // Compare against the in-scope baseline without allowing the outlier itself to
  // make the threshold impossible to reach when the dataset is small.
  for (const row of posted(transactions)) if (average && n(row.amount || row.total) > average * 2.5) result.push({ id: `txn-${row.id}`, title: "Possible unusual transaction", severity: "medium", expected: roundMoney(average), actual: roundMoney(row.amount || row.total), explanation: "This transaction is materially above the saved transaction average.", sourceId: row.id, advisory: true });
  for (const row of expenses) if (n(row.amount) < 0) result.push({ id: `expense-${row.id}`, title: "Possible invalid expense amount", severity: "high", actual: n(row.amount), explanation: "Review the source entry; no automatic correction was made.", sourceId: row.id, advisory: true });
  for (const row of inventory) if (n(row.quantity) < 0) result.push({ id: `stock-${row.id}`, title: "Possible unusual inventory adjustment", severity: "medium", actual: n(row.quantity), explanation: "Negative movement requires human review.", sourceId: row.id, advisory: true });
  return result;
}

export function buildMonthEndReadiness({ unreconciled = 0, uncategorized = 0, duplicateCandidates = 0, missingInvoices = 0, gstIssues = 0, negativeInventory = 0 } = {}) {
  const total = unreconciled + uncategorized + duplicateCandidates + missingInvoices + gstIssues + negativeInventory;
  const criticalCount = negativeInventory + gstIssues;
  const highCount = duplicateCandidates + missingInvoices;
  return { readinessPercent: total ? Math.max(0, 100 - Math.min(100, total * 5)) : 100, totalIssues: total, criticalCount, highCount, issues: { unreconciled, uncategorized, duplicateCandidates, missingInvoices, gstIssues, negativeInventory }, advisory: true };
}

export function buildInventoryForecast({ stock = 0, averageWeeklySales = 0, leadTimeDays = 0 } = {}) {
  const daily = n(averageWeeklySales) / 7; const daysUntilStockout = daily > 0 ? Math.floor(n(stock) / daily) : null;
  return { currentStock: n(stock), averageWeeklySales: n(averageWeeklySales), leadTimeDays: n(leadTimeDays), daysUntilStockout, reorderRecommended: daysUntilStockout != null && daysUntilStockout <= n(leadTimeDays), confidence: daily > 0 ? "medium" : "low", advisory: true };
}

export function buildGstHealthInsights({ invoices = [] } = {}) {
  return (invoices || []).flatMap(row => {
    const issues = [];
    if (row.gstin && row.partyGstin && String(row.gstin).toUpperCase() !== String(row.partyGstin).toUpperCase()) issues.push({ id: `gstin-${row.id}`, title: "Possible GSTIN mismatch", severity: "high", explanation: "Invoice GSTIN differs from the saved party GSTIN.", sourceId: row.id, advisory: true });
    if (row.taxTotal != null && row.lineTaxTotal != null && Math.abs(n(row.taxTotal) - n(row.lineTaxTotal)) > 0.01) issues.push({ id: `tax-${row.id}`, title: "GST total requires review", severity: "medium", explanation: "Invoice tax total does not match its line-level tax total.", sourceId: row.id, advisory: true });
    if (!row.gstin && row.isRegistered) issues.push({ id: `missing-gstin-${row.id}`, title: "Missing GST information", severity: "medium", explanation: "A registered transaction is missing GST details.", sourceId: row.id, advisory: true });
    return issues;
  });
}

export function buildBankMatchSuggestions({ transactions = [], parties = [], invoices = [] } = {}) {
  return (transactions || []).map(row => {
    const text = String(row.description || row.narration || "").toLowerCase();
    const party = (parties || []).find(item => item.name && text.includes(String(item.name).toLowerCase()));
    const invoice = party ? (invoices || []).find(item => item.partyId === party.id && Math.abs(n(item.amount) - n(row.amount)) < 0.01) : null;
    return { id: row.id, suggestedParty: party?.name || null, suggestedInvoiceId: invoice?.id || null, confidence: invoice ? "high" : party ? "medium" : "low", explanation: invoice ? "Amount and party text match a saved invoice." : party ? "Narration contains a saved party name." : "No reliable saved match was found.", advisory: true };
  });
}

export function buildChitHealthInsights({ scheme, installments = [], bids = [] } = {}) {
  const due = (installments || []).filter(row => row.due !== false);
  const paid = due.filter(row => n(row.paid) >= n(row.expected));
  const delayed = due.filter(row => n(row.paid) < n(row.expected) && n(row.daysOverdue) > 0);
  const collectionRate = due.length ? roundMoney((paid.length / due.length) * 100) : null;
  const insights = [];
  if (delayed.length) insights.push({ id: `chit-delay-${scheme?.id || "scheme"}`, title: "Members with payment delays", severity: delayed.length > 1 ? "medium" : "low", count: delayed.length, explanation: "Review overdue installments before the next cycle.", advisory: true });
  if (bids.length > 1) { const amounts = bids.map(row => n(row.amount)); const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length; if (Math.max(...amounts) - Math.min(...amounts) > avg * 0.15) insights.push({ id: `chit-bid-${scheme?.id || "scheme"}`, title: "Bid range requires review", severity: "low", explanation: "Winning bid amounts vary materially across the available history.", advisory: true }); }
  return { schemeId: scheme?.id || null, collectionRate, delayedMembers: delayed.length, expectedNextMonth: roundMoney(due.reduce((sum, row) => sum + n(row.expected), 0)), insights, advisory: true };
}
