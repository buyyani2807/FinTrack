import { useMemo } from "react";
import { buildCashFlowForecast } from "./ai/cashFlowForecast.js";
import { buildReceivablesCollectionPlan } from "./ai/receivablesAgent.js";
import { buildBankReconciliationSuggestions } from "./ai/bankReconciliationAgent.js";
import { buildInventoryForecast } from "./ai/inventoryForecast.js";
import { formatInr as money } from "./ai/aiCommon.js";

const countWord = (count, one, many) => `${count} ${count === 1 ? one : many}`;

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
  const horizons = forecast.horizons.filter(row => row.days > 0);
  const suggested = bank.suggestions.filter(row => row.actionKind === "match" || row.actionKind === "create_entry").length;
  const bankCopy = bank.totalLines
    ? `${countWord(bank.suggestions.length, "open line", "open lines")}; ${suggested} with a suggestion.`
    : "Import a bank statement to get suggestions.";
  const preview = stockouts.slice(0, 2);

  return (
    <section className="acc-section ai-advisory-panel" aria-label="AI advisory summary">
      <header className="ai-advisory-head">
        <div>
          <span className="eyebrow">AI ADVISORY</span>
          <h2 className="acc-section-title">What needs your attention</h2>
        </div>
        {onNavigate ? <button type="button" className="acc-ov-link-btn" onClick={() => open("ai")}>Open AI Review</button> : null}
      </header>

      <div className="ai-advisory-grid">
        <article className="card ai-advisory-card">
          <p className="ai-advisory-kicker">Cash-flow outlook · predicted</p>
          <strong className="ai-advisory-figure">{money(forecast.currentBalance)}</strong>
          <p className="ai-advisory-caption">Cash now</p>
          <dl className="ai-advisory-horizons">
            {horizons.map(row => (
              <div key={row.days}>
                <dt>{row.label}</dt>
                <dd>{money(row.projectedBalance)}</dd>
              </div>
            ))}
          </dl>
          <p className="ai-advisory-copy">{forecast.explanation} Not guaranteed.</p>
        </article>

        <article className="card ai-advisory-card">
          <p className="ai-advisory-kicker">Bank reconciliation</p>
          {bank.reconciledPct == null ? (
            <strong className="ai-advisory-figure is-status">No statements</strong>
          ) : (
            <>
              <strong className="ai-advisory-figure">{bank.reconciledPct}%</strong>
              <p className="ai-advisory-caption">reconciled</p>
              <div className="ai-advisory-meter" role="img" aria-label={`${bank.reconciledPct}% reconciled`}>
                <span style={{ width: `${Math.min(100, Math.max(0, bank.reconciledPct))}%` }} />
              </div>
            </>
          )}
          <p className="ai-advisory-copy">{bankCopy}</p>
          {bank.suggestions.length > 0 && onNavigate ? <button type="button" className="ai-source-link" onClick={() => open("ai")}>Review suggestions</button> : null}
        </article>

        <article className="card ai-advisory-card">
          <p className="ai-advisory-kicker">Inventory signal</p>
          <strong className={`ai-advisory-figure${stockouts.length ? "" : " is-status"}`}>
            {stockouts.length ? countWord(stockouts.length, "likely stockout", "likely stockouts") : "No stockout expected"}
          </strong>
          {preview.length ? (
            <ul className="ai-advisory-stock">
              {preview.map(row => <li key={row.itemId || row.itemName}><span>{row.itemName}</span><b>{row.stockoutDate || "soon"}</b></li>)}
            </ul>
          ) : <p className="ai-advisory-copy">Based on weekly sales and current stock.</p>}
          {stockouts.length > 0 && onNavigate ? <button type="button" className="ai-source-link" onClick={() => open("inventory")}>Open inventory</button> : null}
        </article>
      </div>

      {priorities.length > 0 && (
        <div className="ai-advisory-list">
          <div className="ai-advisory-list-head">
            <h3>Collection priorities</h3>
            {onNavigate ? <button type="button" className="ai-source-link" onClick={() => open("receivables")}>Open receivables</button> : null}
          </div>
          <ol>
            {priorities.map(row => (
              <li className="ai-advisory-row" key={row.id}>
                <div className="ai-advisory-who">
                  <strong>{row.customer}</strong>
                  {row.risk ? <span className={`ai-risk ai-risk-${row.risk}`}>{row.risk}</span> : null}
                </div>
                <p className="ai-advisory-reason">{row.reason}</p>
                <div className="ai-advisory-amount">
                  <b>{money(row.outstanding)}</b>
                  <small>{row.recommendedAction}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
