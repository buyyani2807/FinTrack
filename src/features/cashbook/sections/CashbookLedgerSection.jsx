import { X } from "lucide-react";
import { FilterSelect, SearchInput } from "../../../components/ui.jsx";
import { backfillCashbook } from "../cashbookRepository.js";
import { CASHBOOK_SOURCE_FILTERS, sourceOriginLabel } from "../cashbookModel.js";
import { money } from "../cashbookConfig.js";
import { EmptyState } from "../components/CashbookUi.jsx";
import { PeriodPills } from "../components/PeriodPills.jsx";
import { CashbookOverview } from "../components/CashbookOverview.jsx";

const DIRECTION_OPTIONS = [
  { id: "all", label: "All types" },
  { id: "in", label: "Money in" },
  { id: "out", label: "Money out" },
  { id: "transfer", label: "Transfer" },
];

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
  const filtersActive = Boolean(search) || accountFilter !== "all" || sourceFilter !== "all" || directionFilter !== "all";
  const clearFilters = () => { setSearch(""); setAccountFilter("all"); setSourceFilter("all"); setDirectionFilter("all"); };
  return (
    <div className="accounts-panel">
      <CashbookOverview balances={allTimeOverview} movement={periodOverview} period={period} />
      <div className="card accounts-filter-card cashbook-filters spacer">
        <div className="cashbook-filters-scope">
          <PeriodPills {...periodProps} />
          <span className="cashbook-filters-count" aria-live="polite">{cashbookRows.length} {cashbookRows.length === 1 ? "transaction" : "transactions"}</span>
        </div>
        <div className="cashbook-filters-refine">
          <SearchInput label="Search transactions" placeholder="Search customer, receipt, reference…" value={search} onChange={event => setSearch(event.target.value)} />
          <div className="cashbook-filters-chips">
            <FilterSelect label="Account" value={accountFilter} onChange={setAccountFilter}>
              <option value="all">All accounts</option>
              {ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter}>
              {CASHBOOK_SOURCE_FILTERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </FilterSelect>
            <FilterSelect label="Type" value={directionFilter} onChange={setDirectionFilter}>
              {DIRECTION_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </FilterSelect>
            {filtersActive && <button type="button" className="ft-clear-filters" onClick={clearFilters}><X size={14} aria-hidden="true" />Clear</button>}
          </div>
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
