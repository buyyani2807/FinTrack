import { money } from "../cashbookConfig.js";
import { PanelHead, EmptyState } from "../components/CashbookUi.jsx";

export function DayClosingSection({ openClosing, closings }) {
  return (
    <div className="accounts-panel">
      <PanelHead title="Day closing"><button type="button" className="btn primary" onClick={openClosing}>Record closing</button></PanelHead>
      <div className="accounts-entry-list">
        {closings.map(row => {
          const reconciled = Number(row.difference) === 0;
          return <article key={row.id} className="card accounts-closing-row">
            <div className="accounts-closing-head">
              <strong>{row.closing_date}</strong>
              <span className="small">{row.ledger_accounts?.name || "Account"}</span>
            </div>
            <div className="accounts-closing-stats">
              <div><span className="small">Expected</span><strong>{money(row.expected_balance)}</strong></div>
              <div><span className="small">Actual</span><strong>{money(row.actual_balance)}</strong></div>
              <div className={reconciled ? "accounts-closing-ok" : "accounts-closing-bad"}>
                <span className="small">{reconciled ? "Status" : "Difference"}</span>
                <strong>{reconciled ? "Reconciled" : money(row.difference)}</strong>
              </div>
            </div>
          </article>;
        })}
        {!closings.length && <EmptyState>No day closings recorded yet.</EmptyState>}
      </div>
    </div>
  );
}
