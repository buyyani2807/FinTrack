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

const zipStore = files => {
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

const isNumericCell = value => typeof value === "number" && Number.isFinite(value);

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

const PAGE = { width: 595, height: 842, left: 36, right: 559, top: 800, bottom: 48 };
const ascii = text => String(text ?? "").replace(/₹/g, "Rs.").replace(/[^\x20-\x7E]/g, "?");
const escapePdf = text => ascii(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const clip = (value, max) => {
  const text = ascii(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}.`;
};

function pdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function buildPdf(pages) {
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
    objs[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
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

const text = (font, size, x, y, value) => `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`;
const line = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S`;

export function renderAccountsPdf({ title = "FinTrack report", subtitle = "", rows = [] } = {}) {
  const table = rows.length ? rows : [["No rows"]];
  const cols = Math.max(1, ...table.map(row => row.length));
  const usable = PAGE.right - PAGE.left;
  const widths = Array.from({ length: cols }, (_, index) => (index === 0 ? Math.round(usable * 0.28) : Math.round(usable / cols)));
  widths[widths.length - 1] = usable - widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
  const charBudget = widths.map(width => Math.max(6, Math.floor(width / 5.2)));
  const pages = [];
  const headerHeight = 56;
  const rowHeight = 14;
  const rowsPerPage = Math.max(8, Math.floor((PAGE.top - PAGE.bottom - headerHeight) / rowHeight) - 1);
  const chunks = [];
  const body = table.slice(1);
  const header = table[0] || [];
  for (let i = 0; i < body.length; i += rowsPerPage) chunks.push(body.slice(i, i + rowsPerPage));
  if (!chunks.length) chunks.push([]);
  chunks.forEach((chunk, pageIndex) => {
    const commands = [];
    let y = PAGE.top;
    commands.push(text("F2", 14, PAGE.left, y, clip(title, 70)));
    y -= 16;
    if (subtitle) {
      commands.push(text("F1", 9, PAGE.left, y, clip(subtitle, 90)));
      y -= 14;
    }
    commands.push(text("F1", 8, PAGE.left, y, `Page ${pageIndex + 1} of ${chunks.length}`));
    y -= 12;
    commands.push(line(PAGE.left, y, PAGE.right, y));
    y -= 16;
    const paintRow = (row, bold) => {
      let x = PAGE.left;
      (row || []).forEach((cell, index) => {
        commands.push(text(bold ? "F2" : "F1", 8, x, y, clip(cell, charBudget[index] || 10)));
        x += widths[index] || 0;
      });
      y -= rowHeight;
    };
    paintRow(header, true);
    commands.push(line(PAGE.left, y + 8, PAGE.right, y + 8));
    chunk.forEach(row => paintRow(row, false));
    pages.push(commands);
  });
  return buildPdf(pages);
}

const triggerDownload = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export function downloadAccountsCsv(filename, rows) {
  const csvCell = value => {
    const textValue = String(value ?? "");
    return /[",\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
  };
  const csv = (rows || []).map(row => row.map(csvCell).join(",")).join("\r\n");
  triggerDownload(filename, new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
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
