import { buildAnomalyInsights, buildBankMatchSuggestions, buildCashFlowForecast, buildChitHealthInsights, buildGstHealthInsights, buildInventoryForecast, buildMonthEndReadiness, buildReceivablesPriorities } from "./aiAdvisory.js";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Read-only, deterministic advisory summary. It deliberately accepts already
 * loaded Accounts data and never fetches or mutates records.
 */
export function AiAdvisoryPanel({ metrics = {}, receivables = [], vouchers = [], items = [], stockMovements = [], gstInvoices = [], bankTransactions = [], parties = [], invoices = [], chitScheme = null, chitInstallments = [], chitBids = [] }) {
  const forecast = buildCashFlowForecast({ currentBalance: Number(metrics.cash || 0) + Number(metrics.bank || 0) + Number(metrics.upi || 0), inflows: receivables.map(row => ({ amount: row.outstanding })), outflows: [] });
  const priorities = buildReceivablesPriorities(receivables).slice(0, 3);
  const anomalies = buildAnomalyInsights({ transactions: vouchers, inventory: stockMovements }).slice(0, 3);
  const lowStock = (items || []).filter(item => Number(item.stock ?? item.quantity ?? 0) <= Number(item.reorderLevel ?? item.reorder_point ?? 0));
  const inventory = buildInventoryForecast({ stock: lowStock.reduce((sum, item) => sum + Number(item.stock ?? item.quantity ?? 0), 0), averageWeeklySales: 0, leadTimeDays: 0 });
  const readiness = buildMonthEndReadiness({ unreconciled: 0, uncategorized: 0, duplicateCandidates: anomalies.length, negativeInventory: stockMovements.filter(row => Number(row.quantity) < 0).length });
  const gstIssues = buildGstHealthInsights({ invoices: gstInvoices });
  const bankSuggestions = buildBankMatchSuggestions({ transactions: bankTransactions, parties, invoices });
  const chitHealth = chitScheme ? buildChitHealthInsights({ scheme: chitScheme, installments: chitInstallments, bids: chitBids }) : null;

  return <section className="acc-section ai-advisory-panel" aria-label="AI advisory summary">
    <div className="acc-section-heading"><div><span className="eyebrow">AI ADVISORY</span><h2 className="acc-section-title">What needs your attention</h2></div><span className="small muted">Advisory only · verify before acting</span></div>
    <div className="ai-advisory-grid">
      <article className="card ai-advisory-card"><span className="small muted">Cash-flow outlook</span><strong>{money(forecast.projectedBalance)}</strong><p className="small">Projected from saved balances and open receivables. Confidence: {forecast.confidence}.</p></article>
      <article className="card ai-advisory-card"><span className="small muted">Month-end readiness</span><strong>{readiness.readinessPercent}%</strong><p className="small">{readiness.totalIssues ? `${readiness.totalIssues} item(s) require review.` : "No issues detected from the loaded data."}</p></article>
      <article className="card ai-advisory-card"><span className="small muted">Inventory signal</span><strong>{inventory.reorderRecommended ? "Review reorder" : "No reorder signal"}</strong><p className="small">Based on current stock and saved movement history.</p></article>
    </div>
    {priorities.length > 0 && <div className="ai-advisory-list"><h3>Collection priorities</h3>{priorities.map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.customer}</strong><small>{row.reason}</small></span><span><b>{money(row.outstanding)}</b><small>{row.recommendedAction}</small></span></div>)}</div>}
    {anomalies.length > 0 && <div className="ai-advisory-list"><h3>Possible anomalies</h3>{anomalies.map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.title}</strong><small>{row.explanation}</small></span><span className="badge warning">Review</span></div>)}</div>}
    {(gstIssues.length > 0 || bankSuggestions.length > 0 || chitHealth) && <div className="ai-advisory-list"><h3>Additional review signals</h3>
      {gstIssues.slice(0, 3).map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.title}</strong><small>{row.explanation}</small></span><span className="badge warning">GST review</span></div>)}
      {bankSuggestions.filter(row => row.confidence !== "low").slice(0, 3).map(row => <div className="ai-advisory-row" key={`bank-${row.id}`}><span><strong>Bank match suggestion</strong><small>{row.explanation}</small></span><span className="badge">{row.confidence}</span></div>)}
      {chitHealth?.insights.slice(0, 3).map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.title}</strong><small>{row.explanation}</small></span><span className="badge warning">Chit review</span></div>)}
    </div>}
  </section>;
}
