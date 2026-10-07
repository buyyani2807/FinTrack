import { useEffect, useState } from "react";
import { loadCashbookEntries, loadLedgerAccounts } from "./cashbookRepository.js";
import { aggregateOverview, dateRangeForFilter } from "./cashbookModel.js";
import { money } from "./cashbookConfig.js";

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
  return <button type="button" className="card accounts-summary-card spacer" onClick={onOpen}>
    <div className="toolbar accounts-summary-heading"><strong>Cashbook</strong><span className="small">Running balances · Open</span></div>
    <div className="accounts-summary-grid">
      <div><span className="small">Cash</span><strong className="gold">{moneyFmt(overview.cash)}</strong></div>
      <div><span className="small">Bank</span><strong>{moneyFmt(overview.bank)}</strong></div>
      <div><span className="small">UPI</span><strong>{moneyFmt(overview.upi)}</strong></div>
      <div><span className="small">Total</span><strong className="gold">{moneyFmt(overview.total)}</strong></div>
      <div><span className="small">Today&apos;s in</span><strong className="green">{moneyFmt(overview.moneyIn)}</strong></div>
      <div><span className="small">Today&apos;s out</span><strong className="red">{moneyFmt(overview.moneyOut)}</strong></div>
    </div>
  </button>;
}
