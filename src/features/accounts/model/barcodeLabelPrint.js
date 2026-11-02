/** Print shelf / barcode labels for Inventory items (no extra npm dependency). */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal Code 128B → SVG path widths for printable barcodes. */
function code128Svg(text, { height = 48, module = 1.4 } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const START_B = 104;
  const STOP = 106;
  const patterns = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
  ];
  const values = [START_B];
  let checksum = START_B;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i) - 32;
    if (code < 0 || code > 95) return "";
    values.push(code);
    checksum += code * (i + 1);
  }
  values.push(checksum % 103);
  values.push(STOP);

  let x = 0;
  const bars = [];
  for (const value of values) {
    const pattern = patterns[value];
    if (!pattern) return "";
    let bar = true;
    for (const ch of pattern) {
      const width = Number(ch) * module;
      if (bar) bars.push(`<rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="${height}" fill="currentColor"/>`);
      x += width;
      bar = !bar;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x.toFixed(2)}" height="${height}" viewBox="0 0 ${x.toFixed(2)} ${height}" aria-hidden="true">${bars.join("")}</svg>`;
}

export function printItemLabels(items = [], { companyName = "" } = {}) {
  const rows = (items || []).filter(item => item && item.isActive !== false).slice(0, 200);
  if (!rows.length) throw new Error("No active items to print.");
  const cards = rows.map(item => {
    const code = String(item.barcode || item.sku || "").trim();
    const svg = code128Svg(code);
    return `<article class="label">
      <div class="co">${escapeHtml(companyName)}</div>
      <div class="name">${escapeHtml(item.name)}</div>
      <div class="meta">${escapeHtml([item.brand, item.sku].filter(Boolean).join(" · "))}</div>
      <div class="price">₹${Number(item.sellingPrice || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
      ${svg ? `<div class="bars">${svg}</div>` : ""}
      <div class="code">${escapeHtml(code || "—")}</div>
    </article>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Item labels</title>
<style>
  @page { margin: 8mm; }
  body { margin: 0; font: 12px/1.3 system-ui, sans-serif; color: #111; }
  .sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(48mm, 1fr)); gap: 4mm; }
  .label { border: 1px solid #ccc; border-radius: 2mm; padding: 3mm; break-inside: avoid; page-break-inside: avoid; }
  .co { font-size: 9px; opacity: .7; }
  .name { font-weight: 700; font-size: 13px; margin-top: 1mm; }
  .meta, .code { font-size: 10px; margin-top: 1mm; }
  .price { font-weight: 700; margin-top: 1mm; }
  .bars { margin-top: 2mm; color: #000; overflow: hidden; }
  .bars svg { max-width: 100%; height: auto; display: block; }
</style></head><body><div class="sheet">${cards}</div>
<script>window.onload=function(){window.print();}</script></body></html>`;

  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!popup) throw new Error("Allow pop-ups to print labels.");
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
