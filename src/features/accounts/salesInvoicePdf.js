import { formatReceiptDate } from "../receipts/receiptModel.js";

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
const row = (label, value, y) => [
  text("F1", 10, PAGE.left, y, label),
  text("F2", 10, 320, y, value),
];

function layoutSalesInvoice(invoice) {
  const commands = [];
  let y = PAGE.top;
  const m = invoice.money;
  commands.push(text("F2", 16, PAGE.left, y, String(invoice.companyName || "FinTrack").toUpperCase()));
  y -= 18;
  commands.push(text("F2", 12, PAGE.left, y, "SALES INVOICE"));
  y -= 24;
  if (invoice.companyLegalName) { commands.push(text("F1", 9, PAGE.left, y, `Legal name: ${invoice.companyLegalName}`)); y -= 12; }
  if (invoice.companyAddress) { commands.push(text("F1", 9, PAGE.left, y, invoice.companyAddress)); y -= 12; }
  if (invoice.companyGstin) { commands.push(text("F1", 9, PAGE.left, y, `GSTIN: ${invoice.companyGstin}`)); y -= 12; }
  if (invoice.companyPhone) { commands.push(text("F1", 9, PAGE.left, y, `Phone: ${invoice.companyPhone}`)); y -= 12; }
  if (invoice.companyEmail) { commands.push(text("F1", 9, PAGE.left, y, `Email: ${invoice.companyEmail}`)); y -= 16; }
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 18;
  commands.push(text("F1", 10, PAGE.left, y, `Invoice No: ${invoice.invoiceNumber}`));
  commands.push(text("F1", 10, 320, y, `Date: ${formatReceiptDate(invoice.invoiceDate)}`));
  y -= 14;
  commands.push(text("F1", 10, PAGE.left, y, `Due: ${formatReceiptDate(invoice.dueDate)}`));
  commands.push(text("F1", 10, 320, y, `Settlement: ${invoice.settlement || "—"}`));
  y -= 22;
  commands.push(text("F2", 11, PAGE.left, y, "BILL TO")); y -= 16;
  commands.push(text("F1", 11, PAGE.left, y, invoice.customerName || "Customer")); y -= 14;
  if (invoice.customerPhone) { commands.push(text("F1", 10, PAGE.left, y, `Phone: ${invoice.customerPhone}`)); y -= 14; }
  if (invoice.customerGstin) { commands.push(text("F1", 10, PAGE.left, y, `GSTIN: ${invoice.customerGstin}`)); y -= 14; }
  if (invoice.customerAddress) { commands.push(text("F1", 10, PAGE.left, y, invoice.customerAddress)); y -= 14; }
  y -= 4;
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 18;
  commands.push(text("F2", 11, PAGE.left, y, "AMOUNT")); y -= 18;
  if (invoice.tax > 0) {
    row("Taxable:", m(invoice.taxable), y).forEach(c => commands.push(c)); y -= 14;
    if (invoice.cgst) { row("CGST:", m(invoice.cgst), y).forEach(c => commands.push(c)); y -= 14; }
    if (invoice.sgst) { row("SGST:", m(invoice.sgst), y).forEach(c => commands.push(c)); y -= 14; }
    if (invoice.igst) { row("IGST:", m(invoice.igst), y).forEach(c => commands.push(c)); y -= 14; }
  }
  row("Invoice total:", m(invoice.amount), y).forEach(c => commands.push(c)); y -= 14;
  if (invoice.outstanding != null && invoice.outstanding !== invoice.amount) {
    row("Outstanding:", m(invoice.outstanding), y).forEach(c => commands.push(c)); y -= 14;
  }
  if (invoice.hsnSac) { row("HSN/SAC:", invoice.hsnSac, y).forEach(c => commands.push(c)); y -= 14; }
  if (invoice.narration) {
    y -= 8;
    commands.push(text("F2", 10, PAGE.left, y, "Narration")); y -= 14;
    commands.push(text("F1", 10, PAGE.left, y, invoice.narration)); y -= 18;
  }
  if (invoice.itemLines?.length) {
    y -= 4;
    commands.push(text("F2", 11, PAGE.left, y, "ITEMS")); y -= 16;
    for (const line of invoice.itemLines.slice(0, 18)) {
      commands.push(text("F1", 9, PAGE.left, y, `${line.quantity} ${line.unit || ""} ${line.name} @ ${m(line.rate)} = ${m(line.amount)}`));
      y -= 12;
      if (y < 80) break;
    }
  }
  y -= 8;
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 16;
  commands.push(text("F1", 10, PAGE.left, y, invoice.receiptFooter || "Thank you for your business.")); y -= 14;
  if (invoice.receiptTerms) { commands.push(text("F1", 8, PAGE.left, y, invoice.receiptTerms)); }
  commands.push(text("F1", 8, PAGE.left, 36, "Powered by FinTrack"));
  return [commands];
}

export function renderSalesInvoicePdf(invoice) {
  return buildPdf(layoutSalesInvoice(invoice));
}

export function downloadSalesInvoicePdf(invoice) {
  const pdf = renderSalesInvoicePdf(invoice);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${invoice.invoiceNumber || "sales-invoice"}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
