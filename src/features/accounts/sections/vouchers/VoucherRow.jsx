import { useState } from "react";
import { cancelVoucher, queueEinvoicePayload, queueEwaybillPayload, recordEwaybillNumber, reverseVoucher } from "../../data/accountingRepository.js";
import { Field, Modal } from "../../components/AccUi.jsx";
import { buildEinvoiceOutboundPayload, buildEwayBillOutboundPayload } from "../../io/gstPrepExport.js";
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
  askReason,
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
  const [transportDraft, setTransportDraft] = useState(null);
  const openTransportDraft = () => setTransportDraft({ vehicleNumber: "", transporterName: "", transporterId: "", transMode: "1", transDistance: "", transDocNo: "" });
  const generateEwayBill = transport => run(async () => {
    const payload = buildEwayBillOutboundPayload({ voucher, party, company: activeCompany, workspace, transport });
    await queueEwaybillPayload(token, voucher.id, payload);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fintrack-ewaybill-payload-${voucher.voucherNumber || voucher.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setTransportDraft(null);
  }, transport
    ? "E-way bill payload prepared (not submitted) with Part B, and downloaded. Upload it on the portal, then record the e-way bill number here once you have it."
    : "E-way bill payload prepared (not submitted) and downloaded. Add Part B on the portal, then record the e-way bill number here once you have it.");
  return (
    <>
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
          {canWrite && activeCompany?.gstRegistration === "regular" && (
            <button type="button" className="btn" disabled={saving} onClick={openTransportDraft}>
              Prepare e-way bill JSON
            </button>
          )}
          {canWrite && activeCompany?.gstRegistration === "regular" && askReason && (
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => askReason(
                "Record e-way bill number",
                "Save",
                ebn => run(() => recordEwaybillNumber(token, voucher.id, ebn), "E-way bill number recorded."),
                "E-way bill number (EBN)",
              )}
            >
              Record e-way bill number
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
    {transportDraft && (
      <Modal
        title="E-way bill: vehicle and transporter (Part B)"
        close={() => !saving && setTransportDraft(null)}
        actions={<div className="tabs spacer">
          <button type="button" className="btn" disabled={saving} onClick={() => generateEwayBill(null)}>Skip Part B, prepare anyway</button>
          <button type="button" className="btn primary" disabled={saving} onClick={() => generateEwayBill(transportDraft)}>Generate e-way bill JSON</button>
        </div>}
      >
        <p className="copy">Optional. Fill these in if you have them now — the government portal also lets you add or change them later, before the e-way bill is valid for movement.</p>
        <div className="form">
          <Field className="span" label="Vehicle number"><input placeholder="e.g. KA01AB1234" value={transportDraft.vehicleNumber} onChange={event => setTransportDraft(current => ({ ...current, vehicleNumber: event.target.value }))} /></Field>
          <Field label="Transporter name"><input value={transportDraft.transporterName} onChange={event => setTransportDraft(current => ({ ...current, transporterName: event.target.value }))} /></Field>
          <Field label="Transporter ID (GSTIN, if any)"><input value={transportDraft.transporterId} onChange={event => setTransportDraft(current => ({ ...current, transporterId: event.target.value }))} /></Field>
          <Field label="Mode of transport">
            <select value={transportDraft.transMode} onChange={event => setTransportDraft(current => ({ ...current, transMode: event.target.value }))}>
              <option value="1">Road</option>
              <option value="2">Rail</option>
              <option value="3">Air</option>
              <option value="4">Ship</option>
            </select>
          </Field>
          <Field label="Approx. distance (km)"><input type="number" min="0" value={transportDraft.transDistance} onChange={event => setTransportDraft(current => ({ ...current, transDistance: event.target.value }))} /></Field>
          <Field label="Transport document number"><input value={transportDraft.transDocNo} onChange={event => setTransportDraft(current => ({ ...current, transDocNo: event.target.value }))} /></Field>
        </div>
      </Modal>
    )}
    </>
  );
}
