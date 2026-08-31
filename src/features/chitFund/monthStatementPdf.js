import { buildChitMonthStatement, moneyInr } from "./monthStatement.js";

const PAGE = { width: 595, height: 842, left: 40, right: 555, top: 800, bottom: 48 };
const ascii = text => String(text ?? "").replace(/₹/g, "Rs.").replace(/·/g, "|").replace(/—/g, "-").replace(/[^\x20-\x7E]/g, "?");
const clip = (value, max) => {
  const text = ascii(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}.`;
};
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

function layoutStatement(statement) {
  const pages = [];
  let commands = [];
  let y = PAGE.top;
  const ensure = needed => {
    if (y - needed < PAGE.bottom) {
      pages.push(commands);
      commands = [];
      y = PAGE.top;
      commands.push(text("F2", 11, PAGE.left, y, `Month Statement  ${statement.schemeName} | ${statement.monthLabel}`));
      y -= 28;
    }
  };
  const heading = (label, extra = "") => {
    ensure(28);
    commands.push(text("F2", 11, PAGE.left, y, label + (extra ? `  ${extra}` : "")));
    y -= 8;
    commands.push(line(PAGE.left, y, PAGE.right, y));
    y -= 16;
  };

  commands.push(text("F2", 18, PAGE.left, y, statement.title));
  y -= 16;
  commands.push(text("F1", 9, PAGE.left, y, statement.generatedAt));
  y -= 22;
  commands.push(text("F2", 14, PAGE.left, y, "Month Statement"));
  y -= 16;
  commands.push(text("F1", 12, PAGE.left, y, `${statement.schemeName}  ·  ${statement.monthLabel}`));
  y -= 28;

  const cards = [
    ["EXPECTED", moneyInr(statement.expected)],
    ["COLLECTED", moneyInr(statement.collected)],
    ["PENDING", moneyInr(statement.pending)],
  ];
  cards.forEach((card, index) => {
    const x = PAGE.left + index * 170;
    commands.push(rect(x, y - 36, 155, 48));
    commands.push(text("F1", 8, x + 10, y, card[0]));
    commands.push(text("F2", 12, x + 10, y - 18, card[1]));
  });
  y -= 62;
  commands.push(text("F1", 10, PAGE.left, y, `Collection Progress  ${statement.progress}% received`));
  y -= 14;
  commands.push(text("F1", 10, PAGE.left, y, `${moneyInr(statement.pending)} pending`));
  y -= 26;

  heading("AUCTION / PRIZE", statement.prize ? "1 winner" : "No winner this month");
  commands.push(text("F1", 8, PAGE.left, y, "Winner"));
  commands.push(text("F1", 8, 180, y, "Prize"));
  commands.push(text("F1", 8, 280, y, "Commission"));
  commands.push(text("F1", 8, 390, y, "Net payout"));
  commands.push(text("F1", 8, 500, y, "Payout"));
  y -= 14;
  if (statement.prize) {
    commands.push(text("F1", 10, PAGE.left, y, statement.prize.winner));
    commands.push(text("F1", 10, 180, y, moneyInr(statement.prize.prize)));
    commands.push(text("F1", 10, 280, y, moneyInr(statement.prize.commission)));
    commands.push(text("F1", 10, 390, y, moneyInr(statement.prize.netPayout)));
    commands.push(text("F1", 10, 500, y, statement.prize.status));
  } else {
    commands.push(text("F1", 10, PAGE.left, y, "Not assigned"));
  }
  y -= 28;

  heading("COLLECTIONS", `${statement.collections.length} members`);
  commands.push(text("F1", 7, PAGE.left, y, "#"));
  commands.push(text("F1", 7, 58, y, "Member"));
  commands.push(text("F1", 7, 168, y, "Due"));
  commands.push(text("F1", 7, 228, y, "Paid"));
  commands.push(text("F1", 7, 288, y, "Mode"));
  commands.push(text("F1", 7, 368, y, "Collected by"));
  commands.push(text("F1", 7, 488, y, "Status"));
  y -= 14;
  statement.collections.forEach((row, index) => {
    ensure(16);
    commands.push(text("F1", 8, PAGE.left, y, String(index + 1)));
    commands.push(text("F1", 8, 58, y, clip(row.name, 18)));
    commands.push(text("F1", 8, 168, y, moneyInr(row.due)));
    commands.push(text("F1", 8, 228, y, moneyInr(row.paid)));
    commands.push(text("F1", 8, 288, y, clip(row.paymentModeShort || row.paymentMode, 14)));
    commands.push(text("F1", 8, 368, y, clip(row.collectedBy, 18)));
    commands.push(text("F1", 8, 488, y, row.status));
    y -= 14;
  });
  y -= 8;
  commands.push(text("F2", 10, PAGE.left, y, `Collected  ${moneyInr(statement.collected)}`));
  y -= 26;

  heading("OUTSTANDING DUES", `${statement.outstanding.length} members`);
  commands.push(text("F1", 8, PAGE.left, y, "Member"));
  commands.push(text("F1", 8, 220, y, "This month"));
  commands.push(text("F1", 8, 340, y, "Older dues"));
  commands.push(text("F1", 8, 460, y, "Total owed"));
  y -= 14;
  if (!statement.outstanding.length) {
    commands.push(text("F1", 10, PAGE.left, y, "No outstanding dues for this month."));
    y -= 14;
  }
  statement.outstanding.forEach(row => {
    ensure(16);
    commands.push(text("F1", 10, PAGE.left, y, row.name));
    commands.push(text("F1", 10, 220, y, moneyInr(row.thisMonth)));
    commands.push(text("F1", 10, 340, y, moneyInr(row.older)));
    commands.push(text("F1", 10, 460, y, moneyInr(row.totalOwed)));
    y -= 14;
  });
  y -= 10;
  commands.push(text("F2", 10, PAGE.left, y, `Total outstanding  ${moneyInr(statement.outstandingTotal)}`));
  pages.push(commands);
  return pages.map((pageCommands, index) => {
    const copy = [...pageCommands];
    copy.push(text("F1", 8, PAGE.left, 28, `FinTrack Confidential  ${statement.generatedAt}  ·  Page ${index + 1} of ${pages.length}`));
    return copy;
  });
}

export function renderChitMonthStatementPdf({ scheme, details, monthNumber, generatedAt }) {
  const statement = buildChitMonthStatement({ scheme, details, monthNumber, generatedAt });
  return { statement, pdf: buildPdf(layoutStatement(statement)) };
}

export function downloadChitMonthStatementPdf({ scheme, details, monthNumber }) {
  const { statement, pdf } = renderChitMonthStatementPdf({ scheme, details, monthNumber });
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug = String(scheme.name || "chit").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  link.href = url;
  link.download = `fintrack-chit-statement-${slug}-month-${monthNumber}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  return statement;
}
