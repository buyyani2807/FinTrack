import { useMemo } from "react";
import { buildCashFlowForecast } from "./ai/cashFlowForecast.js";
import { buildReceivablesCollectionPlan } from "./ai/receivablesAgent.js";
import { buildBankReconciliationSuggestions } from "./ai/bankReconciliationAgent.js";
import { buildInventoryForecast } from "./ai/inventoryForecast.js";
import { formatInr as money } from "./ai/aiCommon.js";

/**
 * Read-only summary of the AI Review workspace for the Accounts overview. It uses the same verified engines
 * as AI Review and never fetches or changes records.
 */
export function AiAdvisoryPanel({ accounts = [], vouchers = [], parties = [], items = [], stockMovements = [], statements = [], asOf, onNavigate }) {
  const forecast = useMemo(() => buildCashFlowForecast({ accounts, vouchers, parties, asOf }), [accounts, vouchers, parties, asOf]);
  const priorities = useMemo(() => buildReceivablesCollectionPlan({ accounts, vouchers, parties, asOf }).slice(0, 3), [accounts, vouchers, parties, asOf]);
  const bank = useMemo(() => buildBankReconciliationSuggestions({ statements, accounts, vouchers, parties }), [statements, accounts, vouchers, parties]);
  const stockouts = useMemo(() => buildInventoryForecast({ items, stockMovements, asOf }).filter(row => row.status === "Likely stockout"), [items, stockMovements, asOf]);
  const open = id => onNavigate && onNavigate(id);

  return <section className="acc-section ai-advisory-panel" aria-label="AI advisory summary">
    <div className="acc-section-heading"><div><span className="eyebrow">AI ADVISORY</span><h2 className="acc-section-title">What needs your attention</h2></div><span className="small muted">Advisory only · verify before acting{onNavigate ? <> · <button type="button" className="ai-source-link" onClick={() => open("ai")}>Open AI Review</button></> : null}</span></div>
    <div className="ai-advisory-grid">
      <article className="card ai-advisory-card"><span className="small muted">Cash-flow outlook · predicted</span><strong>{money(forecast.currentBalance)}</strong><div className="ai-forecast-horizons">{forecast.horizons.filter(row => row.days > 0).map(row => <span key={row.days}><b>{money(row.projectedBalance)}</b><small>{row.label}</small></span>)}</div><p className="small">{forecast.explanation} Not guaranteed.</p></article>
      <article className="card ai-advisory-card"><span className="small muted">Bank reconciliation</span><strong>{bank.reconciledPct == null ? "No statements" : `${bank.reconciledPct}% reconciled`}</strong><p className="small">{bank.totalLines ? `${bank.suggestions.length} open line(s); ${bank.suggestions.filter(row => row.actionKind === "match" || row.actionKind === "create_entry").length} with a suggestion.` : "Import a bank statement to get suggestions."}</p>{bank.suggestions.length > 0 && onNavigate && <button type="button" className="ai-source-link" onClick={() => open("ai")}>Review suggestions</button>}</article>
      <article className="card ai-advisory-card"><span className="small muted">Inventory signal</span><strong>{stockouts.length ? `${stockouts.length} likely stockout(s)` : "No stockout expected"}</strong><p className="small">{stockouts.length ? stockouts.slice(0, 2).map(row => `${row.itemName}: ${row.stockoutDate || "soon"}`).join(" · ") : "Based on weekly sales and current stock."}</p>{stockouts.length > 0 && onNavigate && <button type="button" className="ai-source-link" onClick={() => open("inventory")}>Open inventory</button>}</article>
    </div>
    {priorities.length > 0 && <div className="ai-advisory-list"><h3>Collection priorities</h3>{priorities.map(row => <div className="ai-advisory-row" key={row.id}><span><strong>{row.customer}</strong><small>{row.reason}</small></span><span><b>{money(row.outstanding)}</b><small>{row.recommendedAction}</small>{onNavigate && <button type="button" className="ai-source-link" onClick={() => open("receivables")}>Open receivables</button>}</span></div>)}</div>}
  </section>;
}
