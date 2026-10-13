import { buildAgentScopedReceivablesPriorities, buildAnomalyInsights, buildBankMatchSuggestions, buildCashFlowForecastSeries, buildChitHealthInsights, buildExpenseChangeInsights, buildExpenseHistoryWindows, buildGstHealthInsights, buildInventoryForecast, buildMonthEndReadiness, buildSupplierPriceInsights } from "./aiAdvisory.js";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Read-only, deterministic advisory summary. It deliberately accepts already
 * loaded Accounts data and never fetches or mutates records.
 */
export function AiAdvisoryPanel({ metrics = {}, receivables = [], payables = [], vouchers = [], items = [], stockMovements = [], gstInvoices = [], bankTransactions = [], parties = [], invoices = [], expenseRows = [], expenseCurrent = [], expensePrevious = [], expenseAverage = [], role = "owner", assignedIds = [], onNavigate, chitScheme = null, chitInstallments = [], chitBids = [] }) {
  const receivableRows = Array.isArray(receivables) ? receivables : (receivables?.total ? [{ outstanding: receivables.total }] : []);
  const payableRows = Array.isArray(payables) ? payables : (payables?.total ? [{ outstanding: payables.total }] : []);
  const currentBalance = Number(metrics.cash || 0) + Number(metrics.bank || 0) + Number(metrics.upi || 0);
  const forecastSeries = buildCashFlowForecastSeries({ currentBalance, horizons: { 7: { inflows: receivableRows.map(row => ({ amount: row.outstanding })), outflows: payableRows.map(row => ({ amount: row.outstanding })) } } });
  const priorities = buildAgentScopedReceivablesPriorities(receivableRows, { role, assignedIds }).slice(0, 3);
  const anomalies = buildAnomalyInsights({ transactions: vouchers, inventory: stockMovements }).slice(0, 3);
  const lowStock = (items || []).filter(item => Number(item.stock ?? item.quantity ?? 0) <= Number(item.reorderLevel ?? item.reorder_point ?? 0));
  const inventory = buildInventoryForecast({ stock: lowStock.reduce((sum, item) => sum + Number(item.stock ?? item.quantity ?? 0), 0), averageWeeklySales: 0, leadTimeDays: 0 });
  const readiness = buildMonthEndReadiness({ unreconciled: 0, uncategorized: 0, duplicateCandidates: anomalies.length, negativeInventory: stockMovements.filter(row => Number(row.quantity) < 0).length });
  const gstIssues = buildGstHealthInsights({ invoices: gstInvoices });
  const bankSuggestions = buildBankMatchSuggestions({ transactions: bankTransactions, parties, invoices });
  const chitHealth = chitScheme ? buildChitHealthInsights({ scheme: chitScheme, installments: chitInstallments, bids: chitBids }) : null;
  const expenseWindows = buildExpenseHistoryWindows(expenseRows, {});
  const expenseInsights = buildExpenseChangeInsights({ current: expenseRows.length ? expenseWindows.current : expenseCurrent, previous: expenseRows.length ? expenseWindows.previous : expensePrevious, average: expenseRows.length ? expenseWindows.average : expenseAverage });
  const supplierInsights = buildSupplierPriceInsights(expenseRows);

  return <section className="acc-section ai-advisory-panel" aria-label="AI advisory summary">
    <div className="acc-section-heading"><div><span className="eyebrow">AI ADVISORY</span><h2 className="acc-section-title">What needs your attention</h2></div><span className="small muted">Advisory only · verify before acting</span></div>
    <div className="ai-advisory-grid">
      <article className="card ai-advisory-card"><span className="small muted">Cash-flow outlook</span><strong>{money(currentBalance)}</strong><div className="ai-forecast-horizons">{forecastSeries.map(row => <span key={row.horizonDays}><b>{row.insufficientHistory ? "—" : money(row.projectedBalance)}</b><small>{row.horizonDays} days{row.insufficientHistory ? " · insufficient history" : ""}</small></span>)}</div><p className="small">Advisory projection from saved balances, receivables, and payables only.</p></article>
      <article className="card ai-advisory-card"><span className="small muted">Month-end readiness</span><strong>{readiness.readinessPercent}%</strong><p className="small">{readiness.totalIssues ? `${readiness.totalIssues} item(s) require review · ${readiness.criticalCount} critical · ${readiness.highCount} high.` : "No signals detected from the loaded data."}</p></article>
      <article className="card ai-advisory-card"><span className="small muted">Inventory signal</span><strong>{inventory.reorderRecommended ? "Review reorder" : "No reorder signal"}</strong><p className="small">Based on current stock and saved movement history.</p></article>
      <article className="card ai-advisory-card"><span className="small muted">Expense changes</span><strong>{expenseInsights.length ? `${expenseInsights.length} to review` : "Insufficient history"}</strong><p className="small">Trends are shown only when comparable expense history is available.</p></article>
      <article className="card ai-advisory-card"><span className="small muted">GST health</span><strong>{gstIssues.length ? `${gstIssues.length} to review` : "No signals"}</strong><p className="small">Calculated from GST fields present in loaded invoice records. No filing action is performed.</p></article>
    </div>
    {priorities.length > 0 && <div className="ai-advisory-list"><h3>Collection priorities</h3>{priorities.map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.customer}</strong><small>{row.reason}</small></span><span><b>{money(row.outstanding)}</b><small>{row.recommendedAction}</small>{onNavigate && <button type="button" className="ai-source-link" onClick={() => onNavigate("receivables")}>Open receivables</button>}</span></div>)}</div>}
    {anomalies.length > 0 && <div className="ai-advisory-list"><h3>Possible anomalies</h3>{anomalies.map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.title}</strong><small>{row.explanation}</small></span><span className="badge warning">Review</span></div>)}</div>}
    {(gstIssues.length > 0 || bankSuggestions.length > 0 || chitHealth) && <div className="ai-advisory-list"><h3>Additional review signals</h3>
      {gstIssues.slice(0, 3).map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.title}</strong><small>{row.explanation}</small></span><span className="badge warning">GST review</span></div>)}
      {bankSuggestions.filter(row => row.confidence !== "low").slice(0, 3).map(row => <div className="ai-advisory-row" key={`bank-${row.id}`}><span><strong>Bank match suggestion</strong><small>{row.explanation}</small></span><span className="badge">{row.confidence}</span></div>)}
      {chitHealth?.insights.slice(0, 3).map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.title}</strong><small>{row.explanation}</small></span><span className="badge warning">Chit review</span></div>)}
    </div>}
    {supplierInsights.length > 0 && <div className="ai-advisory-list"><h3>Supplier price changes</h3>{supplierInsights.slice(0, 3).map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.supplierName} · {row.changePercent > 0 ? "increased" : "decreased"} {Math.abs(row.changePercent)}%</strong><small>{row.explanation}</small></span><span className="badge warning">Review</span></div>)}</div>}
  </section>;
}
