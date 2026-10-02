import { useMemo, useState } from "react";
import { Building2, Download, FileText, Image as ImageIcon, ShieldCheck, Upload, Wallet } from "lucide-react";
import { TabScroller } from "../../../components/TabScroller.jsx";
import { useActiveTabInView } from "./useActiveTabInView.js";
import { formatInr } from "../../../lib/formatMoney.js";
import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { canWhatsAppShare, openManualWhatsAppShare } from "../../receipts/io/receiptWhatsApp.js";
import { todayIso } from "../../cashbook/cashbookModel.js";
import { gstStateFromGstin, isIntraGst } from "../model/accountingGst.js";
import { emptyItemLine, normalizeItemLine } from "../model/inventoryModel.js";
import {
  DOCUMENT_NEXT,
  DOCUMENT_TYPES,
  buildTradeDocumentMessage,
  buildTradeDocumentView,
  conversionLines,
  documentDisplayStatus,
  documentDraft,
  documentLabel,
  documentTotals,
  emptyDocumentForm,
  pendingOrderRows,
} from "../model/tradeDocumentModel.js";
import { downloadTradeDocumentPdf } from "../io/tradeDocumentPdf.js";
import { PDF_TEMPLATES } from "../io/documentPdf.js";
import { buildSalesInvoice } from "../model/salesInvoiceModel.js";
import { downloadSalesInvoicePdf } from "../io/salesInvoicePdf.js";
import { isValidUpiId, upiPayLink } from "../model/upiPay.js";
import { QrSvg } from "../PayPage.jsx";
import { AccMoreMenu } from "./AccUi.jsx";
import { CloseButton, SearchInput, SegmentedControl } from "../../../components/ui.jsx";

const money = formatInr;
const qty = (value, unit) => `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
const LOGO_MAX_CHARS = 400000;

const TABS = [
  { id: "quotation", label: "Quotations" },
  { id: "sales_order", label: "Sales orders" },
  { id: "delivery_challan", label: "Delivery challans" },
  { id: "purchase_order", label: "Purchase orders" },
  { id: "goods_receipt", label: "Goods receipts" },
  { id: "pending", label: "Pending orders" },
  { id: "settings", label: "Document settings" },
];

const TYPE_HINTS = {
  quotation: "Send a price quote. Converting it to an order, challan or invoice carries the items across. Quotations never touch your books.",
  sales_order: "Confirmed customer orders. Pending quantity drops as you deliver (challan) or invoice.",
  delivery_challan: "Goods sent before or without an invoice. Stock goes out now; the invoice made from this challan will not move stock again.",
  purchase_order: "Orders you place with suppliers. Pending quantity drops as goods are received or billed.",
  goods_receipt: "Goods received before the supplier bill. Stock comes in now; the bill made from this receipt will not move stock again.",
};

function Field({ label, children, className = "" }) {
  return <label className={`accounts-filter-field ${className}`.trim()}><span className="small">{label}</span>{children}</label>;
}

function Modal({ title, close, children, actions, wide = false }) {
  return (
    <div className="modal-bg" role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={`modal acc-modal${wide ? " acc-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row">
          <h2 className="title">{title}</h2>
          <CloseButton onClick={close} />
        </div>
        {children}
        {actions ? <div className="acc-modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

const StatusPill = ({ status }) => (status?.label ? <span className={`acc-doc-status tone-${status.tone || "plain"}`}>{status.label}</span> : null);

const formFromDocument = doc => ({
  id: doc.id,
  docType: doc.docType,
  docDate: doc.docDate,
  validUntil: doc.validUntil || "",
  partyId: doc.partyId,
  reference: doc.reference || "",
  notes: doc.notes || "",
  terms: doc.terms || "",
  sourceDocumentId: doc.sourceDocumentId || null,
  lines: (doc.lines || []).map(line => ({
    ...emptyItemLine(),
    itemId: line.itemId || "",
    itemName: line.itemName,
    itemSku: line.itemSku || "",
    itemType: line.itemType || "product",
    unit: line.unit || "Nos",
    quantity: String(line.quantity),
    rate: String(line.rate),
    rateTouched: true,
    discount: line.discountAmount ? String(line.discountAmount) : "",
    gstRate: String(line.gstRate ?? 0),
    hsnSac: line.hsnSac || "",
    sourceLineId: line.sourceLineId || null,
  })),
});

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      reject(new Error("Choose a PNG, JPG or WebP image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read this image."));
      image.onload = () => {
        const scale = Math.min(1, 320 / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        if (dataUrl.length > LOGO_MAX_CHARS) reject(new Error("This logo is too large. Use a smaller image."));
        else resolve(dataUrl);
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function DocumentForm({ form, setForm, parties, items, stockByItem, gstCompany, fulfilment, documents, saving, onSave, onClose, error }) {
  const config = DOCUMENT_TYPES[form.docType];
  const partyList = parties.filter(party => party.partyType === config.partyType && (party.isActive !== false || party.id === form.partyId));
  const party = parties.find(row => row.id === form.partyId);
  const gstEnabled = gstCompany?.gstRegistration === "regular";
  const intra = isIntraGst(gstCompany?.stateCode, party?.stateCode || gstStateFromGstin(party?.gstin));
  const totals = useMemo(() => documentTotals(form.lines || [], { intra, gstEnabled }), [form.lines, intra, gstEnabled]);
  const source = form.sourceDocumentId ? documents.find(doc => doc.id === form.sourceDocumentId) : null;
  const sourcePending = useMemo(() => {
    const summary = source ? fulfilment.get(source.id) : null;
    return new Map((summary?.lines || []).map(line => [line.lineId, line.pending]));
  }, [source, fulfilment]);
  const activeItems = items.filter(item => item.isActive !== false || (form.lines || []).some(line => line.itemId === item.id));
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const patchLine = (index, patch) => setForm(current => {
    const lines = [...current.lines];
    lines[index] = { ...lines[index], ...patch };
    return { ...current, lines };
  });
  const selectItem = (index, itemId) => {
    const item = items.find(row => row.id === itemId);
    if (!item) {
      patchLine(index, { itemId: "", itemName: "", itemSku: "", itemType: "product", unit: "Nos" });
      return;
    }
    const rate = config.side === "sales" ? item.sellingPrice : item.purchasePrice;
    patchLine(index, {
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      itemType: item.itemType,
      unit: item.unit,
      gstRate: String(item.gstRate ?? 0),
      hsnSac: item.hsnSac || "",
      rate: form.lines[index]?.rateTouched ? form.lines[index].rate : String(rate || ""),
    });
  };

  return (
    <Modal
      wide
      title={`${form.id ? "Edit" : "New"} ${config.label.toLowerCase()}`}
      close={() => !saving && onClose()}
      actions={<div className="tabs spacer">
        
        <button type="button" className="btn primary" disabled={saving} onClick={() => onSave(gstEnabled, intra)}>{saving ? "Saving…" : `Save ${config.label.toLowerCase()}`}</button>
      </div>}
    >
      <p className="copy">{TYPE_HINTS[form.docType]}</p>
      {source && <p className="small">Made from {documentLabel(source.docType)} {source.docNumber}. Quantities are limited to what is still pending.</p>}
      <div className="form">
        <Field label={config.partyType === "supplier" ? "Supplier" : "Customer"}>
          <select value={form.partyId} disabled={Boolean(source)} onChange={event => set({ partyId: event.target.value })}>
            <option value="">Select</option>
            {partyList.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={form.docDate} onChange={event => set({ docDate: event.target.value })} /></Field>
        {config.untilLabel && <Field label={config.untilLabel}><input type="date" value={form.validUntil || ""} onChange={event => set({ validUntil: event.target.value })} /></Field>}
        <Field label="Reference (optional)"><input value={form.reference} placeholder={config.side === "sales" ? "Customer PO / enquiry no." : "Supplier quote / invoice no."} onChange={event => set({ reference: event.target.value })} /></Field>
      </div>

      <section className="acc-form-section acc-item-lines">
        <h3 className="acc-form-section-title">Items</h3>
        <div className="table acc-table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Discount</th>{gstEnabled && <th>GST%</th>}<th className="acc-num">Amount</th><th></th></tr></thead><tbody>
          {form.lines.map((line, index) => {
            const lineTotals = normalizeItemLine(line);
            const stock = line.itemId ? stockByItem[line.itemId] : null;
            const pending = line.sourceLineId ? sourcePending.get(line.sourceLineId) : null;
            return (
              <tr key={index}>
                <td>
                  {line.sourceLineId
                    ? <strong>{line.itemName}</strong>
                    : <select value={line.itemId || ""} onChange={event => selectItem(index, event.target.value)}>
                      <option value="">Select item</option>
                      {activeItems.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}
                    </select>}
                  {!line.itemId && !line.sourceLineId && config.stock === 0 && (
                    <input className="spacer-xs" value={line.itemName || ""} placeholder="or type a description" onChange={event => patchLine(index, { itemName: event.target.value, itemType: "service" })} />
                  )}
                  <div className="small">
                    {pending != null ? `Pending ${qty(pending, line.unit)}` : ""}
                    {stock != null ? `${pending != null ? " · " : ""}Stock ${qty(stock, line.unit)}` : ""}
                  </div>
                </td>
                <td><input type="number" min="0" step="0.001" value={line.quantity} onChange={event => patchLine(index, { quantity: event.target.value })} /></td>
                <td><input type="number" min="0" step="0.01" value={line.rate} onChange={event => patchLine(index, { rate: event.target.value, rateTouched: true })} /></td>
                <td><input inputMode="decimal" value={line.discount || ""} placeholder="₹ or %" aria-label="Discount (amount or percent)" onChange={event => patchLine(index, { discount: event.target.value })} /></td>
                {gstEnabled && <td><input type="number" min="0" max="100" step="0.01" value={line.gstRate} onChange={event => patchLine(index, { gstRate: event.target.value })} /></td>}
                <td className="acc-num">{money(lineTotals.netAmount)}</td>
                <td>{form.lines.length > 1 && <button type="button" className="btn danger" onClick={() => set({ lines: form.lines.filter((_, i) => i !== index) })}>Remove</button>}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        {!source && <button type="button" className="btn" onClick={() => set({ lines: [...form.lines, emptyItemLine()] })}>+ Add item</button>}
        <p className="small acc-gst-preview">
          Subtotal {money(totals.taxable)}
          {gstEnabled && totals.tax > 0 ? (totals.igst > 0 ? ` · IGST ${money(totals.igst)}` : ` · CGST ${money(totals.cgst)} · SGST ${money(totals.sgst)}`) : ""}
          {` · Total ${money(totals.total)}`}
        </p>
      </section>

      <div className="form">
        <Field className="span" label="Notes (optional)"><input value={form.notes} onChange={event => set({ notes: event.target.value })} placeholder={config.stock ? "Vehicle no., transporter, received by…" : "Delivery, payment or other notes"} /></Field>
        {config.side === "sales" && form.docType !== "delivery_challan" && (
          <Field className="span" label="Terms (optional)"><textarea rows="2" value={form.terms} onChange={event => set({ terms: event.target.value })} placeholder="Validity, payment, delivery terms" /></Field>
        )}
        {form.docType === "purchase_order" && (
          <Field className="span" label="Terms (optional)"><textarea rows="2" value={form.terms} onChange={event => set({ terms: event.target.value })} placeholder="Delivery schedule, payment terms" /></Field>
        )}
      </div>
      {error && <p className="red small" role="alert">{error}</p>}
    </Modal>
  );
}

function DocumentViewer({ doc, view, settings, onClose, onEdit, actions }) {
  const [template, setTemplate] = useState(settings.invoiceTemplate || "a4");
  const m = view.money;
  const canShare = canWhatsAppShare(view.partyPhone);
  return (
    <Modal wide title={`${view.label} ${view.docNumber}`} close={onClose}>
      <div className="receipt-paper acc-doc-paper">
        <div className="receipt-header">
          {view.companyLogoUrl && <img src={view.companyLogoUrl} alt="" className="acc-doc-logo" />}
          <strong>{view.companyName}</strong>
          <span>{view.title}</span>
        </div>
        {view.companyAddress && <p className="small">{view.companyAddress}</p>}
        {view.companyGstin && <p className="small">GSTIN: {view.companyGstin}</p>}
        <div className="receipt-meta">
          <span>{view.label} No: {view.docNumber}</span>
          <span>{formatReceiptDate(view.docDate)}</span>
        </div>
        {view.validUntil && view.untilLabel && <p className="small">{view.untilLabel}: {formatReceiptDate(view.validUntil)}</p>}
        {view.sourceNumber && <p className="small">Against {view.sourceNumber}</p>}
        {view.reference && <p className="small">Reference: {view.reference}</p>}
        {doc.status === "cancelled" && <p className="small red">Cancelled{view.cancelReason ? `: ${view.cancelReason}` : ""}</p>}
        <hr />
        <section>
          <strong>{view.partyHeading}</strong>
          <p>{view.partyName}</p>
          {view.partyAddress && <p className="small">{view.partyAddress}</p>}
          {view.partyGstin && <p className="small">GSTIN: {view.partyGstin}</p>}
        </section>
        <hr />
        <div className="table acc-table-wrap"><table><thead><tr><th>Item</th><th className="acc-num">Qty</th><th className="acc-num">Rate</th><th className="acc-num">Amount</th></tr></thead><tbody>
          {view.lines.map((line, index) => <tr key={index}>
            <td>{line.name}{line.hsnSac ? <span className="small"> · HSN {line.hsnSac}</span> : null}{line.discount > 0 ? <span className="small"> · disc {m(line.discount)}</span> : null}</td>
            <td className="acc-num">{qty(line.quantity, line.unit)}</td>
            <td className="acc-num">{m(line.rate)}</td>
            <td className="acc-num">{m(line.amount)}</td>
          </tr>)}
        </tbody></table></div>
        <section className="acc-doc-totals">
          {view.tax > 0 && <>
            <p>Taxable: {m(view.taxable)}</p>
            {view.cgst ? <p>CGST: {m(view.cgst)}</p> : null}
            {view.sgst ? <p>SGST: {m(view.sgst)}</p> : null}
            {view.igst ? <p>IGST: {m(view.igst)}</p> : null}
          </>}
          <p><strong>Total: {m(view.total)}</strong></p>
        </section>
        {view.notes && <p className="small">Notes: {view.notes}</p>}
        {view.terms && <p className="small muted">Terms: {view.terms}</p>}
      </div>
      <div className="row spacer acc-doc-viewer-actions">
        <Field label="PDF size">
          <select value={template} onChange={event => setTemplate(event.target.value)}>
            {Object.values(PDF_TEMPLATES).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </Field>
        <button type="button" className="btn" onClick={() => downloadTradeDocumentPdf(view, { template })}>Download PDF</button>
        {canShare
          ? <button type="button" className="btn whatsapp" onClick={() => openManualWhatsAppShare({ phone: view.partyPhone, message: buildTradeDocumentMessage(view) })}>WhatsApp</button>
          : <span className="small muted">Add party phone for WhatsApp</span>}
        {onEdit && <button type="button" className="btn" onClick={onEdit}>Edit</button>}
        <AccMoreMenu label="Actions" items={actions} />
        <button type="button" className="btn primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

// One settings group: icon, title and a line on what it changes, then its fields.
function SettingsBlock({ icon: Icon, title, copy, children }) {
  return <section className="card acc-settings-block">
    <header className="acc-settings-head">
      <span className="acc-settings-icon" aria-hidden="true"><Icon size={18} /></span>
      <div><h3>{title}</h3>{copy ? <p className="small">{copy}</p> : null}</div>
    </header>
    <div className="acc-settings-body">{children}</div>
  </section>;
}

function DocumentSettingsPanel({ settings, company, workspace, canAdmin, saving, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...settings }));
  const [logoError, setLogoError] = useState("");
  const set = patch => setDraft(current => ({ ...current, ...patch }));
  const upiValid = !draft.upiId || isValidUpiId(draft.upiId);
  const disabled = !canAdmin || saving || !settings.available;
  const previewInvoice = () => {
    const invoice = buildSalesInvoice({
      voucher: {
        id: "sample",
        voucherNumber: "SAMPLE-0001",
        date: todayIso(),
        dueDate: todayIso(),
        status: "posted",
        narration: "Sample invoice",
        lines: [{ debit: 1180, credit: 0, name: "Receivable" }],
        gstLines: company?.gstin ? [{ taxable: 1000, cgst: 90, sgst: 90, igst: 0, rate: 18 }] : [],
      },
      party: { name: "Sample Customer", phone: "9876543210", address: "Customer address" },
      company: { ...company, documentSettings: draft },
      workspace,
      itemLines: [{ itemName: "Sample item", quantity: 2, unit: "Nos", rate: 500, taxableAmount: 1000, gstRate: company?.gstin ? 18 : 0, hsnSac: "9983" }],
    });
    downloadSalesInvoicePdf(invoice, { template: draft.invoiceTemplate });
  };
  const chooseLogo = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setLogoError("");
    if (!file) return;
    try {
      set({ logoDataUrl: await readLogoFile(file) });
    } catch (err) {
      setLogoError(err.message);
    }
  };

  const comparable = value => JSON.stringify({ ...value, overdueBlockDays: Number(value.overdueBlockDays || 0) });
  const dirty = comparable(draft) !== comparable(settings);
  const save = () => onSave({ ...draft, overdueBlockDays: Number(draft.overdueBlockDays || 0) });

  return (
    <div className="acc-doc-settings spacer">
      {!settings.available && <p className="notice small">Run migration 081_accounts_trade_documents.sql in the Supabase SQL editor to save document settings.</p>}
      {!canAdmin && <p className="notice small">Only the owner can change document settings.</p>}
      <SettingsBlock icon={Building2} title="Business details" copy="Printed in the header of every invoice, quotation, order and challan.">
        <div className="acc-doc-logo-row">
          <span className={`acc-doc-logo-tile${draft.logoDataUrl ? " has-logo" : ""}`}>
            {draft.logoDataUrl ? <img src={draft.logoDataUrl} alt="Logo" className="acc-doc-logo" /> : <ImageIcon size={22} aria-hidden="true" />}
          </span>
          <div className="acc-doc-logo-text">
            <strong>Logo</strong>
            <span className="small">{logoError ? <span className="red">{logoError}</span> : "PNG, JPG or WebP. Shown at the top left of documents."}</span>
            <div className="acc-doc-logo-actions">
              <label className={`btn ${disabled ? "disabled" : ""}`.trim()}>
                <Upload size={15} aria-hidden="true" />{draft.logoDataUrl ? "Change logo" : "Upload logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled} onChange={chooseLogo} />
              </label>
              {draft.logoDataUrl && <button type="button" className="btn ghost" disabled={disabled} onClick={() => set({ logoDataUrl: "" })}>Remove</button>}
            </div>
          </div>
        </div>
        <div className="form acc-settings-grid">
          <Field className="span" label="Address"><input value={draft.businessAddress} disabled={disabled} onChange={event => set({ businessAddress: event.target.value })} placeholder="Shop / office address" /></Field>
          <Field label="Phone"><input type="tel" value={draft.businessPhone} disabled={disabled} onChange={event => set({ businessPhone: event.target.value })} placeholder="98765 43210" /></Field>
          <Field label="Email"><input type="email" value={draft.businessEmail} disabled={disabled} onChange={event => set({ businessEmail: event.target.value })} placeholder="accounts@business.in" /></Field>
        </div>
      </SettingsBlock>

      <SettingsBlock icon={FileText} title="Invoice layout" copy="Paper size for PDFs, and the terms printed at the foot of invoices and quotations.">
        <div className="acc-settings-inline">
          <div className="acc-settings-inline-field">
            <span className="acc-settings-label">Default PDF size</span>
            <SegmentedControl label="Default PDF size" value={draft.invoiceTemplate} onChange={value => !disabled && set({ invoiceTemplate: value })} options={Object.values(PDF_TEMPLATES).map(option => ({ id: option.id, label: option.label }))} />
          </div>
          <button type="button" className="btn" onClick={previewInvoice}><Download size={15} aria-hidden="true" />Sample PDF</button>
        </div>
        <div className="form acc-settings-grid">
          <Field label="Invoice terms"><textarea rows="3" value={draft.invoiceTerms} disabled={disabled} onChange={event => set({ invoiceTerms: event.target.value })} placeholder="Goods once sold will not be taken back…" /></Field>
          <Field label="Quotation terms"><textarea rows="3" value={draft.quotationTerms} disabled={disabled} onChange={event => set({ quotationTerms: event.target.value })} placeholder="Prices valid for 15 days. 50% advance…" /></Field>
        </div>
      </SettingsBlock>

      <SettingsBlock icon={Wallet} title="Payment details" copy="How customers pay you. Shown under the totals on invoices.">
        <h4 className="acc-settings-subhead">UPI</h4>
        <div className="form acc-settings-grid">
          <Field label="UPI ID"><input value={draft.upiId} disabled={disabled} aria-invalid={!upiValid} onChange={event => set({ upiId: event.target.value.trim() })} placeholder="business@okaxis" /></Field>
          <Field label="Name shown in UPI app"><input value={draft.upiPayeeName} disabled={disabled} onChange={event => set({ upiPayeeName: event.target.value })} placeholder={company?.name || "Business name"} /></Field>
          {!upiValid && <p className="small red span">Enter a UPI ID like name@bank.</p>}
        </div>
        <label className="settings-switch-row acc-settings-switch">
          <span><strong>Print a UPI QR on invoices</strong><span className="small">The QR asks for the balance due, so customers can pay by scanning.</span></span>
          <input type="checkbox" role="switch" className="ft-switch" checked={draft.showUpiQr !== false} disabled={disabled} onChange={event => set({ showUpiQr: event.target.checked })} />
        </label>
        {draft.upiId && upiValid && <div className="acc-doc-qr-preview">
          <QrSvg text={upiPayLink({ upiId: draft.upiId, payeeName: draft.upiPayeeName || company?.name })} size={104} label="UPI QR preview" />
          <p className="small"><strong>Check before sharing.</strong> Scan with your own UPI app to confirm the payee name. WhatsApp reminders include a pay link when a UPI ID is set.</p>
        </div>}
        <h4 className="acc-settings-subhead">Bank transfer</h4>
        <div className="form acc-settings-grid is-3">
          <Field label="Bank name"><input value={draft.bankName} disabled={disabled} onChange={event => set({ bankName: event.target.value })} placeholder="State Bank of India" /></Field>
          <Field label="Account number"><input inputMode="numeric" value={draft.bankAccountNumber} disabled={disabled} onChange={event => set({ bankAccountNumber: event.target.value })} /></Field>
          <Field label="IFSC"><input value={draft.bankIfsc} disabled={disabled} onChange={event => set({ bankIfsc: event.target.value.toUpperCase() })} placeholder="SBIN0001234" /></Field>
        </div>
      </SettingsBlock>

      <SettingsBlock icon={ShieldCheck} title="Credit control on sales" copy="What happens when a customer goes over their credit limit. Set each customer's limit and credit days in Parties.">
        <div className="acc-settings-inline-field">
          <span className="acc-settings-label">When a customer is over limit</span>
          <SegmentedControl label="When a customer is over limit" className="acc-credit-control" value={draft.creditControl} onChange={value => !disabled && set({ creditControl: value })} options={[{ id: "off", label: "Do nothing" }, { id: "warn", label: "Warn, allow sale" }, { id: "block", label: "Block credit sales" }]} />
        </div>
        <div className="form acc-settings-grid">
          <Field label="Also flag invoices overdue by more than">
            <span className="acc-input-suffix">
              <input type="number" min="0" max="365" value={draft.overdueBlockDays} disabled={disabled} onChange={event => set({ overdueBlockDays: event.target.value })} placeholder="0" />
              <span aria-hidden="true">days</span>
            </span>
          </Field>
          <p className="small acc-settings-hint">0 turns this off. Credit days also set the default due date on a customer's invoices.</p>
        </div>
      </SettingsBlock>

      <div className={`acc-settings-savebar${dirty ? " is-dirty" : ""}`}>
        <span className="small">{dirty ? "You have unsaved changes" : "All changes saved"}</span>
        <button type="button" className="btn primary" disabled={disabled || !upiValid || !dirty} onClick={save}>{saving ? "Saving…" : "Save document settings"}</button>
      </div>
    </div>
  );
}

export function AccDocumentsWorkspace({
  documents = null,
  fulfilment = new Map(),
  parties = [],
  items = [],
  stockByItem = {},
  company = null,
  workspace = {},
  documentSettings = {},
  canEdit = false,
  canAdmin = false,
  saving = false,
  onSaveDocument,
  onSetStatus,
  onConvertToEntry,
  onSaveSettings,
  prefill = null,
  tab: routeTab = null,
  onTabChange,
}) {
  // The document type tab is the URL (/accounting/documents/:docType).
  const tab = TABS.some(item => item.id === routeTab) ? routeTab : "quotation";
  const setTab = next => { if (next !== tab) onTabChange?.(next); };
  const tabsRef = useActiveTabInView([tab]);
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [prefillKey, setPrefillKey] = useState(null);
  if (prefill?.key && prefill.key !== prefillKey && canEdit) {
    setPrefillKey(prefill.key);
    setFormError("");
    setForm({
      ...emptyDocumentForm(prefill.docType, todayIso()),
      partyId: prefill.partyId || "",
      notes: prefill.notes || "",
      lines: prefill.lines?.length ? prefill.lines : [emptyItemLine()],
    });
  }
  const [viewId, setViewId] = useState(null);
  const [cancelDoc, setCancelDoc] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [pendingSide, setPendingSide] = useState("sales");
  const today = todayIso();
  const available = Array.isArray(documents);
  const docs = useMemo(() => documents || [], [documents]);
  const partyById = useMemo(() => new Map(parties.map(party => [party.id, party])), [parties]);

  const rows = useMemo(() => {
    if (!DOCUMENT_TYPES[tab]) return [];
    const q = search.trim().toLowerCase();
    return docs
      .filter(doc => doc.docType === tab)
      .map(doc => ({ doc, summary: fulfilment.get(doc.id), status: documentDisplayStatus(doc, fulfilment.get(doc.id), today) }))
      .filter(({ doc, summary }) => {
        if (!showClosed) {
          if (["cancelled", "closed", "declined"].includes(doc.status)) return false;
          if (doc.docType !== "quotation" && summary?.progress === "complete") return false;
          if (doc.docType === "quotation" && summary?.hasFollowups) return false;
        }
        if (!q) return true;
        return `${doc.docNumber} ${partyById.get(doc.partyId)?.name || ""} ${doc.reference}`.toLowerCase().includes(q);
      });
  }, [docs, tab, search, showClosed, fulfilment, partyById, today]);

  const pendingRows = useMemo(
    () => (tab === "pending" ? pendingOrderRows({ documents: docs, fulfilment, side: pendingSide, parties, today }) : []),
    [tab, docs, fulfilment, pendingSide, parties, today],
  );

  const viewDoc = viewId ? docs.find(doc => doc.id === viewId) : null;
  const view = useMemo(
    () => (viewDoc ? buildTradeDocumentView({ doc: viewDoc, party: partyById.get(viewDoc.partyId), company, workspace, documents: docs }) : null),
    [viewDoc, partyById, company, workspace, docs],
  );

  const isEditable = (doc, summary) => ["open", "accepted"].includes(doc.status) && !doc.stockPosted && !summary?.hasFollowups;

  const openNew = docType => {
    setFormError("");
    const next = emptyDocumentForm(docType, today);
    if (docType === "quotation" && documentSettings.quotationTerms) next.terms = documentSettings.quotationTerms;
    setForm(next);
  };

  const convert = (doc, target) => {
    const lines = conversionLines(doc, fulfilment.get(doc.id));
    if (!lines.length) return;
    setViewId(null);
    if (target === "invoice" || target === "bill") {
      onConvertToEntry?.(doc, target === "invoice" ? "sale" : "purchase", lines);
      return;
    }
    setFormError("");
    setTab(target);
    setForm({
      ...emptyDocumentForm(target, today),
      partyId: doc.partyId,
      reference: doc.reference || "",
      sourceDocumentId: doc.id,
      lines,
    });
  };

  const saveForm = async (gstEnabled, intra) => {
    setFormError("");
    let draft;
    try {
      draft = documentDraft(form, { intra, gstEnabled });
      if (form.sourceDocumentId) {
        const summary = fulfilment.get(form.sourceDocumentId);
        const pendingByLine = new Map((summary?.lines || []).map(line => [line.lineId, line.pending]));
        draft.lines.forEach((line, index) => {
          const pending = line.source_line_id ? pendingByLine.get(line.source_line_id) : null;
          if (pending != null && line.quantity - pending > 0.0005) {
            throw new Error(`Line ${index + 1}: only ${pending} is pending on the source document.`);
          }
        });
      }
    } catch (err) {
      setFormError(err.message);
      return;
    }
    const ok = await onSaveDocument?.(draft);
    if (ok) setForm(null);
  };

  const actionsFor = (doc, summary) => {
    if (!canEdit || doc.status === "cancelled") return [];
    const pending = Number(summary?.pending ?? 1) > 0;
    const live = doc.status !== "declined" && doc.status !== "closed";
    const list = [];
    if (live && pending) {
      for (const target of DOCUMENT_NEXT[doc.docType] || []) {
        list.push({ id: `to-${target}`, label: `Convert to ${documentLabel(target).toLowerCase()}`, onClick: () => convert(doc, target) });
      }
    }
    if (doc.docType === "quotation" && doc.status === "open" && !summary?.hasFollowups) {
      list.push({ id: "accept", label: "Mark accepted", onClick: () => onSetStatus?.(doc, "accepted") });
      list.push({ id: "decline", label: "Mark declined", onClick: () => onSetStatus?.(doc, "declined") });
    }
    if (doc.docType !== "quotation" && doc.status === "open" && summary?.progress !== "complete") {
      list.push({ id: "close", label: "Close (nothing more to come)", onClick: () => onSetStatus?.(doc, "closed") });
    }
    if (["declined", "closed", "accepted"].includes(doc.status)) {
      list.push({ id: "reopen", label: "Reopen", onClick: () => onSetStatus?.(doc, "open") });
    }
    if (!summary?.hasFollowups) {
      list.push({ id: "cancel", label: `Cancel ${documentLabel(doc.docType).toLowerCase()}`, danger: true, onClick: () => { setCancelReason(""); setCancelDoc(doc); } });
    }
    return list;
  };

  const downloadPdf = doc => {
    const docView = buildTradeDocumentView({ doc, party: partyById.get(doc.partyId), company, workspace, documents: docs });
    downloadTradeDocumentPdf(docView, { template: documentSettings.invoiceTemplate || "a4" });
  };

  const config = DOCUMENT_TYPES[tab];

  return (
    <section className="acc-documents" ref={tabsRef}>
      <TabScroller className="is-sub"><nav className="accounts-section-nav" aria-label="Document pages">
        {TABS.map(item => (
          <button key={item.id} type="button" className={`accounts-section-tab ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </nav></TabScroller>

      {!available && tab !== "settings" && (
        <div className="card spacer">
          <strong>Documents need a database update</strong>
          <p className="copy">Run migration 081_accounts_trade_documents.sql in the Supabase SQL editor to enable quotations, orders, delivery challans and goods receipts.</p>
        </div>
      )}

      {available && config && <>
        <p className="copy spacer">{TYPE_HINTS[tab]}</p>
        <div className="acc-list-toolbar spacer">
          <SearchInput label={`Search ${config.plural.toLowerCase()}`} className="acc-list-search" placeholder="Search number, party or reference" value={search} onChange={event => setSearch(event.target.value)} />
          <SegmentedControl label="Show" className="acc-list-scope" value={showClosed ? "all" : "open"} onChange={value => setShowClosed(value === "all")} options={[{ id: "open", label: "Open" }, { id: "all", label: "All, incl. closed" }]} />
          {canEdit && <button type="button" className="btn primary acc-list-new" disabled={saving} onClick={() => openNew(tab)}>+ New {config.label.toLowerCase()}</button>}
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr>
          <th>Number</th><th>Date</th><th>{config.partyType === "supplier" ? "Supplier" : "Customer"}</th><th className="acc-num">Total</th><th>Status</th>{tab !== "quotation" && <th className="acc-num">Pending qty</th>}<th></th>
        </tr></thead><tbody>
          {rows.map(({ doc, summary, status }) => (
            <tr key={doc.id}>
              <td className="acc-cell-stack"><button type="button" className="btn linkish" onClick={() => setViewId(doc.id)}>{doc.docNumber}</button>{doc.reference ? <span className="small">{doc.reference}</span> : null}</td>
              <td className="acc-cell-stack"><span>{formatReceiptDate(doc.docDate)}</span>{doc.validUntil && config.untilLabel ? <span className="small">{config.untilLabel.toLowerCase()} {formatReceiptDate(doc.validUntil)}</span> : null}</td>
              <td>{partyById.get(doc.partyId)?.name || "—"}</td>
              <td className="acc-num">{money(doc.grandTotal)}</td>
              <td><StatusPill status={status} /></td>
              {tab !== "quotation" && <td className="acc-num">{summary ? `${summary.pending} of ${summary.ordered}` : ""}</td>}
              <td>
                <div className="acc-btn-group">
                  <button type="button" className="btn" onClick={() => setViewId(doc.id)}>View</button>
                  <button type="button" className="btn" onClick={() => downloadPdf(doc)}>PDF</button>
                  {canEdit && isEditable(doc, summary) && <button type="button" className="btn" disabled={saving} onClick={() => { setFormError(""); setForm(formFromDocument(doc)); }}>Edit</button>}
                  <AccMoreMenu label="More" items={actionsFor(doc, summary)} />
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={tab === "quotation" ? 6 : 7}>{showClosed ? `No ${config.plural.toLowerCase()} yet.` : `No open ${config.plural.toLowerCase()}. Choose "All, incl. closed" to see completed and cancelled ones.`}</td></tr>}
        </tbody></table></div>
      </>}

      {available && tab === "pending" && <>
        <p className="copy spacer">Order lines still waiting to be delivered or received. Quantity drops when you make a challan, goods receipt, invoice or bill from the order.</p>
        <div className="acc-list-toolbar spacer">
          <SegmentedControl label="Orders" className="acc-list-scope" value={pendingSide} onChange={setPendingSide} options={[{ id: "sales", label: "Sales · to deliver" }, { id: "purchase", label: "Purchases · to receive" }]} />
          <dl className="acc-list-stats" aria-label="Pending totals">
            <div><dt>Lines</dt><dd>{pendingRows.length}</dd></div>
            <div><dt>Pending value</dt><dd>{money(pendingRows.reduce((sum, row) => sum + row.pendingValue, 0))}</dd></div>
          </dl>
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Order</th><th>Due</th><th>{pendingSide === "purchase" ? "Supplier" : "Customer"}</th><th>Item</th><th className="acc-num">Ordered</th><th className="acc-num">Pending</th><th className="acc-num">Value</th><th></th></tr></thead><tbody>
          {pendingRows.map(row => {
            const doc = docs.find(item => item.id === row.documentId);
            return (
              <tr key={row.lineId}>
                <td className="acc-cell-stack"><button type="button" className="btn linkish" onClick={() => setViewId(row.documentId)}>{row.docNumber}</button><span className="small">{formatReceiptDate(row.docDate)}</span></td>
                <td className="acc-cell-stack"><span>{row.dueDate ? formatReceiptDate(row.dueDate) : "—"}</span>{row.overdue ? <span className="acc-doc-status tone-red">Overdue</span> : null}</td>
                <td>{row.partyName}</td>
                <td>{row.itemName}</td>
                <td className="acc-num">{qty(row.ordered, row.unit)}</td>
                <td className="acc-num">{qty(row.pending, row.unit)}</td>
                <td className="acc-num">{money(row.pendingValue)}</td>
                <td>{doc && <AccMoreMenu label="Convert" items={canEdit ? (DOCUMENT_NEXT[doc.docType] || []).map(target => ({ id: target, label: `To ${documentLabel(target).toLowerCase()}`, onClick: () => convert(doc, target) })) : []} />}</td>
              </tr>
            );
          })}
          {!pendingRows.length && <tr><td colSpan="8">Nothing pending.</td></tr>}
        </tbody></table></div>
      </>}

      {tab === "settings" && (
        <DocumentSettingsPanel
          key={`${company?.id || ""}:${documentSettings.available ? "on" : "off"}`}
          settings={documentSettings}
          company={company}
          workspace={workspace}
          canAdmin={canAdmin}
          saving={saving}
          onSave={onSaveSettings}
        />
      )}

      {form && (
        <DocumentForm
          form={form}
          setForm={setForm}
          parties={parties}
          items={items}
          stockByItem={stockByItem}
          gstCompany={company}
          fulfilment={fulfilment}
          documents={docs}
          saving={saving}
          error={formError}
          onSave={saveForm}
          onClose={() => setForm(null)}
        />
      )}

      {viewDoc && view && (
        <DocumentViewer
          doc={viewDoc}
          view={view}
          settings={documentSettings}
          onClose={() => setViewId(null)}
          onEdit={canEdit && isEditable(viewDoc, fulfilment.get(viewDoc.id)) ? () => { setViewId(null); setFormError(""); setForm(formFromDocument(viewDoc)); } : null}
          actions={actionsFor(viewDoc, fulfilment.get(viewDoc.id))}
        />
      )}

      {cancelDoc && (
        <Modal
          title={`Cancel ${documentLabel(cancelDoc.docType).toLowerCase()} ${cancelDoc.docNumber}?`}
          close={() => !saving && setCancelDoc(null)}
          actions={<div className="tabs spacer">
            <button type="button" className="btn" disabled={saving} onClick={() => setCancelDoc(null)}>Keep it</button>
            <button
              type="button"
              className="btn danger"
              disabled={saving || !cancelReason.trim()}
              onClick={async () => {
                const ok = await onSetStatus?.(cancelDoc, "cancelled", cancelReason.trim());
                if (ok) setCancelDoc(null);
              }}
            >{saving ? "Cancelling…" : "Cancel document"}</button>
          </div>}
        >
          <p className="copy">{cancelDoc.stockPosted ? "Stock moved by this document is reversed. " : ""}The document stays in the list as cancelled, with your reason on the audit trail.</p>
          <div className="form">
            <Field className="span" label="Reason"><input value={cancelReason} autoFocus onChange={event => setCancelReason(event.target.value)} /></Field>
          </div>
        </Modal>
      )}
    </section>
  );
}
