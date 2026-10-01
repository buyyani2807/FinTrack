import { money } from "../cashbookConfig.js";
import { PanelHead, EmptyState } from "../components/CashbookUi.jsx";
import { PeriodPills } from "../components/PeriodPills.jsx";

export function ExpensesSection({ openExpense, periodProps, expenseRows }) {
  return (
    <div className="accounts-panel">
      <PanelHead title="Expenses"><button type="button" className="btn primary" onClick={openExpense}>+ Add expense</button></PanelHead>
      <div className="card accounts-filter-card spacer"><PeriodPills {...periodProps} /></div>
      <div className="accounts-entry-list">
        {expenseRows.map(entry => <article key={entry.id} className="card accounts-entry-row accounts-expense-row">
          <div className="accounts-entry-main">
            <div><strong>{entry.description}</strong><p className="small">{entry.entryDate} · {entry.category} · {entry.ledgerName}</p></div>
            <span className="red accounts-expense-amount">{money(entry.moneyOut)}</span>
          </div>
        </article>)}
        {!expenseRows.length && <EmptyState>No expenses for this period.</EmptyState>}
      </div>
    </div>
  );
}
