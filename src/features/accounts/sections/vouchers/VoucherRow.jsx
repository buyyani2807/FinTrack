import { cancelVoucher, queueEinvoicePayload, reverseVoucher } from "../../data/accountingRepository.js";
import { AccMoreMenu } from "../../components/AccUi.jsx";
import { buildEinvoiceOutboundPayload } from "../../io/gstPrepExport.js";
import { attachmentDownloadHref, VOUCHER_ATTACHMENT_MAX_BYTES } from "../../data/voucherAttachments.js";
import { VOUCHER_TYPES, voucherTotals } from "../../model/accountingModel.js";
import { todayIso } from "../../../../lib/dates.js";
import { buildSalesInvoice } from "../../model/salesInvoiceModel.js";
import { PurchaseDocumentButton, SalesInvoiceActions } from "../../components/SalesInvoiceActions.jsx";
import { formatOverviewDate, money } from "../../accountsFormat.js";

const TYPE_TONE = {
  sales: "sale",
  purchase: "buy",
  receipt: "in",
  payment: "out",
  credit_note: "note",
  debit_note: "note",
  journal: "book",
  contra: "book",
};

export function VoucherRow({
  voucher,
  setExpandedVoucherId,
  expandedVoucherId,
  openSalesInvoice,
  canWrite,
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
}) {
  const open = expandedVoucherId === voucher.id;
  const type = VOUCHER_TYPES[voucher.voucherType];
  const party = parties.find(item => item.id === voucher.partyId) || null;
  const amount = voucherTotals(voucher.lines).debit;
  const statusClass = voucher.status === "posted"
    ? "is-posted"
    : voucher.status === "cancelled"
      ? "is-cancelled"
      : voucher.status === "reversed"
        ? "is-reversed"
        : "is-draft";

  return (
    <article className={`acc-tx-row${open ? " is-open" : ""}`}>
      <div className="acc-tx-main">
        <div className="acc-tx-copy">
          <div className="acc-tx-topline">
            <span className={`acc-tx-type is-${TYPE_TONE[voucher.voucherType] || "book"}`}>{type?.label || voucher.voucherType}</span>
            <span className={`acc-tx-status ${statusClass}`}>{voucher.status}</span>
            {voucher.sourceType ? <span className="acc-tx-source">{voucher.sourceModule}/{voucher.sourceType}</span> : null}
          </div>
          <div className="acc-tx-title-row">
            <strong className="acc-tx-number">{voucher.voucherNumber}</strong>
            <span className="acc-tx-date">{formatOverviewDate(voucher.date)}</span>
          </div>
          {(party?.name || voucher.narration) && (
            <p className="acc-tx-narration">
              {party?.name ? <span className="acc-tx-party">{party.name}</span> : null}
              {party?.name && voucher.narration ? <span className="acc-tx-dot" aria-hidden="true">·</span> : null}
              {voucher.narration ? <span>{voucher.narration}</span> : null}
            </p>
          )}
          {voucher.status === "reversed" && (
            <p className="acc-tx-note">Kept in ledgers with its reversal</p>
          )}
        </div>
        <div className="acc-tx-side">
          <span className="acc-tx-amount">{money(amount)}</span>
          <div className="acc-tx-actions">
            <button
              type="button"
              className={`btn${open ? " primary" : ""}`}
              aria-expanded={open}
              onClick={() => setExpandedVoucherId(current => current === voucher.id ? null : voucher.id)}
            >
              {open ? "Hide" : "Lines"}
            </button>
            <AccMoreMenu
              label="More"
              items={[
                voucher.voucherType === "sales" && voucher.status === "posted"
                  ? { id: "invoice", label: "Invoice", onClick: () => openSalesInvoice(voucher) }
                  : null,
                canWrite
                  ? { id: "duplicate", label: "Duplicate", onClick: () => duplicateVoucher(voucher) }
                  : null,
                canWrite && voucher.status === "posted"
                  ? {
                    id: "reverse",
                    label: "Reverse",
                    disabled: saving,
                    onClick: () => askReason("Reverse voucher", "Post reversal", reason => run(() => reverseVoucher(token, voucher.id, todayIso(), reason), "Reversal posted.")),
                  }
                  : null,
                canWrite && voucher.status === "posted"
                  ? {
                    id: "cancel",
                    label: "Cancel voucher",
                    danger: true,
                    disabled: saving,
                    onClick: () => askReason("Cancel voucher", "Cancel voucher", reason => run(() => cancelVoucher(token, voucher.id, reason), "Voucher cancelled.")),
                  }
                  : null,
              ]}
            />
          </div>
        </div>
      </div>

      {open && (
        <div className="acc-tx-detail">
          <div className="acc-voucher-nav">
            <button type="button" className="btn" disabled={shownVouchers.findIndex(item => item.id === voucher.id) <= 0} onClick={() => showAdjacentVoucher(voucher.id, -1)}>Previous</button>
            <button type="button" className="btn" disabled={shownVouchers.findIndex(item => item.id === voucher.id) >= shownVouchers.length - 1} onClick={() => showAdjacentVoucher(voucher.id, 1)}>Next</button>
          </div>
          {voucher.voucherType === "sales" && (
            <div className="acc-sales-invoice-actions">
              <SalesInvoiceActions
                invoice={buildSalesInvoice({
                  voucher,
                  party,
                  accounts,
                  company: activeCompany,
                  workspace,
                  itemLines: voucherItemLines.filter(line => line.voucherId === voucher.id),
                })}
                settings={orgSettings}
                compact
              />
              {canWrite && activeCompany?.gstRegistration === "regular" && (
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={() => run(async () => {
                    const payload = buildEinvoiceOutboundPayload({
                      voucher,
                      party,
                      company: activeCompany,
                      workspace,
                    });
                    await queueEinvoicePayload(token, voucher.id, payload);
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `fintrack-einvoice-payload-${voucher.voucherNumber || voucher.id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }, "E-invoice payload queued (not submitted) and downloaded.")}
                >
                  Queue e-invoice payload
                </button>
              )}
            </div>
          )}
          {voucher.voucherType === "purchase" && (
            <div className="acc-sales-invoice-actions">
              <PurchaseDocumentButton
                voucher={voucher}
                party={party}
                settings={orgSettings}
                company={activeCompany}
                workspace={workspace}
                compact
              />
            </div>
          )}
          <div className="table acc-tx-lines"><table><thead><tr><th>Account</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th></tr></thead><tbody>
            {voucher.lines.map(line => (
              <tr key={line.id}>
                <td>{line.code} {line.name}</td>
                <td className="acc-num">{line.debit ? money(line.debit) : ""}</td>
                <td className="acc-num">{line.credit ? money(line.credit) : ""}</td>
              </tr>
            ))}
          </tbody></table></div>
          <div className="acc-voucher-attachments">
            <div className="acc-tx-attach-head">
              <strong>Attachments</strong>
              {(voucher.status === "posted" || voucher.status === "reversed") && (
                <label className={`btn${attachmentBusy ? " is-busy" : ""}`}>
                  {attachmentBusy ? "Uploading…" : "Add file"}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                    hidden
                    disabled={attachmentBusy}
                    onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) onAttachVoucherFile(voucher, file);
                    }}
                  />
                </label>
              )}
            </div>
            <p className="small">PDF or image up to {Math.round(VOUCHER_ATTACHMENT_MAX_BYTES / 1024)} KB. Kept with this company’s voucher only.</p>
            <ul className="acc-attachment-list">
              {voucherAttachments.map(file => (
                <li key={file.id} className="acc-attachment-item">
                  <a className="link-button" href={attachmentDownloadHref(file)} download={file.fileName}>{file.fileName}</a>
                  <span className="small">{Math.max(1, Math.round(file.byteSize / 1024))} KB</span>
                  <button type="button" className="btn" disabled={attachmentBusy} onClick={() => onDeleteAttachment(voucher.id, file.id)}>Remove</button>
                </li>
              ))}
              {!voucherAttachments.length && <li className="small">No attachments yet.</li>}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}
