/**
 * Counter / POS thermal print via HTML — not PDF.
 *
 * Why HTML: PDF print on macOS often becomes PostScript (cg-pdf.ps) that ESC/POS
 * printers dump as junk. HTML is rasterized or sent as text by the OS driver.
 *
 * Cross-device: print from a same-origin iframe (works in mobile PWA, Windows,
 * and macOS). Pop-ups are a desktop fallback only — many phones block them.
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
 * @param {{ autoPrint?: boolean }} [options]
 */
export function buildThermalReceiptHtml(model, invoice = null, options = {}) {
  const autoPrint = options.autoPrint !== false;
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
  const printScript = autoPrint
    ? `<script>
    (function () {
      function go() {
        try { window.focus(); window.print(); } catch (e) {}
      }
      if (document.readyState === "complete") go();
      else window.addEventListener("load", go);
    })();
  </script>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(model.title || "Receipt")}</title>
  <style>
    /* 80 mm slip. Drivers that ignore @page still get a narrow body. */
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 80mm;
      max-width: 80mm;
      color: #000;
      background: #fff;
      font: 11px/1.35 "Courier New", Courier, ui-monospace, monospace;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slip { width: 72mm; max-width: 100%; margin: 0 auto; padding: 1mm 2mm 6mm; }
    .c { text-align: center; }
    .bold { font-weight: 700; }
    .muted { font-size: 10px; }
    .title { font-weight: 700; letter-spacing: 0.04em; margin: 0 0 2px; }
    .shop { font-size: 13px; font-weight: 700; margin: 0 0 2px; }
    .rule { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 1px 0; }
    .row > span:last-child { text-align: right; white-space: nowrap; }
    .head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 9mm 13mm 15mm;
      gap: 2px;
      font-weight: 700;
      font-size: 10px;
      margin-bottom: 2px;
    }
    .head .num, .item-grid .num { text-align: right; }
    .item { margin: 3px 0; }
    .item-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 9mm 13mm 15mm;
      gap: 2px;
      align-items: start;
    }
    .item-grid .name { font-weight: 700; overflow-wrap: anywhere; word-break: break-word; }
    .detail { margin-top: 1px; font-size: 10px; }
    .pay { display: grid; grid-template-columns: 1fr auto 1fr; gap: 4px; align-items: center; font-size: 10px; }
    .pay > span:nth-child(2) { text-align: center; }
    .pay > span:last-child { text-align: right; }
    .qr { text-align: center; margin: 4px 0; }
    .qr svg { max-width: 36mm; height: auto; }
    .foot { margin-top: 4px; font-weight: 700; }
    @media print {
      html, body { width: 80mm !important; max-width: 80mm !important; }
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
  ${printScript}
</body>
</html>`;
}

function cleanupPrintFrame(frame) {
  window.setTimeout(() => {
    try { frame.remove(); } catch { /* ignore */ }
  }, 60_000);
}

/** Hidden iframe print — reliable on mobile PWA (no pop-up) and desktop. */
function printViaIframe(html) {
  if (typeof document === "undefined") return false;
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Thermal receipt");
  frame.setAttribute("aria-hidden", "true");
  // Must be in the layout tree (not display:none) or some browsers skip print.
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument || win?.document;
  if (!win || !doc) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Call print in the same user-gesture turn when possible (required on iOS).
  try {
    win.focus();
    win.print();
    cleanupPrintFrame(frame);
    return true;
  } catch {
    frame.remove();
    return false;
  }
}

/** Desktop fallback: blob tab (no noopener — we need to trigger print). */
function printViaPopup(html) {
  let popup = null;
  try {
    popup = window.open("", "_blank", "width=420,height=720");
  } catch {
    popup = null;
  }
  if (!popup) return false;
  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    try {
      popup.focus();
      popup.print();
    } catch { /* user can use browser Print */ }
    return true;
  } catch {
    try { popup.close(); } catch { /* ignore */ }
    return false;
  }
}

/**
 * Open the system print dialog for an 80 mm Counter slip.
 * Prefer iframe (PWA / phone / Windows / Mac). Pop-up only if iframe fails.
 * @param {object} model - from salesInvoicePdfModel(invoice)
 * @param {object} [invoice]
 */
export function printThermalReceiptHtml(model, invoice = null) {
  if (typeof window === "undefined" || !model) return false;
  // Host calls print() — do not double-fire via embedded onload on iframe path.
  const iframeHtml = buildThermalReceiptHtml(model, invoice, { autoPrint: false });
  if (printViaIframe(iframeHtml)) return true;
  const popupHtml = buildThermalReceiptHtml(model, invoice, { autoPrint: true });
  return printViaPopup(popupHtml);
}
