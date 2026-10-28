import { StatementSheetPair } from "./StatementSheet.jsx";
import { balanceAssetRows, balanceLiabilityRows, periodCaption } from "./reportStatementRows.js";

export function BalanceSheetReport({ sheet, rangeFrom = "", rangeTo = "", companyName = "" }) {
  const asOf = rangeTo || periodCaption(rangeFrom, rangeTo);
  const meta = [companyName, asOf ? `As of ${asOf}` : ""].filter(Boolean).join(" · ");
  return (
    <StatementSheetPair
      left={{ title: "Assets", periodLabel: meta, rows: balanceAssetRows(sheet) }}
      right={{ title: "Liabilities & equity", periodLabel: meta, rows: balanceLiabilityRows(sheet) }}
    />
  );
}
