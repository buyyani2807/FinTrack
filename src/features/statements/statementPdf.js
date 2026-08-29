import { formatReceiptDate } from "../receipts/receiptModel.js";

const PAGE = { width: 595, height: 842, left: 40, right: 555, top: 800, bottom: 48 };
const ascii = text => String(text ?? "").replace(/₹/g, "Rs.").replace(/·/g, "|").replace(/[^\x20-\x7E]/g, "?");
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
const rect = (x, y, w, h) => `${x} ${y} ${w} ${h} re S`;

const FINANCE_COLS = [
  { label: "Date", x: 48, width: 78 },
  { label: "Amount", x: 126, width: 68 },
  { label: "Mode", x: 194, width: 128 },
  { label: "Collected By", x: 322, width: 110 },
  { label: "Balance", x: 432, width: 115 },
];

const CHIT_COLS = [
  { label: "Month", x: 48, width: 62 },
  { label: "Due Date", x: 110, width: 78 },
  { label: "Amount", x: 188, width: 68 },
  { label: "Mode", x: 256, width: 78 },
  { label: "Status", x: 334, width: 78 },
  { label: "Notes", x: 412, width: 135 },
];

const ROW_H = 18;
const HEADER_H = 20;

function clip(value, max = 22) {
  const textValue = String(value || "—");
  return textValue.length > max ? `${textValue.slice(0, max - 1)}.` : textValue;
}

function drawBankTable(commands, cols, rows, topY) {
  const tableLeft = PAGE.left;
  const tableWidth = PAGE.right - PAGE.left;
  const tableHeight = HEADER_H + rows.length * ROW_H;
  const bottomY = topY - tableHeight;

  // Outer border
  commands.push(rect(tableLeft, bottomY, tableWidth, tableHeight));

  // Header bottom line
  commands.push(line(tableLeft, topY - HEADER_H, PAGE.right, topY - HEADER_H));

  // Vertical column dividers
  let x = tableLeft;
  cols.slice(0, -1).forEach(col => {
    x += col.width;
    commands.push(line(x, bottomY, x, topY));
  });

  // Horizontal row dividers
  for (let i = 1; i < rows.length; i += 1) {
    const rowY = topY - HEADER_H - i * ROW_H;
    commands.push(line(tableLeft, rowY, PAGE.right, rowY));
  }

  // Header labels
  const headerTextY = topY - 13;
  cols.forEach(col => {
    commands.push(text("F2", 8, col.x, headerTextY, col.label));
  });

  // Data cells
  rows.forEach((cells, index) => {
    const textY = topY - HEADER_H - index * ROW_H - 12;
    cells.forEach((value, colIndex) => {
      const col = cols[colIndex];
      commands.push(text("F1", 8, col.x, textY, value));
    });
  });

  return bottomY;
}

function layoutCustomerStatement(bundle) {
  const money = bundle.money;
  const pages = [];
  let commands = [];
  let y = PAGE.top;
  const ensure = needed => {
    if (y - needed < PAGE.bottom) {
      pages.push(commands);
      commands = [];
      y = PAGE.top;
      commands.push(text("F2", 10, PAGE.left, y, `${bundle.companyName} | Customer Statement | ${bundle.customerName}`));
      y -= 24;
    }
  };
  const row = (label, value) => {
    ensure(16);
    commands.push(text("F1", 10, PAGE.left, y, label));
    commands.push(text("F2", 10, 320, y, value));
    y -= 14;
  };
  const heading = label => {
    ensure(28);
    commands.push(text("F2", 12, PAGE.left, y, label));
    y -= 8;
    commands.push(line(PAGE.left, y, PAGE.right, y));
    y -= 16;
  };
  const renderTableChunked = (cols, allRows) => {
    if (!allRows.length) return;
    const maxRowsPerChunk = Math.max(1, Math.floor((y - PAGE.bottom - 40) / ROW_H) - 1);
    for (let start = 0; start < allRows.length; start += maxRowsPerChunk) {
      const chunk = allRows.slice(start, start + maxRowsPerChunk);
      const needed = HEADER_H + chunk.length * ROW_H + 16;
      ensure(needed);
      if (start > 0) {
        commands.push(text("F2", 9, PAGE.left, y, "Payment History (continued)"));
        y -= 14;
      }
      y = drawBankTable(commands, cols, chunk, y) - 12;
    }
  };

  commands.push(text("F2", 16, PAGE.left, y, String(bundle.companyName || "FinTrack").toUpperCase()));
  y -= 16;
  commands.push(text("F2", 13, PAGE.left, y, "CUSTOMER STATEMENT"));
  y -= 18;
  if (bundle.companyAddress) { commands.push(text("F1", 9, PAGE.left, y, bundle.companyAddress)); y -= 12; }
  if (bundle.companyPhone) { commands.push(text("F1", 9, PAGE.left, y, `Phone: ${bundle.companyPhone}`)); y -= 12; }
  commands.push(text("F1", 9, PAGE.left, y, `Statement As Of: ${formatReceiptDate(bundle.asOf)}`));
  y -= 20;
  commands.push(line(PAGE.left, y, PAGE.right, y));
  y -= 18;

  heading("CUSTOMER");
  row("Customer Name", bundle.customerName || "—");
  row("Phone", bundle.phone || "—");
  if (bundle.address) row("Address", bundle.address);
  row("Customer ID", bundle.customerId || "—");
  y -= 8;

  bundle.accounts.forEach((account, index) => {
    heading(account.type === "chit"
      ? `CHIT FUND · ${account.scheme?.name || "Scheme"}`
      : `${String(account.financeType || "ACCOUNT").toUpperCase()} · ${account.accountId}`);
    if (index > 0) y -= 2;

    if (account.type === "chit") {
      row("Finance Type", "Chit Fund");
      row("Chit Type", account.scheme.chitTypeLabel || "Auction");
      row("Chit Scheme", account.scheme.name);
      row("Account ID", account.accountId || "—");
      row("Chit Value", money(account.scheme.chitValue));
      row("Total Members", String(account.scheme.memberCount || "—"));
      row("Installment", money(account.summary.installment));
      row("Total Months", String(account.scheme.totalMonths || "—"));
      row("Months Paid", String(account.summary.monthsPaid));
      row("Months Remaining", String(account.summary.monthsRemaining));
      row("Total Paid", money(account.summary.totalPaid));
      row("Outstanding", money(account.summary.outstanding));
      row("Status", String(account.summary.status || "").toUpperCase());
      if (account.bid?.isWinner) {
        y -= 4;
        commands.push(text("F2", 10, PAGE.left, y, "Bid / Lift Information"));
        y -= 14;
        row("Bid Winner", "Yes");
        row("Winning Month", account.bid.winningMonth ? `Month ${account.bid.winningMonth}` : "—");
        row("Winning Bid / Lift", money(account.bid.winningBid));
        if (account.bid.discount) row("Discount", money(account.bid.discount));
        if (account.bid.managerCommission) row("Commission", money(account.bid.managerCommission));
        if (account.bid.distributable) row("Distributable", money(account.bid.distributable));
        if (account.bid.dividendPerMember) row("Dividend / Member", money(account.bid.dividendPerMember));
        if (account.bid.amountPaidToMember) row("Amount to Member", money(account.bid.amountPaidToMember));
      }
      y -= 6;
      commands.push(text("F2", 10, PAGE.left, y, "Payment History"));
      y -= 14;
      if (!account.payments.length) {
        ensure(14);
        commands.push(text("F1", 9, PAGE.left, y, "No payment rows for this statement date."));
        y -= 14;
      } else {
        const tableRows = account.payments.map(payment => [
          payment.month ? `Month ${payment.month}` : "—",
          formatReceiptDate(payment.dueDate) || "—",
          money(payment.paid || payment.expected),
          clip(payment.paymentMode || "—", 12),
          clip(payment.status, 10),
          clip(payment.notes || "", 18),
        ]);
        renderTableChunked(CHIT_COLS, tableRows);
      }
    } else {
      const s = account.summary;
      row("Finance Type", account.financeType || "Finance");
      row("Account ID", account.accountId || "—");
      if (account.kind === "daily") {
        row("Finance Amount", money(s.financeAmount));
        row("Total Payable", money(s.totalPayable));
        row("Total Paid", money(s.totalPaid));
        row("Outstanding", money(s.outstanding));
        row("Start Date", formatReceiptDate(s.startDate));
        row("Repayment Period", s.repaymentPeriod);
        row("Days Completed", String(s.daysCompleted));
        row("Days Remaining", String(s.daysRemaining));
      } else {
        row("Loan Amount", money(s.loanAmount));
        row("Total Paid", money(s.totalPaid));
        row("Outstanding", money(s.outstanding));
        row("Monthly Interest", money(s.monthlyInstallment));
        row("No of months interest paid", String(s.installmentsPaid));
        row("Start Date", formatReceiptDate(s.startDate));
        if (s.nextDueDate) row("Next Due Date", formatReceiptDate(s.nextDueDate));
      }
      row("Status", String(s.status || "").toUpperCase());
      y -= 6;
      commands.push(text("F2", 10, PAGE.left, y, "Payment History"));
      y -= 14;
      if (!account.payments.length) {
        ensure(14);
        commands.push(text("F1", 9, PAGE.left, y, "No payments recorded up to this statement date."));
        y -= 14;
      } else {
        const tableRows = account.payments.map(payment => [
          formatReceiptDate(payment.date),
          money(payment.amount),
          clip(
            payment.splitPayment
              ? `Cash+UPI (${money(payment.cashAmount)}/${money(payment.upiAmount)})`
              : (payment.paymentMode || "—"),
            20,
          ),
          clip(payment.collectedBy, 16),
          money(payment.balanceAfter),
        ]);
        renderTableChunked(FINANCE_COLS, tableRows);
      }
    }
    y -= 10;
  });

  ensure(30);
  commands.push(line(PAGE.left, y, PAGE.right, y));
  y -= 16;
  commands.push(text("F1", 9, PAGE.left, y, bundle.receiptFooter || "Thank you for your business."));
  pages.push(commands);
  return pages;
}

export function renderCustomerStatementPdf(bundle) {
  return buildPdf(layoutCustomerStatement(bundle));
}

export function downloadCustomerStatementPdf(bundle) {
  const pdf = renderCustomerStatementPdf(bundle);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug = String(bundle.customerName || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "customer";
  link.href = url;
  link.download = `fintrack-statement-${slug}-${bundle.asOf}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
