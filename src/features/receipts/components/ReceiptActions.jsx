import { useState } from "react";
import { downloadReceiptPdf } from "../io/receiptPdf.js";
import { buildWhatsAppMessage, canWhatsAppShare, openManualWhatsAppShare } from "../io/receiptWhatsApp.js";
import { formatReceiptDate, withReceiptBranding } from "../model/receiptModel.js";
import { ReceiptViewerModal } from "./ReceiptViewerModal.jsx";
import { CloseButton } from "../../../components/ui.jsx";

export function ReceiptActions({ receipt, settings, token, onLogAction, compact = false }) {
  const [viewOpen, setViewOpen] = useState(false);
  const brandedReceipt = withReceiptBranding(receipt, settings);
  const whatsAppAvailable = canWhatsAppShare(receipt?.customerPhone);

  const log = async action => {
    if (token && receipt?.paymentId && onLogAction) {
      try { await onLogAction(token, receipt.source, receipt.paymentId, action); } catch { /* non-blocking */ }
    }
  };

  const viewReceipt = async () => {
    await log("viewed");
    setViewOpen(true);
  };

  const downloadPdf = async () => {
    await log("downloaded");
    downloadReceiptPdf(brandedReceipt);
  };

  const shareWhatsApp = () => {
    if (!whatsAppAvailable) return;
    openManualWhatsAppShare({
      phone: receipt.customerPhone,
      message: buildWhatsAppMessage(brandedReceipt, settings),
    });
    log("whatsapp_clicked");
  };

  if (!receipt?.receiptNumber) return <span className="small">—</span>;

  return <>
    <div className={`receipt-actions ${compact ? "compact" : ""}`}>
      <button type="button" className="btn" onClick={viewReceipt}>View</button>
      <button type="button" className="btn" onClick={downloadPdf}>PDF</button>
      {whatsAppAvailable
        ? <button type="button" className="btn whatsapp" onClick={shareWhatsApp}>WhatsApp</button>
        : !compact && <span className="small muted">WhatsApp unavailable</span>}
    </div>
    {viewOpen && <ReceiptViewerModal receipt={brandedReceipt} close={() => setViewOpen(false)} settings={settings} token={token} onLogAction={onLogAction} />}
  </>;
}

export function ReceiptSuccessModal({ receipt, settings, token, onLogAction, close }) {
  const [viewOpen, setViewOpen] = useState(false);
  const brandedReceipt = withReceiptBranding(receipt, settings);
  const whatsAppAvailable = canWhatsAppShare(receipt?.customerPhone);

  const log = async action => {
    if (token && receipt?.paymentId && onLogAction) {
      try { await onLogAction(token, receipt.source, receipt.paymentId, action); } catch { /* non-blocking */ }
    }
  };

  const viewReceipt = async () => { await log("viewed"); setViewOpen(true); };
  const downloadPdf = async () => { await log("downloaded"); downloadReceiptPdf(brandedReceipt); };
  const shareWhatsApp = () => {
    if (!whatsAppAvailable) return;
    openManualWhatsAppShare({ phone: receipt.customerPhone, message: buildWhatsAppMessage(brandedReceipt, settings) });
    log("whatsapp_clicked");
  };

  return <>
    <div className="modal-bg"><div className="modal receipt-success has-corner-close" role="dialog" aria-modal="true" aria-label="Payment successful"><span className="modal-corner-close"><CloseButton onClick={close} /></span>
      <h2 className="title green">Payment Successful ✓</h2>
      <p className="copy">Receipt No: <strong className="gold">{receipt.receiptNumber}</strong></p>
      <p className="copy">{receipt.customerName} · {receipt.money(receipt.amount)} · {receipt.paymentMode}</p>
      <p className="small">Date: {formatReceiptDate(receipt.paymentDate)} · Collected by {receipt.collectedBy}</p>
      <div className="tool-stack spacer">
        <button type="button" className="btn primary" onClick={viewReceipt}>View Receipt</button>
        <button type="button" className="btn" onClick={downloadPdf}>Download PDF</button>
        {whatsAppAvailable
          ? <button type="button" className="btn whatsapp" onClick={shareWhatsApp}>📲 Send via WhatsApp</button>
          : <p className="small">WhatsApp unavailable — add a valid customer phone number.</p>}
      </div>
      <div className="row spacer"><button type="button" className="btn primary" onClick={close}>Done</button></div>
    </div></div>
    {viewOpen && <ReceiptViewerModal receipt={brandedReceipt} close={() => setViewOpen(false)} settings={settings} token={token} onLogAction={onLogAction} />}
  </>;
}
