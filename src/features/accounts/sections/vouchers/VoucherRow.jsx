import { cancelVoucher, queueEinvoicePayload, reverseVoucher } from "../../data/accountingRepository.js";
import { AccMoreMenu } from "../../components/AccUi.jsx";
import { buildEinvoiceOutboundPayload } from "../../io/gstPrepExport.js";
import { attachmentDownloadHref, VOUCHER_ATTACHMENT_MAX_BYTES } from "../../data/voucherAttachments.js";
import { VOUCHER_TYPES, voucherTotals } from "../../model/accountingModel.js";
import { todayIso } from "../../../../lib/dates.js";
import { buildSalesInvoice } from "../../model/salesInvoiceModel.js";
import { PurchaseDocumentButton, SalesInvoiceActions } from "../../components/SalesInvoiceActions.jsx";
import { money } from "../../accountsFormat.js";

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
  return (
    <article className="card accounts-entry-row">
      <div className="accounts-entry-main">
        <div>
          <strong>{voucher.voucherNumber}</strong>
          <p className="small">{voucher.date} · {VOUCHER_TYPES[voucher.voucherType]?.label} · {voucher.status}{voucher.sourceType ? ` · ${voucher.sourceModule}/${voucher.sourceType}` : ""}{voucher.status === "reversed" ? " · kept in ledgers with its reversal" : ""}</p>
          <p className="small">{voucher.narration}</p>
        </div>
        <div className="accounts-entry-amounts">
          <span>{money(voucherTotals(voucher.lines).debit)}</span>
          <button type="button" className="btn" onClick={() => setExpandedVoucherId(current => current === voucher.id ? null : voucher.id)}>{expandedVoucherId === voucher.id ? "Hide" : "Lines"}</button>
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
      {expandedVoucherId === voucher.id && <>
        <div className="acc-voucher-nav">
          <button type="button" className="btn" disabled={shownVouchers.findIndex(item => item.id === voucher.id) <= 0} onClick={() => showAdjacentVoucher(voucher.id, -1)}>Previous</button>
          <button type="button" className="btn" disabled={shownVouchers.findIndex(item => item.id === voucher.id) >= shownVouchers.length - 1} onClick={() => showAdjacentVoucher(voucher.id, 1)}>Next</button>
        </div>
        {voucher.voucherType === "sales" && (
          <div className="acc-sales-invoice-actions spacer">
            <SalesInvoiceActions
              invoice={buildSalesInvoice({
                voucher,
                party: parties.find(item => item.id === voucher.partyId) || null,
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
                  const party = parties.find(item => item.id === voucher.partyId) || null;
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
          <div className="acc-sales-invoice-actions spacer">
            <PurchaseDocumentButton
              voucher={voucher}
              party={parties.find(item => item.id === voucher.partyId) || null}
              settings={orgSettings}
              company={activeCompany}
              workspace={workspace}
              compact
            />
          </div>
        )}
        <div className="table spacer"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
          {voucher.lines.map(line => <tr key={line.id}><td>{line.code} {line.name}</td><td>{line.debit ? money(line.debit) : ""}</td><td>{line.credit ? money(line.credit) : ""}</td></tr>)}
        </tbody></table></div>
        <div className="acc-voucher-attachments spacer">
          <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <strong>Attachments</strong>
            {(voucher.status === "posted" || voucher.status === "reversed") && (
              <label className="btn" style={{ cursor: attachmentBusy ? "wait" : "pointer" }}>
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
      </>}
    </article>
  );
}
