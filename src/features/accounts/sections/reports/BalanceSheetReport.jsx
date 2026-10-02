import { roundMoney } from "../../model/accountingModel.js";
import { money } from "../../accountsFormat.js";

export function BalanceSheetReport({ sheet }) {
  return (
    <div className="grid two spacer">
      <div className="card"><strong>Assets {money(sheet.totalAssets)}</strong>{sheet.assets.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}</div>
      <div className="card"><strong>Liabilities & equity {money(roundMoney(sheet.totalLiabilities + sheet.totalEquity))}</strong>
        {sheet.liabilities.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}
        {sheet.equity.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}
        <p className="small">{sheet.balanced ? "Assets equal liabilities plus equity." : "Balance sheet is out of equation."}</p>
      </div>
    </div>
  );
}
