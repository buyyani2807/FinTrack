import { useEffect, useState } from "react";
import { loadCashbookEntries, loadLedgerAccounts } from "./cashbookRepository.js";
import { aggregateOverview, dateRangeForFilter } from "./cashbookModel.js";
import { money } from "./cashbookConfig.js";
import { CashbookOverview } from "./components/CashbookOverview.jsx";

export function AccountsSummaryCard({ token, moneyFmt = money, onOpen }) {
  const [overview, setOverview] = useState(null);
  useEffect(() => {
    if (!token) return;
    Promise.all([loadLedgerAccounts(token), loadCashbookEntries(token)])
      .then(([ledgers, entries]) => {
        const range = dateRangeForFilter("today");
        setOverview(aggregateOverview(ledgers, entries, range));
      })
      .catch(() => setOverview(null));
  }, [token]);
  if (!overview) return null;
  return <section className="accounts-summary spacer">
    <div className="accounts-summary-heading">
      <strong>Cashbook</strong>
      <button type="button" className="link-button" onClick={onOpen}>Open</button>
    </div>
    <CashbookOverview balances={overview} movement={overview} period="today" onOpen={onOpen} showHint={false} moneyFmt={moneyFmt} />
  </section>;
}
