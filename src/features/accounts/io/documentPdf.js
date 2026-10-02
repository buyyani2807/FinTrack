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
    text(value, x, top, { size = spec.base, bold = false, align = "left", gray = 0 } = {}) {
      const safe = escapePdf(value);
      if (!safe) return;
      const w = textWidth(value, size, bold);
      const startX = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      const color = gray ? `${gray} g ` : "";
      surface.page.ops.push(h => `${color}BT /${bold ? "F2" : "F1"} ${fmt(size)} Tf ${fmt(startX)} ${fmt(h - top - size * 0.8)} Td (${safe}) Tj ET${gray ? " 0 g" : ""}`);
    },
    rule(top, { x1 = surface.left, x2 = surface.right, weight = 0.5, gray = 0.6 } = {}) {
      surface.page.ops.push(h => `${gray} G ${weight} w ${fmt(x1)} ${fmt(h - top)} m ${fmt(x2)} ${fmt(h - top)} l S 0 G`);
    },
    fill(x, top, w, height, gray = 0.94) {
      surface.page.ops.push(h => `${gray} g ${fmt(x)} ${fmt(h - top - height)} ${fmt(w)} ${fmt(height)} re f 0 g`);
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
    paragraph(value, x, maxWidth, { size = spec.base, bold = false, gray = 0, lineGap = 1.35 } = {}) {
      for (const line of wrapText(value, size, maxWidth, bold)) {
        surface.room(size * lineGap);
        surface.text(line, x, surface.y, { size, bold, gray });
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
      surface.fill(surface.left, surface.y, surface.width, base * 2, 0.92);
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
    surface.text("Powered by FinTrack", surface.left, spec.height - spec.margin + 4, { size: base - 2, gray: 0.5 });
    if (surface.pages.length > 1) surface.text(`Page ${index + 1} of ${surface.pages.length}`, surface.right, spec.height - spec.margin + 4, { size: base - 2, gray: 0.5, align: "right" });
  });
}

function drawThermal(model, surface, logo, qr) {
  const { spec } = surface;
  const base = spec.base;
  const center = spec.width / 2;
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

  if (logo) {
    const scale = Math.min(spec.logo / logo.width, spec.logo / logo.height);
    surface.image(center - (logo.width * scale) / 2, surface.y, logo.width * scale, logo.height * scale);
    surface.y += logo.height * scale + 4;
  }
  centered(model.seller.name, { size: base + 3, bold: true });
  for (const line of model.seller.lines) centered(line, { size: base - 1 });
  dashed();
  centered(model.title, { size: base + 1, bold: true });
  for (const [label, value] of model.meta) pair(`${label}:`, value, { size: base - 0.5 });
  dashed();
  surface.text(`${model.partyHeading}:`, surface.left, surface.y, { size: base - 1, bold: true });
  surface.y += (base - 1) * 1.35;
  surface.paragraph(model.party.name, surface.left, surface.width, { size: base, bold: true });
  for (const line of model.party.lines) surface.paragraph(line, surface.left, surface.width, { size: base - 1 });
  dashed();
  if (model.items.length) {
    for (const item of model.items) {
      surface.paragraph(item.name, surface.left, surface.width, { size: base, bold: true });
      const detail = [`${item.quantity} x ${item.rate}`, item.discount ? `disc ${item.discount}` : "", item.gst].filter(Boolean).join("  ");
      pair(detail, item.amount, { size: base - 0.5 });
      if (item.detail) surface.paragraph(item.detail, surface.left, surface.width, { size: base - 1.5, gray: 0.4 });
      surface.y += 2;
    }
  } else if (model.description) {
    surface.paragraph(model.description, surface.left, surface.width, { size: base });
  }
  dashed();
  for (const total of model.totals) pair(total.label, total.value, { size: total.bold ? base + 1.5 : base, bold: total.bold });
  if (model.amountNote) surface.paragraph(model.amountNote, surface.left, surface.width, { size: base - 1, gray: 0.35 });
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
  centered(model.footer, { size: base - 1 });
  centered("Powered by FinTrack", { size: base - 2, gray: 0.5 });
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
    meta: model.meta || [],
    seller: { name: model.seller?.name || "FinTrack", lines: (model.seller?.lines || []).filter(Boolean) },
    partyHeading: model.partyHeading || "BILL TO",
    party: { name: model.party?.name || "", lines: (model.party?.lines || []).filter(Boolean) },
    items: model.items || [],
    description: model.description || "",
    totals: model.totals || [],
    amountNote: model.amountNote || "",
    notes: (model.notes || []).filter(block => block?.lines?.some(Boolean)).map(block => ({ heading: block.heading, lines: block.lines.filter(Boolean) })),
    bankLines: (model.bankLines || []).filter(Boolean),
    footer: model.footer || "Thank you for your business.",
  };
  const surface = createSurface(spec);
  if (spec.id === "thermal") drawThermal(normalized, surface, logo, qr);
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
