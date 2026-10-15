/**
 * File readers for the migration assistant. Everything runs in the browser:
 * CSV/TSV text, Excel .xlsx (zip + XML) and Tally XML exports.
 */

const DELIMITERS = [",", "\t", ";", "|"];

/** Reads delimited text with quoted fields, escaped quotes and newlines inside quotes. */
export function readDelimited(text, delimiter = "") {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const sep = delimiter || detectDelimiter(source);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === "\"") {
        if (source[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === "\"" && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map(cells => cells.map(cell => cell.trim())).filter(cells => cells.some(Boolean));
}

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  let best = ",";
  let bestCount = 0;
  for (const sep of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (const char of sample) {
      if (char === "\"") quoted = !quoted;
      else if (!quoted && char === sep) count += 1;
    }
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best;
}

/** Decodes bytes as UTF-16 (Tally's default export) or UTF-8. */
export function decodeText(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder("utf-16le").decode(view.subarray(2));
  if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder("utf-16be").decode(view.subarray(2));
  if (view.length > 3 && view[0] === 0x3c && view[1] === 0x00 && view[3] === 0x00) return new TextDecoder("utf-16le").decode(view);
  return new TextDecoder("utf-8").decode(view).replace(/^\uFEFF/, "");
}

export function decodeEntities(text) {
  return String(text || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(Number(dec)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeChar(code) {
  if (code === 9 || code === 10 || code === 13) return " ";
  if (!code || code < 32) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/* ---------------- Excel (.xlsx) ---------------- */

async function inflateRaw(data) {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open Excel files. Save the sheet as CSV and upload that.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lists the files inside a zip and returns a reader for each. */
export function readZipEntries(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error("This does not look like an Excel .xlsx file. Old .xls files need to be saved as .xlsx or CSV first.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = new Map();
  const names = new TextDecoder("utf-8");
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = names.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, async () => {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error("This Excel file uses compression FinTrack cannot read. Save it again as .xlsx or CSV.");
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const attr = (tag, name) => {
  const match = String(tag || "").match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : "";
};

const xmlText = xml => decodeEntities(String(xml || "")
  .replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")
  .replace(/<t\b[^>]*\/>/g, "")
  .match(/<t\b[^>]*>([\s\S]*?)<\/t>/g)?.map(part => part.replace(/<t\b[^>]*>|<\/t>/g, "")).join("") || "");

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function dateStyles(stylesXml) {
  const custom = new Map();
  for (const match of String(stylesXml || "").matchAll(/<numFmt\b[^>]*>/g)) {
    custom.set(Number(attr(match[0], "numFmtId")), attr(match[0], "formatCode"));
  }
  const xfs = String(stylesXml || "").match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] || "";
  const result = [];
  for (const match of xfs.matchAll(/<xf\b[^>]*>/g)) {
    const id = Number(attr(match[0], "numFmtId"));
    const code = custom.get(id) || "";
    const cleaned = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    result.push(BUILTIN_DATE_FORMATS.has(id) || (/[dy]/i.test(cleaned) && /[dmy]/i.test(cleaned) && !/^[#0.,]+$/.test(cleaned)));
  }
  return result;
}

export function excelSerialToIso(serial) {
  const number = Number(serial);
  if (!Number.isFinite(number) || number < 1 || number > 2958465) return "";
  const ms = Math.round((number - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

const columnIndex = ref => {
  const letters = String(ref || "").match(/^[A-Z]+/)?.[0] || "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
};

function readSheetXml(xml, shared, isDate) {
  const rows = [];
  for (const rowMatch of String(xml || "").matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cellMatch[1];
      const inner = cellMatch[2] || "";
      const ref = attr(`<c ${tag}>`, "r");
      const type = attr(`<c ${tag}>`, "t");
      const style = Number(attr(`<c ${tag}>`, "s") || 0);
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = xmlText(inner);
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (raw !== undefined) value = decodeEntities(raw);
      if (value && !type && isDate[style] && /^\d+(\.\d+)?$/.test(value)) value = excelSerialToIso(value) || value;
      const at = ref ? columnIndex(ref) : cells.length;
      cells[at] = String(value).trim();
    }
    const filled = Array.from(cells, cell => cell ?? "");
    if (filled.some(Boolean)) rows.push(filled);
  }
  return rows;
}

/** Returns every sheet in the workbook as rows of text. */
export async function readXlsx(buffer) {
  const entries = readZipEntries(buffer);
  const text = async name => (entries.has(name) ? new TextDecoder("utf-8").decode(await entries.get(name)()) : "");
  const workbook = await text("xl/workbook.xml");
  if (!workbook) throw new Error("This Excel file has no worksheets FinTrack can read.");
  const rels = await text("xl/_rels/workbook.xml.rels");
  const targets = new Map();
  for (const match of rels.matchAll(/<Relationship\b[^>]*>/g)) targets.set(attr(match[0], "Id"), attr(match[0], "Target"));
  const sharedXml = await text("xl/sharedStrings.xml");
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => xmlText(match[1]));
  const isDate = dateStyles(await text("xl/styles.xml"));
  const sheets = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const target = targets.get(attr(match[0], "r:id")) || "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = await text(path);
    if (xml) sheets.push({ name: attr(match[0], "name"), rows: readSheetXml(xml, shared, isDate) });
  }
  return sheets;
}

/* ---------------- Tally XML ---------------- */

const TALLY_PRIMARY_GROUPS = [
  "Bank Accounts", "Bank OD A/c", "Branch / Divisions", "Capital Account", "Cash-in-Hand", "Current Assets",
  "Current Liabilities", "Deposits (Asset)", "Direct Expenses", "Direct Incomes", "Duties & Taxes", "Fixed Assets",
  "Indirect Expenses", "Indirect Incomes", "Investments", "Loans & Advances (Asset)", "Loans (Liability)",
  "Misc. Expenses (ASSET)", "Provisions", "Purchase Accounts", "Reserves & Surplus", "Sales Accounts",
  "Secured Loans", "Stock-in-Hand", "Sundry Creditors", "Sundry Debtors", "Suspense A/c", "Unsecured Loans",
];
const PRIMARY = new Map(TALLY_PRIMARY_GROUPS.map(name => [name.toLowerCase(), name]));

const tag = (xml, name) => {
  const match = String(xml || "").match(new RegExp(`<${name.replace(/\./g, "\\.")}(?:\\s[^>]*)?>([\\s\\S]*?)</${name.replace(/\./g, "\\.")}>`));
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
};

const stripLists = xml => {
  let text = String(xml || "");
  let previous;
  do {
    previous = text;
    text = text.replace(/<([A-Z0-9_]+(?:\.[A-Z0-9_]+)*\.LIST)\b[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1>/g, "");
  } while (text !== previous);
  return text;
};

const listBlocks = (xml, name) => [...String(xml || "").matchAll(new RegExp(`<${name}\\.LIST\\b[^>]*>([\\s\\S]*?)</${name}\\.LIST>`, "g"))].map(match => match[1]);

/** "-1,200.50" -> -1200.5. Foreign currency amounts use the rupee value after "=". */
export function tallyAmount(text) {
  const raw = String(text || "");
  const part = raw.includes("=") ? raw.slice(raw.lastIndexOf("=") + 1) : raw;
  const number = Number(part.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

const tallyDate = text => {
  const raw = String(text || "").trim();
  return /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : "";
};

const nameOf = (openTag, body) => decodeEntities(attr(openTag, "NAME")) || tag(body, "NAME");

export function isTallyXml(text) {
  return /<ENVELOPE>/i.test(String(text || "").slice(0, 4000)) && /<TALLYMESSAGE|<LEDGER\b|<VOUCHER\b/i.test(String(text || ""));
}

/**
 * Reads ledgers, groups and vouchers from a Tally export (Masters, Day Book, or both).
 * Tally amounts are negative for debit and positive for credit; this returns
 * openings as { amount, side } and voucher lines as { ledger, debit, credit }.
 */
export function readTallyXml(text) {
  const xml = String(text || "");
  const groups = new Map();
  for (const match of xml.matchAll(/<GROUP\b([^>]*)>([\s\S]*?)<\/GROUP>/g)) {
    const name = nameOf(`<GROUP ${match[1]}>`, match[2]);
    if (name) groups.set(name.toLowerCase(), tag(stripLists(match[2]), "PARENT"));
  }
  const primaryOf = group => {
    let current = String(group || "");
    for (let depth = 0; depth < 20 && current; depth += 1) {
      const known = PRIMARY.get(current.toLowerCase());
      if (known) return known;
      const parent = groups.get(current.toLowerCase());
      if (!parent) return current;
      current = parent;
    }
    return current;
  };

  const ledgers = [];
  for (const match of xml.matchAll(/<LEDGER\b([^>]*)>([\s\S]*?)<\/LEDGER>/g)) {
    const body = match[2];
    const flat = stripLists(body);
    const name = nameOf(`<LEDGER ${match[1]}>`, body);
    if (!name) continue;
    const parent = tag(flat, "PARENT");
    const opening = tallyAmount(tag(flat, "OPENINGBALANCE"));
    ledgers.push({
      name,
      group: parent,
      primaryGroup: primaryOf(parent) || (name.toLowerCase() === "profit & loss a/c" ? "Profit & Loss" : ""),
      openingBalance: Math.abs(opening),
      openingSide: opening < 0 ? "debit" : "credit",
      gstin: tag(flat, "PARTYGSTIN") || tag(body, "GSTIN"),
      phone: tag(flat, "LEDGERMOBILE") || tag(flat, "LEDGERPHONE"),
      email: tag(flat, "EMAIL"),
      state: tag(flat, "LEDSTATENAME") || tag(flat, "STATENAME"),
    });
  }

  const vouchers = [];
  let cancelled = 0;
  for (const match of xml.matchAll(/<VOUCHER\b([^>]*)>([\s\S]*?)<\/VOUCHER>/g)) {
    const open = `<VOUCHER ${match[1]}>`;
    const body = match[2];
    const flat = stripLists(body);
    if (/^yes$/i.test(tag(flat, "ISCANCELLED")) || /^yes$/i.test(tag(flat, "ISOPTIONAL")) || /^yes$/i.test(tag(flat, "ISDELETED"))) {
      cancelled += 1;
      continue;
    }
    const lines = [];
    const take = blocks => {
      for (const own of blocks) {
        const ledger = tag(own, "LEDGERNAME");
        const amount = tallyAmount(tag(own, "AMOUNT"));
        if (!ledger || !amount) continue;
        lines.push({ ledger, debit: amount < 0 ? Math.abs(amount) : 0, credit: amount > 0 ? amount : 0, isParty: /^yes$/i.test(tag(own, "ISPARTYLEDGER")) });
      }
    };
    const ledgerList = body.includes("<ALLLEDGERENTRIES.LIST") ? "ALLLEDGERENTRIES" : "LEDGERENTRIES";
    take(listBlocks(body, ledgerList).map(stripLists));
    const inventoryList = body.includes("<ALLINVENTORYENTRIES.LIST") ? "ALLINVENTORYENTRIES" : "INVENTORYENTRIES";
    take(listBlocks(body, inventoryList).flatMap(block => listBlocks(block, "ACCOUNTINGALLOCATIONS")).map(stripLists));
    vouchers.push({
      date: tallyDate(tag(flat, "DATE")),
      type: tag(flat, "VOUCHERTYPENAME") || attr(open, "VCHTYPE"),
      number: tag(flat, "VOUCHERNUMBER"),
      narration: tag(flat, "NARRATION"),
      party: tag(flat, "PARTYLEDGERNAME") || tag(flat, "PARTYNAME"),
      lines,
    });
  }
  return { ledgers, vouchers, groups: groups.size, cancelled };
}

/** Reads one uploaded file into sheets (rows) or a Tally dataset. */
export async function readImportFile(file) {
  const name = String(file?.name || "file");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || /\.xlsx$/i.test(name)) return { name, kind: "sheets", sheets: await readXlsx(buffer) };
  if (/\.xls$/i.test(name) && bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error(`${name} is an old Excel (.xls) file. Open it in Excel and save it as .xlsx or CSV.`);
  }
  const text = decodeText(bytes);
  if (isTallyXml(text)) return { name, kind: "tally", tally: readTallyXml(text) };
  if (/^\s*</.test(text)) throw new Error(`${name} is XML but not a Tally export. Export Masters or Day Book from Tally as XML.`);
  return { name, kind: "sheets", sheets: [{ name: name.replace(/\.[^.]+$/, ""), rows: readDelimited(text) }] };
}
