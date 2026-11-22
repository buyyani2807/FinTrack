import { encodeQr } from "../../../lib/qrCode.js";

// Shared renderer for invoices and trade documents. Output is a binary (latin1) string so an
// embedded JPEG logo survives; text is limited to the WinAnsi-safe ASCII range of the base fonts.

export const PDF_TEMPLATES = {
  a4: { id: "a4", label: "A4", width: 595, height: 842, margin: 40, base: 9, qr: 92, logo: 56 },
  a5: { id: "a5", label: "A5", width: 420, height: 595, margin: 26, base: 8, qr: 76, logo: 42 },
  thermal: { id: "thermal", label: "Thermal 80 mm", width: 226, height: 0, margin: 10, base: 7.5, qr: 112, logo: 48 },
};

const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELVETICA_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

const REPLACEMENTS = { "₹": "Rs.", "—": "-", "–": "-", "×": "x", "·": "-", "•": "-", "‘": "'", "’": "'", "“": "\"", "”": "\"", "…": "...", "\u00a0": " " };

export function pdfSafeText(value) {
  return String(value ?? "")
    .replace(/[₹—–×·•‘’“”…\u00a0]/g, ch => REPLACEMENTS[ch])
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
}

const escapePdf = value => pdfSafeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function textWidth(value, size, bold = false) {
  const widths = bold ? HELVETICA_BOLD : HELVETICA;
  let total = 0;
  for (const ch of pdfSafeText(value)) total += widths[ch.charCodeAt(0) - 32] ?? 556;
  return (total * size) / 1000;
}

export function wrapText(value, size, maxWidth, bold = false) {
  const words = pdfSafeText(value).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  const pushLong = word => {
    let chunk = "";
    for (const ch of word) {
      if (chunk && textWidth(chunk + ch, size, bold) > maxWidth) { lines.push(chunk); chunk = ""; }
      chunk += ch;
    }
    return chunk;
  };
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size, bold) <= maxWidth) { current = next; continue; }
    if (current) lines.push(current);
    current = textWidth(word, size, bold) > maxWidth ? pushLong(word) : word;
  }
  if (current) lines.push(current);
  return lines;
}

const fmt = value => (Math.round(value * 100) / 100).toString();

/** Width/height/components of a baseline or progressive JPEG (binary string). */
export function jpegInfo(binary) {
  if (!binary || binary.charCodeAt(0) !== 0xff || binary.charCodeAt(1) !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < binary.length) {
    if (binary.charCodeAt(offset) !== 0xff) return null;
    const marker = binary.charCodeAt(offset + 1);
    const length = (binary.charCodeAt(offset + 2) << 8) | binary.charCodeAt(offset + 3);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        height: (binary.charCodeAt(offset + 5) << 8) | binary.charCodeAt(offset + 6),
        width: (binary.charCodeAt(offset + 7) << 8) | binary.charCodeAt(offset + 8),
        components: binary.charCodeAt(offset + 9),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function decodeJpegDataUrl(dataUrl) {
  const match = /^data:image\/jpe?g;base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match || typeof atob !== "function") return null;
  try {
    const binary = atob(match[1]);
    const info = jpegInfo(binary);
    return info && info.width && info.height ? { binary, ...info } : null;
  } catch {
    return null;
  }
}

function serialize(pages, { width, logo }) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const boldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pagesId = add(null);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let imageId = 0;
  if (logo) {
    const colorSpace = logo.components === 1 ? "/DeviceGray" : logo.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const decode = logo.components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : "";
    imageId = add(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode${decode} /Length ${logo.binary.length} >>\nstream\n${logo.binary}\nendstream`);
  }
  const pageIds = pages.map(page => {
    const stream = page.ops.map(op => op(page.height)).join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const xobject = imageId && page.usesLogo ? ` /XObject << /Im1 ${imageId} 0 R >>` : "";
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${fmt(width)} ${fmt(page.height)}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >>${xobject} >> /Contents ${contentId} 0 R >>`);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(offset => { body += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return body;
}

function createSurface(spec) {
  const pages = [];
  const surface = {
    spec,
    left: spec.margin,
    right: spec.width - spec.margin,
    width: spec.width - spec.margin * 2,
    y: spec.margin,
    page: null,
    pages,
    newPage() {
      surface.page = { ops: [], height: spec.height, usesLogo: false };
      pages.push(surface.page);
      surface.y = spec.margin;
    },
    room(height) {
      if (!spec.height) return;
      if (surface.y + height > spec.height - spec.margin - 14) surface.newPage();
    },
    text(value, x, top, { size = spec.base, bold = false, align = "left", gray = 0, rgb = null } = {}) {
      const safe = escapePdf(value);
      if (!safe) return;
      const w = textWidth(value, size, bold);
      const startX = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      const colored = Boolean(rgb || gray);
      const color = rgb ? `${rgb.map(fmt).join(" ")} rg ` : gray ? `${gray} g ` : "";
      surface.page.ops.push(h => `${color}BT /${bold ? "F2" : "F1"} ${fmt(size)} Tf ${fmt(startX)} ${fmt(h - top - size * 0.8)} Td (${safe}) Tj ET${colored ? " 0 g" : ""}`);
    },
    rule(top, { x1 = surface.left, x2 = surface.right, weight = 0.5, gray = 0.6, rgb = null } = {}) {
      const color = rgb ? `${rgb.map(fmt).join(" ")} RG` : `${gray} G`;
      surface.page.ops.push(h => `${color} ${weight} w ${fmt(x1)} ${fmt(h - top)} m ${fmt(x2)} ${fmt(h - top)} l S 0 G`);
    },
    fill(x, top, w, height, gray = 0.94, rgb = null) {
      const color = rgb ? `${rgb.map(fmt).join(" ")} rg` : `${gray} g`;
      surface.page.ops.push(h => `${color} ${fmt(x)} ${fmt(h - top - height)} ${fmt(w)} ${fmt(height)} re f 0 g`);
    },
    box(x, top, w, height, { weight = 0.6, rgb = [0.6, 0.6, 0.6] } = {}) {
      surface.page.ops.push(h => `${rgb.map(fmt).join(" ")} RG ${weight} w ${fmt(x)} ${fmt(h - top - height)} ${fmt(w)} ${fmt(height)} re S 0 G`);
    },
    image(x, top, w, height) {
      surface.page.usesLogo = true;
      surface.page.ops.push(h => `q ${fmt(w)} 0 0 ${fmt(height)} ${fmt(x)} ${fmt(h - top - height)} cm /Im1 Do Q`);
    },
    qr(matrix, x, top, size) {
      const quiet = 2;
      const cell = size / (matrix.size + quiet * 2);
      surface.page.ops.push(h => {
        const rects = [];
        for (let row = 0; row < matrix.size; row += 1) {
          for (let col = 0; col < matrix.size; col += 1) {
            if (!matrix.modules[row][col]) continue;
            const px = x + (col + quiet) * cell;
            const py = h - top - (row + quiet + 1) * cell;
            rects.push(`${fmt(px)} ${fmt(py)} ${fmt(cell + 0.02)} ${fmt(cell + 0.02)} re`);
          }
        }
        return `0 g ${rects.join(" ")} f`;
      });
    },
    paragraph(value, x, maxWidth, { size = spec.base, bold = false, gray = 0, rgb = null, lineGap = 1.35 } = {}) {
      for (const line of wrapText(value, size, maxWidth, bold)) {
        surface.room(size * lineGap);
        surface.text(line, x, surface.y, { size, bold, gray, rgb });
        surface.y += size * lineGap;
      }
    },
  };
  surface.newPage();
  return surface;
}

function sheetColumns(spec, width) {
  if (spec.id === "a5") {
    return [
      { key: "index", label: "#", width: 14 },
      { key: "name", label: "Item", width: width - 14 - 44 - 58 - 68 },
      { key: "quantity", label: "Qty", width: 44, align: "right" },
      { key: "rate", label: "Rate", width: 58, align: "right" },
      { key: "amount", label: "Amount", width: 68, align: "right" },
    ];
  }
  return [
    { key: "index", label: "#", width: 18 },
    { key: "name", label: "Item", width: width - 18 - 56 - 70 - 56 - 38 - 80 },
    { key: "quantity", label: "Qty", width: 56, align: "right" },
    { key: "rate", label: "Rate", width: 70, align: "right" },
    { key: "discount", label: "Disc.", width: 56, align: "right" },
    { key: "gst", label: "GST", width: 38, align: "right" },
    { key: "amount", label: "Amount", width: 80, align: "right" },
  ];
}

function drawSheet(model, surface, logo, qr) {
  const { spec } = surface;
  const base = spec.base;
  surface.fill(surface.left, surface.y, surface.width, 3, 0.28);
  surface.y += 12;
  const top = surface.y;
  let textLeft = surface.left;
  if (logo) {
    const scale = Math.min(spec.logo / logo.width, spec.logo / logo.height);
    surface.image(surface.left, top, logo.width * scale, logo.height * scale);
    textLeft += logo.width * scale + 10;
  }
  const headerWidth = surface.width * 0.58 - (textLeft - surface.left);
  surface.y = top;
  surface.paragraph(model.seller.name, textLeft, headerWidth, { size: base + 6, bold: true, lineGap: 1.2 });
  for (const line of model.seller.lines) surface.paragraph(line, textLeft, headerWidth, { size: base - 0.5, gray: 0.25 });
  const leftBottom = Math.max(surface.y, top + (logo ? spec.logo : 0));

  let rightY = top;
  surface.text(model.title, surface.right, rightY, { size: base + 5, bold: true, align: "right" });
  rightY += (base + 5) * 1.5;
  for (const [label, value] of model.meta) {
    surface.text(`${label}: ${value}`, surface.right, rightY, { size: base, align: "right" });
    rightY += base * 1.45;
  }
  surface.y = Math.max(leftBottom, rightY) + 8;
  surface.rule(surface.y);
  surface.y += 10;

  surface.text(model.partyHeading, surface.left, surface.y, { size: base - 0.5, bold: true, gray: 0.35 });
  surface.y += base * 1.5;
  surface.paragraph(model.party.name, surface.left, surface.width * 0.6, { size: base + 1.5, bold: true });
  for (const line of model.party.lines) surface.paragraph(line, surface.left, surface.width * 0.6, { size: base - 0.5, gray: 0.25 });
  surface.y += 8;

  if (model.items.length) {
    const columns = sheetColumns(spec, surface.width);
    const header = () => {
      surface.fill(surface.left, surface.y, surface.width, base * 2, 0.9);
      let x = surface.left;
      for (const column of columns) {
        const pad = 4;
        surface.text(column.label, column.align === "right" ? x + column.width - pad : x + pad, surface.y + base * 0.55, { size: base - 0.5, bold: true, align: column.align || "left" });
        x += column.width;
      }
      surface.y += base * 2 + 4;
    };
    surface.room(base * 6);
    header();
    model.items.forEach((item, index) => {
      const nameColumn = columns.find(column => column.key === "name");
      const nameLines = wrapText(item.name, base, nameColumn.width - 8);
      const detail = spec.id === "a5" ? [item.detail, item.discount ? `Disc ${item.discount}` : "", item.gst].filter(Boolean).join(" - ") : item.detail;
      const detailLines = detail ? wrapText(detail, base - 1.5, nameColumn.width - 8) : [];
      const height = nameLines.length * base * 1.3 + detailLines.length * (base - 1.5) * 1.3 + 5;
      if (spec.height && surface.y + height > spec.height - spec.margin - 20) {
        surface.newPage();
        header();
      }
      let x = surface.left;
      for (const column of columns) {
        const pad = 4;
        if (column.key === "name") {
          let lineY = surface.y;
          nameLines.forEach(line => { surface.text(line, x + pad, lineY, { size: base }); lineY += base * 1.3; });
          detailLines.forEach(line => { surface.text(line, x + pad, lineY, { size: base - 1.5, gray: 0.4 }); lineY += (base - 1.5) * 1.3; });
        } else {
          const value = column.key === "index" ? String(index + 1) : item[column.key] || "";
          surface.text(value, column.align === "right" ? x + column.width - pad : x + pad, surface.y, { size: base, align: column.align || "left" });
        }
        x += column.width;
      }
      surface.y += height;
      surface.rule(surface.y - 2, { weight: 0.3, gray: 0.85 });
    });
  } else if (model.description) {
    surface.paragraph(model.description, surface.left, surface.width, { size: base });
  }

  const totalsHeight = model.totals.length * base * 1.6 + 10;
  surface.room(totalsHeight);
  surface.y += 6;
  const labelX = surface.right - (spec.id === "a5" ? 150 : 200);
  for (const total of model.totals) {
    const size = total.bold ? base + 1.5 : base;
    if (total.bold) surface.fill(labelX - 6, surface.y - 3, surface.right - labelX + 6, size * 1.7, 0.94);
    surface.text(total.label, labelX, surface.y, { size, bold: total.bold });
    surface.text(total.value, surface.right - 2, surface.y, { size, bold: total.bold, align: "right" });
    surface.y += size * 1.6;
  }
  if (model.amountNote) {
    surface.paragraph(model.amountNote, labelX, surface.right - labelX, { size: base - 1, gray: 0.35 });
  }
  surface.y += 10;

  const qrSize = qr ? spec.qr : 0;
  const notesWidth = qr ? surface.width - qrSize - 20 : surface.width;
  const blocks = [...model.notes, ...model.bankLines.length ? [{ heading: "Bank details", lines: model.bankLines }] : []];
  const estimate = blocks.reduce((sum, block) => sum + (block.lines.length + 1) * base * 1.5 + 6, 0);
  surface.room(Math.max(estimate, qrSize + base * 4));
  const startY = surface.y;
  for (const block of blocks) {
    surface.text(block.heading, surface.left, surface.y, { size: base - 0.5, bold: true, gray: 0.35 });
    surface.y += base * 1.5;
    for (const line of block.lines) surface.paragraph(line, surface.left, notesWidth, { size: base - 0.5 });
    surface.y += 6;
  }
  if (qr) {
    const x = surface.right - qrSize;
    surface.qr(qr.matrix, x, startY, qrSize);
    let captionY = startY + qrSize + 2;
    for (const line of qr.caption) {
      surface.text(line, x + qrSize / 2, captionY, { size: base - 1, align: "center", bold: line === qr.caption[0] });
      captionY += (base - 1) * 1.35;
    }
    surface.y = Math.max(surface.y, captionY);
  }
  surface.y += 6;
  surface.room(base * 3);
  surface.rule(surface.y);
  surface.y += 6;
  surface.paragraph(model.footer, surface.left, surface.width, { size: base - 0.5, gray: 0.25 });

  surface.pages.forEach((page, index) => {
    surface.page = page;
    surface.text("Powered by MyFinTracker", surface.left, spec.height - spec.margin + 4, { size: base - 2, gray: 0.5 });
    if (surface.pages.length > 1) surface.text(`Page ${index + 1} of ${surface.pages.length}`, surface.right, spec.height - spec.margin + 4, { size: base - 2, gray: 0.5, align: "right" });
  });
}

// Counter bill on regular paper and every Counter PDF sent to a customer. Modelled on a
// typical Indian retail bill: bordered page, shop header with phone and address, bill
// number and date, Bill To, items with units, a subtotal row, then totals with received
// and balance, amount in words, bank details and a signature box (UPI QR when payable).
const INK = [0.18, 0.22, 0.36];
const MUTED = [0.36, 0.39, 0.48];
const GOLD = [0.79, 0.66, 0.38];
const CREAM = [0.98, 0.955, 0.905];

function retailColumns(spec, left, width, particulars = false) {
  const small = spec.id === "a5";
  const no = small ? 22 : 34;
  const qty = small ? 58 : 76;
  const rate = small ? 52 : 70;
  const total = small ? 62 : 84;
  // Payment receipts: what the money was for, and how much — no quantity or rate.
  const cols = particulars ? [
    { key: "index", label: "No", width: no, align: "center" },
    { key: "name", label: "Particulars", width: width - no - total * 1.3 },
    { key: "amount", label: "Amount", width: total * 1.3, align: "right" },
  ] : [
    { key: "index", label: "No", width: no, align: "center" },
    { key: "name", label: "Items", width: width - no - qty - rate - total },
    { key: "quantity", label: "Qty.", width: qty, align: "right" },
    { key: "rate", label: "Rate", width: rate, align: "right" },
    { key: "amount", label: "Total", width: total, align: "right" },
  ];
  let x = left;
  for (const col of cols) { col.x = x; x += col.width; }
  return cols;
}

function retailCellX(col, pad = 6) {
  if (col.align === "right") return col.x + col.width - pad;
  if (col.align === "center") return col.x + col.width / 2;
  return col.x + pad;
}

function drawRetailBill(model, surface, logo, qr) {
  const { spec } = surface;
  const base = spec.base;
  const r = model.retail;
  const pad = spec.id === "a5" ? 10 : 16;
  const left = surface.left + pad;
  const right = surface.right - pad;
  const width = right - left;
  const top = surface.y + pad;
  const small = spec.id === "a5";
  // Page break that keeps the content inside the border.
  const roomFor = height => {
    if (spec.height && surface.y + height > spec.height - spec.margin - 18) {
      surface.newPage();
      surface.y += pad + 4;
      return true;
    }
    return false;
  };

  // Header: logo, shop name / phone / address on the left; title and tag on the right.
  const titleSize = base + 4;
  const tag = r.tag || "ORIGINAL FOR RECIPIENT";
  const tagSize = base - 2.5;
  const tagWidth = textWidth(tag, tagSize) + 14;
  const rightBlock = Math.max(textWidth(model.title, titleSize, true), tagWidth);
  surface.text(model.title, right, top, { size: titleSize, bold: true, align: "right", rgb: INK });
  const tagTop = top + titleSize * 1.5;
  surface.box(right - tagWidth, tagTop, tagWidth, tagSize * 2.2, { weight: 0.6, rgb: MUTED });
  surface.text(tag, right - tagWidth / 2, tagTop + tagSize * 0.65, { size: tagSize, align: "center", rgb: MUTED });
  const rightBottom = tagTop + tagSize * 2.2;

  let textLeft = left;
  let logoBottom = top;
  if (logo) {
    const boxSize = spec.logo * 1.25;
    const scale = Math.min(boxSize / logo.width, boxSize / logo.height);
    surface.image(left, top, logo.width * scale, logo.height * scale);
    textLeft += logo.width * scale + 14;
    logoBottom = top + logo.height * scale;
  }
  surface.y = top;
  surface.paragraph(model.seller.name, textLeft, right - rightBlock - 12 - textLeft, { size: base + 8, bold: true, rgb: INK, lineGap: 1.15 });
  surface.y += 3;
  const infoWidth = right - textLeft;
  if (r.legalName) surface.paragraph(r.legalName, textLeft, infoWidth, { size: base, rgb: MUTED });
  if (r.phone) surface.paragraph(`Ph: ${r.phone}`, textLeft, infoWidth, { size: base + 0.5, rgb: MUTED });
  if (r.address) surface.paragraph(r.address, textLeft, infoWidth, { size: base, rgb: MUTED });
  const extra = [r.gstin ? `GSTIN: ${r.gstin}` : "", r.email].filter(Boolean).join("   ");
  if (extra) surface.paragraph(extra, textLeft, infoWidth, { size: base, rgb: MUTED });
  surface.y = Math.max(surface.y, logoBottom, rightBottom) + pad;
  surface.rule(surface.y, { x1: surface.left, x2: surface.right, weight: 0.8, rgb: GOLD });

  // Bill number, date, till, cashier.
  surface.y += 12;
  // Columns sized to their content so a long date never runs into the next column.
  const metaWidths = r.meta.map(([label, value]) => Math.max(textWidth(label, base - 0.5, true), textWidth(value || "-", base)) + (small ? 16 : 28));
  let metaX = left;
  r.meta.forEach(([label, value], index) => {
    if (index && metaX + metaWidths[index] - (small ? 16 : 28) > right) return;
    surface.text(label, metaX, surface.y, { size: base - 0.5, bold: true, rgb: INK });
    surface.text(value || "-", metaX, surface.y + base * 1.6, { size: base, rgb: MUTED });
    metaX += metaWidths[index];
  });
  surface.y += base * 3.4 + 6;
  surface.rule(surface.y, { x1: surface.left, x2: surface.right, weight: 0.8, rgb: GOLD });

  // Bill To.
  surface.y += 14;
  surface.text(r.partyHeading || "Bill To", left, surface.y, { size: base + 0.5, bold: true, rgb: INK });
  surface.y += base * 1.6;
  surface.paragraph(r.customerName, left, width * 0.6, { size: base + 0.5, rgb: INK });
  if (r.customerPhone) {
    surface.text("Mobile", left, surface.y, { size: base - 0.5, bold: true, rgb: INK });
    surface.text(r.customerPhone, left + textWidth("Mobile ", base - 0.5, true), surface.y, { size: base - 0.5, rgb: MUTED });
    surface.y += base * 1.4;
  }
  if (r.customerAddress) surface.paragraph(r.customerAddress, left, width * 0.6, { size: base - 0.5, rgb: MUTED });
  if (r.customerGstin) surface.paragraph(`GSTIN: ${r.customerGstin}`, left, width * 0.6, { size: base - 0.5, rgb: MUTED });
  surface.y += 12;

  // Items.
  const cols = retailColumns(spec, surface.left, surface.width, Boolean(r.particulars));
  const rowPad = base * (small ? 0.55 : 0.9);
  const header = () => {
    const h = base * 2.6;
    surface.fill(surface.left, surface.y, surface.width, h, 0, CREAM);
    for (const col of cols) surface.text(col.label, retailCellX(col), surface.y + (h - base) / 2, { size: base - 0.5, align: col.align || "left", rgb: MUTED });
    surface.y += h + 4;
  };
  roomFor(base * 8);
  header();
  const nameCol = cols.find(col => col.key === "name");
  r.items.forEach((item, index) => {
    const nameLines = wrapText(item.name, base, nameCol.width - 12);
    const detail = [item.detail, item.discount ? `Disc ${item.discount}` : ""].filter(Boolean).join(" - ");
    const detailLines = detail ? wrapText(detail, base - 1.5, nameCol.width - 12) : [];
    const height = nameLines.length * base * 1.3 + detailLines.length * (base - 1.5) * 1.3 + rowPad * 2;
    if (roomFor(height)) header();
    const rowTop = surface.y + rowPad;
    for (const col of cols) {
      if (col.key === "name") {
        let lineY = rowTop;
        nameLines.forEach(line => { surface.text(line, retailCellX(col), lineY, { size: base, rgb: INK }); lineY += base * 1.3; });
        detailLines.forEach(line => { surface.text(line, retailCellX(col), lineY, { size: base - 1.5, rgb: MUTED }); lineY += (base - 1.5) * 1.3; });
      } else {
        const value = col.key === "index" ? String(index + 1) : item[col.key] || "";
        surface.text(value, retailCellX(col), rowTop, { size: base, align: col.align || "left", rgb: INK });
      }
    }
    surface.y += height;
  });
  const subH = base * 2.6;
  roomFor(subH + 4);
  surface.fill(surface.left, surface.y, surface.width, subH, 0, CREAM);
  const subTop = surface.y + (subH - base) / 2;
  surface.text(r.subtotalLabel || "SUBTOTAL", retailCellX(nameCol), subTop, { size: base, bold: true, rgb: INK });
  const qtyCol = cols.find(col => col.key === "quantity");
  const amtCol = cols.find(col => col.key === "amount");
  if (r.totalQty && qtyCol) surface.text(r.totalQty, retailCellX(qtyCol), subTop, { size: base, bold: true, align: "right", rgb: INK });
  surface.text(r.subtotal, retailCellX(amtCol), subTop, { size: base, bold: true, align: "right", rgb: INK });
  surface.y += subH + (small ? 12 : 18);

  // HSN-wise GST summary (sales invoices), in the same cream-and-gold style as the items.
  if (r.taxSummary) {
    const sum = r.taxSummary;
    const cols = [{ key: "hsn", label: "HSN/SAC", weight: 1.3 }, { key: "taxable", label: "Taxable Value", weight: 1.3, align: "right" }];
    if (sum.showCgst) {
      cols.push({ key: "cgstRate", label: "CGST %", weight: 0.7, align: "right" }, { key: "cgst", label: "CGST", weight: 1, align: "right" });
      cols.push({ key: "sgstRate", label: "SGST %", weight: 0.7, align: "right" }, { key: "sgst", label: "SGST", weight: 1, align: "right" });
    }
    if (sum.showIgst) cols.push({ key: "igstRate", label: "IGST %", weight: 0.7, align: "right" }, { key: "igst", label: "IGST", weight: 1, align: "right" });
    cols.push({ key: "tax", label: "Total Tax", weight: 1.1, align: "right" });
    const totalWeight = cols.reduce((sum2, col) => sum2 + col.weight, 0);
    let cx = surface.left;
    for (const col of cols) { col.width = surface.width * col.weight / totalWeight; col.x = cx; cx += col.width; }
    const size = base - 1;
    const h = base * 2.3;
    roomFor(h * (sum.rows.length + 1) + 12);
    surface.fill(surface.left, surface.y, surface.width, h, 0, CREAM);
    for (const col of cols) surface.text(col.label, retailCellX(col), surface.y + (h - size) / 2, { size: size - 0.5, align: col.align || "left", rgb: MUTED });
    surface.y += h;
    for (const row of sum.rows) {
      const rowTop = surface.y + (h - size) / 2;
      for (const col of cols) surface.text(String(row[col.key] ?? ""), retailCellX(col), rowTop, { size, align: col.align || "left", rgb: INK });
      surface.y += h;
      surface.rule(surface.y, { x1: surface.left, x2: surface.right, weight: 0.4, rgb: GOLD });
    }
    surface.y += small ? 12 : 18;
  }

  // Totals (right) and bank details (left).
  const split = left + width * 0.52;
  const qrSize = qr ? Math.min(spec.qr, small ? 70 : 84) : 0;
  const signBox = (qr ? qrSize + base * 4 : base * (small ? 3 : 5)) + base * 4.5;
  const estimate = (r.taxLines.length + 3) * base * 1.8 + base * 5 + signBox + base * 3;
  roomFor(estimate);
  const blockTop = surface.y;

  let leftY = blockTop;
  if (r.bankLines.length) {
    surface.text("Bank Details", left, leftY, { size: base, bold: true, rgb: INK });
    leftY += base * 1.7;
    for (const line of r.bankLines) {
      for (const wrapped of wrapText(line, base - 0.5, split - left - 16)) {
        surface.text(wrapped, left, leftY, { size: base - 0.5, rgb: MUTED });
        leftY += (base - 0.5) * 1.45;
      }
    }
    leftY += 8;
  }
  if (r.settlement) {
    surface.text("Payment Mode", left, leftY, { size: base, bold: true, rgb: INK });
    leftY += base * 1.6;
    surface.text(r.settlement, left, leftY, { size: base - 0.5, rgb: MUTED });
    leftY += base * 1.6;
  }
  for (const [heading, text] of r.notes || []) {
    leftY += 6;
    surface.text(heading, left, leftY, { size: base, bold: true, rgb: INK });
    leftY += base * 1.6;
    for (const wrapped of wrapText(text, base - 0.5, split - left - 16)) {
      surface.text(wrapped, left, leftY, { size: base - 0.5, rgb: MUTED });
      leftY += (base - 0.5) * 1.45;
    }
  }

  let y = blockTop;
  const row = (label, value, { bold = false, size = base, ink = false } = {}) => {
    const rgb = bold || ink ? INK : MUTED;
    surface.text(label, split, y, { size, bold, rgb });
    surface.text(value, right, y, { size, bold, align: "right", rgb });
    y += size * 1.75;
  };
  for (const [label, value] of r.taxLines) row(label, value);
  if (r.taxLines.length) { surface.rule(y - 4, { x1: split, x2: right, weight: 0.6, rgb: GOLD }); y += 4; }
  // Bills and invoices: total, received, balance. Other documents pass their own rows
  // (a receipt: amount received, previous and remaining balance; a quotation: total only).
  const summary = r.summary || [
    { label: "Total Amount", value: r.total, bold: true, big: true, rule: true },
    { label: "Received Amount", value: r.received },
    { label: "Balance", value: r.balance, bold: true, rule: true },
  ];
  for (const item of summary) {
    row(item.label, item.value, { bold: Boolean(item.bold), size: item.big ? base + 2 : base });
    if (item.rule) { surface.rule(y - 4, { x1: split, x2: right, weight: 0.6, rgb: GOLD }); y += 4; }
  }
  y += 6;
  surface.text(r.wordsLabel || "Total Amount (in words)", split, y, { size: base, bold: true, rgb: INK });
  y += base * 1.6;
  for (const line of wrapText(r.words, base - 0.5, right - split)) {
    surface.text(line, split, y, { size: base - 0.5, rgb: MUTED });
    y += (base - 0.5) * 1.45;
  }
  y += 10;
  const boxTop = y;
  surface.box(split, boxTop, right - split, signBox, { weight: 0.7, rgb: GOLD });
  let inner = boxTop + 10;
  const centerX = split + (right - split) / 2;
  if (qr) {
    surface.qr(qr.matrix, centerX - qrSize / 2, inner, qrSize);
    inner += qrSize + 2;
    for (const line of qr.caption) {
      surface.text(line, centerX, inner, { size: base - 1.5, align: "center", rgb: MUTED });
      inner += (base - 1.5) * 1.35;
    }
  }
  const signTop = boxTop + signBox - base * 3.6;
  surface.text("Signature", centerX, signTop, { size: base, bold: true, align: "center", rgb: INK });
  surface.text(model.seller.name, centerX, signTop + base * 1.5, { size: base - 0.5, align: "center", rgb: MUTED });
  y = boxTop + signBox;

  surface.y = Math.max(leftY, y) + 16;
  roomFor(base * 3);
  surface.text(model.footer, surface.left + surface.width / 2, surface.y, { size: base, bold: true, align: "center", rgb: INK });
  surface.y += base * 2;

  surface.pages.forEach((page, index) => {
    surface.page = page;
    surface.box(surface.left, spec.margin, surface.width, spec.height - spec.margin * 2, { weight: 1.4, rgb: GOLD });
    surface.text("Powered by MyFinTracker", surface.left, spec.height - spec.margin + 6, { size: base - 2, gray: 0.5 });
    if (surface.pages.length > 1) surface.text(`Page ${index + 1} of ${surface.pages.length}`, surface.right, spec.height - spec.margin + 6, { size: base - 2, gray: 0.5, align: "right" });
  });
}

function taxItemColumns(width, discount) {
  const index = 16;
  const hsn = Math.min(72, Math.round(width * 0.15));
  const qty = Math.min(70, Math.round(width * 0.14));
  const rate = Math.min(68, Math.round(width * 0.13));
  const per = 32;
  const disc = discount ? 48 : 0;
  const amount = Math.min(74, Math.round(width * 0.15));
  const name = Math.max(80, width - index - hsn - qty - rate - per - disc - amount);
  const columns = [
    { key: "index", label: "#", width: index, align: "right" },
    { key: "name", label: "Description", width: name },
    { key: "hsn", label: "HSN/SAC", width: hsn },
    { key: "quantity", label: "Qty", width: qty, align: "right" },
    { key: "rate", label: "Rate", width: rate, align: "right" },
    { key: "per", label: "per", width: per },
  ];
  if (discount) columns.push({ key: "discount", label: "Disc.", width: disc, align: "right" });
  columns.push({ key: "amount", label: "Amount", width: amount, align: "right" });
  return columns;
}

function taxHsnColumns(width, sheet) {
  const amount = 58;
  const rate = 34;
  const columns = [
    { key: "hsn", label: "HSN/SAC", width: 0 },
    { key: "taxable", label: "Taxable", width: 64, align: "right" },
  ];
  if (sheet.showCgst) {
    columns.push({ key: "cgstRate", label: "CGST", width: rate, align: "right" });
    columns.push({ key: "cgst", label: "Amount", width: amount, align: "right" });
    columns.push({ key: "sgstRate", label: "SGST", width: rate, align: "right" });
    columns.push({ key: "sgst", label: "Amount", width: amount, align: "right" });
  }
  if (sheet.showIgst) {
    columns.push({ key: "igstRate", label: "IGST", width: rate, align: "right" });
    columns.push({ key: "igst", label: "Amount", width: amount, align: "right" });
  }
  columns.push({ key: "tax", label: "Total tax", width: 62, align: "right" });
  columns[0].width = width - columns.reduce((sum, column) => sum + column.width, 0);
  return columns;
}

function drawTaxCells(surface, columns, values, top, size, { bold = false, gray = 0 } = {}) {
  let x = surface.left;
  const pad = 3;
  for (const column of columns) {
    const value = values[column.key] || "";
    if (value) {
      const align = column.align || "left";
      surface.text(value, align === "right" ? x + column.width - pad : x + pad, top, { size, bold, align, gray });
    }
    x += column.width;
  }
}

function drawTaxInvoice(sheet, surface, logo, qr) {
  const { spec } = surface;
  const base = spec.base;
  const gap = base * 1.35;
  surface.text(sheet.title || "TAX INVOICE", (surface.left + surface.right) / 2, surface.y, { size: base + 1, bold: true, align: "center" });
  surface.y += gap + 4;
  const top = surface.y;
  let textLeft = surface.left;
  if (logo) {
    const scale = Math.min(spec.logo / logo.width, spec.logo / logo.height);
    surface.image(surface.left, top, logo.width * scale, logo.height * scale);
    textLeft += logo.width * scale + 10;
  }
  surface.y = top;
  surface.paragraph(sheet.sellerName, textLeft, surface.width * 0.7, { size: base + 4, bold: true, lineGap: 1.2 });
  for (const line of sheet.sellerLines || []) surface.paragraph(line, textLeft, surface.width * 0.7, { size: base - 0.5, gray: 0.3 });
  surface.y = Math.max(surface.y, top + (logo ? spec.logo : 0)) + 6;
  surface.rule(surface.y);
  surface.y += 8;
  const meta = sheet.meta || [];
  const metaHeight = Math.ceil(meta.length / 2) * gap;
  surface.room(metaHeight + 8);
  const metaTop = surface.y;
  meta.forEach((row, index) => {
    const column = index % 2;
    const y = metaTop + Math.floor(index / 2) * gap;
    const x = column === 0 ? surface.left : surface.left + surface.width * 0.52;
    surface.text(row.label, x, y, { size: base - 0.5, gray: 0.4 });
    surface.text(row.value, x + surface.width * 0.46, y, { size: base - 0.5, bold: true, align: "right" });
  });
  surface.y = metaTop + metaHeight + 4;
  surface.rule(surface.y);
  surface.y += 10;
  surface.text(sheet.partyHeading || "BILL TO", surface.left, surface.y, { size: base - 1, bold: true, gray: 0.4 });
  surface.y += gap;
  surface.paragraph(sheet.partyName, surface.left, surface.width * 0.7, { size: base + 1, bold: true });
  for (const line of sheet.partyLines || []) surface.paragraph(line, surface.left, surface.width * 0.7, { size: base - 0.5, gray: 0.3 });
  surface.y += 6;

  if (sheet.items?.length) {
    const columns = taxItemColumns(surface.width, sheet.showDiscount);
    const header = () => {
      surface.fill(surface.left, surface.y, surface.width, base * 1.8, 0.93);
      drawTaxCells(surface, columns, Object.fromEntries(columns.map(column => [column.key, column.label])), surface.y + base * 0.4, base - 1, { bold: true, gray: 0.35 });
      surface.y += base * 1.8 + 4;
    };
    surface.room(base * 6);
    header();
    sheet.items.forEach((item, index) => {
      const nameColumn = columns.find(column => column.key === "name");
      const nameLines = wrapText(item.name, base, nameColumn.width - 8);
      const detailLines = item.detail ? wrapText(item.detail, base - 1.5, nameColumn.width - 8) : [];
      const height = nameLines.length * base * 1.25 + detailLines.length * (base - 1.5) * 1.25 + 4;
      if (spec.height && surface.y + height > spec.height - spec.margin - 24) {
        surface.newPage();
        header();
      }
      const rowTop = surface.y;
      const nameX = surface.left + columns[0].width;
      nameLines.forEach(line => {
        surface.text(line, nameX + 3, surface.y, { size: base });
        surface.y += base * 1.25;
      });
      detailLines.forEach(line => {
        surface.text(line, nameX + 3, surface.y, { size: base - 1.5, gray: 0.4 });
        surface.y += (base - 1.5) * 1.25;
      });
      drawTaxCells(surface, columns, {
        index: String(index + 1),
        hsn: item.hsn,
        quantity: item.quantity,
        rate: item.rate,
        per: item.per,
        discount: item.discount,
        amount: item.amount,
      }, rowTop, base);
      surface.y = Math.max(surface.y, rowTop + height);
      surface.rule(surface.y - 2, { weight: 0.3, gray: 0.85 });
    });
  }

  surface.y += 6;
  surface.room(base * ((sheet.totals || []).length + 2));
  if (sheet.quantityTotal) {
    surface.text(`Total quantity ${sheet.quantityTotal}`, surface.left, surface.y, { size: base - 0.5, gray: 0.35 });
  }
  const labelX = surface.right - 180;
  for (const total of sheet.totals || []) {
    const size = total.bold ? base + 1 : base;
    if (total.bold) surface.fill(labelX - 8, surface.y - 3, surface.right - labelX + 8, size * 1.7, 0.94);
    surface.text(total.label, labelX, surface.y, { size, bold: total.bold });
    surface.text(total.value, surface.right, surface.y, { size, bold: total.bold, align: "right" });
    surface.y += size * 1.55;
  }
  surface.text("E. & O.E.", surface.right, surface.y, { size: base - 2, gray: 0.45, align: "right" });
  surface.y += gap;
  surface.room(base * 4);
  surface.text("Amount chargeable (in words)", surface.left, surface.y, { size: base - 1, bold: true, gray: 0.4 });
  surface.y += gap;
  surface.paragraph(sheet.amountWords, surface.left, surface.width, { size: base, bold: true });
  surface.y += 4;

  if (sheet.hsn?.length) {
    const columns = taxHsnColumns(surface.width, sheet);
    surface.room(base * (sheet.hsn.length + 3));
    surface.fill(surface.left, surface.y, surface.width, base * 1.8, 0.93);
    drawTaxCells(surface, columns, Object.fromEntries(columns.map(column => [column.key, column.label])), surface.y + base * 0.4, base - 1.5, { bold: true, gray: 0.35 });
    surface.y += base * 1.8 + 4;
    for (const row of sheet.hsn) {
      drawTaxCells(surface, columns, row, surface.y, base - 0.5);
      surface.y += gap;
      surface.rule(surface.y - 3, { weight: 0.3, gray: 0.85 });
    }
    surface.y += 4;
    if (sheet.taxWords) {
      surface.text("Tax amount (in words)", surface.left, surface.y, { size: base - 1, bold: true, gray: 0.4 });
      surface.y += gap;
      surface.paragraph(sheet.taxWords, surface.left, surface.width, { size: base, bold: true });
      surface.y += 4;
    }
  }

  surface.room(base * 8);
  surface.rule(surface.y);
  surface.y += 8;
  const signTop = surface.y;
  surface.text("Declaration", surface.left, surface.y, { size: base - 1, bold: true, gray: 0.4 });
  surface.y += gap;
  surface.paragraph(sheet.declaration, surface.left, surface.width * 0.62, { size: base - 0.5, gray: 0.3 });
  const signX = surface.right;
  surface.text(`for ${sheet.signatory}`, signX, signTop, { size: base - 0.5, bold: true, align: "right" });
  surface.text("Authorised Signatory", signX, signTop + gap * 3, { size: base - 1, gray: 0.4, align: "right" });
  surface.y = Math.max(surface.y, signTop + gap * 4) + 6;
  if (sheet.notes) {
    surface.text("Notes", surface.left, surface.y, { size: base - 1, bold: true, gray: 0.4 });
    surface.y += gap;
    surface.paragraph(sheet.notes, surface.left, surface.width, { size: base - 0.5 });
    surface.y += 4;
  }
  if (sheet.bankLines?.length) {
    surface.text("Bank", surface.left, surface.y, { size: base - 1, bold: true, gray: 0.4 });
    surface.y += gap;
    for (const line of sheet.bankLines) surface.paragraph(line, surface.left, surface.width * 0.65, { size: base - 0.5 });
  }
  if (qr) {
    const qrSize = spec.qr;
    surface.room(qrSize + base * 4);
    const x = surface.right - qrSize;
    const qrTop = surface.y;
    surface.qr(qr.matrix, x, qrTop, qrSize);
    let captionY = qrTop + qrSize + 2;
    for (const line of qr.caption || []) {
      surface.text(line, x + qrSize / 2, captionY, { size: base - 1, align: "center", bold: line === qr.caption[0] });
      captionY += (base - 1) * 1.3;
    }
    surface.y = Math.max(surface.y, captionY);
  }
  if (sheet.courtesy) {
    surface.y += 6;
    surface.paragraph(sheet.courtesy, surface.left, surface.width, { size: base - 0.5, gray: 0.35 });
  }
  surface.y += 8;
  surface.room(base * 2);
  surface.text(sheet.computerNote || "This is a computer generated invoice.", (surface.left + surface.right) / 2, surface.y, { size: base - 1, gray: 0.4, align: "center" });

  surface.pages.forEach((page, index) => {
    surface.page = page;
    if (!spec.height) return;
    surface.text("Powered by MyFinTracker", surface.left, spec.height - spec.margin + 4, { size: base - 2, gray: 0.5 });
    if (surface.pages.length > 1) surface.text(`Page ${index + 1} of ${surface.pages.length}`, surface.right, spec.height - spec.margin + 4, { size: base - 2, gray: 0.5, align: "right" });
  });
}

function drawThermal(model, surface, logo, qr) {
  const { spec } = surface;
  const base = spec.base;
  const center = spec.width / 2;
  const pos = Boolean(model.posSlip);
  const col = {
    qty: 28,
    price: 44,
    amount: 48,
  };
  const itemWidth = Math.max(48, surface.width - (col.qty + col.price + col.amount) - 4);
  const xQty = surface.left + itemWidth;
  const xPrice = xQty + col.qty;
  const xAmount = xPrice + col.price;
  const centered = (value, { size = base, bold = false, gray = 0 } = {}) => {
    for (const line of wrapText(value, size, surface.width, bold)) {
      surface.text(line, center, surface.y, { size, bold, gray, align: "center" });
      surface.y += size * 1.35;
    }
  };
  const pair = (label, value, { size = base, bold = false } = {}) => {
    const valueWidth = textWidth(value, size, bold);
    const labelLines = wrapText(label, size, Math.max(40, surface.width - valueWidth - 6), bold);
    labelLines.forEach((line, index) => {
      surface.text(line, surface.left, surface.y, { size, bold });
      if (index === 0) surface.text(value, surface.right, surface.y, { size, bold, align: "right" });
      surface.y += size * 1.35;
    });
  };
  const dashed = () => {
    surface.rule(surface.y + 2, { weight: 0.4, gray: 0.5 });
    surface.y += 7;
  };
  const itemHeader = () => {
    const size = base - 1;
    surface.text("Item", surface.left, surface.y, { size, bold: true });
    surface.text("Qty", xQty + col.qty, surface.y, { size, bold: true, align: "right" });
    surface.text("Price", xPrice + col.price, surface.y, { size, bold: true, align: "right" });
    surface.text("Amount", xAmount + col.amount, surface.y, { size, bold: true, align: "right" });
    surface.y += size * 1.4;
  };
  const itemRow = item => {
    const size = base - 0.5;
    const nameLines = wrapText(item.name || "Item", size, itemWidth - 2, true);
    nameLines.forEach((line, index) => {
      surface.text(line, surface.left, surface.y, { size, bold: true });
      if (index === 0) {
        surface.text(String(item.quantity || ""), xQty + col.qty, surface.y, { size, align: "right" });
        surface.text(String(item.rate || ""), xPrice + col.price, surface.y, { size, align: "right" });
        surface.text(String(item.amount || ""), xAmount + col.amount, surface.y, { size, align: "right" });
      }
      surface.y += size * 1.3;
    });
    if (item.discount) surface.paragraph(`Disc ${item.discount}`, surface.left, surface.width, { size: base - 1.5, gray: 0.4 });
    if (item.detail) surface.paragraph(item.detail, surface.left, surface.width, { size: base - 1.5, gray: 0.4 });
    surface.y += 1;
  };

  if (logo) {
    const scale = Math.min(spec.logo / logo.width, spec.logo / logo.height);
    surface.image(center - (logo.width * scale) / 2, surface.y, logo.width * scale, logo.height * scale);
    surface.y += logo.height * scale + 4;
  }
  if (pos) centered(model.title, { size: base, bold: true });
  centered(model.seller.name, { size: base + 3, bold: true });
  for (const line of model.seller.lines) centered(line, { size: base - 1 });
  dashed();
  if (!pos) centered(model.title, { size: base + 1, bold: true });
  if (pos) {
    surface.paragraph(`${model.partyHeading}: ${model.party.name}`, surface.left, surface.width, { size: base, bold: true });
    for (const line of model.party.lines) surface.paragraph(line, surface.left, surface.width, { size: base - 1 });
    for (const [label, value] of model.meta) pair(`${label}:`, value, { size: base - 0.5 });
  } else {
    for (const [label, value] of model.meta) pair(`${label}:`, value, { size: base - 0.5 });
    dashed();
    surface.text(`${model.partyHeading}:`, surface.left, surface.y, { size: base - 1, bold: true });
    surface.y += (base - 1) * 1.35;
    surface.paragraph(model.party.name, surface.left, surface.width, { size: base, bold: true });
    for (const line of model.party.lines) surface.paragraph(line, surface.left, surface.width, { size: base - 1 });
  }
  dashed();
  if (model.items.length) {
    if (pos) itemHeader();
    for (const item of model.items) {
      if (pos) {
        itemRow(item);
      } else {
        surface.paragraph(item.name, surface.left, surface.width, { size: base, bold: true });
        const detail = [`${item.quantity} x ${item.rate}`, item.discount ? `disc ${item.discount}` : "", item.gst].filter(Boolean).join("  ");
        pair(detail, item.amount, { size: base - 0.5 });
        if (item.detail) surface.paragraph(item.detail, surface.left, surface.width, { size: base - 1.5, gray: 0.4 });
        surface.y += 2;
      }
    }
  } else if (model.description) {
    surface.paragraph(model.description, surface.left, surface.width, { size: base });
  }
  dashed();
  if (pos && model.totalQty) {
    const sub = model.totals.find(row => String(row.label).toLowerCase().includes("sub"));
    if (sub) pair(`Total Qty: ${model.totalQty}`, `Sub Total: ${sub.value}`, { size: base - 0.5 });
    else pair("Total Qty", model.totalQty, { size: base - 0.5 });
  }
  for (const total of model.totals) {
    if (pos && model.totalQty && String(total.label).toLowerCase().includes("sub")) continue;
    pair(total.label, total.value, { size: total.bold ? base + 1.5 : base, bold: total.bold });
  }
  if (model.amountNote) surface.paragraph(model.amountNote, surface.left, surface.width, { size: base - 1, gray: 0.35 });
  if (pos && model.payment) {
    dashed();
    surface.text(model.payment.when || "", surface.left, surface.y, { size: base - 1 });
    surface.text(model.payment.method || "", center, surface.y, { size: base - 1, bold: true, align: "center" });
    surface.text(model.payment.amount || "", surface.right, surface.y, { size: base - 1, bold: true, align: "right" });
    surface.y += (base - 1) * 1.4;
  }
  if (qr) {
    dashed();
    surface.qr(qr.matrix, center - spec.qr / 2, surface.y, spec.qr);
    surface.y += spec.qr + 2;
    qr.caption.forEach((line, index) => centered(line, { size: base - 1, bold: index === 0 }));
  }
  for (const block of model.notes) {
    dashed();
    surface.text(block.heading, surface.left, surface.y, { size: base - 1, bold: true });
    surface.y += (base - 1) * 1.35;
    for (const line of block.lines) surface.paragraph(line, surface.left, surface.width, { size: base - 1.5 });
  }
  if (model.bankLines.length) {
    dashed();
    for (const line of model.bankLines) surface.paragraph(line, surface.left, surface.width, { size: base - 1.5 });
  }
  dashed();
  centered(model.footer, { size: base - 1, bold: pos });
  if (!pos) centered("Powered by MyFinTracker", { size: base - 2, gray: 0.5 });
  surface.page.height = Math.ceil(surface.y + spec.margin);
}

/**
 * Render a document model to a PDF binary string.
 * model: { title, meta: [[label, value]], seller: { name, lines, logoDataUrl }, partyHeading,
 *   party: { name, lines }, items: [{ name, detail, quantity, rate, discount, gst, amount }],
 *   description, totals: [{ label, value, bold }], amountNote, notes: [{ heading, lines }],
 *   bankLines, upi: { link, caption: [] } | null, footer }
 */
export function renderDocumentPdf(model, { template = "a4" } = {}) {
  const spec = PDF_TEMPLATES[template] || PDF_TEMPLATES.a4;
  const logo = decodeJpegDataUrl(model.seller?.logoDataUrl);
  let qr = null;
  if (model.upi?.link) {
    try {
      qr = { matrix: encodeQr(model.upi.link, { ecc: "M" }), caption: model.upi.caption || [] };
    } catch {
      qr = null;
    }
  }
  const normalized = {
    title: model.title || "DOCUMENT",
    posSlip: Boolean(model.posSlip),
    meta: model.meta || [],
    seller: { name: model.seller?.name || "MyFinTracker", lines: (model.seller?.lines || []).filter(Boolean) },
    partyHeading: model.partyHeading || "BILL TO",
    party: { name: model.party?.name || "", lines: (model.party?.lines || []).filter(Boolean) },
    items: model.items || [],
    description: model.description || "",
    totals: model.totals || [],
    totalQty: model.totalQty || "",
    payment: model.payment || null,
    amountNote: model.amountNote || "",
    notes: (model.notes || []).filter(block => block?.lines?.some(Boolean)).map(block => ({ heading: block.heading, lines: block.lines.filter(Boolean) })),
    bankLines: (model.bankLines || []).filter(Boolean),
    footer: model.footer || "Thank you for your business.",
    retail: model.retail || null,
  };
  const surface = createSurface(spec);
  if (spec.id === "thermal") drawThermal(normalized, surface, logo, qr);
  else if ((normalized.posSlip || model.retailLayout) && normalized.retail) drawRetailBill(normalized, surface, logo, qr);
  else if (model.layout === "tax" && model.taxSheet) drawTaxInvoice(model.taxSheet, surface, logo, qr);
  else drawSheet(normalized, surface, logo, qr);
  return serialize(surface.pages, { width: spec.width, logo });
}

export function pdfBinaryToBytes(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 0xff;
  return bytes;
}

export function downloadPdf(binary, filename) {
  const blob = new Blob([pdfBinaryToBytes(binary)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
