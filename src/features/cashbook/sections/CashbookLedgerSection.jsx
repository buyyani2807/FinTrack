import { backfillCashbook } from "../cashbookRepository.js";
import { CASHBOOK_SOURCE_FILTERS, sourceOriginLabel } from "../cashbookModel.js";
import { money } from "../cashbookConfig.js";
import { EmptyState } from "../components/CashbookUi.jsx";
import { PeriodPills } from "../components/PeriodPills.jsx";
import { CashbookOverview } from "../components/CashbookOverview.jsx";

export function CashbookLedgerSection({
  allTimeOverview,
  periodOverview,
  period,
  periodProps,
  search,
  setSearch,
  accountFilter,
  setAccountFilter,
  ledgers,
  sourceFilter,
  setSourceFilter,
  directionFilter,
  setDirectionFilter,
  openManual,
  exportCsv,
  cashbookRows,
  token,
  refresh,
  loanById,
  removeManual,
}) {
  return (
    <div className="accounts-panel">
      <CashbookOverview balances={allTimeOverview} movement={periodOverview} period={period} />
      <div className="card accounts-filter-card spacer">
        <PeriodPills {...periodProps} />
        <div className="accounts-filter-row">
          <input className="accounts-search" placeholder="Search customer, receipt, reference…" value={search} onChange={event => setSearch(event.target.value)} />
          <label className="accounts-filter-field">
            <span className="small">Account</span>
            <select value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
              <option value="all">All accounts</option>
              {ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
            </select>
          </label>
          <label className="accounts-filter-field">
            <span className="small">Source</span>
            <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}>
              {CASHBOOK_SOURCE_FILTERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="accounts-filter-field">
            <span className="small">In / out</span>
            <select value={directionFilter} onChange={event => setDirectionFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="in">Money in</option>
              <option value="out">Money out</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>
        </div>
      </div>
      <div className="accounts-action-row spacer">
        <button type="button" className="btn primary" onClick={openManual}>+ Add transaction</button>
        <button type="button" className="btn" onClick={() => exportCsv(cashbookRows)}>Export CSV</button>
        <button type="button" className="btn" onClick={() => backfillCashbook(token).then(refresh)}>Sync from FinTrack</button>
      </div>
      <div className="accounts-entry-list">
        {cashbookRows.map(entry => <article key={entry.id} className="card accounts-entry-row">
          <div className="accounts-entry-main">
            <div className="accounts-entry-copy">
              <strong>{entry.description}</strong>
              <p className="small">{entry.entryDate} · {entry.ledgerName} · {entry.category}</p>
            </div>
            <div className="accounts-entry-amounts">
              {entry.moneyIn > 0 && <span className="green">{money(entry.moneyIn)}</span>}
              {entry.moneyOut > 0 && <span className="red">{money(entry.moneyOut)}</span>}
              <span className="small accounts-entry-balance">Bal {money(entry.balance)}</span>
            </div>
          </div>
          {(entry.receiptNumber || entry.paymentMode || entry.reference) && <p className="small accounts-entry-meta">
            {entry.receiptNumber && <>Receipt {entry.receiptNumber} · </>}
            {entry.paymentMode && <>{entry.paymentMode} · </>}
            {entry.reference || ""}
          </p>}
          {sourceOriginLabel(entry, loanById) && <p className="small accounts-origin-note">Synced from {sourceOriginLabel(entry, loanById)} — edit the original record to change the amount.</p>}
          {entry.isEditable && <button type="button" className="btn danger accounts-entry-delete" onClick={() => removeManual(entry)}>Delete</button>}
        </article>)}
        {!cashbookRows.length && <EmptyState>No cashbook entries match these filters.</EmptyState>}
      </div>
    </div>
  );
}
