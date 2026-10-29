import { AccMoreMenu, AccToolbar, AccEmpty, AccPager } from "../components/AccUi.jsx";
import { SIMPLE_ENTRY_KINDS } from "../model/accountingModel.js";
import { VoucherRow } from "./vouchers/VoucherRow.jsx";

export function VouchersSection({
  canWrite,
  openSimple,
  openVoucher,
  openBulkImport = null,
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
      {canWrite && (
        <AccToolbar
          className="acc-tx-toolbar"
          start={(
            <div className="acc-btn-group">
              <button type="button" className="btn primary" onClick={() => openSimple("sale")}>+ Sale</button>
              <button type="button" className="btn" onClick={() => openSimple("purchase")}>+ Purchase</button>
              <AccMoreMenu
                label="More"
                items={[
                  ...SIMPLE_ENTRY_KINDS
                    .filter(item => !["sale", "purchase"].includes(item.id))
                    .map(item => ({
                      id: item.id,
                      label: `+ ${item.label}`,
                      onClick: () => openSimple(item.id),
                    })),
                  { id: "advanced", label: "+ Advanced voucher", onClick: openVoucher },
                  ...(openBulkImport ? [{ id: "bulk", label: "Bulk import…", onClick: openBulkImport }] : []),
                ]}
              />
            </div>
          )}
          end={(
            <input
              className="accounts-search acc-tx-search"
              placeholder="Search voucher, party, or narration"
              value={search}
              onChange={event => setSearch(event.target.value)}
              aria-label="Search transactions"
            />
          )}
        />
      )}
      {!canWrite && (
        <div className="accounts-action-row acc-tx-toolbar">
          <input
            className="accounts-search acc-tx-search"
            placeholder="Search voucher, party, or narration"
            value={search}
            onChange={event => setSearch(event.target.value)}
            aria-label="Search transactions"
          />
        </div>
      )}
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
            copy="Use a guided entry for everyday work, or an advanced voucher for a custom journal."
            actionLabel="+ Create transaction"
            onAction={() => openSimple("sale")}
          />
        )}
      </div>
      <AccPager page={pagedVouchers.page} pages={pagedVouchers.pages} total={pagedVouchers.total} onPage={setListPage} noun="vouchers" />
    </div>
  );
}
