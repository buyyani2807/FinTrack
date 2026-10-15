import {
  SYSTEM_CODES,
  VOUCHER_TYPES,
  addDaysIso,
  findAccount,
  gstDocumentLine,
  gstSplit,
  moneyAccounts,
  roundMoney,
  taxableFromInclusive,
} from "./accountingModel.js";
import { gstStateFromGstin, isIntraGst } from "./accountingGst.js";
import { suggestBillWiseAllocations } from "./accountingReports.js";
import { significantTokens, textHasPhrase } from "./bookSuggestions.js";
import { formatInr } from "../../../lib/formatMoney.js";

export const BOOKKEEPER_ACTIONS = [
  { id: "expense", label: "Expense paid" },
  { id: "asset_purchase", label: "Asset bought (laptop, furniture, vehicle)" },
  { id: "stock_purchase", label: "Stock bought to sell" },
  { id: "sale", label: "Sale" },
  { id: "receipt", label: "Money received from a customer" },
  { id: "supplier_payment", label: "Payment to a supplier" },
  { id: "transfer", label: "Money moved between cash and bank" },
  { id: "other_income", label: "Other income (interest, commission)" },
  { id: "capital", label: "Owner put money in" },
  { id: "drawings", label: "Owner took money out" },
  { id: "loan_received", label: "Loan received" },
  { id: "loan_repayment", label: "Loan repaid" },
];

const ACTION_IDS = new Set(BOOKKEEPER_ACTIONS.map(action => action.id));

export const BOOKKEEPER_EXAMPLES = [
  "I bought a laptop for ₹85,000 using HDFC",
  "Paid shop rent ₹25,000 by UPI",
  "Sold goods to Ramesh Traders for ₹48,000 on credit",
  "Received ₹20,000 from Ramesh Traders in cash",
  "Deposited ₹50,000 cash in the bank",
  "Bought stock for ₹1.2 lakh plus 18% GST on credit from Sri Balaji Electricals",
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const BANK_BRANDS = [
  "hdfc", "sbi", "icici", "axis", "kotak", "canara", "pnb", "bob", "baroda", "union", "idfc", "indusind", "federal",
  "kvb", "karur", "boi", "iob", "uco", "cub", "tmb", "rbl", "dbs", "hsbc", "citi", "yes", "au", "bandhan", "idbi",
];
const GENERIC_MONEY_TOKENS = new Set(["bank", "account", "acc", "current", "savings", "saving", "cash", "hand", "upi", "main", "the", "and", "ltd", "limited"]);

const ASSET_RE = /\b(laptops?|computers?|desktops?|pc|printers?|scanners?|photocopier|xerox machine|mobile phones?|smart ?phones?|iphones?|phones?|tablets?|ipads?|furniture|tables?|chairs?|sofas?|almirahs?|cupboards?|racks?|shel(?:f|ves)|counters?|air ?conditioners?|ac|fridges?|refrigerators?|freezers?|tvs?|televisions?|projectors?|vehicles?|cars?|bikes?|motorcycles?|scooters?|trucks?|lorry|lorries|vans?|tempos?|tractors?|machines?|machinery|generators?|inverters?|ups|cctv|cameras?|weighing (?:scale|machine)s?|billing machines?|pos machines?|servers?|equipment|software licen[cs]es?)\b/i;
const STOCK_RE = /\b(stock|goods|inventory|raw materials?|materials?|merchandise|for resale|to sell|to resell|trading items)\b/i;
const SERVICE_RE = /\b(services?|repair work|installation|consult(?:ing|ancy)?|labou?r charges|job work|commission work)\b/i;

const EXPENSE_HINTS = [
  ["5000", "Rent", /\b(shop rent|office rent|godown rent|warehouse rent|rent|lease)\b/i],
  ["5010", "Salary", /\b(salary|salaries|wages?|staff pay|payroll|bonus|incentives?)\b/i],
  ["5040", "Electricity", /\b(electricity|power bill|eb bill|current bill|bescom|tneb|msedcl|tata power)\b/i],
  ["5050", "Internet", /\b(internet|broadband|wi-?fi|fiber|fibre|data pack|phone bill|mobile bill|recharge)\b/i],
  ["5030", "Fuel", /\b(fuel|petrol|diesel|cng)\b/i],
  ["5090", "Travel", /\b(travel|taxi|cab|uber|ola|auto fare|bus fare|train|flight|hotel stay|conveyance)\b/i],
  ["5080", "Marketing", /\b(marketing|advertis\w*|ads|promotion|pamphlets?|banners?|hoardings?)\b/i],
  ["5065", "Office Expenses", /\b(tea|coffee|snacks|refreshments?|cleaning|housekeeping|water cans?|drinking water|pantry|courier)\b/i],
  ["5060", "Office Supplies", /\b(stationery|stationary|printing paper|pens|printer ink|toner|office supplies)\b/i],
  ["5070", "Maintenance", /\b(repairs?|maintenance|servicing|plumber|electrician|painting)\b/i],
  ["5100", "Bank Charges", /\b(bank charges?|bank fees?|sms charges|annual fee|processing fee)\b/i],
  ["5120", "Professional Fees", /\b(ca fees?|audit fees?|accountant|lawyer|legal fees?|consultant fees?|professional fees?)\b/i],
];

const STOP_AFTER_NAME = new Set([
  "for", "on", "in", "using", "via", "by", "with", "worth", "of", "at", "through", "from", "to", "and", "against",
  "rs", "inr", "today", "yesterday", "cash", "upi", "bank", "cheque", "neft", "rtgs", "imps", "gpay", "phonepe", "paytm",
  "plus", "including", "incl", "excluding", "credit", "as", "towards", "paid", "received", "into", "amount",
  "deposited", "sent", "transferred", "gave", "has", "have", "is", "was",
]);
const NOT_A_PARTY = /^(the |my |our |a |an )?(bank|cash|account|customer|supplier|vendor|shop|office|owner|home|myself|me|business|company|wallet|upi|hand|godown|staff|employees?|government|gst)$/i;

const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const normName = value => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const titleCase = value => String(value || "").replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
const isoOf = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const yearsBack = (iso, today) => {
  if (!iso || !today || iso <= today) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return isoOf(year - 1, month, day) || iso;
};

function readDate(text, today) {
  const lower = text.toLowerCase();
  if (/\bday before yesterday\b/.test(lower)) return { date: addDaysIso(today, -2), match: "day before yesterday" };
  if (/\byesterday\b/.test(lower)) return { date: addDaysIso(today, -1), match: "yesterday" };
  if (/\btoday\b/.test(lower)) return { date: today, match: "today" };
  const [ty, tm] = String(today).split("-").map(Number);
  let match = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?\\b`));
  if (match) {
    const month = MONTHS.indexOf(match[2].slice(0, 3)) + 1;
    const iso = isoOf(match[3] ? Number(match[3]) : ty, month, Number(match[1]));
    if (iso) return { date: match[3] ? iso : yearsBack(iso, today), match: match[0] };
  }
  match = lower.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  if (match) {
    const month = MONTHS.indexOf(match[1].slice(0, 3)) + 1;
    const iso = isoOf(match[3] ? Number(match[3]) : ty, month, Number(match[2]));
    if (iso) return { date: match[3] ? iso : yearsBack(iso, today), match: match[0] };
  }
  match = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/) || lower.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
  if (match) {
    const year = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : ty;
    const iso = isoOf(year, Number(match[2]), Number(match[1]));
    if (iso) return { date: match[3] ? iso : yearsBack(iso, today), match: match[0] };
  }
  match = lower.match(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);
  if (match) {
    let iso = isoOf(ty, tm, Number(match[1]));
    if (iso && iso > today) iso = isoOf(tm === 1 ? ty - 1 : ty, tm === 1 ? 12 : tm - 1, Number(match[1]));
    if (iso) return { date: iso, match: match[0] };
  }
  return { date: "", match: "" };
}

const MULTIPLIERS = { k: 1000, thousand: 1000, lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000, l: 100000, crore: 10000000, crores: 10000000, cr: 10000000 };

export function readAmount(text) {
  const source = String(text || "");
  const pattern = /(₹|\brs\.?|\binr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:\/-)?\s*(k|thousand|lakhs?|lacs?|l|crores?|cr)?\b(\s*%)?/gi;
  const found = [];
  for (const match of source.matchAll(pattern)) {
    if (match[4]) continue;
    const after = source.slice(match.index + match[0].length, match.index + match[0].length + 3);
    if (/^(st|nd|rd|th)\b/i.test(after)) continue;
    const base = Number(match[2].replace(/,/g, ""));
    if (!Number.isFinite(base) || base <= 0) continue;
    const unit = (match[3] || "").toLowerCase();
    found.push({ value: roundMoney(base * (MULTIPLIERS[unit] || 1)), currency: Boolean(match[1]), unit: Boolean(unit) });
  }
  if (!found.length) return null;
  return (found.find(item => item.currency) || found.find(item => item.unit) || [...found].sort((a, b) => b.value - a.value)[0]).value;
}

function readGst(lower) {
  const rate = lower.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:gst|igst|tax)/) || lower.match(/\b(?:gst|igst)\s*(?:@|at|of)?\s*(\d{1,2}(?:\.\d+)?)\s*%/);
  const mentioned = /\b(gst|igst|cgst|sgst)\b/.test(lower);
  let included = null;
  if (/\b(incl(?:uding|usive|\.)?|with)\s+(?:of\s+)?(?:\d{1,2}(?:\.\d+)?\s*%\s*)?gst\b|\bgst\s+incl/.test(lower)) included = true;
  if (/(\bplus|\+|\bexcl(?:uding|usive|\.)?|\bextra)\s*(?:\d{1,2}(?:\.\d+)?\s*%\s*)?gst\b|\bgst\s+extra\b/.test(lower)) included = false;
  return { gstRate: rate ? Number(rate[1]) : null, gstMentioned: mentioned, gstIncluded: included };
}

function moneyHints(lower) {
  const hints = [];
  const push = (value, index) => { if (value && !hints.some(hint => hint.value === value)) hints.push({ value, index }); };
  for (const brand of BANK_BRANDS) {
    const match = lower.match(new RegExp(`\\b${brand}\\b`));
    if (match) push(brand, match.index);
  }
  const upi = lower.match(/\b(upi|gpay|google pay|phonepe|phone pe|paytm|bhim)\b/);
  if (upi) push("upi", upi.index);
  const cash = lower.match(/\bcash\b/);
  if (cash) push("cash", cash.index);
  const bank = lower.match(/\b(bank|neft|rtgs|imps|cheque|check|debit card|credit card|card|net ?banking|online)\b/);
  if (bank && !hints.some(hint => BANK_BRANDS.includes(hint.value))) push("bank", bank.index);
  return hints.sort((a, b) => a.index - b.index).map(hint => hint.value);
}

function readPartyName(original, action) {
  const words = String(original || "").replace(/[₹,]/g, " ").split(/\s+/).filter(Boolean);
  const lowerWords = words.map(word => word.toLowerCase().replace(/[^a-z0-9&.'-]/g, ""));
  const triggers = action === "sale" || action === "receipt" ? ["to", "from"] : ["from", "to"];
  const take = start => {
    const picked = [];
    for (let index = start; index < words.length && picked.length < 6; index += 1) {
      const word = lowerWords[index];
      if (!word || STOP_AFTER_NAME.has(word) || /^\d/.test(word) || BANK_BRANDS.includes(word)) break;
      picked.push(words[index].replace(/[^A-Za-z0-9&.'-]/g, ""));
    }
    const name = picked.join(" ").replace(/^(the|my|our|a|an)\s+/i, "").trim();
    if (!name || NOT_A_PARTY.test(name) || EXPENSE_HINTS.some(([, , re]) => re.test(name)) || ASSET_RE.test(name) || STOCK_RE.test(name)) return "";
    return /[A-Z]/.test(name) ? name : titleCase(name);
  };
  for (const trigger of triggers) {
    for (let index = 0; index < lowerWords.length; index += 1) {
      if (lowerWords[index] !== trigger) continue;
      const name = take(index + 1);
      if (name) return name;
    }
  }
  if (action === "supplier_payment") {
    const paid = lowerWords.findIndex(word => word === "paid" || word === "pay");
    if (paid >= 0) return take(paid + 1);
  }
  if (action === "receipt" && /^[A-Z]/.test(words[0] || "") && !/^(i|we|received|got|collected)$/i.test(lowerWords[0])) {
    return take(0);
  }
  return "";
}

function readItem(original) {
  const match = String(original || "").match(/\b(?:bought|purchased|buy|purchase of|got)\s+(?:a|an|the|some|new|one|two|three|\d+)?\s*(?:new\s+)?([a-z][a-z0-9 &/-]{1,40}?)(?=\s+(?:for|worth|at|from|using|via|by|with|on|in|through|₹|rs|inr|\d)|[.,]|$)/i);
  if (!match) return "";
  const item = match[1].trim();
  return /^(stock|goods|inventory|items?|materials?)$/i.test(item) ? "" : item;
}

const MONEY_WORD = `(?:cash|bank|upi|account|${BANK_BRANDS.join("|")})`;
const TRANSFER_RE = new RegExp(`\\b(?:transferr?(?:ed)?|moved|shifted|sent)\\b.*\\bfrom\\s+(?:the\\s+|my\\s+|our\\s+)?${MONEY_WORD}\\b.*\\b(?:to|into)\\s+(?:the\\s+|my\\s+|our\\s+)?${MONEY_WORD}\\b`);

function detectAction(lower) {
  const drawings = /\b(for (?:personal|home|household|myself|family)|personal use|drawings?|for my own use)\b/.test(lower);
  if (drawings) return "drawings";
  if (/\b(took|taken|got|received|availed|sanctioned|disbursed)\b.*\bloan\b|\bloan\b.*\b(received|credited|disbursed|sanctioned|taken|from)\b|\bborrowed\b/.test(lower)
    && !/\b(emi|repaid|repay|repayment|paid back|returned)\b/.test(lower)) return "loan_received";
  if (/\b(emi|repaid|repayment|paid back)\b/.test(lower) && /\b(loan|emi)\b/.test(lower)) return "loan_repayment";
  if (/\b(invested|introduced|capital|brought in|added my own|own money|my money into)\b/.test(lower) && !/\bbought\b/.test(lower)) return "capital";
  if ((/\bdeposit\w*\b/.test(lower) && /\bcash\b/.test(lower)) || /\bwithdr[ae]w\w*\b|\batm\b/.test(lower) || TRANSFER_RE.test(lower)) return "transfer";
  if (/\b(sold|sell|sale|sales|billed|invoiced)\b/.test(lower)) return "sale";
  const purchase = /\b(bought|buy|purchased|purchase|ordered)\b/.test(lower) || (/\bgot\b/.test(lower) && (ASSET_RE.test(lower) || STOCK_RE.test(lower)));
  if (!purchase && /\b(received|receive|got|collected|credited|deposited)\b/.test(lower)) {
    if (/\b(interest|commission|rent received|discount|scrap|dividend|cashback|refund)\b/.test(lower)) return "other_income";
    return "receipt";
  }
  const expenseHit = EXPENSE_HINTS.some(([, , re]) => re.test(lower));
  if (purchase) {
    if (ASSET_RE.test(lower)) return "asset_purchase";
    if (expenseHit && !STOCK_RE.test(lower)) return "expense";
    return "stock_purchase";
  }
  if (/\b(paid|pay|spent|spend|expense|expenses|bill|charges|fees?)\b/.test(lower)) {
    if (expenseHit) return "expense";
    if (ASSET_RE.test(lower)) return "asset_purchase";
    if (/\b(paid|pay)\b\s+(?:to\s+)?[a-z]/.test(lower) && !/\bpaid (?:for|by|via|using|in|through)\b/.test(lower)) return "supplier_payment";
    return "expense";
  }
  return "";
}

/** Read a plain sentence such as "I bought a laptop for ₹85,000 using HDFC". Nothing is posted. */
export function parseEntryText(text, { today = "" } = {}) {
  const original = clip(text, 500);
  const lower = original.toLowerCase();
  const { date, match: dateText } = readDate(original, today);
  const amountText = dateText ? lower.replace(dateText, " ") : lower;
  const action = detectAction(lower);
  const hints = moneyHints(lower);
  const credit = /\b(on credit|credit basis|udhaa?r|pay later|will pay|to be paid|unpaid|not paid|yet to pay|payable|due (?:on|in|by)|on account)\b/.test(lower)
    || (/\bcredit\b/.test(lower) && !/\bcredit card\b/.test(lower) && !/\bcredited\b/.test(lower));
  let paidVia = hints[0] || "";
  let toAccount = "";
  if (action === "transfer") {
    const deposit = /\bdeposit/.test(lower);
    const withdraw = /\bwithdr|\batm\b/.test(lower);
    const banks = hints.filter(hint => hint !== "cash" && hint !== "upi");
    if (deposit) { paidVia = "cash"; toAccount = banks[0] || "bank"; }
    else if (withdraw) { paidVia = banks[0] || "bank"; toAccount = "cash"; }
    else {
      const from = lower.match(/\bfrom\s+(?:the\s+|my\s+)?([a-z]+)/);
      const to = lower.match(/\b(?:to|into|in)\s+(?:the\s+|my\s+)?([a-z]+)/);
      paidVia = from?.[1] && from[1] !== "bank" ? from[1] : hints[0] || "";
      toAccount = to?.[1] && to[1] !== paidVia ? to[1] : hints.find(hint => hint !== paidVia) || "";
    }
  }
  const expense = EXPENSE_HINTS.find(([, , re]) => re.test(lower));
  return {
    action,
    amount: readAmount(amountText),
    date,
    item: action === "asset_purchase" || action === "stock_purchase" || action === "expense" ? readItem(original) : "",
    party: ["sale", "receipt", "stock_purchase", "supplier_payment", "asset_purchase", "expense"].includes(action) ? readPartyName(original, action) : "",
    paidVia,
    toAccount,
    settlement: credit ? "credit" : hints.length || /\b(paid|received|collected)\b/.test(lower) ? "paid" : "",
    expenseHint: expense ? expense[1] : "",
    service: SERVICE_RE.test(lower),
    ...readGst(lower),
    text: original,
  };
}

const str = (value, max = 120) => (typeof value === "string" ? clip(value, max) : "");

/** Coerce a model reply into the same shape as parseEntryText. */
export function normalizeEntryIntent(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const action = ACTION_IDS.has(source.action) ? source.action : "";
  const amount = Number(source.amount);
  const rate = Number(source.gstRate);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(source.date || "")) ? String(source.date) : "";
  const settlement = source.settlement === "credit" || source.settlement === "paid" ? source.settlement : "";
  return {
    action,
    amount: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null,
    date,
    item: str(source.item, 60),
    party: str(source.party, 120),
    paidVia: str(source.paidVia, 60),
    toAccount: str(source.toAccount, 60),
    settlement,
    expenseHint: str(source.expenseHint, 60),
    service: source.service === true,
    gstRate: Number.isFinite(rate) && rate > 0 && rate <= 40 ? rate : null,
    gstMentioned: source.gstMentioned === true || (Number.isFinite(rate) && rate > 0),
    gstIncluded: source.gstIncluded === true ? true : source.gstIncluded === false ? false : null,
    text: str(source.text, 500),
  };
}

/** Prefer the model's reading and fill its blanks from the built-in rules. */
export function combineIntents(remote, local) {
  if (!remote?.action) return local;
  const merged = { ...local };
  for (const [key, value] of Object.entries(remote)) {
    if (value !== null && value !== "" && value !== undefined) merged[key] = value;
  }
  merged.gstMentioned = Boolean(remote.gstMentioned || local.gstMentioned);
  merged.text = local.text || remote.text;
  return merged;
}

const active = account => account && account.isActive !== false;
const isGstLedger = account => /^(1140|1141|1142|2210|2211|2212)$/.test(account.code) || /\b(input|output)\s+[cis]gst\b/i.test(account.name || "");

export function ledgerOptions(action, accounts = []) {
  const rows = (accounts || []).filter(active);
  switch (action) {
    case "asset_purchase":
      return rows.filter(account => account.groupType === "asset" && account.accountType === "other" && !isGstLedger(account) && !/receivable|advance|deposit|tds|stock/i.test(account.name));
    case "expense":
      return rows.filter(account => account.groupType === "expense" && account.code !== SYSTEM_CODES.purchase);
    case "stock_purchase":
      return rows.filter(account => account.code === SYSTEM_CODES.purchase);
    case "sale":
    case "other_income":
      return rows.filter(account => account.groupType === "income");
    case "capital":
      return rows.filter(account => account.groupType === "equity" && account.accountType !== "drawing" && account.accountType !== "retained");
    case "drawings":
      return rows.filter(account => account.groupType === "equity" && account.accountType === "drawing");
    case "loan_received":
    case "loan_repayment":
      return rows.filter(account => account.groupType === "liability" && account.code !== SYSTEM_CODES.payable && !isGstLedger(account));
    default:
      return [];
  }
}

export const NEW_LEDGER_ID = "__new";

const STARTER_LEDGERS = {
  asset_purchase: { code: "1300", name: "Fixed Assets", groupType: "asset", accountType: "other" },
  loan_received: { code: "2100", name: "Loans Payable", groupType: "liability", accountType: "payable" },
  loan_repayment: { code: "2100", name: "Loans Payable", groupType: "liability", accountType: "payable" },
  other_income: { code: "4100", name: "Other Income", groupType: "income", accountType: "income" },
  expense: { code: "5990", name: "Other Expenses", groupType: "expense", accountType: "expense" },
};

export function freeLedgerCode(accounts = [], preferred = "9000") {
  const used = new Set((accounts || []).map(account => String(account.code)));
  let code = Number(preferred) || 9000;
  while (used.has(String(code))) code += 1;
  return String(code);
}

/** The ledger FinTrack offers to add when the books have none for this kind of entry. */
export function starterLedger(action, accounts = []) {
  const starter = STARTER_LEDGERS[action];
  if (!starter) return null;
  if ((accounts || []).some(account => normName(account.name) === normName(starter.name))) return null;
  return { ...starter, code: freeLedgerCode(accounts, starter.code) };
}

const ASSET_LEDGER_HINTS = [
  [/\b(laptops?|computers?|desktops?|pc|printers?|scanners?|servers?|tablets?|ipads?|software)\b/i, /computer|it equipment|office equipment/i],
  [/\b(furniture|tables?|chairs?|sofas?|almirahs?|cupboards?|racks?|shel(?:f|ves)|counters?)\b/i, /furniture|fixture/i],
  [/\b(vehicles?|cars?|bikes?|motorcycles?|scooters?|trucks?|lorry|vans?|tempos?|tractors?)\b/i, /vehicle|motor/i],
  [/\b(machines?|machinery|generators?|equipment)\b/i, /machine|plant|equipment/i],
  [/\b(phones?|mobile|iphones?|cctv|cameras?|tvs?|air ?conditioners?|ac|fridges?|refrigerators?)\b/i, /electrical|equipment|appliance/i],
];

function pickLedger(action, intent, accounts) {
  const options = ledgerOptions(action, accounts);
  if (!options.length) return null;
  const text = `${intent.text || ""} ${intent.item || ""} ${intent.expenseHint || ""}`;
  const named = options
    .filter(account => textHasPhrase(text, account.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (named) return named;
  if (action === "asset_purchase") {
    for (const [itemRe, ledgerRe] of ASSET_LEDGER_HINTS) {
      if (!itemRe.test(text)) continue;
      const hit = options.find(account => ledgerRe.test(account.name));
      if (hit) return hit;
    }
    return options.find(account => account.code === "1300") || options.find(account => /fixed asset/i.test(account.name)) || null;
  }
  if (action === "expense") {
    const hint = EXPENSE_HINTS.find(([, name, re]) => re.test(text) || (intent.expenseHint && normName(intent.expenseHint) === normName(name)));
    if (hint) {
      const byCode = options.find(account => account.code === hint[0]);
      if (byCode) return byCode;
      const byName = options.find(account => normName(account.name).includes(normName(hint[1])));
      if (byName) return byName;
    }
    const tokens = significantTokens(text);
    const byToken = options.find(account => significantTokens(account.name).some(token => tokens.includes(token)));
    return byToken || options.find(account => account.code === SYSTEM_CODES.otherExpense) || null;
  }
  if (action === "sale") {
    if (intent.service) return options.find(account => account.code === SYSTEM_CODES.serviceIncome) || options.find(account => /service/i.test(account.name)) || options.find(account => account.code === SYSTEM_CODES.sales) || null;
    return options.find(account => account.code === SYSTEM_CODES.sales) || null;
  }
  if (action === "other_income") {
    if (/\binterest\b/i.test(text)) return options.find(account => account.code === SYSTEM_CODES.interestIncome) || options.find(account => /interest/i.test(account.name)) || null;
    return options.find(account => account.code === SYSTEM_CODES.otherIncome) || null;
  }
  if (action === "capital") return options.find(account => account.code === SYSTEM_CODES.capital) || options[0];
  if (action === "drawings") return options.find(account => account.code === SYSTEM_CODES.drawings) || options[0];
  if (action === "loan_received" || action === "loan_repayment") return options.find(account => /loan/i.test(account.name)) || null;
  return options[0];
}

function moneyTokens(account) {
  return normName(account.name).split(" ").filter(token => token.length >= 2 && !GENERIC_MONEY_TOKENS.has(token));
}

/** Match a hint such as "HDFC", "UPI", or "cash" to one of the company's cash, bank, or UPI ledgers. */
export function resolveMoneyAccount(hint, accounts = [], text = "") {
  const money = moneyAccounts(accounts).filter(active);
  const wanted = normName(hint);
  if (!money.length) return { account: null, missing: wanted };
  if (wanted) {
    const tokens = wanted.split(" ").filter(token => !GENERIC_MONEY_TOKENS.has(token));
    if (tokens.length) {
      const hits = money.filter(account => moneyTokens(account).some(token => tokens.includes(token)));
      if (hits.length) return { account: hits[0], missing: "" };
    }
    if (/\bupi\b/.test(wanted)) return { account: money.find(account => account.accountType === "upi") || null, missing: "" };
    if (/\bcash\b/.test(wanted)) return { account: money.find(account => account.accountType === "cash") || null, missing: "" };
    const bank = money.find(account => account.accountType === "bank");
    if (/\bbank\b/.test(wanted) || BANK_BRANDS.includes(tokens[0])) {
      return { account: bank || null, missing: tokens.length && BANK_BRANDS.includes(tokens[0]) ? tokens[0] : "" };
    }
  }
  const lowerText = normName(text);
  const named = money.filter(account => moneyTokens(account).some(token => token.length >= 3 && new RegExp(`\\b${token}\\b`).test(lowerText)));
  if (named.length === 1) return { account: named[0], missing: "" };
  return { account: null, missing: "" };
}

export function findPartyByName(name, parties = [], preferType = "") {
  const list = (parties || []).filter(party => party?.name && party.isActive !== false);
  const wanted = normName(name);
  if (wanted.length < 2) return null;
  const rank = party => (preferType && party.partyType === preferType ? 0 : 1);
  const exact = list.filter(party => normName(party.name) === wanted).sort((a, b) => rank(a) - rank(b));
  if (exact.length) return exact[0];
  if (wanted.length < 4) return null;
  const partial = list
    .filter(party => {
      const partyName = normName(party.name);
      return partyName.length >= 4 && (partyName.includes(wanted) || wanted.includes(partyName) || partyName.split(" ")[0] === wanted.split(" ")[0] && wanted.split(" ")[0].length >= 4);
    })
    .sort((a, b) => rank(a) - rank(b));
  if (partial.length === 1 || (partial.length > 1 && rank(partial[0]) < rank(partial[1]))) return partial[0];
  return null;
}

function partyInText(text, parties = [], preferType = "") {
  const hits = (parties || [])
    .filter(party => party?.name && party.isActive !== false && textHasPhrase(text, party.name))
    .sort((a, b) => (preferType && (a.partyType === preferType) !== (b.partyType === preferType) ? (a.partyType === preferType ? -1 : 1) : b.name.length - a.name.length));
  return hits[0] || null;
}

const PARTY_ROLE = {
  sale: "customer",
  receipt: "customer",
  stock_purchase: "supplier",
  asset_purchase: "supplier",
  expense: "supplier",
  supplier_payment: "supplier",
};

/** Turn a reading into editable choices: ledger, money account, party, and GST. */
export function fieldsFromIntent(intent, { accounts = [], parties = [], today = "" } = {}) {
  const action = intent?.action || "";
  const role = PARTY_ROLE[action] || "";
  const notes = [];
  const ledger = action ? pickLedger(action, intent, accounts) : null;
  const money = resolveMoneyAccount(intent?.paidVia, accounts, action === "transfer" ? "" : intent?.text);
  const to = action === "transfer" ? resolveMoneyAccount(intent?.toAccount, accounts) : { account: null, missing: "" };
  if (money.missing && BANK_BRANDS.includes(money.missing)) notes.push(`There is no ${money.missing.toUpperCase()} ledger yet, so ${money.account?.name || "a bank ledger"} is used. Add it in Setup → Chart of accounts, or pick another account.`);
  if (to.missing && BANK_BRANDS.includes(to.missing)) notes.push(`There is no ${to.missing.toUpperCase()} ledger yet, so ${to.account?.name || "a bank ledger"} is used.`);
  let party = null;
  let partyName = "";
  if (role) {
    party = (intent.party && findPartyByName(intent.party, parties, role)) || partyInText(intent.text || "", parties, role);
    if (!party && intent.party) partyName = intent.party;
  }
  const creditable = ["sale", "stock_purchase", "asset_purchase", "expense"].includes(action);
  let settlement = creditable ? intent?.settlement || "" : "";
  const defaulted = creditable && !settlement;
  if (defaulted) {
    settlement = (party || partyName) && action !== "expense" ? "credit" : "paid";
    notes.push(settlement === "credit"
      ? "It does not say it was paid, so it is recorded on credit. Change Payment if it was paid now."
      : "It does not say how it was paid, so cash is used. Change Paid from if it was a bank or UPI payment.");
  }
  const needsMoney = Boolean(action) && action !== "transfer" && (!creditable || settlement === "paid");
  let moneyAccountId = money.account?.id || "";
  if (needsMoney && !moneyAccountId) {
    moneyAccountId = moneyAccounts(accounts).find(account => account.accountType === "cash" && active(account))?.id || "";
    if (intent?.paidVia) notes.push(`No cash, bank, or UPI ledger matches “${intent.paidVia}”, so Cash in hand is used. Change Paid from if needed.`);
    else if (moneyAccountId && !defaulted) notes.push("The sentence does not name the account, so Cash in hand is used. Change Paid from if needed.");
  }
  let toAccountId = to.account?.id || "";
  if (action === "transfer" && !toAccountId) {
    toAccountId = moneyAccounts(accounts).find(account => active(account) && account.id !== moneyAccountId && account.accountType === "bank")?.id || "";
  }
  if (intent?.date && today && intent.date > today) notes.push("That date is in the future, so today is used.");
  return {
    action,
    amount: intent?.amount ? String(intent.amount) : "",
    date: intent?.date && (!today || intent.date <= today) ? intent.date : today,
    ledgerId: ledger?.id || (starterLedger(action, accounts) ? NEW_LEDGER_ID : ""),
    moneyAccountId: needsMoney || action === "transfer" ? moneyAccountId : "",
    paidVia: intent?.paidVia || "",
    toAccountId: action === "transfer" ? toAccountId : "",
    partyId: party?.id || "",
    partyName,
    settlement,
    gstRate: intent?.gstRate ? String(intent.gstRate) : "",
    gstIncluded: intent?.gstIncluded === true,
    gstMentioned: Boolean(intent?.gstMentioned),
    item: intent?.item || "",
    text: intent?.text || "",
    notes,
  };
}

const ledgerName = account => account?.name || "";
const plainItem = fields => (fields.item ? fields.item.replace(/^(a|an|the)\s+/i, "") : "");
export const shortDate = iso => {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return iso || "";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
const assetSentence = item => {
  if (!item) return "It will be used for years, so it is an asset, not this period's expense.";
  const plural = /[^s]s$/i.test(item);
  return `The ${item} will be used for years, so ${plural ? "they are" : "it is"} an asset, not this period's expense.`;
};

function moneyEffect(account, amount, direction) {
  return `${ledgerName(account)} goes ${direction} by ${formatInr(amount)}.`;
}

/** Build the voucher the sentence describes. Posting stays with the person using the screen. */
export function buildBookkeeperDraft(fields, { accounts = [], parties = [], company = null, today = "", openInvoices = [] } = {}) {
  const errors = [];
  const effects = [];
  const notes = [...(fields?.notes || [])];
  const action = fields?.action || "";
  const amount = roundMoney(Number(fields?.amount || 0));
  const date = fields?.date || today;
  const byId = id => (accounts || []).find(account => account.id === id) || null;
  const newLedger = fields?.ledgerId === NEW_LEDGER_ID ? starterLedger(action, accounts) : null;
  const ledger = newLedger ? { id: null, ...newLedger, isNew: true } : byId(fields?.ledgerId);
  const money = byId(fields?.moneyAccountId);
  const toMoney = byId(fields?.toAccountId);
  const party = (parties || []).find(item => item.id === fields?.partyId) || null;
  const newPartyName = !party ? clip(fields?.partyName, 120) : "";
  const role = PARTY_ROLE[action] || "";
  const partyLabel = party?.name || newPartyName;
  const credit = fields?.settlement === "credit";

  if (!action) errors.push("Choose what happened.");
  if (!(amount > 0)) errors.push("Enter the amount.");
  if (!date) errors.push("Enter the date.");
  if (date && today && date > today) errors.push("The date cannot be in the future.");

  const gstRegular = company?.gstRegistration === "regular";
  const gstAction = ["asset_purchase", "expense", "stock_purchase", "sale"].includes(action);
  const rate = Number(fields?.gstRate || 0);
  const gstOn = gstRegular && gstAction && rate > 0;
  if (gstAction && fields?.gstMentioned && !gstRegular) notes.push("The company is not GST registered, so GST is not split out. The full amount is recorded.");
  const partyState = party?.stateCode || gstStateFromGstin(party?.gstin);
  const intra = company?.stateCode && partyState ? isIntraGst(company.stateCode, partyState) : true;
  if (gstOn && !(company?.stateCode && partyState)) notes.push("The party's state is not known, so CGST and SGST are used. Choose a party with a GSTIN for IGST.");
  if (gstOn && !fields?.gstIncluded) notes.push(`${formatInr(amount)} is taken as the value before GST, and GST is added on top.`);
  const taxable = gstOn ? (fields?.gstIncluded ? taxableFromInclusive(amount, rate) : amount) : amount;
  const tax = gstOn ? gstSplit({ taxable, rate, intra }) : { taxable: amount, cgst: 0, sgst: 0, igst: 0, total: amount };
  const total = roundMoney(tax.total);

  const lines = [];
  const add = (account, debit, creditAmount, partyLine = false) => {
    if (!account) return;
    const value = roundMoney(debit || creditAmount);
    if (!(value > 0)) return;
    lines.push({ coaId: account.id, code: account.code, name: account.name, debit: roundMoney(debit), credit: roundMoney(creditAmount), partyId: partyLine ? party?.id || null : null, partyLine, newLedger: Boolean(account.isNew) });
  };
  const gstAccounts = side => {
    const codes = side === "input"
      ? [SYSTEM_CODES.inputCgst, SYSTEM_CODES.inputSgst, SYSTEM_CODES.inputIgst]
      : [SYSTEM_CODES.outputCgst, SYSTEM_CODES.outputSgst, SYSTEM_CODES.outputIgst];
    return codes.map(code => findAccount(accounts, { code }));
  };
  const addTax = side => {
    if (!gstOn) return;
    const [cgst, sgst, igst] = gstAccounts(side);
    const needed = [[cgst, tax.cgst], [sgst, tax.sgst], [igst, tax.igst]].filter(([, value]) => value > 0);
    if (needed.some(([account]) => !account)) {
      errors.push("The GST ledgers are missing from the chart of accounts.");
      return;
    }
    for (const [account, value] of needed) add(account, side === "input" ? value : 0, side === "input" ? 0 : value);
  };
  const payable = findAccount(accounts, { code: SYSTEM_CODES.payable }) || findAccount(accounts, { accountType: "payable" });
  const receivable = findAccount(accounts, { code: SYSTEM_CODES.receivable }) || findAccount(accounts, { accountType: "receivable" });
  const needParty = () => { if (!party && !newPartyName) errors.push(role === "customer" ? "Choose the customer." : "Choose the supplier."); };
  const needMoney = label => { if (!money) errors.push(label || "Choose the cash, bank, or UPI account."); };
  const needLedger = label => { if (!ledger) errors.push(label); };
  let voucherType = "journal";
  let dueDate = null;
  let settlements = [];
  const partyCreditDays = party?.creditDays ?? 7;
  const gstEffect = side => {
    if (!gstOn) return;
    const gst = roundMoney(tax.cgst + tax.sgst + tax.igst);
    effects.push(side === "input"
      ? `${formatInr(gst)} GST is kept as input credit, which you can set off against GST on your sales.`
      : `${formatInr(gst)} GST is collected for the government and shows in GST payable.`);
  };

  switch (action) {
    case "asset_purchase":
    case "expense":
    case "stock_purchase": {
      const label = action === "asset_purchase" ? "Choose the asset ledger, such as Fixed Assets." : action === "expense" ? "Choose the expense." : "The Purchase ledger is missing.";
      needLedger(label);
      add(ledger, tax.taxable, 0);
      addTax("input");
      if (credit) {
        needParty();
        if (!payable) errors.push("Accounts Payable is missing from the chart of accounts.");
        add(payable, 0, total, true);
        voucherType = "purchase";
        dueDate = addDaysIso(date, partyCreditDays);
      } else {
        needMoney("Choose the account it was paid from.");
        add(money, 0, total);
        voucherType = gstOn ? "purchase" : "payment";
      }
      const item = plainItem(fields);
      if (action === "asset_purchase") {
        effects.push(`${ledgerName(ledger) || "Fixed Assets"} goes up by ${formatInr(tax.taxable)}. ${assetSentence(item)}`);
      } else if (action === "expense") {
        effects.push(`${formatInr(tax.taxable)} is counted under ${ledgerName(ledger) || "the expense"}, which lowers this period's profit.`);
      } else {
        effects.push(`Purchases go up by ${formatInr(tax.taxable)}. Stock bought to sell is counted in cost of goods sold as it is used.`);
      }
      gstEffect("input");
      if (credit) effects.push(`You owe ${partyLabel || "the supplier"} ${formatInr(total)}, due by ${shortDate(dueDate)}.`);
      else if (money) effects.push(moneyEffect(money, total, "down"));
      break;
    }
    case "sale": {
      needLedger("Choose the sales ledger.");
      if (credit) {
        needParty();
        if (!receivable) errors.push("Accounts Receivable is missing from the chart of accounts.");
        add(receivable, total, 0, true);
        dueDate = addDaysIso(date, partyCreditDays);
      } else {
        needMoney("Choose the account the money came into.");
        add(money, total, 0);
      }
      add(ledger, 0, tax.taxable);
      addTax("output");
      voucherType = "sales";
      effects.push(`${ledgerName(ledger) || "Sales"} goes up by ${formatInr(tax.taxable)}, which adds to profit.`);
      gstEffect("output");
      if (credit) effects.push(`${partyLabel || "The customer"} owes you ${formatInr(total)}, due by ${shortDate(dueDate)}.`);
      else if (money) effects.push(moneyEffect(money, total, "up"));
      break;
    }
    case "receipt":
    case "supplier_payment": {
      needParty();
      needMoney(action === "receipt" ? "Choose the account the money came into." : "Choose the account it was paid from.");
      const control = action === "receipt" ? receivable : payable;
      if (!control) errors.push(action === "receipt" ? "Accounts Receivable is missing from the chart of accounts." : "Accounts Payable is missing from the chart of accounts.");
      if (action === "receipt") {
        add(money, amount, 0);
        add(control, 0, amount, true);
        voucherType = "receipt";
        effects.push(`${partyLabel || "The customer"} owes you ${formatInr(amount)} less.`);
        if (money) effects.push(moneyEffect(money, amount, "up"));
      } else {
        add(control, amount, 0, true);
        add(money, 0, amount);
        voucherType = "payment";
        effects.push(`You owe ${partyLabel || "the supplier"} ${formatInr(amount)} less.`);
        if (money) effects.push(moneyEffect(money, amount, "down"));
      }
      if (party) {
        const open = (openInvoices || []).filter(row => row.partyId === party.id && Number(row.outstanding || 0) > 0);
        settlements = suggestBillWiseAllocations(open, amount).filter(link => link.invoiceVoucherId && Number(link.amount) > 0);
        if (settlements.length) {
          const refs = settlements.map(link => open.find(row => (row.voucherId || row.id) === link.invoiceVoucherId)?.reference).filter(Boolean);
          effects.push(`It is set against ${refs.length ? refs.join(", ") : "the open bills"}, oldest first.`);
        }
      }
      effects.push("Profit does not change. Only the balance owed moves.");
      break;
    }
    case "transfer": {
      if (!money) errors.push("Choose where the money came from.");
      if (!toMoney) errors.push("Choose where the money went.");
      if (money && toMoney && money.id === toMoney.id) errors.push("Choose two different accounts.");
      add(toMoney, amount, 0);
      add(money, 0, amount);
      voucherType = "contra";
      if (money && toMoney) effects.push(`${ledgerName(money)} goes down and ${ledgerName(toMoney)} goes up by ${formatInr(amount)}. Profit does not change.`);
      break;
    }
    case "other_income": {
      needLedger("Choose the income ledger.");
      needMoney("Choose the account the money came into.");
      add(money, amount, 0);
      add(ledger, 0, amount);
      effects.push(`${ledgerName(ledger) || "Other income"} goes up by ${formatInr(amount)}, which adds to profit.`);
      if (money) effects.push(moneyEffect(money, amount, "up"));
      break;
    }
    case "capital": {
      needLedger("The Capital ledger is missing.");
      needMoney("Choose the account the money came into.");
      add(money, amount, 0);
      add(ledger, 0, amount);
      effects.push(`${ledgerName(ledger) || "Capital"} goes up by ${formatInr(amount)}. This is the owner's own money put into the business, so it is not income.`);
      if (money) effects.push(moneyEffect(money, amount, "up"));
      break;
    }
    case "drawings": {
      needLedger("The Drawings ledger is missing.");
      needMoney("Choose the account the money came from.");
      add(ledger, amount, 0);
      add(money, 0, amount);
      effects.push(`${formatInr(amount)} is recorded as ${ledgerName(ledger) || "Drawings"}: money the owner took for personal use. It is not a business expense, so profit does not change.`);
      if (money) effects.push(moneyEffect(money, amount, "down"));
      break;
    }
    case "loan_received": {
      needLedger("Choose the loan ledger, such as Loans Payable.");
      needMoney("Choose the account the loan came into.");
      add(money, amount, 0);
      add(ledger, 0, amount);
      effects.push(`${ledgerName(ledger) || "Loans Payable"} goes up by ${formatInr(amount)}: the business owes this back. It is not income.`);
      if (money) effects.push(moneyEffect(money, amount, "up"));
      break;
    }
    case "loan_repayment": {
      needLedger("Choose the loan ledger, such as Loans Payable.");
      needMoney("Choose the account it was paid from.");
      add(ledger, amount, 0);
      add(money, 0, amount);
      effects.push(`${ledgerName(ledger) || "Loans Payable"} goes down by ${formatInr(amount)}.`);
      notes.push("If the EMI includes interest, open it in the full voucher form and move the interest to an interest expense ledger.");
      if (money) effects.push(moneyEffect(money, amount, "down"));
      break;
    }
    default:
      break;
  }

  const debit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0));
  const creditTotal = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0));
  if (!errors.length && (lines.length < 2 || Math.abs(debit - creditTotal) > 0.005)) errors.push("The entry does not balance.");
  const narration = clip(fields?.text, 200) || BOOKKEEPER_ACTIONS.find(item => item.id === action)?.label || "Entry";
  const gstLine = gstOn ? gstDocumentLine({ ...tax, rate, hsnSac: "", itcEligible: action !== "sale" }, narration) : null;
  const usesParty = Boolean(role) && (action === "receipt" || action === "supplier_payment" || credit);
  const confidence = errors.length ? "low" : notes.length ? "medium" : "high";
  return {
    ok: errors.length === 0,
    action,
    actionLabel: BOOKKEEPER_ACTIONS.find(item => item.id === action)?.label || "",
    voucherType,
    voucherLabel: VOUCHER_TYPES[voucherType]?.label || voucherType,
    date,
    amount,
    total,
    lines,
    totals: { debit, credit: creditTotal },
    effects,
    notes,
    errors,
    confidence,
    newParty: usesParty && !party && newPartyName ? { name: newPartyName, partyType: role } : null,
    newLedger: newLedger && lines.some(line => line.newLedger) ? newLedger : null,
    payload: {
      voucherType,
      date,
      dueDate,
      narration,
      partyId: usesParty ? party?.id || null : null,
      lines: lines.map(line => ({ coaId: line.coaId, debit: line.debit, credit: line.credit, partyId: line.partyId, partyLine: line.partyLine, newLedger: line.newLedger, description: narration })),
      gstLines: gstLine ? [gstLine] : [],
      settlements,
    },
  };
}

/** Attach a party created at post time to the lines that carry the balance owed. */
export function withNewParty(payload, partyId) {
  if (!partyId) return payload;
  return {
    ...payload,
    partyId,
    lines: payload.lines.map(line => (line.partyLine ? { ...line, partyId } : line)),
  };
}

/** Point the lines at a ledger created at post time. */
export function withNewLedger(payload, coaId) {
  if (!coaId) return payload;
  return { ...payload, lines: payload.lines.map(line => (line.newLedger ? { ...line, coaId } : line)) };
}
