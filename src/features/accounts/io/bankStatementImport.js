/** Parse and map common Indian bank statement CSV / TSV / simple Excel-like text exports. */

export const BANK_IMPORT_FIELDS = [
  { id: "date", label: "Date", required: true },
  { id: "description", label: "Description", required: true },
  { id: "reference", label: "Reference", required: false },
  { id: "debit", label: "Debit / Withdrawal", required: false },
  { id: "credit", label: "Credit / Deposit", required: false },
  { id: "amount", label: "Amount (signed or absolute)", required: false },
  { id: "balance", label: "Running balance", required: false },
  { id: "direction", label: "In / Out (optional)", required: false },
];

const HEADER_ALIASES = {
  date: ["date", "txn date", "transaction date", "value date", "txn_date", "tran date", "posting date"],
  description: ["description", "narration", "particulars", "details", "remarks", "transaction remarks", "narrative"],
  reference: ["reference", "ref", "chq", "cheque", "cheque no", "chq no", "utr", "txn id", "transaction id", "ref no", "reference no"],
  debit: ["debit", "withdrawal", "withdrawals", "dr", "debit amount", "amount debit", "money out"],
  credit: ["credit", "deposit", "deposits", "cr", "credit amount", "amount credit", "money in"],
  amount: ["amount", "txn amount", "transaction amount"],
  balance: ["balance", "closing balance", "running balance", "available balance"],
  direction: ["type", "dr/cr", "credit/debit", "txn type", "transaction type"],
};

export function parseDelimitedText(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!raw) return { headers: [], rows: [] };
  const lines = raw.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]);
  const table = lines.map(line => splitDelimitedLine(line, delimiter));
  const width = Math.max(...table.map(row => row.length));
  const normalized = table.map(row => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next;
  });
  const headers = normalized[0].map((cell, index) => cell.trim() || `Column ${index + 1}`);
  const rows = normalized.slice(1).filter(row => row.some(cell => String(cell || "").trim()));
  return { headers, rows };
}

function detectDelimiter(line) {
  const counts = {
    ",": (line.match(/,/g) || []).length,
    "\t": (line.match(/\t/g) || []).length,
    "|": (line.match(/\|/g) || []).length,
    ";": (line.match(/;/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function guessColumnMapping(headers = []) {
  const mapping = {};
  const used = new Set();
  for (const field of BANK_IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field.id] || [];
    const index = headers.findIndex((header, i) => {
      if (used.has(i)) return false;
      const normalized = normalizeHeader(header);
      return aliases.some(alias => normalized === alias || normalized.includes(alias));
    });
    if (index >= 0) {
      mapping[field.id] = index;
      used.add(index);
    }
  }
  return mapping;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[_./]+/g, " ").replace(/\s+/g, " ");
}

export function parseIndianAmount(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "—") return 0;
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith("-");
  const cleaned = raw.replace(/[₹,\s()]/g, "").replace(/^-/, "");
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return 0;
  return negative ? -Math.abs(amount) : amount;
}

export function parseImportDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function directionFromText(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (["cr", "credit", "deposit", "in", "money in", "c"].includes(raw)) return "in";
  if (["dr", "debit", "withdrawal", "out", "money out", "d"].includes(raw)) return "out";
  return "";
}

/**
 * Map parsed table rows into bank statement draft lines for the Banking form.
 * Prefers debit/credit columns; falls back to signed amount or amount + direction.
 */
export function mapBankImportRows({ headers, rows, mapping }) {
  const errors = [];
  const lines = [];
  let openingBalance = "";
  let closingBalance = "";

  rows.forEach((row, index) => {
    const get = field => {
      const col = mapping[field];
      return col == null || col < 0 ? "" : row[col];
    };
    const date = parseImportDate(get("date"));
    const description = String(get("description") || "").trim();
    const reference = String(get("reference") || "").trim();
    const debit = Math.abs(parseIndianAmount(get("debit")));
    const credit = Math.abs(parseIndianAmount(get("credit")));
    const signedAmount = parseIndianAmount(get("amount"));
    const balanceRaw = get("balance");
    const hasBalance = mapping.balance != null && mapping.balance >= 0 && String(balanceRaw ?? "").trim() !== "";
    const balance = hasBalance ? parseIndianAmount(balanceRaw) : null;
    let direction = directionFromText(get("direction"));
    let amount = 0;

    if (debit > 0 && credit > 0) {
      errors.push(`Row ${index + 2}: both debit and credit have values.`);
      return;
    }
    if (debit > 0) {
      amount = debit;
      direction = "out";
    } else if (credit > 0) {
      amount = credit;
      direction = "in";
    } else if (signedAmount !== 0) {
      amount = Math.abs(signedAmount);
      direction = direction || (signedAmount < 0 ? "out" : "in");
    } else {
      return;
    }
    if (!direction) direction = "in";
    if (!date) {
      errors.push(`Row ${index + 2}: could not read date.`);
      return;
    }
    if (!(amount > 0)) return;

    lines.push({
      lineDate: date,
      description,
      reference,
      amount: String(amount),
      direction,
      balance: hasBalance ? String(balance) : "",
    });

    if (hasBalance && Number.isFinite(balance)) {
      if (openingBalance === "" && lines.length === 1) {
        const prior = direction === "in" ? balance - amount : balance + amount;
        openingBalance = String(Number(prior.toFixed(2)));
      }
      closingBalance = String(Number(balance.toFixed(2)));
    }
  });

  return { lines, errors, openingBalance, closingBalance, headers };
}

export async function readBankStatementFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const text = await file.text();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    // Prefer CSV/TSV exports from banks. If the file is actually plain text/CSV renamed, still parse.
    if (!text.includes(",") && !text.includes("\t") && text.includes("PK")) {
      throw new Error("Excel (.xlsx) binary import needs a CSV export from your bank. Save/export the statement as CSV and try again.");
    }
  }
  if (name.endsWith(".pdf")) {
    throw new Error("PDF bank statements are not auto-parsed yet. Export CSV from net banking, or enter lines manually.");
  }
  return parseDelimitedText(text);
}
