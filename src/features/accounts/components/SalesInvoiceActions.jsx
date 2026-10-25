import { useState } from "react";
import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { canWhatsAppShare, openManualWhatsAppShare, openWhatsAppWeb } from "../../receipts/io/receiptWhatsApp.js";
import { buildArReminderMessage, buildOutstandingSummaryMessage, buildPartyStatementMessage, buildPaymentAdviceMessage, buildPurchaseDocumentMessage, salesInvoicePresentation } from "../model/salesInvoiceModel.js";
import { downloadSalesInvoicePdf, invoicePdfShareOnThisDevice, salesInvoicePdfFile, salesInvoiceWhatsAppText } from "../io/salesInvoicePdf.js";
import { downloadPartyStatementPdf } from "../io/partyStatementPdf.js";
import { CloseButton, ModalScroll } from "../../../components/ui.jsx";
import { useDialogDismiss } from "../../../components/useDialogDismiss.js";

function sendInvoiceMessage(invoice) {
  const message = salesInvoiceWhatsAppText(invoice);
  if (invoicePdfShareOnThisDevice(navigator.userAgent, navigator.maxTouchPoints)) {
    openManualWhatsAppShare({ phone: invoice.customerPhone, message });
    return;
  }
  openWhatsAppWeb({ phone: invoice.customerPhone, message });
}

function sendSalesInvoiceOnWhatsApp(invoice) {
  const file = salesInvoicePdfFile(invoice);
  const canGivePdfToWhatsApp = Boolean(
    file
    && invoicePdfShareOnThisDevice(navigator.userAgent, navigator.maxTouchPoints)
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [file] }),
  );
  if (canGivePdfToWhatsApp) {
    navigator.share({ files: [file], title: file.name }).catch(error => {
      if (error?.name === "AbortError") return;
      sendInvoiceMessage(invoice);
    });
    return;
  }
  sendInvoiceMessage(invoice);
}

function printDocument() {
  document.body.classList.add("acc-print-doc");
  const cleanup = () => document.body.classList.remove("acc-print-doc");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1500);
}

export function VoucherNumberLink({ number, voucherType, onView }) {
  if (!onView || !number) return number || "—";
  if (voucherType && !["sales", "purchase", "receipt", "payment"].includes(voucherType)) return number;
  return <button type="button" className="acc-invoice-ref-btn" onClick={onView}>{number}</button>;
}

function TaxInvoiceSheet({ invoice }) {
  const sheet = salesInvoicePresentation(invoice);
  return (
    <article className="acc-tax-invoice">
      <header className="acc-tax-head">
        <p className="acc-tax-kicker">{sheet.title}</p>
        <div className="acc-tax-brand">
          {sheet.logoUrl ? <img src={sheet.logoUrl} alt="" className="acc-doc-logo" /> : null}
          <div>
            <h3>{sheet.sellerName}</h3>
            {sheet.sellerLines.map(line => <p key={line}>{line}</p>)}
          </div>
        </div>
      </header>
      <dl className="acc-tax-meta">
        {sheet.meta.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
      </dl>
      <section className="acc-tax-party">
        <p className="acc-tax-kicker">{sheet.partyHeading}</p>
        <strong>{sheet.partyName}</strong>
        {sheet.partyLines.map(line => <p key={line}>{line}</p>)}
      </section>
      {sheet.items.length ? (
        <div className="table acc-tax-table"><table><thead><tr>
          <th className="acc-num">#</th>
          <th>Description of goods</th>
          <th>HSN/SAC</th>
          <th className="acc-num">Quantity</th>
          <th className="acc-num">Rate</th>
          <th>per</th>
          {sheet.showDiscount ? <th className="acc-num">Disc.</th> : null}
          <th className="acc-num">Amount</th>
        </tr></thead><tbody>
          {sheet.items.map((line, index) => <tr key={`${line.name}-${index}`}>
            <td className="acc-num">{index + 1}</td>
            <td><div className="acc-tax-item"><strong>{line.name}</strong>{line.detail ? <span>{line.detail}</span> : null}</div></td>
            <td>{line.hsn}</td>
            <td className="acc-num">{line.quantity}</td>
            <td className="acc-num">{line.rate}</td>
            <td>{line.per}</td>
            {sheet.showDiscount ? <td className="acc-num">{line.discount || "—"}</td> : null}
            <td className="acc-num">{line.amount}</td>
          </tr>)}
        </tbody></table></div>
      ) : null}
      <footer className="acc-tax-foot">
        <p>{sheet.quantityTotal ? <>Total quantity <strong>{sheet.quantityTotal}</strong></> : null}</p>
        <div className="acc-tax-totals-wrap">
          <dl className="acc-tax-totals">
            {sheet.totals.map(row => <div key={row.label} className={row.bold ? "is-total" : ""}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          </dl>
          <p className="acc-tax-eoe">E. &amp; O.E.</p>
        </div>
      </footer>
      <p className="acc-tax-words"><span>Amount chargeable (in words)</span><strong>{sheet.amountWords}</strong></p>
      {sheet.hsn.length ? (
        <div className="table acc-tax-table acc-tax-hsn"><table><thead><tr>
          <th>HSN/SAC</th>
          <th className="acc-num">Taxable value</th>
          {sheet.showCgst ? <><th className="acc-num">CGST</th><th className="acc-num">Amount</th><th className="acc-num">SGST</th><th className="acc-num">Amount</th></> : null}
          {sheet.showIgst ? <><th className="acc-num">IGST</th><th className="acc-num">Amount</th></> : null}
          <th className="acc-num">Total tax</th>
        </tr></thead><tbody>
          {sheet.hsn.map(row => <tr key={`${row.hsn}-${row.rate}`}>
            <td>{row.hsn}</td>
            <td className="acc-num">{row.taxable}</td>
            {sheet.showCgst ? <><td className="acc-num">{row.cgstRate}</td><td className="acc-num">{row.cgst}</td><td className="acc-num">{row.sgstRate}</td><td className="acc-num">{row.sgst}</td></> : null}
            {sheet.showIgst ? <><td className="acc-num">{row.igstRate}</td><td className="acc-num">{row.igst}</td></> : null}
            <td className="acc-num">{row.tax}</td>
          </tr>)}
        </tbody></table></div>
      ) : null}
      {sheet.taxWords ? <p className="acc-tax-words"><span>Tax amount (in words)</span><strong>{sheet.taxWords}</strong></p> : null}
      <div className="acc-tax-bottom">
        <section>
          <p className="acc-tax-kicker">Declaration</p>
          <p>{sheet.declaration}</p>
        </section>
        <section className="acc-tax-sign">
          <p>for <strong>{sheet.signatory}</strong></p>
          <p>Authorised Signatory</p>
        </section>
      </div>
      {invoice.narration ? <p className="acc-tax-note"><span>Notes</span>{invoice.narration}</p> : null}
      {invoice.bankLines?.length ? <p className="acc-tax-note"><span>Bank</span>{invoice.bankLines.join(" ")}</p> : null}
      {sheet.courtesy ? <p className="acc-tax-note">{sheet.courtesy}</p> : null}
      <p className="acc-tax-computer">{sheet.computerNote}</p>
    </article>
  );
}

export function SalesInvoiceViewerModal({ invoice, close }) {
  const layerRef = useDialogDismiss(close);
  const salesDocument = !invoice.kind || invoice.kind === "sales_invoice";
  const whatsAppAvailable = salesDocument && canWhatsAppShare(invoice?.customerPhone);
  const m = invoice.money;
  const moneyOnly = invoice.kind === "receipt" || invoice.kind === "payment";

  return (
    <div className="modal-bg" ref={layerRef}>
      <div className={`modal receipt-view has-corner-close${salesDocument ? " acc-modal acc-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={invoice.title || "Sales invoice"}>
        <span className="modal-corner-close"><CloseButton onClick={close} /></span>
        <ModalScroll>
        <div className="receipt-paper">
          {salesDocument ? <TaxInvoiceSheet invoice={invoice} /> : null}
          {salesDocument ? null : <>
          <div className="receipt-header">
            <strong>{invoice.companyName}</strong>
            <span>{invoice.title || "SALES INVOICE"}</span>
          </div>
          {invoice.companyLegalName && <p className="small">Legal name: {invoice.companyLegalName}</p>}
          {invoice.companyAddress && <p className="small">{invoice.companyAddress}</p>}
          {invoice.companyGstin && <p className="small">GSTIN: {invoice.companyGstin}</p>}
          {(invoice.companyPhone || invoice.companyEmail) && (
            <p className="small">{[invoice.companyPhone, invoice.companyEmail].filter(Boolean).join(" · ")}</p>
          )}
          <div className="receipt-meta">
            <span>{invoice.numberLabel || "Invoice No"}: {invoice.invoiceNumber}</span>
            <span>{formatReceiptDate(invoice.invoiceDate)}</span>
          </div>
          <p className="small">{moneyOnly ? (invoice.settlement || "") : `Due ${formatReceiptDate(invoice.dueDate)} · ${invoice.settlement || "Sale"}`}</p>
          <hr />
          <section>
            <strong>{invoice.partyHeading || "BILL TO"}</strong>
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
                <p key={index}>{line.quantity} {line.unit} × {line.name} @ {m(line.rate)}{line.discount > 0 ? ` − disc ${m(line.discount)}` : ""} = {m(line.amount)}</p>
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
            <p>{invoice.amountLabel || "Invoice total"}: {m(invoice.amount)}</p>
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
          </>}
        </div>
        </ModalScroll>
        <div className="row spacer modal-foot">
          <button type="button" className="btn" onClick={printDocument}>Print</button>
          <button type="button" className="btn" onClick={() => downloadSalesInvoicePdf(invoice)}>Download PDF</button>
          {whatsAppAvailable && (
            <button
              type="button"
              className="btn whatsapp"
              onClick={() => sendSalesInvoiceOnWhatsApp(invoice)}
            >
              WhatsApp
            </button>
          )}
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
              onClick={() => sendSalesInvoiceOnWhatsApp(invoice)}
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
  const layerRef = useDialogDismiss(close);
  const [viewOpen, setViewOpen] = useState(false);
  const whatsAppAvailable = canWhatsAppShare(invoice?.customerPhone);
  const m = invoice.money;

  return (
    <>
      <div className="modal-bg" ref={layerRef}>
        <div className="modal receipt-success has-corner-close" role="dialog" aria-modal="true" aria-label="Invoice saved">
          <span className="modal-corner-close"><CloseButton onClick={close} /></span>
          <h2 className="title green">Sale recorded ✓</h2>
          <ModalScroll>
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
                  onClick={() => sendSalesInvoiceOnWhatsApp(invoice)}
                >
                  Send via WhatsApp
                </button>
              )
              : <p className="small">WhatsApp unavailable — add a valid party phone number.</p>}
          </div>
          </ModalScroll>
          <div className="row spacer modal-foot">
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
      onClick={() => openManualWhatsAppShare({
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
      onClick={() => openManualWhatsAppShare({
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
      onClick={() => openManualWhatsAppShare({
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
          onClick={() => openManualWhatsAppShare({
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
      onClick={() => openManualWhatsAppShare({
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
