import { formatReceiptDate } from "../../receipts/model/receiptModel.js";

const PAGE = { width: 595, height: 842, left: 48, right: 547, top: 790, bottom: 48 };
const ascii = text => String(text ?? "").replace(/₹/g, "Rs.").replace(/[^\x20-\x7E]/g, "?");
const escapePdf = text => ascii(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

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

function layoutPartyStatement({
  party,
  partyBook = {},
  periodFrom = "",
  periodTo = "",
  company = {},
  money,
} = {}) {
  const commands = [];
  let y = PAGE.top;
  const m = typeof money === "function" ? money : value => `Rs.${Number(value || 0).toFixed(2)}`;
  const rows = partyBook.rows || [];

  commands.push(text("F2", 16, PAGE.left, y, String(company.name || company.legalName || "FinTrack").toUpperCase()));
  y -= 18;
  commands.push(text("F2", 12, PAGE.left, y, "PARTY STATEMENT OF ACCOUNT"));
  y -= 20;
  if (company.gstin) { commands.push(text("F1", 9, PAGE.left, y, `GSTIN: ${company.gstin}`)); y -= 12; }
  commands.push(text("F1", 9, PAGE.left, y, `Period: ${periodFrom || "—"} to ${periodTo || "—"}`));
  y -= 16;
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 18;
  commands.push(text("F2", 11, PAGE.left, y, "PARTY")); y -= 14;
  commands.push(text("F1", 11, PAGE.left, y, party?.name || "Party")); y -= 14;
  if (party?.phone) { commands.push(text("F1", 10, PAGE.left, y, `Phone: ${party.phone}`)); y -= 12; }
  if (party?.gstin) { commands.push(text("F1", 10, PAGE.left, y, `GSTIN: ${party.gstin}`)); y -= 12; }
  y -= 4;
  commands.push(text("F1", 10, PAGE.left, y, `Opening: ${m(partyBook.opening || 0)}`));
  commands.push(text("F1", 10, 320, y, `Closing: ${m(partyBook.closing ?? partyBook.outstanding ?? 0)}`));
  y -= 14;
  const periodInvoices = rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const periodPayments = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  commands.push(text("F1", 9, PAGE.left, y, `Invoices (period): ${m(periodInvoices)}`));
  commands.push(text("F1", 9, 320, y, `Payments (period): ${m(periodPayments)}`));
  y -= 18;
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 16;
  commands.push(text("F2", 9, PAGE.left, y, "Date"));
  commands.push(text("F2", 9, 100, y, "Voucher"));
  commands.push(text("F2", 9, 190, y, "Type"));
  commands.push(text("F2", 9, 250, y, "Narration"));
  commands.push(text("F2", 9, 400, y, "Debit"));
  commands.push(text("F2", 9, 470, y, "Credit"));
  y -= 12;
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 14;

  const maxRows = Math.min(rows.length, 28);
  for (let i = 0; i < maxRows; i += 1) {
    const row = rows[i];
    if (y < PAGE.bottom + 40) break;
    commands.push(text("F1", 8, PAGE.left, y, formatReceiptDate(row.date) || row.date || ""));
    commands.push(text("F1", 8, 100, y, String(row.voucherNumber || "").slice(0, 12)));
    commands.push(text("F1", 8, 190, y, String(row.voucherType || "").slice(0, 8)));
    commands.push(text("F1", 8, 250, y, String(row.narration || "—").slice(0, 22)));
    commands.push(text("F1", 8, 400, y, row.debit ? m(row.debit) : ""));
    commands.push(text("F1", 8, 470, y, row.credit ? m(row.credit) : ""));
    y -= 12;
  }
  if (rows.length > maxRows) {
    y -= 4;
    commands.push(text("F1", 8, PAGE.left, y, `… and ${rows.length - maxRows} more lines in FinTrack`));
    y -= 14;
  }
  y -= 8;
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 16;
  commands.push(text("F1", 9, PAGE.left, y, "Generated from FinTrack Accounts. Not a tax invoice."));
  return [commands];
}

export function renderPartyStatementPdf(payload) {
  return buildPdf(layoutPartyStatement(payload));
}

export function downloadPartyStatementPdf(payload) {
  const pdf = renderPartyStatementPdf(payload);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = String(payload?.party?.name || "party").replace(/[^\w\-]+/g, "_").slice(0, 40);
  a.download = `fintrack-statement-${safeName}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
