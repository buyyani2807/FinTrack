import { Fragment } from "react";
import { AccEmpty, AccPager, AccMoreMenu, DateSortTh } from "../components/AccUi.jsx";
import { formatOverviewDate, money } from "../accountsFormat.js";
import { pageSlice } from "../model/accountsList.js";
import { useDateSort } from "../model/useDateSort.js";
import {
  voucherAmount,
  voucherMoreItems,
  voucherTypeLabel,
  VoucherExpandPanel,
} from "./vouchers/VoucherRow.jsx";

const statusClass = status => {
  if (status === "posted") return "is-posted";
  if (status === "cancelled") return "is-cancelled";
  if (status === "reversed") return "is-reversed";
  return "is-draft";
};

export function VouchersSection({
  canWrite,
  openSimple,
  search,
  setSearch,
  shownVouchers,
  setExpandedVoucherId,
  expandedVoucherId,
  openSalesInvoice,
  duplicateVoucher,
  saving,
  askReason,
  run,
  token,
  parties,
  accounts,
  activeCompany,
  workspace,
  voucherItemLines,
  orgSettings,
  attachmentBusy,
  onAttachVoucherFile,
  voucherAttachments,
  onDeleteAttachment,
  listPage,
  setListPage,
}) {
  const { sorted, direction, toggle } = useDateSort(shownVouchers, "date");
  const paged = pageSlice(sorted, listPage);
  const partyName = id => parties.find(party => party.id === id)?.name || "";
  const onToggleSort = () => {
    toggle();
    setListPage(1);
  };
  const toggleOpen = id => setExpandedVoucherId(current => (current === id ? null : id));
  const showAdjacentVoucher = (voucherId, delta) => {
    const index = sorted.findIndex(item => item.id === voucherId);
    if (index < 0) return;
    const next = sorted[index + delta];
    if (next) setExpandedVoucherId(next.id);
  };
  const actionProps = {
    openSalesInvoice,
    canWrite,
    duplicateVoucher,
    saving,
    askReason,
    run,
    token,
  };
  const expandProps = {
    canWrite,
    saving,
    run,
    token,
    shownVouchers: sorted,
    showAdjacentVoucher,
    parties,
    accounts,
    activeCompany,
    workspace,
    voucherItemLines,
    orgSettings,
    attachmentBusy,
    onAttachVoucherFile,
    voucherAttachments,
    onDeleteAttachment,
  };

  return (
    <div className="acc-panel acc-tx">
      <div className="accounts-action-row acc-tx-toolbar">
        <input
          className="accounts-search acc-tx-search"
          placeholder="Search voucher, party, or narration"
          value={search}
          onChange={event => setSearch(event.target.value)}
          aria-label="Search transactions"
        />
      </div>

      {!shownVouchers.length ? (
        <AccEmpty
          title="No transactions yet"
          copy={canWrite
            ? "Use New entry at the top of the page for a sale, purchase, or other voucher."
            : "Transactions for this company will show here once they are posted."}
          actionLabel={canWrite ? "+ Sale" : undefined}
          onAction={canWrite ? () => openSimple("sale") : undefined}
        />
      ) : (
        <>
          <div className="table spacer acc-table-wrap acc-tx-table">
            <table>
              <thead>
                <tr>
                  <th><DateSortTh label="Date" direction={direction} onToggle={onToggleSort} /></th>
                  <th>Number</th>
                  <th>Type</th>
                  <th>Party</th>
                  <th>Narration</th>
                  <th>Status</th>
                  <th className="acc-num">Amount</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map(voucher => {
                  const open = expandedVoucherId === voucher.id;
                  return (
                    <Fragment key={voucher.id}>
                      <tr className={open ? "is-open" : undefined}>
                        <td>{formatOverviewDate(voucher.date)}</td>
                        <td>
                          <button type="button" className="acc-invoice-ref-btn" aria-expanded={open} onClick={() => toggleOpen(voucher.id)}>
                            {voucher.voucherNumber}
                          </button>
                        </td>
                        <td>{voucherTypeLabel(voucher)}</td>
                        <td>{partyName(voucher.partyId) || "—"}</td>
                        <td>{voucher.narration || "—"}</td>
                        <td><span className={`acc-tx-status ${statusClass(voucher.status)}`}>{voucher.status}</span></td>
                        <td className="acc-num">{money(voucherAmount(voucher))}</td>
                        <td>
                          <div className="acc-tx-table-actions">
                            <button type="button" className={`btn${open ? " primary" : ""}`} aria-expanded={open} onClick={() => toggleOpen(voucher.id)}>
                              {open ? "Hide" : "Lines"}
                            </button>
                            <AccMoreMenu label="More" items={voucherMoreItems({ voucher, ...actionProps })} />
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="acc-tx-expand-row">
                          <td colSpan={8}>
                            <VoucherExpandPanel voucher={voucher} {...expandProps} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="acc-ledger-cards spacer acc-tx-cards">
            {paged.items.map(voucher => {
              const open = expandedVoucherId === voucher.id;
              return (
                <article key={voucher.id} className={`acc-ledger-card${open ? " is-open" : ""}`}>
                  <div className="acc-ledger-card-top">
                    <strong>
                      <button type="button" className="acc-invoice-ref-btn" aria-expanded={open} onClick={() => toggleOpen(voucher.id)}>
                        {voucher.voucherNumber}
                      </button>
                    </strong>
                    <span className={`acc-tx-status ${statusClass(voucher.status)}`}>{voucher.status}</span>
                  </div>
                  <p className="small">
                    {formatOverviewDate(voucher.date)} · {voucherTypeLabel(voucher)}
                    {partyName(voucher.partyId) ? ` · ${partyName(voucher.partyId)}` : ""}
                  </p>
                  {voucher.narration ? <p className="small">{voucher.narration}</p> : null}
                  <p className="acc-ledger-card-amounts">
                    <span>Amount <strong>{money(voucherAmount(voucher))}</strong></span>
                  </p>
                  <div className="acc-tx-table-actions">
                    <button type="button" className={`btn${open ? " primary" : ""}`} aria-expanded={open} onClick={() => toggleOpen(voucher.id)}>
                      {open ? "Hide" : "Lines"}
                    </button>
                    <AccMoreMenu label="More" items={voucherMoreItems({ voucher, ...actionProps })} />
                  </div>
                  {open ? <VoucherExpandPanel voucher={voucher} {...expandProps} /> : null}
                </article>
              );
            })}
          </div>

          <AccPager page={paged.page} pages={paged.pages} total={paged.total} onPage={setListPage} noun="vouchers" />
        </>
      )}
    </div>
  );
}
