import { useState } from "react";
import { formatReceiptDate, withReceiptBranding } from "../receipts/receiptModel.js";
import { canWhatsAppShare, openWhatsAppShare } from "../receipts/receiptWhatsApp.js";
import { buildArReminderMessage, buildSalesInvoiceMessage } from "./salesInvoiceModel.js";
import { downloadSalesInvoicePdf } from "./salesInvoicePdf.js";

export function SalesInvoiceViewerModal({ invoice, settings = {}, close }) {
  const branded = withReceiptBranding(invoice, settings);
  const whatsAppAvailable = canWhatsAppShare(branded?.customerPhone);
  const m = branded.money;

  return (
    <div className="modal-bg">
      <div className="modal receipt-view">
        <div className="receipt-paper">
          <div className="receipt-header">
            <strong>{branded.companyName}</strong>
            <span>SALES INVOICE</span>
          </div>
          {branded.companyAddress && <p className="small">{branded.companyAddress}</p>}
          {(branded.companyPhone || branded.companyEmail) && (
            <p className="small">{[branded.companyPhone, branded.companyEmail].filter(Boolean).join(" · ")}</p>
          )}
          <div className="receipt-meta">
            <span>Invoice No: {branded.invoiceNumber}</span>
            <span>{formatReceiptDate(branded.invoiceDate)}</span>
          </div>
          <p className="small">Due {formatReceiptDate(branded.dueDate)} · {branded.settlement || "Sale"}</p>
          <hr />
          <section>
            <strong>BILL TO</strong>
            <p>{branded.customerName}</p>
            {branded.customerPhone && <p className="small">Phone: {branded.customerPhone}</p>}
            {branded.customerGstin && <p className="small">GSTIN: {branded.customerGstin}</p>}
            {branded.customerAddress && <p className="small">{branded.customerAddress}</p>}
          </section>
          <hr />
          <section>
            <strong>AMOUNT</strong>
            {branded.tax > 0 && <>
              <p>Taxable: {m(branded.taxable)}</p>
              {branded.cgst ? <p>CGST: {m(branded.cgst)}</p> : null}
              {branded.sgst ? <p>SGST: {m(branded.sgst)}</p> : null}
              {branded.igst ? <p>IGST: {m(branded.igst)}</p> : null}
            </>}
            <p>Invoice total: {m(branded.amount)}</p>
            {branded.outstanding != null && branded.outstanding !== branded.amount && (
              <p>Outstanding: {m(branded.outstanding)}</p>
            )}
            {branded.hsnSac ? <p className="small">HSN/SAC: {branded.hsnSac}</p> : null}
          </section>
          {branded.narration ? <section><strong>Narration</strong><p>{branded.narration}</p></section> : null}
          <hr />
          <p className="small">{branded.receiptFooter}</p>
          {branded.receiptTerms && <p className="small muted">{branded.receiptTerms}</p>}
          <p className="small muted">Powered by FinTrack</p>
        </div>
        <div className="row spacer">
          <button type="button" className="btn" onClick={() => downloadSalesInvoicePdf(branded)}>Download PDF</button>
          {whatsAppAvailable && (
            <button
              type="button"
              className="btn whatsapp"
              onClick={() => openWhatsAppShare({
                phone: branded.customerPhone,
                message: buildSalesInvoiceMessage(branded, settings),
              })}
            >
              WhatsApp
            </button>
          )}
          <button type="button" className="btn primary" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function SalesInvoiceActions({ invoice, settings = {}, compact = false }) {
  const [viewOpen, setViewOpen] = useState(false);
  if (!invoice?.invoiceNumber) return null;
  const branded = withReceiptBranding(invoice, settings);
  const whatsAppAvailable = canWhatsAppShare(branded.customerPhone);

  return (
    <>
      <div className={`receipt-actions ${compact ? "compact" : ""}`}>
        <button type="button" className="btn" onClick={() => setViewOpen(true)}>Invoice</button>
        <button type="button" className="btn" onClick={() => downloadSalesInvoicePdf(branded)}>PDF</button>
        {whatsAppAvailable
          ? (
            <button
              type="button"
              className="btn whatsapp"
              onClick={() => openWhatsAppShare({
                phone: branded.customerPhone,
                message: buildSalesInvoiceMessage(branded, settings),
              })}
            >
              WhatsApp
            </button>
          )
          : (!compact && <span className="small muted">Add party phone for WhatsApp</span>)}
      </div>
      {viewOpen && <SalesInvoiceViewerModal invoice={branded} settings={settings} close={() => setViewOpen(false)} />}
    </>
  );
}

export function SalesInvoiceSuccessModal({ invoice, settings = {}, close }) {
  const [viewOpen, setViewOpen] = useState(false);
  const branded = withReceiptBranding(invoice, settings);
  const whatsAppAvailable = canWhatsAppShare(branded?.customerPhone);
  const m = branded.money;

  return (
    <>
      <div className="modal-bg">
        <div className="modal receipt-success">
          <h2 className="title green">Sale recorded ✓</h2>
          <p className="copy">Invoice No: <strong className="gold">{branded.invoiceNumber}</strong></p>
          <p className="copy">{branded.customerName} · {m(branded.amount)} · {branded.settlement}</p>
          <p className="small">Date: {formatReceiptDate(branded.invoiceDate)} · Due: {formatReceiptDate(branded.dueDate)}</p>
          <div className="tool-stack spacer">
            <button type="button" className="btn primary" onClick={() => setViewOpen(true)}>View invoice</button>
            <button type="button" className="btn" onClick={() => downloadSalesInvoicePdf(branded)}>Download PDF</button>
            {whatsAppAvailable
              ? (
                <button
                  type="button"
                  className="btn whatsapp"
                  onClick={() => openWhatsAppShare({
                    phone: branded.customerPhone,
                    message: buildSalesInvoiceMessage(branded, settings),
                  })}
                >
                  Send via WhatsApp
                </button>
              )
              : <p className="small">WhatsApp unavailable — add a valid party phone number.</p>}
          </div>
          <div className="row spacer">
            <button type="button" className="btn primary" onClick={close}>Done</button>
          </div>
        </div>
      </div>
      {viewOpen && <SalesInvoiceViewerModal invoice={branded} settings={settings} close={() => setViewOpen(false)} />}
    </>
  );
}

export function ArReminderButton({ row, settings = {}, company = {}, compact = false }) {
  if (!row || Number(row.outstanding || 0) <= 0) return null;
  const phone = row.partyPhone || "";
  if (!canWhatsAppShare(phone)) {
    return compact ? null : <span className="small muted">No WhatsApp phone</span>;
  }
  return (
    <button
      type="button"
      className="btn whatsapp"
      title="Open WhatsApp payment reminder"
      onClick={() => openWhatsAppShare({
        phone,
        message: buildArReminderMessage(row, settings, company),
      })}
    >
      Remind
    </button>
  );
}
