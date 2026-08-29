import { formatReceiptDate } from "./receiptModel.js";

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

function layoutReceipt(receipt) {
  const commands = [];
  let y = PAGE.top;
  const m = receipt.money;
  commands.push(text("F2", 16, PAGE.left, y, receipt.companyName.toUpperCase()));
  y -= 18;
  commands.push(text("F2", 12, PAGE.left, y, "PAYMENT RECEIPT"));
  y -= 24;
  if (receipt.companyAddress) { commands.push(text("F1", 9, PAGE.left, y, receipt.companyAddress)); y -= 12; }
  if (receipt.companyPhone) { commands.push(text("F1", 9, PAGE.left, y, `Phone: ${receipt.companyPhone}`)); y -= 12; }
  if (receipt.companyEmail) { commands.push(text("F1", 9, PAGE.left, y, `Email: ${receipt.companyEmail}`)); y -= 16; }
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 18;
  commands.push(text("F1", 10, PAGE.left, y, `Receipt No: ${receipt.receiptNumber}`));
  commands.push(text("F1", 10, 320, y, `Date: ${formatReceiptDate(receipt.paymentDate)}`));
  y -= 14;
  commands.push(text("F1", 10, PAGE.left, y, `Time: ${receipt.paymentTime}`));
  y -= 22;
  commands.push(text("F2", 11, PAGE.left, y, "CUSTOMER")); y -= 16;
  commands.push(text("F1", 11, PAGE.left, y, receipt.customerName)); y -= 14;
  if (receipt.customerPhone) { commands.push(text("F1", 10, PAGE.left, y, `Phone: ${receipt.customerPhone}`)); y -= 18; }
  commands.push(text("F2", 11, PAGE.left, y, "ACCOUNT")); y -= 16;
  commands.push(text("F1", 10, PAGE.left, y, `Account ID: ${receipt.accountId}`)); y -= 14;
  commands.push(text("F1", 10, PAGE.left, y, `Finance Type: ${receipt.financeType}`)); y -= 18;
  if (receipt.schemeName) {
    commands.push(text("F1", 10, PAGE.left, y, `Scheme: ${receipt.schemeName}`)); y -= 14;
    if (receipt.chitFields?.month) {
      commands.push(text("F1", 10, PAGE.left, y, `Month: ${receipt.chitFields.month} of ${receipt.chitFields.totalMonths}`)); y -= 14;
    }
  }
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 18;
  commands.push(text("F2", 11, PAGE.left, y, "PAYMENT")); y -= 18;
  row("Amount Paid:", m(receipt.amount), y).forEach(c => commands.push(c)); y -= 14;
  if (receipt.splitPayment) {
    row("Cash:", m(receipt.cashAmount), y).forEach(c => commands.push(c)); y -= 14;
    row("UPI:", m(receipt.upiAmount), y).forEach(c => commands.push(c)); y -= 14;
  }
  row("Payment Mode:", receipt.paymentMode, y).forEach(c => commands.push(c)); y -= 14;
  row("Previous Balance:", m(receipt.previousBalance), y).forEach(c => commands.push(c)); y -= 14;
  row("Remaining Balance:", m(receipt.remainingBalance), y).forEach(c => commands.push(c)); y -= 14;
  if (receipt.dailyFields) {
    row("Daily Collection:", m(receipt.dailyFields.dailyCollection), y).forEach(c => commands.push(c)); y -= 14;
    row("Day Progress:", `Day ${receipt.dailyFields.daysCompleted} of 100`, y).forEach(c => commands.push(c)); y -= 14;
  }
  if (receipt.monthlyFields) {
    if (receipt.monthlyFields.interestPaid) { row("Interest Paid:", m(receipt.monthlyFields.interestPaid), y).forEach(c => commands.push(c)); y -= 14; }
    if (receipt.monthlyFields.principalPaid) { row("Principal Paid:", m(receipt.monthlyFields.principalPaid), y).forEach(c => commands.push(c)); y -= 14; }
    if (receipt.monthlyFields.penaltyPaid) { row("Penalty Paid:", m(receipt.monthlyFields.penaltyPaid), y).forEach(c => commands.push(c)); y -= 14; }
  }
  y -= 8;
  commands.push(text("F2", 10, PAGE.left, y, "Collected By:")); y -= 14;
  commands.push(text("F1", 11, PAGE.left, y, receipt.collectedBy)); y -= 14;
  commands.push(text("F1", 10, PAGE.left, y, receipt.collectedByRole)); y -= 24;
  commands.push(line(PAGE.left, y, PAGE.right, y)); y -= 16;
  commands.push(text("F1", 10, PAGE.left, y, receipt.receiptFooter)); y -= 14;
  if (receipt.receiptTerms) { commands.push(text("F1", 8, PAGE.left, y, receipt.receiptTerms)); }
  commands.push(text("F1", 8, PAGE.left, 36, "Powered by FinTrack"));
  return [commands];
}

export function renderReceiptPdf(receipt) {
  return buildPdf(layoutReceipt(receipt));
}

export function downloadReceiptPdf(receipt) {
  const pdf = renderReceiptPdf(receipt);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `receipt-${receipt.receiptNumber || receipt.paymentId}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
