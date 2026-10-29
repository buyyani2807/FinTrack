import { cancelVoucher, queueEinvoicePayload, reverseVoucher } from "../../data/accountingRepository.js";
import { AccMoreMenu } from "../../components/AccUi.jsx";
import { buildEinvoiceOutboundPayload } from "../../io/gstPrepExport.js";
import { attachmentDownloadHref, VOUCHER_ATTACHMENT_MAX_BYTES } from "../../data/voucherAttachments.js";
import { VOUCHER_TYPES, voucherTotals } from "../../model/accountingModel.js";
import { todayIso } from "../../../../lib/dates.js";
import { buildSalesInvoice } from "../../model/salesInvoiceModel.js";
import { PurchaseDocumentButton, SalesInvoiceActions } from "../../components/SalesInvoiceActions.jsx";
import { money } from "../../accountsFormat.js";

export const voucherTypeLabel = voucher => VOUCHER_TYPES[voucher.voucherType]?.label || voucher.voucherType;
export const voucherAmount = voucher => voucherTotals(voucher.lines).debit;

export function voucherMoreItems({
  voucher,
  openSalesInvoice,
  canWrite,
  duplicateVoucher,
  saving,
  askReason,
  run,
  token,
}) {
  return [
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
  ];
}

/** Expanded lines, document actions, and attachments for a voucher row. */
export function VoucherExpandPanel({
  voucher,
  canWrite,
  saving,
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
  const party = parties.find(item => item.id === voucher.partyId) || null;
  return (
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
  );
}

export function VoucherActionsMenu(props) {
  return <AccMoreMenu label="More" items={voucherMoreItems(props)} />;
}
