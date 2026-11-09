/**
 * Counter / POS thermal print via HTML — not PDF.
 * Cheap ESC/POS printers often print PDF→PostScript (cg-pdf.ps) as raw junk;
 * an 80 mm HTML slip is rasterized or treated as text by the driver instead.
 */
import { encodeQr } from "../../../lib/qrCode.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function qrSvg(link, { module = 2 } = {}) {
  const text = String(link || "").trim();
  if (!text) return "";
  let qr;
  try {
    qr = encodeQr(text, { ecc: "M" });
  } catch {
    return "";
  }
  const modules = qr?.modules;
  if (!modules?.length) return "";
  const size = modules.length * module;
  const cells = [];
  for (let y = 0; y < modules.length; y += 1) {
    for (let x = 0; x < modules[y].length; x += 1) {
      if (!modules[y][x]) continue;
      cells.push(`<rect x="${x * module}" y="${y * module}" width="${module}" height="${module}" fill="#000"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${cells.join("")}</svg>`;
}

/**
 * @param {object} model - from salesInvoicePdfModel(invoice)
 * @param {object} [invoice] - original invoice for UPI / money helpers
 */
export function buildThermalReceiptHtml(model, invoice = null) {
  const sellerLines = (model.seller?.lines || []).filter(Boolean).map(line => `<div class="c muted">${escapeHtml(line)}</div>`).join("");
  const partyLines = (model.party?.lines || []).filter(Boolean).map(line => `<div>${escapeHtml(line)}</div>`).join("");
  const metaRows = (model.meta || [])
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`)
    .join("");
  const itemRows = (model.items || []).map(item => {
    const detail = item.detail ? `<div class="muted detail">${escapeHtml(item.detail)}</div>` : "";
    const disc = item.discount ? `<div class="muted detail">Disc ${escapeHtml(item.discount)}</div>` : "";
    return `<div class="item">
      <div class="item-grid">
        <div class="name">${escapeHtml(item.name || "Item")}</div>
        <div class="num">${escapeHtml(item.quantity || "")}</div>
        <div class="num">${escapeHtml(item.rate || "")}</div>
        <div class="num">${escapeHtml(item.amount || "")}</div>
      </div>
      ${detail}${disc}
    </div>`;
  }).join("");
  const totals = (model.totals || []).map(row => (
    `<div class="row${row.bold ? " bold" : ""}"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.value)}</span></div>`
  )).join("");
  const payment = model.payment
    ? `<div class="rule"></div>
       <div class="pay">
         <span>${escapeHtml(model.payment.when || "")}</span>
         <span class="bold">${escapeHtml(model.payment.method || "")}</span>
         <span class="bold">${escapeHtml(model.payment.amount || "")}</span>
       </div>`
    : "";
  let qrBlock = "";
  if (invoice?.upiLink && Number(invoice.payableAmount || 0) > 0 && invoice.showUpiQr !== false) {
    const svg = qrSvg(invoice.upiLink);
    const captions = (typeof invoice.money === "function"
      ? [`Scan to pay ${invoice.money(invoice.payableAmount)}`, invoice.upiId ? `UPI: ${invoice.upiId}` : ""]
      : []).filter(Boolean);
    if (svg) {
      qrBlock = `<div class="rule"></div><div class="qr">${svg}</div>${captions.map(line => `<div class="c muted">${escapeHtml(line)}</div>`).join("")}`;
    }
  }
  const qtyLine = model.totalQty
    ? `<div class="row"><span>Total Qty</span><span>${escapeHtml(model.totalQty)}</span></div>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(model.title || "Receipt")}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 76mm;
      color: #000;
      background: #fff;
      font: 11px/1.35 ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slip { width: 72mm; margin: 0 auto; padding: 1mm 0 4mm; }
    .c { text-align: center; }
    .bold { font-weight: 700; }
    .muted { opacity: 0.9; font-size: 10px; }
    .title { font-weight: 700; letter-spacing: 0.04em; margin: 0 0 2px; }
    .shop { font-size: 13px; font-weight: 700; margin: 0 0 2px; }
    .rule { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 1px 0; }
    .row > span:last-child { text-align: right; white-space: nowrap; }
    .head {
      display: grid;
      grid-template-columns: 1fr 10mm 14mm 16mm;
      gap: 2px;
      font-weight: 700;
      font-size: 10px;
      margin-bottom: 2px;
    }
    .head .num, .item-grid .num { text-align: right; }
    .item { margin: 3px 0; }
    .item-grid {
      display: grid;
      grid-template-columns: 1fr 10mm 14mm 16mm;
      gap: 2px;
      align-items: start;
    }
    .item-grid .name { font-weight: 700; word-break: break-word; }
    .detail { margin-top: 1px; padding-right: 40mm; }
    .pay { display: grid; grid-template-columns: 1fr auto 1fr; gap: 4px; align-items: center; font-size: 10px; }
    .pay > span:nth-child(2) { text-align: center; }
    .pay > span:last-child { text-align: right; }
    .qr { text-align: center; margin: 4px 0; }
    .qr svg { max-width: 38mm; height: auto; }
    .foot { margin-top: 4px; font-weight: 700; }
    @media print {
      html, body { width: 76mm; }
      .slip { width: 72mm; }
    }
  </style>
</head>
<body>
  <div class="slip">
    <div class="c title">${escapeHtml(model.title || "BILL")}</div>
    <div class="c shop">${escapeHtml(model.seller?.name || "")}</div>
    ${sellerLines}
    <div class="rule"></div>
    <div class="bold">${escapeHtml(model.partyHeading || "Name")}: ${escapeHtml(model.party?.name || "")}</div>
    ${partyLines}
    ${metaRows}
    <div class="rule"></div>
    ${model.items?.length ? `<div class="head"><div>Item</div><div class="num">Qty</div><div class="num">Price</div><div class="num">Amt</div></div>${itemRows}` : ""}
    <div class="rule"></div>
    ${qtyLine}
    ${totals}
    ${payment}
    ${qrBlock}
    <div class="rule"></div>
    <div class="c foot">${escapeHtml(model.footer || "Thank You & Visit Again..!")}</div>
  </div>
  <script>
    window.onload = function () {
      try { window.focus(); window.print(); } catch (e) {}
    };
  </script>
</body>
</html>`;
}

/**
 * Open an HTML thermal slip and trigger the system print dialog.
 * @param {object} model - from salesInvoicePdfModel(invoice)
 * @param {object} [invoice]
 */
export function printThermalReceiptHtml(model, invoice = null) {
  if (typeof window === "undefined" || !model) return false;
  const html = buildThermalReceiptHtml(model, invoice);
  let popup = null;
  try {
    popup = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
  } catch {
    popup = null;
  }
  if (!popup) return false;
  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    return true;
  } catch {
    try { popup.close(); } catch { /* ignore */ }
    return false;
  }
}
