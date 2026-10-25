import { roundMoney } from "../../model/accountingModel.js";
import { money, profitResult } from "../../accountsFormat.js";

export function ProfitLossReport({ pnl }) {
  const result = profitResult(pnl.net);
  const beforeStock = roundMoney(Number(pnl.totalIncome || 0) - Number(pnl.totalExpense || 0));
  const hasStock = Boolean(pnl.openingStock || pnl.closingStock);
  return (
    <div className="grid two spacer">
      <div className="card"><strong>Income</strong>{pnl.income.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total income</span><strong className="green">{money(pnl.totalIncome)}</strong></p></div>
      <div className="card"><strong>Expenses</strong>{pnl.expenses.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total expenses</span><strong className="red">{money(pnl.totalExpense)}</strong></p></div>
      {hasStock ? <div className="card span"><strong>Stock</strong>
        <p className="row spacer"><span>{beforeStock < 0 ? "Loss before stock" : "Profit before stock"}</span><strong className={beforeStock < 0 ? "red" : "green"}>{money(Math.abs(beforeStock))}</strong></p>
        <p className="row"><span>Opening stock</span><strong>{money(pnl.openingStock)}</strong></p>
        <p className="row"><span>Closing stock</span><strong>{money(pnl.closingStock)}</strong></p>
        <p className="small">Closing stock is what is still in hand. It is added back. Opening stock is charged for the period.</p>
      </div> : null}
      <div className="card span"><strong>{result.label}</strong><p className={`metric-value ${result.loss ? "red" : "green"}`}>{money(result.amount)}</p></div>
    </div>
  );
}
