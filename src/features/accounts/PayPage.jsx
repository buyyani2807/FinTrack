import { useMemo, useState } from "react";
import { formatInr } from "../../lib/formatMoney.js";
import { encodeQr, qrSvgPath } from "../../lib/qrCode.js";
import { parsePayPageParams, upiPayLink } from "./model/upiPay.js";

const PAY_PAGE_CSS = `
.pay-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px; }
.pay-card { width: 100%; max-width: 380px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.pay-card .title { margin: 0; }
.pay-amount { font-size: 28px; font-weight: 700; margin: 0; }
.pay-card .acc-qr { border-radius: 8px; border: 1px solid rgba(0, 0, 0, 0.08); max-width: 100%; height: auto; }
.pay-open { width: 100%; text-align: center; text-decoration: none; }
.pay-upi-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
`;

export function QrSvg({ text, size = 220, label = "QR code" }) {
  const qr = useMemo(() => {
    try {
      return text ? encodeQr(text, { ecc: "M" }) : null;
    } catch {
      return null;
    }
  }, [text]);
  if (!qr) return null;
  const border = 4;
  const dimension = qr.size + border * 2;
  return (
    <svg className="acc-qr" width={size} height={size} viewBox={`0 0 ${dimension} ${dimension}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={dimension} height={dimension} fill="#fff" />
      <path d={qrSvgPath(qr, border)} fill="#000" />
    </svg>
  );
}

/** Public page linked from WhatsApp reminders: shows the UPI QR and opens the payer's UPI app. */
export function PayPage() {
  const params = useMemo(() => parsePayPageParams(typeof window !== "undefined" ? window.location.search : ""), []);
  const [copied, setCopied] = useState(false);
  const link = params.valid ? upiPayLink(params) : "";

  const copyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(params.upiId);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!params.valid) {
    return (
      <main className="pay-page">
        <style>{PAY_PAGE_CSS}</style>
        <section className="card pay-card">
          <h1 className="title">Payment link not valid</h1>
          <p className="copy">This link is missing the UPI ID. Ask the sender for a new payment link.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="pay-page">
      <style>{PAY_PAGE_CSS}</style>
      <section className="card pay-card">
        <p className="small">Pay to</p>
        <h1 className="title">{params.payeeName || params.upiId}</h1>
        {params.amount > 0 && <p className="pay-amount">{formatInr(params.amount)}</p>}
        {params.note && <p className="small">For {params.note}</p>}
        <QrSvg text={link} label={`UPI QR code for ${params.payeeName || params.upiId}`} />
        <p className="small">Scan with any UPI app, or tap below on your phone.</p>
        <a className="btn primary pay-open" href={link}>Open UPI app</a>
        <div className="pay-upi-row">
          <span className="small">UPI ID: <strong>{params.upiId}</strong></span>
          <button type="button" className="btn ghost" onClick={copyUpiId}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <p className="small muted">Check the payee name in your UPI app before you pay. FinTrack does not process this payment.</p>
      </section>
    </main>
  );
}
