import { INDIA_STATES, gstStateFromGstin, gstinValidationMessage, normalizeGstin } from "./accountingGst.js";
import { SYSTEM_CODES, roundMoney } from "./accountingModel.js";
import { freeLedgerCode } from "./bookkeeper.js";

export const AUTO_MAP_CONFIDENCE = 0.8;
const OPENING_CHUNK = 150;
export const ADJUSTMENT_LEDGER = { name: "Opening Balance Adjustment", groupType: "equity", accountType: "other" };

const norm = text => String(text || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const header = text => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/* ---------------- Sheet classification ---------------- */

const ALIASES = {
  name: ["name", "partyname", "customername", "vendorname", "suppliername", "contactname", "displayname", "companyname", "ledgername", "ledger", "accountname", "account", "particulars", "particular", "party"],
  gstin: ["gstin", "gstno", "gstnumber", "gstidentificationnumbergstin", "gstinuin", "gstidentificationnumber", "gstinno", "partygstin"],
  phone: ["phone", "mobile", "mobileno", "phoneno", "mobilephone", "contactnumber", "contactno", "phonenumber", "mobilenumber", "workphone", "whatsapp"],
  email: ["email", "emailid", "emailaddress", "mail"],
  state: ["state", "placeofsupply", "billingstate", "statename", "stateut"],
  partyType: ["contacttype", "partytype", "customertype", "category"],
  group: ["group", "under", "parent", "accounttype", "accountgroup", "groupname", "primarygroup", "nature", "type"],
  code: ["code", "accountcode", "ledgercode"],
  opening: ["openingbalance", "opening", "openingbal", "balance", "closingbalance", "outstanding", "outstandingbalance", "openingamount", "receivables", "payables"],
  openingDebit: ["openingdebit", "debitopening", "openingdr", "drbalance", "debitbalance"],
  openingCredit: ["openingcredit", "creditopening", "openingcr", "crbalance", "creditbalance"],
  side: ["drcr", "balancetype", "side", "openingtype", "openingbalancetype", "crdr"],
  date: ["date", "voucherdate", "txndate", "transactiondate", "journaldate", "invoicedate", "billdate", "entrydate", "vchdate"],
  number: ["vouchernumber", "voucherno", "vchno", "number", "journalnumber", "referencenumber", "refno", "reference", "invoicenumber", "invoiceno", "billno", "billnumber", "entrynumber", "transactionid", "journalid", "entryno", "vouchernum"],
  voucherType: ["vouchertype", "vchtype", "transactiontype", "entrytype", "txntype", "voucher"],
  debit: ["debit", "dr", "debitamount", "debitinr", "amountdebit", "debitamt"],
  credit: ["credit", "cr", "creditamount", "creditinr", "amountcredit", "creditamt"],
  amount: ["amount", "total", "value", "netamount", "grandtotal", "amountinr", "totalamount", "invoiceamount", "billamount"],
  account: ["account", "ledger", "ledgername", "accountname", "particulars", "head", "accounthead"],
  party: ["party", "partyname", "customer", "vendor", "customername", "vendorname", "suppliername", "contactname"],
  narration: ["narration", "notes", "description", "memo", "remarks", "details", "note"],
  mode: ["paymentmode", "mode", "paidthrough", "depositto", "paidfrom", "cashbank", "paymentaccount", "receivedin"],
};

function headerMap(row) {
  const keys = row.map(header);
  const map = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const index = keys.findIndex(key => aliases.includes(key));
    if (index >= 0) map[field] = index;
  }
  return map;
}

function findHeader(rows) {
  let best = { index: -1, map: {}, score: 0 };
  rows.slice(0, 12).forEach((row, index) => {
    const map = headerMap(row);
    const score = Object.keys(map).length;
    if (score > best.score) best = { index, map, score };
  });
  return best.score >= 2 ? best : null;
}

const PARTY_HINT = /customer|vendor|supplier|party|parties|contact|debtor|creditor|client/i;
const SUPPLIER_HINT = /vendor|supplier|creditor|payable/i;

export function classifySheet(sheet, fileName = "") {
  const found = findHeader(sheet.rows || []);
  if (!found) return { kind: "unknown", reason: "No header row found." };
  const map = found.map;
  const label = `${fileName} ${sheet.name || ""}`;
  if (map.date !== undefined && (map.debit !== undefined || map.credit !== undefined || map.amount !== undefined)
    && (map.account !== undefined || map.party !== undefined || map.name !== undefined)) {
    return { kind: "transactions", headerIndex: found.index, map };
  }
  if (map.name !== undefined && map.group !== undefined && !(map.partyType !== undefined && map.gstin !== undefined)) {
    const groupValues = (sheet.rows || []).slice(found.index + 1, found.index + 40).map(row => norm(row[map.group]));
    const looksLikeParties = PARTY_HINT.test(label) && !groupValues.some(value => /expense|income|asset|liabilit|bank|cash|capital|sales|purchase/.test(value));
    if (!looksLikeParties) return { kind: "ledgers", headerIndex: found.index, map };
  }
  if (map.name !== undefined && (map.gstin !== undefined || map.phone !== undefined || map.email !== undefined || map.partyType !== undefined || map.state !== undefined || PARTY_HINT.test(label))) {
    return { kind: "parties", headerIndex: found.index, map, defaultType: SUPPLIER_HINT.test(label) ? "supplier" : "customer" };
  }
  return { kind: "unknown", reason: "Columns not recognised." };
}

/* ---------------- Values ---------------- */

export function parseAmount(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { amount: 0, side: "" };
  const side = /\bdr\.?$|\bdebit$/i.test(raw) ? "debit" : /\bcr\.?$|\bcredit$/i.test(raw) ? "credit" : "";
  const negative = /^\(.*\)$/.test(raw) || /^-|-\s*$/.test(raw.replace(/[₹\s]/g, ""));
  const number = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number)) return { amount: 0, side };
  return { amount: roundMoney(negative ? -number : number), side };
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Reads 2026-04-15, 15/04/2026, 15-Apr-2026, 15-Apr-26 and 1-4-26 (Indian day-first order). */
export function parseDateValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return isoDate(+match[1], +match[2], +match[3]);
  match = raw.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/);
  if (match) return isoDate(fullYear(+match[3]), +match[2], +match[1]);
  match = raw.match(/^(\d{1,2})[-/. ]([a-z]{3,9})[-/., ]+(\d{2,4})$/i);
  if (match) {
    const month = MONTHS[match[2].slice(0, 4).toLowerCase()] || MONTHS[match[2].slice(0, 3).toLowerCase()];
    if (month) return isoDate(fullYear(+match[3]), month, +match[1]);
  }
  match = raw.match(/^(\d{8})$/);
  if (match) return isoDate(+raw.slice(0, 4), +raw.slice(4, 6), +raw.slice(6, 8));
  return "";
}

const fullYear = year => (year < 100 ? 2000 + year : year);

function isoDate(year, month, day) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return "";
  return date.toISOString().slice(0, 10);
}

const cell = (row, index) => (index === undefined ? "" : String(row[index] ?? "").trim());
const cleanPhone = value => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};
const stateCodeFrom = (state, gstin) => gstStateFromGstin(gstin)
  || INDIA_STATES.find(item => norm(item.name) === norm(state) || item.code === String(state || "").padStart(2, "0"))?.code
  || "";

function readOpening(row, map, naturalSide) {
  if (map.openingDebit !== undefined || map.openingCredit !== undefined) {
    const debit = parseAmount(cell(row, map.openingDebit)).amount;
    const credit = parseAmount(cell(row, map.openingCredit)).amount;
    const net = roundMoney(debit - credit);
    return { openingBalance: Math.abs(net), openingSide: net >= 0 ? "debit" : "credit" };
  }
  const { amount, side } = parseAmount(cell(row, map.opening));
  const sideText = norm(cell(row, map.side));
  const explicit = side || (/^(dr|debit|d)$/.test(sideText) ? "debit" : /^(cr|credit|c)$/.test(sideText) ? "credit" : "");
  const base = explicit || naturalSide;
  const flipped = amount < 0 ? (base === "debit" ? "credit" : "debit") : base;
  return { openingBalance: Math.abs(amount), openingSide: flipped };
}

/* ---------------- Ledger groups ---------------- */

const GROUP_RULES = [
  ["customer", /sundry debtors?|accounts? receivable|trade receivables?|debtors?|customers?/],
  ["supplier", /sundry creditors?|accounts? payable|trade payables?|creditors?|suppliers?|vendors?/],
  ["bank", /bank od|bank occ|overdraft|cash credit|bank accounts?|^bank$|\bbank\b/],
  ["cash", /cash in hand|cash-in-hand|^cash$|petty cash|\bcash\b/],
  ["tax", /duties and taxes|duties taxes|\bgst\b|\btax(es)?\b|tds|tcs/],
  ["sales", /sales accounts?|^sales$|\bsales\b|revenue|operating income/],
  ["purchase", /purchase accounts?|\bpurchases?\b|cost of goods sold|\bcogs\b/],
  ["stock", /stock in hand|stock-in-hand|inventory|^stock$|closing stock/],
  ["expense", /direct expenses?|indirect expenses?|\bexpenses?\b/],
  ["income", /direct incomes?|indirect incomes?|other income|\bincome\b/],
  ["drawings", /drawings?/],
  ["capital", /capital account|\bcapital\b|\bequity\b|owner|partner/],
  ["reserves", /reserves? and surplus|retained|reserves?/],
  ["loan_liability", /loans? liability|secured loans?|unsecured loans?|long term liabilit|borrowings?/],
  ["loan_asset", /loans? and advances|advances?|deposits? asset|deposits?/],
  ["fixed_asset", /fixed assets?|property plant|equipment/],
  ["investment", /investments?/],
  ["suspense", /suspense/],
  ["pl", /profit and loss|profit loss/],
  ["liability", /current liabilit|provisions?|other liabilit|other current liabilit|credit card|liabilit/],
  ["asset", /current assets?|other assets?|other current assets?|misc expenses asset|branch|divisions?|assets?/],
];

export function groupKind(group) {
  const text = norm(group).replace(/-/g, " ");
  if (!text) return "";
  return GROUP_RULES.find(([, pattern]) => pattern.test(text))?.[0] || "unknown";
}

const NAME_HINTS = [
  ["cash", /^(cash|cash in hand|petty cash|cash a c)$/],
  ["bank", /\b(bank|hdfc|icici|sbi|axis|kotak|canara|baroda|pnb|idfc|indusind|federal|yes bank|union bank)\b/],
  ["tax", /\b(cgst|sgst|igst|utgst|gst|tds|tcs|cess)\b/],
  ["sales", /^sales\b|\bsales (a c|account)\b/],
  ["purchase", /^purchases?\b/],
  ["drawings", /\bdrawings?\b/],
  ["capital", /\bcapital\b/],
  ["expense", /\b(rent|salary|salaries|wages|electricity|internet|telephone|fuel|petrol|diesel|travel|conveyance|printing|stationery|repairs?|maintenance|freight|carriage|courier|postage|advertis\w*|marketing|bank charges|interest paid|audit fees|professional|insurance|staff welfare|office expenses?|loading|unloading|discount allowed|commission paid|depreciation)\b/],
  ["income", /\b(interest (received|income)|discount received|commission received|rent received|other income|misc(ellaneous)? income)\b/],
  ["pl", /^profit (and|&)? ?loss/],
  ["suspense", /\bsuspense\b/],
];

const nameKind = name => NAME_HINTS.find(([, pattern]) => pattern.test(norm(name)))?.[0] || "";

const NATURAL_SIDE = {
  customer: "debit", supplier: "credit", bank: "debit", cash: "debit", tax: "credit", sales: "credit", purchase: "debit",
  stock: "debit", expense: "debit", income: "credit", drawings: "debit", capital: "credit", reserves: "credit",
  loan_liability: "credit", loan_asset: "debit", fixed_asset: "debit", investment: "debit", suspense: "debit",
  pl: "credit", liability: "credit", asset: "debit",
};

/* ---------------- Gathering ---------------- */

function emptyDataset() {
  return { ledgers: new Map(), vouchers: [], sources: new Set(), files: [], skippedSheets: [], cancelled: 0 };
}

function addLedger(data, input) {
  const record = { ...input, name: String(input.name || "").replace(/\s+/g, " ").trim() };
  const key = norm(record.name);
  if (!key) return null;
  const existing = data.ledgers.get(key);
  if (!existing) {
    const ledger = { name: record.name, group: "", kind: "", openingBalance: 0, openingSide: "debit", gstin: "", phone: "", email: "", state: "", partyType: "", uses: 0, ...record, key };
    data.ledgers.set(key, ledger);
    return ledger;
  }
  for (const field of ["group", "kind", "gstin", "phone", "email", "state", "partyType", "code"]) {
    if (!existing[field] && record[field]) existing[field] = record[field];
  }
  if (!existing.openingBalance && record.openingBalance) {
    existing.openingBalance = record.openingBalance;
    existing.openingSide = record.openingSide;
  }
  return existing;
}

function sourceLabel(fileName, map, rows) {
  if (/tally/i.test(fileName)) return "Tally";
  if (/book ?keeper/i.test(fileName)) return "Book Keeper";
  const headers = (rows[0] || []).map(header).join(" ");
  if (/zoho/i.test(fileName) || /gstidentificationnumbergstin|contacttype|journalnumber/.test(headers)) return "Zoho Books";
  return /\.csv$|\.txt$|\.tsv$/i.test(fileName) ? "CSV" : "Excel";
}

const TALLY_CUSTOMER_TYPES = /^(sales|receipt|credit note)\b/;
const TALLY_SUPPLIER_TYPES = /^(purchase|payment|debit note)\b/;

function gatherTally(data, file) {
  data.sources.add("Tally");
  data.cancelled += file.tally.cancelled || 0;
  for (const ledger of file.tally.ledgers) {
    const kind = ledger.primaryGroup === "Profit & Loss" ? "pl" : groupKind(ledger.primaryGroup) || nameKind(ledger.name);
    addLedger(data, {
      name: ledger.name,
      group: ledger.group || ledger.primaryGroup,
      kind,
      openingBalance: ledger.openingBalance,
      openingSide: ledger.openingSide,
      gstin: ledger.gstin,
      phone: cleanPhone(ledger.phone),
      email: ledger.email,
      state: ledger.state,
      partyType: kind === "customer" ? "customer" : kind === "supplier" ? "supplier" : "",
      source: file.name,
    });
  }
  file.tally.vouchers.forEach((voucher, index) => {
    const partyType = TALLY_CUSTOMER_TYPES.test(norm(voucher.type)) ? "customer" : TALLY_SUPPLIER_TYPES.test(norm(voucher.type)) ? "supplier" : "";
    const lines = voucher.lines.map(line => ({
      ...line,
      partyType: partyType && (line.isParty || norm(line.ledger) === norm(voucher.party)) ? partyType : "",
    }));
    data.vouchers.push({ ...voucher, lines, source: file.name, sourceIndex: index });
  });
}

const PARTY_TYPE_TEXT = value => {
  const text = norm(value);
  if (/vendor|supplier|creditor/.test(text)) return "supplier";
  if (/customer|debtor|client/.test(text)) return "customer";
  return "";
};

function gatherSheet(data, file, sheet) {
  const info = classifySheet(sheet, file.name);
  if (info.kind === "unknown") {
    data.skippedSheets.push({ file: file.name, sheet: sheet.name, reason: info.reason });
    return;
  }
  const rows = sheet.rows.slice(info.headerIndex + 1);
  const map = info.map;
  data.sources.add(sourceLabel(file.name, map, sheet.rows.slice(info.headerIndex)));
  if (info.kind === "parties") {
    for (const row of rows) {
      const name = cell(row, map.name);
      if (!name || /^(total|grand total)$/i.test(name)) continue;
      const partyType = PARTY_TYPE_TEXT(cell(row, map.partyType)) || PARTY_TYPE_TEXT(cell(row, map.group)) || info.defaultType;
      addLedger(data, {
        name,
        group: partyType === "supplier" ? "Sundry Creditors" : "Sundry Debtors",
        kind: partyType,
        partyType,
        ...readOpening(row, map, partyType === "supplier" ? "credit" : "debit"),
        gstin: normalizeGstin(cell(row, map.gstin)),
        phone: cleanPhone(cell(row, map.phone)),
        email: cell(row, map.email),
        state: cell(row, map.state),
        source: file.name,
      });
    }
    return;
  }
  if (info.kind === "ledgers") {
    for (const row of rows) {
      const name = cell(row, map.name);
      if (!name || /^(total|grand total)$/i.test(name)) continue;
      const group = cell(row, map.group);
      const kind = groupKind(group) || nameKind(name);
      addLedger(data, {
        name,
        group,
        kind,
        code: cell(row, map.code),
        partyType: kind === "customer" || kind === "supplier" ? kind : "",
        ...readOpening(row, map, NATURAL_SIDE[kind] || "debit"),
        gstin: normalizeGstin(cell(row, map.gstin)),
        phone: cleanPhone(cell(row, map.phone)),
        source: file.name,
      });
    }
    return;
  }
  gatherTransactionSheet(data, file, sheet, rows, map);
}

const SINGLE_SIDED = [
  ["sales", /sale|invoice/],
  ["purchase", /purchase|bill/],
  ["receipt", /receipt|received|payment received|customer payment/],
  ["payment", /payment|paid|vendor payment|expense/],
];

function gatherTransactionSheet(data, file, sheet, rows, map) {
  const doubleEntry = (map.debit !== undefined || map.credit !== undefined) && (map.account !== undefined || map.name !== undefined);
  const accountIndex = map.account ?? map.name;
  let current = null;
  let lastDate = "";
  let lastNumber = "";
  const flush = () => {
    if (current?.lines.length) data.vouchers.push(current);
    current = null;
  };
  rows.forEach((row, index) => {
    const rawDate = cell(row, map.date);
    const date = parseDateValue(rawDate) || (rawDate ? "" : lastDate);
    const number = cell(row, map.number) || (rawDate ? "" : lastNumber);
    const narration = cell(row, map.narration);
    if (doubleEntry) {
      const account = cell(row, accountIndex);
      if (!account || /^(total|grand total|opening balance|closing balance)$/i.test(account)) return;
      const debit = Math.abs(parseAmount(cell(row, map.debit)).amount);
      const credit = Math.abs(parseAmount(cell(row, map.credit)).amount);
      if (!debit && !credit) return;
      const key = number ? `${date}|${number}` : "";
      const balanced = current && roundMoney(current.lines.reduce((sum, line) => sum + line.debit - line.credit, 0)) === 0;
      if (!current || (key && key !== current.key) || (!key && rawDate && balanced) || (!key && date !== current.date)) {
        flush();
        current = { key, date, number, type: cell(row, map.voucherType) || "Journal", narration, party: cell(row, map.party), lines: [], source: file.name, sourceIndex: `${sheet.name}:${index}` };
      }
      if (!current.narration && narration) current.narration = narration;
      current.lines.push({ ledger: account, debit, credit });
    } else {
      flush();
      const amount = Math.abs(parseAmount(cell(row, map.amount)).amount);
      const party = cell(row, map.party) || cell(row, map.name);
      const typeText = norm(cell(row, map.voucherType) || sheet.name || file.name);
      const type = SINGLE_SIDED.find(([, pattern]) => pattern.test(typeText))?.[0] || "";
      const other = cell(row, map.mode) || cell(row, map.account) || "";
      if (!amount) return;
      const lines = singleSidedLines(type, party, other, amount);
      data.vouchers.push({ date, number, type: type || cell(row, map.voucherType) || "", narration, party, lines, source: file.name, sourceIndex: `${sheet.name}:${index}`, invalid: lines.length ? "" : "Could not tell if this row is a sale, purchase, receipt or payment." });
    }
    lastDate = date;
    lastNumber = number;
  });
  flush();
}

function singleSidedLines(type, party, other, amount) {
  const money = /bank|hdfc|icici|sbi|axis|kotak|upi|neft|rtgs|imps|cheque|online|card/i.test(other) ? (/upi/i.test(other) ? "UPI" : other) : "Cash";
  if (!party && type !== "payment") return [];
  if (type === "sales") return [{ ledger: party, debit: amount, credit: 0, partyType: "customer" }, { ledger: "Sales", debit: 0, credit: amount }];
  if (type === "purchase") return [{ ledger: "Purchase", debit: amount, credit: 0 }, { ledger: party, debit: 0, credit: amount, partyType: "supplier" }];
  if (type === "receipt") return [{ ledger: money, debit: amount, credit: 0 }, { ledger: party, debit: 0, credit: amount, partyType: "customer" }];
  if (type === "payment") return [{ ledger: party || "Other Expenses", debit: amount, credit: 0, partyType: party ? "supplier" : "" }, { ledger: money, debit: 0, credit: amount }];
  return [];
}

/* ---------------- Mapping ---------------- */

const accountByCode = (accounts, code) => accounts.find(account => account.code === code);
const accountByName = (accounts, name) => accounts.find(account => norm(account.name) === norm(name) && account.isActive !== false);

function taxTarget(name, ledger, accounts) {
  const text = norm(name);
  const which = /\bigst\b/.test(text) ? "Igst" : /\bsgst\b|\butgst\b/.test(text) ? "Sgst" : /\bcgst\b/.test(text) ? "Cgst" : "";
  if (!which) {
    if (/\btds\b|\btcs\b/.test(text)) return { create: { groupType: "liability", accountType: "other" }, confidence: 0.85, reason: "Tax deducted or collected; kept as its own liability ledger." };
    return { create: { groupType: "liability", accountType: "other" }, confidence: 0.5, reason: "A tax ledger that is not CGST, SGST or IGST. Check where it belongs." };
  }
  const input = /\b(input|itc|receivable|paid on purchase|purchase)\b/.test(text);
  const output = /\b(output|payable|collected|sales?)\b/.test(text);
  if (input || output) {
    const account = accountByCode(accounts, SYSTEM_CODES[`${input ? "input" : "output"}${which}`]);
    if (account) return { coaId: account.id, confidence: 0.95, reason: `${input ? "Input" : "Output"} ${which.toUpperCase()}.` };
  }
  const guessInput = ledger.openingBalance > 0 && ledger.openingSide === "debit";
  const account = accountByCode(accounts, SYSTEM_CODES[`${guessInput ? "input" : "output"}${which}`]);
  return { coaId: account?.id || "", confidence: 0.55, reason: `"${name}" does not say input or output. FinTrack keeps them apart, so choose one.` };
}

function bankTarget(name, accounts) {
  const banks = accounts.filter(account => account.accountType === "bank" && account.isActive !== false);
  const words = norm(name).split(" ").filter(word => word.length > 2 && !["bank", "account", "current", "savings", "the"].includes(word));
  const match = banks.find(account => words.some(word => norm(account.name).split(" ").includes(word)));
  if (match) return { coaId: match.id, confidence: 0.95, reason: `Same bank as ${match.name}.` };
  if (norm(name) === "bank" && banks[0]) return { coaId: banks[0].id, confidence: 0.9, reason: "Your bank ledger." };
  return { create: { groupType: "asset", accountType: "bank" }, confidence: 0.92, reason: "New bank ledger." };
}

function mapLedger(ledger, accounts) {
  const kind = ledger.kind || nameKind(ledger.name) || "unknown";
  const same = accountByName(accounts, ledger.name);
  if (kind === "customer" || kind === "supplier") return { party: kind, confidence: 0.98, reason: kind === "customer" ? "Customer (Sundry Debtors)." : "Supplier (Sundry Creditors)." };
  if (same && !["tax"].includes(kind)) return { coaId: same.id, confidence: 0.97, reason: `Same name as your ${same.name} ledger.` };
  const code = value => accountByCode(accounts, value)?.id || "";
  switch (kind) {
    case "cash": return code(SYSTEM_CODES.cash) ? { coaId: code(SYSTEM_CODES.cash), confidence: 0.95, reason: "Cash in Hand." } : { create: { groupType: "asset", accountType: "cash" }, confidence: 0.9, reason: "Cash ledger." };
    case "bank": return bankTarget(ledger.name, accounts);
    case "tax": return taxTarget(ledger.name, ledger, accounts);
    case "sales": return /service/i.test(ledger.name) && code(SYSTEM_CODES.serviceIncome)
      ? { coaId: code(SYSTEM_CODES.serviceIncome), confidence: 0.9, reason: "Service Income." }
      : { coaId: code(SYSTEM_CODES.sales), confidence: 0.9, reason: "Sales. GST rate splits are tracked on each invoice in FinTrack." };
    case "purchase": return { coaId: code(SYSTEM_CODES.purchase), confidence: 0.9, reason: "Purchase." };
    case "expense": return { create: { groupType: "expense", accountType: "expense" }, confidence: 0.9, reason: "Expense ledger." };
    case "income": return /interest/i.test(ledger.name) && code(SYSTEM_CODES.interestIncome)
      ? { coaId: code(SYSTEM_CODES.interestIncome), confidence: 0.9, reason: "Interest Income." }
      : { create: { groupType: "income", accountType: "income" }, confidence: 0.9, reason: "Income ledger." };
    case "drawings": return { coaId: code(SYSTEM_CODES.drawings), confidence: 0.92, reason: "Owner's drawings." };
    case "capital": return /^(capital|capital a c|capital account|owner s capital|proprietor s capital)$/.test(norm(ledger.name)) && code(SYSTEM_CODES.capital)
      ? { coaId: code(SYSTEM_CODES.capital), confidence: 0.95, reason: "Capital." }
      : { create: { groupType: "equity", accountType: "capital" }, confidence: 0.88, reason: "Separate capital ledger, such as a partner's." };
    case "reserves":
    case "pl": return { coaId: accountByCode(accounts, SYSTEM_CODES.retained)?.id || "", confidence: 0.88, reason: "Past profits go to Retained Earnings." };
    case "loan_liability": return { create: { groupType: "liability", accountType: "payable" }, confidence: 0.88, reason: "Loan the business owes." };
    case "loan_asset": return { create: { groupType: "asset", accountType: "other" }, confidence: 0.85, reason: "Loan or advance given." };
    case "fixed_asset": return { create: { groupType: "asset", accountType: "other" }, confidence: 0.9, reason: "Fixed asset." };
    case "investment": return { create: { groupType: "asset", accountType: "other" }, confidence: 0.88, reason: "Investment." };
    case "stock": return { create: { groupType: "asset", accountType: "other" }, confidence: 0.82, reason: "Stock value. Item quantities come from Inventory." };
    case "liability": return { create: { groupType: "liability", accountType: "other" }, confidence: 0.82, reason: "Liability ledger." };
    case "asset": return { create: { groupType: "asset", accountType: "other" }, confidence: 0.82, reason: "Asset ledger." };
    case "suspense": return { create: { groupType: "asset", accountType: "other" }, confidence: 0.3, reason: "Suspense holds entries nobody classified. Decide where they belong." };
    default: return { create: { groupType: "asset", accountType: "other" }, confidence: 0.2, reason: ledger.group ? `FinTrack does not know the group "${ledger.group}".` : "This ledger has no group in the file." };
  }
}

/** Encodes a mapping as a select value: party:customer, coa:<id>, new:<groupType>:<accountType>, skip. */
export const targetValue = target => {
  if (!target) return "";
  if (target.skip) return "skip";
  if (target.party) return `party:${target.party}`;
  if (target.coaId) return `coa:${target.coaId}`;
  if (target.create) return `new:${target.create.groupType}:${target.create.accountType}`;
  return "";
};

export function parseTargetValue(value) {
  const [kind, a, b] = String(value || "").split(":");
  if (kind === "skip") return { skip: true };
  if (kind === "party" && (a === "customer" || a === "supplier")) return { party: a };
  if (kind === "coa" && a) return { coaId: a };
  if (kind === "new" && a) return { create: { groupType: a, accountType: b || "other" } };
  return null;
}

export const NEW_LEDGER_TARGETS = [
  { value: "new:expense:expense", label: "New expense ledger" },
  { value: "new:income:income", label: "New income ledger" },
  { value: "new:asset:other", label: "New asset ledger" },
  { value: "new:asset:bank", label: "New bank ledger" },
  { value: "new:liability:other", label: "New liability ledger" },
  { value: "new:liability:payable", label: "New loan ledger" },
  { value: "new:equity:capital", label: "New capital ledger" },
  { value: "party:customer", label: "Customer" },
  { value: "party:supplier", label: "Supplier" },
  { value: "skip", label: "Leave out" },
];

/* ---------------- Duplicates ---------------- */

const LEGAL_SUFFIX = /\b(m s|messrs|pvt|private|ltd|limited|llp|inc|the)\b/g;
export const partyKey = name => norm(name).replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();

function findDuplicateGroups(partyLedgers) {
  const parent = new Map(partyLedgers.map(ledger => [ledger.key, ledger.key]));
  const find = key => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    parent.set(key, root);
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const seen = new Map();
  for (const ledger of partyLedgers) {
    const keys = [`n:${ledger.partyType}:${partyKey(ledger.name)}`];
    if (ledger.gstin && !gstinValidationMessage(ledger.gstin)) keys.push(`g:${ledger.partyType}:${ledger.gstin}`);
    if (ledger.phone) keys.push(`p:${ledger.partyType}:${ledger.phone}`);
    for (const key of keys) {
      if (seen.has(key)) union(seen.get(key), ledger.key);
      else seen.set(key, ledger.key);
    }
  }
  const groups = new Map();
  for (const ledger of partyLedgers) {
    const root = find(ledger.key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(ledger);
  }
  const score = ledger => (ledger.gstin ? 4 : 0) + (ledger.phone ? 2 : 0) + (ledger.email ? 1 : 0) + ledger.uses / 1000;
  return [...groups.values()]
    .filter(group => group.length > 1)
    .map(group => {
      const sorted = [...group].sort((a, b) => score(b) - score(a) || a.name.length - b.name.length);
      return { id: `dup:${sorted[0].key}`, keep: sorted[0].key, members: sorted.map(ledger => ledger.key) };
    });
}

/* ---------------- Analysis ---------------- */

/**
 * Reads uploaded files (from readImportFile) into one picture of the old books:
 * counts, ledger mappings with confidence, duplicate parties and the exceptions to review.
 */
export function analyzeMigration(files, { accounts = [], parties = [] } = {}) {
  const data = emptyDataset();
  for (const file of files) {
    data.files.push(file.name);
    if (file.kind === "tally") gatherTally(data, file);
    else for (const sheet of file.sheets || []) gatherSheet(data, file, sheet);
  }

  for (const voucher of data.vouchers) {
    for (const line of voucher.lines) {
      const ledger = addLedger(data, { name: line.ledger, kind: line.partyType || "", partyType: line.partyType || "" });
      if (ledger) ledger.uses += 1;
    }
  }

  const ledgers = [...data.ledgers.values()];
  const existingParties = new Map();
  for (const party of parties) {
    existingParties.set(`n:${party.partyType}:${partyKey(party.name)}`, party);
    if (party.gstin) existingParties.set(`g:${party.partyType}:${normalizeGstin(party.gstin)}`, party);
  }

  for (const ledger of ledgers) {
    if (!ledger.kind) ledger.kind = nameKind(ledger.name) || "unknown";
    if (ledger.kind === "customer" || ledger.kind === "supplier") ledger.partyType = ledger.kind;
    if (ledger.kind === "unknown") {
      const party = parties.find(item => partyKey(item.name) === partyKey(ledger.name));
      if (party) {
        ledger.kind = party.partyType === "supplier" ? "supplier" : "customer";
        ledger.partyType = ledger.kind;
      }
    }
    ledger.suggested = mapLedger(ledger, accounts);
    if (ledger.partyType) {
      ledger.existingPartyId = (existingParties.get(`g:${ledger.partyType}:${ledger.gstin}`) || existingParties.get(`n:${ledger.partyType}:${partyKey(ledger.name)}`))?.id || "";
    }
  }

  const partyLedgers = ledgers.filter(ledger => ledger.partyType);
  const duplicates = findDuplicateGroups(partyLedgers);
  const today = new Date().toISOString().slice(0, 10);
  const invalid = [];
  for (const voucher of data.vouchers) {
    if (voucher.invalid) {
      invalid.push({ voucher, reason: voucher.invalid });
      continue;
    }
    const debit = roundMoney(voucher.lines.reduce((sum, line) => sum + line.debit, 0));
    const credit = roundMoney(voucher.lines.reduce((sum, line) => sum + line.credit, 0));
    if (!voucher.date) voucher.invalid = "No readable date.";
    else if (voucher.lines.length < 2) voucher.invalid = "Fewer than two ledger lines.";
    else if (debit !== credit) voucher.invalid = `Debits ${debit} and credits ${credit} do not match.`;
    else if (voucher.date > today) voucher.invalid = "Dated in the future.";
    if (voucher.invalid) invalid.push({ voucher, reason: voucher.invalid });
  }

  const auto = ledgers.filter(ledger => ledger.suggested.confidence >= AUTO_MAP_CONFIDENCE).length;
  const needsMapping = ledgers.filter(ledger => ledger.suggested.confidence < AUTO_MAP_CONFIDENCE);
  const duplicateCount = duplicates.reduce((sum, group) => sum + group.members.length - 1, 0);
  const validVouchers = data.vouchers.filter(voucher => !voucher.invalid);
  const dates = validVouchers.map(voucher => voucher.date).sort();
  return {
    files: data.files,
    sources: [...data.sources],
    skippedSheets: data.skippedSheets,
    ledgers,
    vouchers: data.vouchers,
    duplicates,
    invalid,
    counts: {
      customers: partyLedgers.filter(ledger => ledger.partyType === "customer").length,
      suppliers: partyLedgers.filter(ledger => ledger.partyType === "supplier").length,
      ledgers: ledgers.length,
      transactions: data.vouchers.length,
      duplicates: duplicateCount,
      needsMapping: needsMapping.length,
      cancelled: data.cancelled,
      openings: ledgers.filter(ledger => ledger.openingBalance > 0).length,
    },
    autoMappedPercent: ledgers.length ? Math.floor((auto / ledgers.length) * 1000) / 10 : 100,
    exceptions: needsMapping.length + duplicates.length,
    firstDate: dates[0] || "",
    lastDate: dates[dates.length - 1] || "",
  };
}

/** Applies AI suggestions for ledgers FinTrack could not place on its own. */
export function applyAiSuggestions(analysis, suggestions = []) {
  const byName = new Map(suggestions.map(item => [norm(item.name), item.target]));
  for (const ledger of analysis.ledgers) {
    if (ledger.suggested.confidence >= AUTO_MAP_CONFIDENCE) continue;
    const target = parseTargetValue(byName.get(ledger.key));
    if (!target) continue;
    ledger.suggested = { ...target, confidence: 0.75, reason: "Suggested by FinTrack AI. Please confirm.", ai: true };
  }
  return analysis;
}

/* ---------------- Plan ---------------- */

function hashString(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/** Same input, same id: posting the same file twice does not double the books. */
export function stableUuid(text) {
  const parts = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map(seed => hashString(String(text), seed).toString(16).padStart(8, "0"));
  const hex = parts.join("");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const VOUCHER_TYPES = [
  ["sales", /^sales?\b|invoice|tax invoice/],
  ["purchase", /^purchases?\b|\bbill\b/],
  ["receipt", /receipt|customer payment|payment received/],
  ["payment", /^payments?\b|vendor payment|expense/],
  ["contra", /contra|transfer/],
  ["credit_note", /credit note|sales return/],
  ["debit_note", /debit note|purchase return/],
];
const fintrackVoucherType = type => VOUCHER_TYPES.find(([, pattern]) => pattern.test(norm(type)))?.[0] || "journal";

/**
 * Builds the import from the analysis and the owner's review.
 * decisions: { targets: { [ledgerKey]: selectValue }, separate: Set<duplicateGroupId> }.
 * Lines point at accounts by coaId or ledgerRef, and at parties by partyId or partyRef,
 * so the runner can fill in ids as it creates them.
 */
export function buildMigrationPlan(analysis, decisions = {}, { accounts = [], parties = [], booksStartedOn = "", today = "", companyId = "" } = {}) {
  const targets = decisions.targets || {};
  const separate = decisions.separate || new Set();
  const byKey = new Map(analysis.ledgers.map(ledger => [ledger.key, ledger]));
  const mergeInto = new Map();
  for (const group of analysis.duplicates) {
    if (separate.has(group.id)) continue;
    for (const member of group.members) if (member !== group.keep) mergeInto.set(member, group.keep);
  }

  const planned = [...accounts];
  const newLedgers = [];
  const newParties = [];
  const resolved = new Map();
  const usedPartyNames = new Set(parties.map(party => norm(party.name)));
  const ledgerRefs = new Map();

  const ensureLedger = (name, { groupType, accountType }) => {
    const create = { groupType, accountType };
    const key = norm(name);
    if (ledgerRefs.has(key)) return { ledgerRef: ledgerRefs.get(key) };
    const same = accountByName(planned, name);
    if (same?.id) return { coaId: same.id };
    const ledger = { ref: `L${newLedgers.length + 1}`, code: freeLedgerCode(planned, create.groupType === "expense" ? "5200" : create.groupType === "income" ? "4400" : create.groupType === "liability" ? "2300" : create.groupType === "equity" ? "3300" : create.accountType === "bank" ? "1021" : "1400"), name: name.trim().slice(0, 120), ...create };
    planned.push(ledger);
    newLedgers.push(ledger);
    ledgerRefs.set(key, ledger.ref);
    return { ledgerRef: ledger.ref };
  };

  const resolve = key => {
    if (resolved.has(key)) return resolved.get(key);
    const ledger = byKey.get(mergeInto.get(key) || key);
    if (!ledger) return null;
    const chosen = parseTargetValue(targets[ledger.key]) || ledger.suggested;
    let result = null;
    if (chosen.skip) result = { skip: true };
    else if (chosen.party) {
      const partyType = chosen.party;
      const account = accountByCode(accounts, partyType === "supplier" ? SYSTEM_CODES.payable : SYSTEM_CODES.receivable);
      if (ledger.existingPartyId && ledger.partyType === partyType) result = { coaId: account?.id, partyId: ledger.existingPartyId };
      else {
        let name = ledger.name.trim().slice(0, 120);
        if (usedPartyNames.has(norm(name))) name = `${name} (${partyType === "supplier" ? "supplier" : "customer"})`;
        usedPartyNames.add(norm(name));
        const gstin = ledger.gstin && !gstinValidationMessage(ledger.gstin) ? ledger.gstin : "";
        const party = { ref: `P${newParties.length + 1}`, partyType, name, gstin, phone: ledger.phone || "", email: ledger.email || "", stateCode: stateCodeFrom(ledger.state, gstin), gstRegistration: gstin ? "regular" : "" };
        newParties.push(party);
        result = { coaId: account?.id, partyRef: party.ref };
      }
    } else if (chosen.coaId) result = { coaId: chosen.coaId };
    else if (chosen.create) result = ensureLedger(ledger.name, chosen.create);
    resolved.set(key, result);
    for (const [member, keep] of mergeInto) if (keep === ledger.key && !resolved.has(member)) resolved.set(member, result);
    return result;
  };

  for (const ledger of analysis.ledgers) resolve(ledger.key);

  const allDates = analysis.vouchers.filter(voucher => !voucher.invalid).map(voucher => voucher.date).sort();
  const openingDate = [booksStartedOn, allDates[0]].filter(Boolean).sort()[0] || booksStartedOn || today;
  const prefix = `${companyId}|${analysis.files.join(",")}`;

  const openingLines = [];
  for (const ledger of analysis.ledgers) {
    if (!(ledger.openingBalance > 0)) continue;
    const target = resolved.get(ledger.key);
    if (!target || target.skip || (!target.coaId && !target.ledgerRef)) continue;
    const amount = roundMoney(ledger.openingBalance);
    openingLines.push({
      ...pickTarget(target),
      debit: ledger.openingSide === "debit" ? amount : 0,
      credit: ledger.openingSide === "credit" ? amount : 0,
      description: `Opening balance: ${ledger.name}`,
    });
  }
  const openingDifference = roundMoney(openingLines.reduce((sum, line) => sum + line.debit - line.credit, 0));
  const needsAdjustment = openingLines.length > 0;
  const adjustment = needsAdjustment ? ensureLedger(ADJUSTMENT_LEDGER.name, ADJUSTMENT_LEDGER) : null;
  const openings = [];
  for (let start = 0; start < openingLines.length; start += OPENING_CHUNK) {
    const lines = openingLines.slice(start, start + OPENING_CHUNK);
    const net = roundMoney(lines.reduce((sum, line) => sum + line.debit - line.credit, 0));
    if (net) lines.push({ ...adjustment, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, description: "Balances the opening entry" });
    const index = openings.length;
    openings.push({
      label: `Opening balances ${index + 1}`,
      payload: { voucherType: "journal", date: openingDate, narration: `Opening balances brought in from ${analysis.sources.join(", ") || "your old books"}`, lines, clientRequestId: stableUuid(`${prefix}|opening|${index}|${lines.length}`) },
    });
  }

  const vouchers = [];
  const skipped = { invalid: analysis.invalid.length, future: 0, unmapped: 0, beforeStart: 0 };
  const seenKeys = new Map();
  for (const voucher of analysis.vouchers) {
    if (voucher.invalid) continue;
    if (today && voucher.date > today) {
      skipped.future += 1;
      continue;
    }
    if (voucher.date < openingDate) {
      skipped.beforeStart += 1;
      continue;
    }
    const lines = [];
    let ok = true;
    for (const line of voucher.lines) {
      const target = resolve(norm(line.ledger));
      if (!target || target.skip || (!target.coaId && !target.ledgerRef)) {
        ok = false;
        break;
      }
      lines.push({ ...pickTarget(target), debit: roundMoney(line.debit), credit: roundMoney(line.credit) });
    }
    if (!ok) {
      skipped.unmapped += 1;
      continue;
    }
    const partyLine = lines.find(line => line.partyId || line.partyRef);
    const amount = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0));
    const baseKey = `${voucher.date}|${voucher.type}|${voucher.number}|${amount}`;
    const seen = seenKeys.get(baseKey) || 0;
    seenKeys.set(baseKey, seen + 1);
    vouchers.push({
      label: `${voucher.type || "Entry"} ${voucher.number || ""}`.trim(),
      payload: {
        voucherType: fintrackVoucherType(voucher.type),
        date: voucher.date,
        narration: [voucher.narration, voucher.number ? `${voucher.type || "Voucher"} ${voucher.number} (imported)` : "Imported"].filter(Boolean).join(" · ").slice(0, 500),
        partyId: partyLine?.partyId || "",
        partyRef: partyLine?.partyRef || "",
        lines,
        clientRequestId: stableUuid(`${prefix}|voucher|${baseKey}|${seen}`),
      },
    });
  }

  return {
    openingDate,
    openingDifference,
    newLedgers,
    newParties,
    openings,
    vouchers,
    skipped,
    totalSteps: newLedgers.length + newParties.length + openings.length + vouchers.length,
  };
}

const pickTarget = target => ({
  ...(target.coaId ? { coaId: target.coaId } : { ledgerRef: target.ledgerRef }),
  ...(target.partyId ? { partyId: target.partyId } : target.partyRef ? { partyRef: target.partyRef } : {}),
});

/**
 * Runs the plan one step at a time. A failed step is reported and the run continues.
 * api: { createLedger(ledger) -> id, createParty(party) -> id, postVoucher(payload) -> id }.
 */
export async function runMigrationPlan(plan, api, { onProgress = () => {}, shouldStop = () => false } = {}) {
  const ledgerIds = new Map();
  const partyIds = new Map();
  const failed = [];
  const done = { ledgers: 0, parties: 0, openings: 0, vouchers: 0 };
  let step = 0;
  const tick = label => {
    step += 1;
    onProgress({ step, total: plan.totalSteps, label, done: { ...done }, failed: failed.length });
  };
  const fill = payload => {
    const lines = payload.lines.map(({ ledgerRef, partyRef, ...line }) => ({
      ...line,
      coaId: line.coaId || ledgerIds.get(ledgerRef) || "",
      partyId: line.partyId || partyIds.get(partyRef) || null,
    }));
    if (lines.some(line => !line.coaId)) throw new Error("A ledger this entry needs was not created.");
    if (payload.lines.some(line => line.partyRef && !partyIds.has(line.partyRef))) throw new Error("A party this entry needs was not created.");
    const { partyRef, ...rest } = payload;
    return { ...rest, partyId: payload.partyId || partyIds.get(partyRef) || null, lines };
  };

  for (const ledger of plan.newLedgers) {
    if (shouldStop()) return { done, failed, stopped: true };
    try {
      ledgerIds.set(ledger.ref, await api.createLedger(ledger));
      done.ledgers += 1;
    } catch (error) {
      failed.push({ label: `Ledger ${ledger.name}`, message: error?.message || "Failed" });
    }
    tick(`Ledger ${ledger.name}`);
  }
  for (const party of plan.newParties) {
    if (shouldStop()) return { done, failed, stopped: true };
    try {
      partyIds.set(party.ref, await api.createParty(party));
      done.parties += 1;
    } catch (error) {
      failed.push({ label: `Party ${party.name}`, message: error?.message || "Failed" });
    }
    tick(`Party ${party.name}`);
  }
  for (const [list, field] of [[plan.openings, "openings"], [plan.vouchers, "vouchers"]]) {
    for (const entry of list) {
      if (shouldStop()) return { done, failed, stopped: true };
      try {
        await api.postVoucher(fill(entry.payload));
        done[field] += 1;
      } catch (error) {
        failed.push({ label: `${entry.label} (${entry.payload.date})`, message: error?.message || "Failed" });
      }
      tick(entry.label);
    }
  }
  return { done, failed, stopped: false };
}
