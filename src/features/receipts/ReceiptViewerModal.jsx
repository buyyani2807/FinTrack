import { downloadReceiptPdf } from "./receiptPdf.js";
import { buildWhatsAppMessage, canWhatsAppShare, openWhatsAppShare } from "./receiptWhatsApp.js";
import { formatReceiptDate, withReceiptBranding } from "./receiptModel.js";

export function ReceiptViewerModal({ receipt, settings, token, onLogAction, close }) {
  const brandedReceipt = withReceiptBranding(receipt, settings);
  const whatsAppAvailable = canWhatsAppShare(receipt?.customerPhone);
  const m = receipt.money;

  const log = async action => {
    if (token && receipt?.paymentId && onLogAction) {
      try { await onLogAction(token, receipt.source, receipt.paymentId, action); } catch { /* non-blocking */ }
    }
  };

  return <div className="modal-bg"><div className="modal receipt-view">
    <div className="receipt-paper">
      <div className="receipt-header">
        <strong>{receipt.companyName}</strong>
        <span>PAYMENT RECEIPT</span>
      </div>
      {receipt.companyAddress && <p className="small">{receipt.companyAddress}</p>}
      {(receipt.companyPhone || receipt.companyEmail) && <p className="small">{[receipt.companyPhone, receipt.companyEmail].filter(Boolean).join(" · ")}</p>}
      <div className="receipt-meta">
        <span>Receipt No: {receipt.receiptNumber}</span>
        <span>{formatReceiptDate(receipt.paymentDate)} · {receipt.paymentTime}</span>
      </div>
      <hr />
      <section><strong>CUSTOMER</strong><p>{receipt.customerName}</p>{receipt.customerPhone && <p className="small">Phone: {receipt.customerPhone}</p>}</section>
      <section><strong>ACCOUNT</strong><p>Account ID: {receipt.accountId}</p><p>Finance Type: {receipt.financeType}</p>{receipt.schemeName && <p>Scheme: {receipt.schemeName}</p>}</section>
      <hr />
      <section><strong>PAYMENT</strong>
        <p>Amount Paid: {m(receipt.amount)}</p>
        {receipt.splitPayment && <>
          <p>Cash: {m(receipt.cashAmount)}</p>
          <p>UPI: {m(receipt.upiAmount)}</p>
        </>}
        <p>Payment Mode: {receipt.paymentMode}</p>
        <p>Previous Balance: {m(receipt.previousBalance)}</p>
        <p>Remaining Balance: {m(receipt.remainingBalance)}</p>
        {receipt.dailyFields && <p>Day {receipt.dailyFields.daysCompleted} of 100 · {receipt.dailyFields.daysRemaining} days remaining</p>}
      </section>
      <section><strong>Collected By</strong><p>{receipt.collectedBy}</p><p className="small">{receipt.collectedByRole}</p></section>
      <hr />
      <p className="small">{receipt.receiptFooter}</p>
      {receipt.receiptTerms && <p className="small muted">{receipt.receiptTerms}</p>}
      <p className="small muted">Powered by FinTrack</p>
    </div>
    <div className="row spacer">
      <button type="button" className="btn" onClick={async () => { await log("downloaded"); downloadReceiptPdf(receipt); }}>Download PDF</button>
      {whatsAppAvailable && <button type="button" className="btn whatsapp" onClick={async () => { await log("whatsapp_clicked"); openWhatsAppShare({ phone: receipt.customerPhone, message: buildWhatsAppMessage(brandedReceipt, settings) }); }}>WhatsApp</button>}
      <button type="button" className="btn primary" onClick={close}>Close</button>
    </div>
  </div></div>;
}
