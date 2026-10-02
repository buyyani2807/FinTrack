import { todayIso } from "../cashbookModel.js";
import { PanelHead } from "../components/CashbookUi.jsx";
import { PeriodPills } from "../components/PeriodPills.jsx";

export function CashbookReportsSection({ periodProps, exportCsv, rangedEntries, expenseRows, allTimeOverview }) {
  return (
    <div className="accounts-panel">
      <PanelHead title="Reports" />
      <div className="card accounts-filter-card spacer"><PeriodPills {...periodProps} /></div>
      <div className="card accounts-report-card spacer">
        <p className="copy">Export data for the selected period.</p>
        <div className="accounts-report-actions">
          <button type="button" className="btn" onClick={() => exportCsv(rangedEntries)}>Cashbook CSV</button>
          <button type="button" className="btn" onClick={() => exportCsv(expenseRows)}>Expense CSV</button>
          <button type="button" className="btn" onClick={() => exportCsv(allTimeOverview.ledgers.map(l => ({ entryDate: todayIso(), description: l.name, ledgerName: l.accountType, category: "Balance", moneyIn: l.balance, moneyOut: 0, reference: "", receiptNumber: "" })))}>Account balances CSV</button>
        </div>
      </div>
    </div>
  );
}
