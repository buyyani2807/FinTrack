import { money } from "../../accountsFormat.js";

export function ProfitLossReport({ pnl }) {
  return (
    <div className="grid two spacer">
      <div className="card"><strong>Income</strong>{pnl.income.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total income</span><strong className="green">{money(pnl.totalIncome)}</strong></p></div>
      <div className="card"><strong>Expenses</strong>{pnl.expenses.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total expenses</span><strong className="red">{money(pnl.totalExpense)}</strong></p></div>
      {(pnl.openingStock || pnl.closingStock) ? <div className="card span"><strong>Stock (weighted average)</strong>
        <p className="row spacer"><span>Opening stock (charged)</span><strong>{money(pnl.openingStock)}</strong></p>
        <p className="row"><span>Closing stock (added back)</span><strong>{money(pnl.closingStock)}</strong></p>
        <p className="row"><span>Stock adjustment to profit</span><strong className={pnl.stockAdjustment < 0 ? "red" : "green"}>{money(pnl.stockAdjustment)}</strong></p>
        <p className="small">Purchases are expensed when booked; cost of goods sold = opening stock + purchases − closing stock.</p>
      </div> : null}
      <div className="card span"><strong>Net {pnl.net < 0 ? "loss" : "profit"}</strong><p className={`metric-value ${pnl.net < 0 ? "red" : "green"}`}>{money(pnl.net)}</p></div>
    </div>
  );
}
