import { useState } from "react";
import { formatReceiptDate } from "../receipts/receiptModel.js";
import { canWhatsAppShare, openWhatsAppShare } from "../receipts/receiptWhatsApp.js";
import { buildArReminderMessage, buildOutstandingSummaryMessage, buildPartyStatementMessage, buildPaymentAdviceMessage, buildPurchaseDocumentMessage, buildSalesInvoiceMessage } from "./salesInvoiceModel.js";
import { downloadSalesInvoicePdf } from "./salesInvoicePdf.js";
import { downloadPartyStatementPdf } from "./partyStatementPdf.js";

export function SalesInvoiceViewerModal({ invoice, settings = {}, close }) {
  const whatsAppAvailable = canWhatsAppShare(invoice?.customerPhone);
  const m = invoice.money;

  return (
    <div className="modal-bg">
      <div className="modal receipt-view">
        <div className="receipt-paper">
          <div className="receipt-header">
            <strong>{invoice.companyName}</strong>
            <span>SALES INVOICE</span>
          </div>
          {invoice.companyLegalName && <p className="small">Legal name: {invoice.companyLegalName}</p>}
          {invoice.companyAddress && <p className="small">{invoice.companyAddress}</p>}
          {invoice.companyGstin && <p className="small">GSTIN: {invoice.companyGstin}</p>}
          {(invoice.companyPhone || invoice.companyEmail) && (
            <p className="small">{[invoice.companyPhone, invoice.companyEmail].filter(Boolean).join(" · ")}</p>
          )}
          <div className="receipt-meta">
            <span>Invoice No: {invoice.invoiceNumber}</span>
            <span>{formatReceiptDate(invoice.invoiceDate)}</span>
          </div>
          <p className="small">Due {formatReceiptDate(invoice.dueDate)} · {invoice.settlement || "Sale"}</p>
          <hr />
          <section>
            <strong>BILL TO</strong>
            <p>{invoice.customerName}</p>
            {invoice.customerPhone && <p className="small">Phone: {invoice.customerPhone}</p>}
            {invoice.customerGstin && <p className="small">GSTIN: {invoice.customerGstin}</p>}
            {invoice.customerAddress && <p className="small">{invoice.customerAddress}</p>}
          </section>
          <hr />
          {invoice.itemLines?.length ? (
            <section>
              <strong>ITEMS</strong>
              {invoice.itemLines.map((line, index) => (
                <p key={index}>{line.quantity} {line.unit} × {line.name} @ {m(line.rate)} = {m(line.amount)}</p>
              ))}
            </section>
          ) : null}
          <section>
            <strong>AMOUNT</strong>
            {invoice.tax > 0 && <>
              <p>Taxable: {m(invoice.taxable)}</p>
              {invoice.cgst ? <p>CGST: {m(invoice.cgst)}</p> : null}
              {invoice.sgst ? <p>SGST: {m(invoice.sgst)}</p> : null}
              {invoice.igst ? <p>IGST: {m(invoice.igst)}</p> : null}
            </>}
            <p>Invoice total: {m(invoice.amount)}</p>
            {invoice.outstanding != null && invoice.outstanding !== invoice.amount && (
              <p>Outstanding: {m(invoice.outstanding)}</p>
            )}
            {invoice.hsnSac ? <p className="small">HSN/SAC: {invoice.hsnSac}</p> : null}
          </section>
          {invoice.narration ? <section><strong>Narration</strong><p>{invoice.narration}</p></section> : null}
          <hr />
          <p className="small">{invoice.receiptFooter}</p>
          {invoice.receiptTerms && <p className="small muted">{invoice.receiptTerms}</p>}
          <p className="small muted">Powered by FinTrack</p>
        </div>
        <div className="row spacer">
          <button type="button" className="btn" onClick={() => downloadSalesInvoicePdf(invoice)}>Download PDF</button>
          {whatsAppAvailable && (
            <button
              type="button"
              className="btn whatsapp"
              onClick={() => openWhatsAppShare({
                phone: invoice.customerPhone,
                message: buildSalesInvoiceMessage(invoice, settings),
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
  const whatsAppAvailable = canWhatsAppShare(invoice.customerPhone);

  return (
    <>
      <div className={`receipt-actions ${compact ? "compact" : ""}`}>
        <button type="button" className="btn" onClick={() => setViewOpen(true)}>Invoice</button>
        <button type="button" className="btn" onClick={() => downloadSalesInvoicePdf(invoice)}>PDF</button>
        {whatsAppAvailable
          ? (
            <button
              type="button"
              className="btn whatsapp"
              onClick={() => openWhatsAppShare({
                phone: invoice.customerPhone,
                message: buildSalesInvoiceMessage(invoice, settings),
              })}
            >
              WhatsApp
            </button>
          )
          : (!compact && <span className="small muted">Add party phone for WhatsApp</span>)}
      </div>
      {viewOpen && <SalesInvoiceViewerModal invoice={invoice} settings={settings} close={() => setViewOpen(false)} />}
    </>
  );
}

export function SalesInvoiceSuccessModal({ invoice, settings = {}, close }) {
  const [viewOpen, setViewOpen] = useState(false);
  const whatsAppAvailable = canWhatsAppShare(invoice?.customerPhone);
  const m = invoice.money;

  return (
    <>
      <div className="modal-bg">
        <div className="modal receipt-success">
          <h2 className="title green">Sale recorded ✓</h2>
          <p className="copy">Invoice No: <strong className="gold">{invoice.invoiceNumber}</strong></p>
          <p className="copy">{invoice.companyName} → {invoice.customerName} · {m(invoice.amount)} · {invoice.settlement}</p>
          <p className="small">Date: {formatReceiptDate(invoice.invoiceDate)} · Due: {formatReceiptDate(invoice.dueDate)}</p>
          <div className="tool-stack spacer">
            <button type="button" className="btn primary" onClick={() => setViewOpen(true)}>View invoice</button>
            <button type="button" className="btn" onClick={() => downloadSalesInvoicePdf(invoice)}>Download PDF</button>
            {whatsAppAvailable
              ? (
                <button
                  type="button"
                  className="btn whatsapp"
                  onClick={() => openWhatsAppShare({
                    phone: invoice.customerPhone,
                    message: buildSalesInvoiceMessage(invoice, settings),
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
      {viewOpen && <SalesInvoiceViewerModal invoice={invoice} settings={settings} close={() => setViewOpen(false)} />}
    </>
  );
}

export function ArReminderButton({ row, settings = {}, company = {}, workspace = {}, compact = false }) {
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
        message: buildArReminderMessage(row, settings, company, workspace),
      })}
    >
      Remind
    </button>
  );
}

export function PaymentAdviceButton({ row, settings = {}, company = {}, workspace = {}, compact = false }) {
  if (!row || Number(row.outstanding || 0) <= 0) return null;
  const phone = row.partyPhone || "";
  if (!canWhatsAppShare(phone)) {
    return compact ? null : <span className="small muted">No WhatsApp phone</span>;
  }
  return (
    <button
      type="button"
      className="btn whatsapp"
      title="Open WhatsApp payment advice"
      onClick={() => openWhatsAppShare({
        phone,
        message: buildPaymentAdviceMessage(row, settings, company, workspace),
      })}
    >
      {compact ? "Advice" : "Payment advice"}
    </button>
  );
}

export function PurchaseDocumentButton({ voucher, party, settings = {}, company = {}, workspace = {}, compact = false }) {
  if (!voucher || voucher.voucherType !== "purchase") return null;
  const phone = party?.phone || "";
  if (!canWhatsAppShare(phone)) {
    return compact ? null : <span className="small muted">No WhatsApp phone</span>;
  }
  return (
    <button
      type="button"
      className="btn whatsapp"
      title="Share purchase document on WhatsApp"
      onClick={() => openWhatsAppShare({
        phone,
        message: buildPurchaseDocumentMessage(voucher, party, settings, company, workspace),
      })}
    >
      {compact ? "WhatsApp" : "Share purchase"}
    </button>
  );
}

export function PartyStatementButton({
  party,
  partyBook,
  periodFrom,
  periodTo,
  settings = {},
  company = {},
  workspace = {},
  compact = false,
  money,
}) {
  if (!party) return null;
  const phone = party.phone || "";
  const whatsAppAvailable = canWhatsAppShare(phone);
  return (
    <>
      <button
        type="button"
        className="btn"
        title="Download party statement PDF"
        onClick={() => downloadPartyStatementPdf({
          party,
          partyBook,
          periodFrom,
          periodTo,
          company,
          money,
        })}
      >
        {compact ? "PDF" : "Statement PDF"}
      </button>
      {whatsAppAvailable ? (
        <button
          type="button"
          className="btn whatsapp"
          title="Send party statement on WhatsApp"
          onClick={() => openWhatsAppShare({
            phone,
            message: buildPartyStatementMessage({
              party,
              partyBook,
              periodFrom,
              periodTo,
              settings,
              company,
              workspace,
            }),
          })}
        >
          {compact ? "WhatsApp" : "WhatsApp statement"}
        </button>
      ) : (compact ? null : <span className="small muted">Add party phone for WhatsApp</span>)}
    </>
  );
}

export function OutstandingWhatsAppButton({
  party,
  outstanding = 0,
  kind = "receivable",
  settings = {},
  company = {},
  workspace = {},
  compact = false,
}) {
  if (!party || Number(outstanding || 0) <= 0) return null;
  const phone = party.phone || "";
  if (!canWhatsAppShare(phone)) return compact ? null : <span className="small muted">No WhatsApp phone</span>;
  return (
    <button
      type="button"
      className="btn whatsapp"
      title={kind === "payable" ? "WhatsApp outstanding payable" : "WhatsApp outstanding receivable"}
      onClick={() => openWhatsAppShare({
        phone,
        message: buildOutstandingSummaryMessage({
          party,
          outstanding,
          kind,
          settings,
          company,
          workspace,
        }),
      })}
    >
      {compact ? "Outstanding" : "WhatsApp outstanding"}
    </button>
  );
}
