import { StatementSheet } from "./StatementSheet.jsx";
import { periodCaption, pnlStatementRows } from "./reportStatementRows.js";

export function ProfitLossReport({ pnl, rangeFrom = "", rangeTo = "", companyName = "" }) {
  const period = periodCaption(rangeFrom, rangeTo);
  return (
    <StatementSheet
      title="Profit & Loss"
      periodLabel={[companyName, period].filter(Boolean).join(" · ")}
      rows={pnlStatementRows(pnl)}
    />
  );
}
