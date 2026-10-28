const XLSX_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const OD_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[i] = crc >>> 0;
  }
  return table;
})();

const crc32 = bytes => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = parts => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const u16 = value => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
};

const u32 = value => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
};

const encodeUtf8 = text => new TextEncoder().encode(text);

export const zipStore = files => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = encodeUtf8(file.name);
    const data = typeof file.data === "string" ? encodeUtf8(file.data) : file.data;
    const crc = crc32(data);
    const local = concatBytes([
      encodeUtf8("PK\u0003\u0004"), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      name, data,
    ]);
    const central = concatBytes([
      encodeUtf8("PK\u0001\u0002"), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concatBytes(centrals);
  const end = concatBytes([
    encodeUtf8("PK\u0005\u0006"), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDir.length), u32(offset), u16(0),
  ]);
  return concatBytes([...locals, centralDir, end]);
};

const xmlText = value => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const colLetter = index => {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
};

const isNumericCell = value => {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  const text = String(value ?? "").trim();
  return text !== "" && /^-?\d+(\.\d+)?$/.test(text);
};

export function buildAccountsXlsx(rows = []) {
  const sheetRows = (rows || []).map((row, rowIndex) => {
    const cells = (row || []).map((value, colIndex) => {
      const ref = `${colLetter(colIndex)}${rowIndex + 1}`;
      if (isNumericCell(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      const numeric = typeof value === "string" && value !== "" && /^-?\d+(\.\d+)?$/.test(value);
      if (numeric) return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlText(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="${XLSX_NS}"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="${XLSX_NS}" xmlns:r="${OD_REL}"><sheets>`
    + `<sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="${PKG_REL}">`
    + `<Relationship Id="rId1" Type="${OD_REL}/worksheet" Target="worksheets/sheet1.xml"/>`
    + `</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="${PKG_REL}">`
    + `<Relationship Id="rId1" Type="${OD_REL}/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + `</Types>`;
  return zipStore([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}

const PORTRAIT = { width: 595, height: 842, left: 28, right: 567, top: 806, bottom: 40 };
const LANDSCAPE = { width: 842, height: 595, left: 24, right: 818, top: 562, bottom: 28 };

const HEADER_SHORT = {
  "Invoice date": "Inv date",
  "Due date": "Due",
  "Days outstanding": "Days out",
  "Days overdue": "Overdue",
  "Sales amount (₹)": "Sales",
  "Purchase amount (₹)": "Purchase",
  "Amount (₹)": "Amount",
  "Debit (₹)": "Debit",
  "Credit (₹)": "Credit",
  "Balance (₹)": "Balance",
  "HSN / SAC": "HSN",
  "Narration": "Narration",
  "Direction": "Dir",
  "Internal transfers (excluded from inflow/outflow)": "Transfers (excluded)",
};

const ascii = text => String(text ?? "")
  .replace(/₹/g, "Rs.")
  .replace(/[·•–—]/g, "-")
  .replace(/[^\x20-\x7E]/g, "?");
const escapePdf = text => ascii(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const clip = (value, max) => {
  const text = ascii(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}.`;
};
const cellLen = value => Math.min(ascii(value).length || 1, 32);

function pdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function buildPdf(pages, page) {
  const objs = {};
  const fontId = 1;
  const boldId = 2;
  const pagesId = 3;
  const catalogId = 4;
  let nextId = 5;
  objs[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[boldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const pageIds = [];
  pages.forEach(commands => {
    const stream = commands.join("\n");
    const contentId = nextId++;
    objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    const pageId = nextId++;
    objs[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  });
  objs[pagesId] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objs[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const maxId = nextId - 1;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = body.length;
    body += pdfObject(id, objs[id]);
  }
  const xrefStart = body.length;
  body += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return body;
}

const text = (font, size, x, y, value) => `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(value)}) Tj ET`;
const line = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S`;

function choosePage(cols) {
  return cols >= 6 ? LANDSCAPE : PORTRAIT;
}

function columnWidths(page, table, cols) {
  const usable = page.right - page.left;
  const sample = table.slice(0, Math.min(table.length, 50));
  const weights = Array.from({ length: cols }, (_, col) => {
    let weight = 4;
    for (const row of sample) weight = Math.max(weight, cellLen(row?.[col]));
    if (col === 0) weight = Math.max(weight, 10);
    return weight;
  });
  const sum = weights.reduce((total, value) => total + value, 0) || cols;
  const widths = weights.map(weight => Math.max(26, Math.floor((weight / sum) * usable)));
  let used = widths.slice(0, -1).reduce((total, value) => total + value, 0);
  widths[cols - 1] = Math.max(26, usable - used);
  used = widths.reduce((total, value) => total + value, 0);
  if (used > usable) {
    const scale = usable / used;
    for (let i = 0; i < cols - 1; i += 1) widths[i] = Math.max(22, Math.floor(widths[i] * scale));
    widths[cols - 1] = usable - widths.slice(0, -1).reduce((total, value) => total + value, 0);
  }
  return widths;
}

function compactHeaderRow(header = []) {
  return header.map(cell => HEADER_SHORT[String(cell ?? "")] || cell);
}

/** Shared table PDF used by Accounts reports, Expenses, Ledger, and GST packs. */
export function renderAccountsPdf({ title = "FinTrack report", subtitle = "", rows = [] } = {}) {
  const raw = rows.length ? rows : [["No rows"]];
  const cols = Math.max(1, ...raw.map(row => row.length));
  const page = choosePage(cols);
  const fontSize = cols >= 9 ? 6.5 : cols >= 6 ? 7 : 8;
  const charUnit = fontSize * 0.52;
  const header = compactHeaderRow(raw[0] || []);
  const body = raw.slice(1);
  const table = [header, ...body];
  const widths = columnWidths(page, table, cols);
  const numericCols = Array.from({ length: cols }, (_, col) => {
    const headerText = String(header[col] || "").toLowerCase();
    if (/(amount|paid|outstanding|debit|credit|balance|qty|rate|cgst|sgst|igst|taxable|inflow|outflow|net|sales|purchase|overdue|days)/.test(headerText)) {
      return true;
    }
    let numeric = 0;
    let seen = 0;
    for (const row of body.slice(0, 30)) {
      const value = row?.[col];
      if (value === "" || value == null) continue;
      seen += 1;
      if (isNumericCell(value)) numeric += 1;
    }
    return seen > 0 && numeric / seen >= 0.7;
  });
  const charBudget = widths.map(width => Math.max(4, Math.floor(width / charUnit)));
  const headerHeight = 52;
  const rowHeight = fontSize + 6;
  const rowsPerPage = Math.max(6, Math.floor((page.top - page.bottom - headerHeight) / rowHeight) - 1);
  const chunks = [];
  for (let i = 0; i < body.length; i += rowsPerPage) chunks.push(body.slice(i, i + rowsPerPage));
  if (!chunks.length) chunks.push([]);
  const titleBudget = Math.floor((page.right - page.left) / (14 * 0.5));
  const subtitleBudget = Math.floor((page.right - page.left) / (9 * 0.5));
  const pages = chunks.map((chunk, pageIndex) => {
    const commands = [];
    let y = page.top;
    commands.push(text("F2", 13, page.left, y, clip(title, titleBudget)));
    y -= 15;
    if (subtitle) {
      commands.push(text("F1", 8, page.left, y, clip(ascii(subtitle), subtitleBudget)));
      y -= 12;
    }
    commands.push(text("F1", 7, page.left, y, `Page ${pageIndex + 1} of ${chunks.length}`));
    y -= 10;
    commands.push(line(page.left, y, page.right, y));
    y -= 14;
    const paintRow = (row, bold) => {
      let x = page.left;
      for (let index = 0; index < cols; index += 1) {
        const width = widths[index] || 0;
        const rawCell = row?.[index];
        const shown = clip(rawCell, charBudget[index] || 4);
        const size = bold ? fontSize : fontSize;
        if (numericCols[index] && shown) {
          const approx = shown.length * charUnit;
          const drawX = Math.max(x, x + width - approx - 2);
          commands.push(text(bold ? "F2" : "F1", size, drawX, y, shown));
        } else {
          commands.push(text(bold ? "F2" : "F1", size, x, y, shown));
        }
        x += width;
      }
      y -= rowHeight;
    };
    paintRow(header, true);
    commands.push(line(page.left, y + 6, page.right, y + 6));
    chunk.forEach(row => {
      const label = String(row?.[0] ?? "").toLowerCase();
      const emphasize = /^(total|net |income|expenses|stock|assets|liabilit|equity|inflow|outflow|balanced|difference)/i.test(label)
        || (row || []).filter(cell => cell !== "" && cell != null).length === 1;
      paintRow(row, emphasize);
    });
    return commands;
  });
  return buildPdf(pages, page);
}

const triggerDownload = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/** CSV text with a UTF-8 BOM so Excel opens rupee symbols and Indian names correctly. */
export function accountsCsvText(rows) {
  const csvCell = value => {
    const textValue = String(value ?? "");
    return /[",\r\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
  };
  return "\ufeff" + (rows || []).map(row => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadAccountsCsv(filename, rows) {
  triggerDownload(filename, new Blob([accountsCsvText(rows)], { type: "text/csv;charset=utf-8" }));
}

export function downloadAccountsZip(filename, files) {
  triggerDownload(filename, new Blob([zipStore(files)], { type: "application/zip" }));
}

export function downloadAccountsExcel(filename, rows) {
  const bytes = buildAccountsXlsx(rows);
  const name = String(filename || "fintrack-report.xlsx").replace(/\.(csv|xls)$/i, ".xlsx");
  triggerDownload(name.endsWith(".xlsx") ? name : `${name}.xlsx`, new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
}

export function downloadAccountsPdf(filename, { title, subtitle, rows } = {}) {
  const pdf = renderAccountsPdf({ title, subtitle, rows });
  const name = String(filename || "fintrack-report.pdf").replace(/\.(csv|xls|xlsx)$/i, ".pdf");
  triggerDownload(name.endsWith(".pdf") ? name : `${name}.pdf`, new Blob([pdf], { type: "application/pdf" }));
}
