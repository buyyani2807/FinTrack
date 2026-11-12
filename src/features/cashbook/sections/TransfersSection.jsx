import { AccPager } from "../../accounts/components/AccUi.jsx";
import { usePagedList } from "../../accounts/model/usePagedList.js";
import { money } from "../cashbookConfig.js";
import { PanelHead, EmptyState } from "../components/CashbookUi.jsx";
import { PeriodPills } from "../components/PeriodPills.jsx";

export function TransfersSection({ openTransfer, periodProps, transferRows = [], canWrite = true }) {
  const pagedRows = usePagedList(
    transferRows,
    `${periodProps.period}|${periodProps.customFrom}|${periodProps.customTo}|${transferRows.length}`,
  );
  return (
    <div className="accounts-panel">
      <PanelHead title="Transfers">
        {canWrite ? <button type="button" className="btn primary" onClick={openTransfer}>Transfer money</button> : null}
      </PanelHead>
      <div className="card accounts-info-card spacer">
        <p className="copy">
          Move money between your own Cash, UPI, and Bank books — for example cash deposited to bank, or UPI withdrawn to the till.
          Transfers are not income or expense, and they do not change your total money.
        </p>
        {!canWrite ? <p className="small">Transfers are recorded by the owner.</p> : null}
      </div>
      <div className="card accounts-filter-card spacer"><PeriodPills {...periodProps} /></div>
      <div className="accounts-entry-list">
        {pagedRows.items.map(row => (
          <article key={row.id} className="card accounts-entry-row">
            <div className="accounts-entry-main">
              <div>
                <strong>{row.fromName} → {row.toName}</strong>
                <p className="small">
                  {row.entryDate}
                  {row.description ? ` · ${row.description}` : ""}
                  {!row.complete ? " · Incomplete pair" : ""}
                </p>
              </div>
              <span className="accounts-expense-amount">{money(row.amount)}</span>
            </div>
          </article>
        ))}
        {!transferRows.length && (
          <EmptyState>
            {canWrite
              ? "No transfers in this period. Use Transfer money when you move cash between Cash, UPI, and Bank."
              : "No transfers in this period."}
          </EmptyState>
        )}
      </div>
      <AccPager
        page={pagedRows.page}
        pages={pagedRows.pages}
        total={pagedRows.total}
        from={pagedRows.from}
        to={pagedRows.to}
        onPage={pagedRows.setPage}
        noun="transfers"
      />
    </div>
  );
}
