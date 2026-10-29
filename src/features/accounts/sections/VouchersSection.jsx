import { AccEmpty, AccPager } from "../components/AccUi.jsx";
import { VoucherRow } from "./vouchers/VoucherRow.jsx";

export function VouchersSection({
  canWrite,
  openSimple,
  search,
  setSearch,
  pagedVouchers,
  setExpandedVoucherId,
  expandedVoucherId,
  openSalesInvoice,
  duplicateVoucher,
  saving,
  askReason,
  run,
  token,
  shownVouchers,
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
  setListPage,
}) {
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
      <div className="acc-tx-list" role="list">
        {pagedVouchers.items.map(voucher => (
          <div key={voucher.id} role="listitem">
            <VoucherRow
              voucher={voucher}
              setExpandedVoucherId={setExpandedVoucherId}
              expandedVoucherId={expandedVoucherId}
              openSalesInvoice={openSalesInvoice}
              canWrite={canWrite}
              duplicateVoucher={duplicateVoucher}
              saving={saving}
              askReason={askReason}
              run={run}
              token={token}
              shownVouchers={shownVouchers}
              showAdjacentVoucher={showAdjacentVoucher}
              parties={parties}
              accounts={accounts}
              activeCompany={activeCompany}
              workspace={workspace}
              voucherItemLines={voucherItemLines}
              orgSettings={orgSettings}
              attachmentBusy={attachmentBusy}
              onAttachVoucherFile={onAttachVoucherFile}
              voucherAttachments={voucherAttachments}
              onDeleteAttachment={onDeleteAttachment}
            />
          </div>
        ))}
        {!shownVouchers.length && (
          <AccEmpty
            title="No transactions yet"
            copy={canWrite
              ? "Use New entry at the top of the page for a sale, purchase, or other voucher."
              : "Transactions for this company will show here once they are posted."}
            actionLabel={canWrite ? "+ Sale" : undefined}
            onAction={canWrite ? () => openSimple("sale") : undefined}
          />
        )}
      </div>
      <AccPager page={pagedVouchers.page} pages={pagedVouchers.pages} total={pagedVouchers.total} onPage={setListPage} noun="vouchers" />
    </div>
  );
}
