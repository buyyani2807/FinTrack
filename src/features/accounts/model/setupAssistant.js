import {
  INDIA_STATES,
  gstStateFromGstin,
  gstinValidationMessage,
  normalizeGstin,
  normalizePan,
  panFromGstin,
  panValidationMessage,
} from "./accountingGst.js";
import { ledgerHasPostedLines } from "./accountingModel.js";
import { freeLedgerCode, shortDate } from "./bookkeeper.js";

export const SETUP_INDUSTRIES = ["retail", "wholesale", "hardware", "jewellery", "manufacturing", "services", "finance", "chit", "school", "medical"];

const WHOLESALE_RE = /\b(wholesale\w*|distribut\w*|dealers?|dealership|stockists?|traders?|trading|suppliers?|b2b|c&f|super stockist)\b/i;

const SECTORS = [
  {
    id: "electrical",
    label: "electrical goods",
    match: /\b(electricals?|electric|wires?|wiring|cables?|switch(?:es|gear)?|lighting|lights?|led|fans?|mcbs?|lamps?)\b/i,
    industry: "retail",
    categories: ["Wires & Cables", "Switches & Sockets", "Lighting", "Fans", "MCBs & Distribution Boards", "Electrical Accessories"],
  },
  {
    id: "hardware",
    label: "hardware",
    match: /\b(hardware|plumbing|sanitary\w*|paints?|tools?|fasteners?|building materials?|cement|tiles?|steel|pipes?)\b/i,
    industry: "hardware",
    categories: ["Plumbing", "Sanitaryware", "Paints", "Tools", "Fasteners", "Building Materials"],
  },
  {
    id: "pharmacy",
    label: "pharmacy",
    match: /\b(pharma\w*|chemists?|druggists?|drug stores?|medicines?|medical (?:store|shop|stores|shops))\b/i,
    industry: "medical",
    categories: ["Tablets & Capsules", "Syrups", "Injections", "Surgical", "OTC & Wellness"],
  },
  {
    id: "grocery",
    label: "grocery",
    match: /\b(kirana|grocer(?:y|ies)?|provisions?|supermarkets?|general stores?|fmcg|departmental stores?|mini ?mart)\b/i,
    industry: "retail",
    categories: ["Staples", "Oils & Ghee", "Snacks & Beverages", "Personal Care", "Household"],
  },
  {
    id: "textiles",
    label: "clothing and textiles",
    match: /\b(textiles?|garments?|cloth(?:ing|es)?|apparel|fabrics?|sarees?|boutiques?|readymades?|fashion|footwear)\b/i,
    industry: "retail",
    categories: ["Men's Wear", "Women's Wear", "Kids' Wear", "Fabrics", "Accessories"],
  },
  {
    id: "electronics",
    label: "mobiles and electronics",
    match: /\b(mobiles?|phones?|electronics?|computers?|laptops?|gadgets?|appliances?)\b/i,
    industry: "retail",
    categories: ["Mobiles", "Laptops & Computers", "Appliances", "Accessories", "Spare Parts"],
  },
  {
    id: "food",
    label: "food business",
    match: /\b(restaurants?|hotels?|caf[eé]s?|bakery|bakeries|sweets?|catering|caterers?|tiffin|mess|dhabas?|food|cloud kitchen|juice)\b/i,
    industry: "retail",
    categories: ["Raw Materials", "Beverages", "Packaging"],
    ledgers: ["Kitchen Gas", "Packaging Expenses"],
  },
  {
    id: "auto",
    label: "auto parts",
    match: /\b(auto ?parts|spare parts|spares|automobiles?|garages?|tyres?|tires?|lubricants?|workshops?)\b/i,
    industry: "hardware",
    categories: ["Engine Parts", "Tyres & Tubes", "Lubricants", "Accessories"],
  },
  {
    id: "jewellery",
    label: "jewellery",
    match: /\b(jewel(?:le)?ry|jewellers?|jewelers?|gold|silver|ornaments?|diamonds?)\b/i,
    industry: "jewellery",
    categories: ["Gold", "Silver", "Diamond", "Platinum"],
  },
  {
    id: "manufacturing",
    label: "manufacturing",
    match: /\b(manufactur\w*|factory|factories|fabrication|production|industries|mill|processing unit)\b/i,
    industry: "manufacturing",
    categories: ["Raw Materials", "Work in Progress", "Finished Goods", "Packing Materials"],
    ledgers: ["Factory Wages", "Power & Fuel", "Freight Inward"],
  },
  {
    id: "school",
    label: "school or coaching centre",
    match: /\b(schools?|coaching|tuitions?|academy|institutes?|classes|training cent(?:er|re)s?|play ?school)\b/i,
    industry: "school",
    services: true,
    ledgers: ["Fee Income"],
  },
  {
    id: "finance",
    label: "finance business",
    match: /\b(finance|lending|money lending|loans? business|micro ?finance|nbfc|chit)\b/i,
    industry: "finance",
    services: true,
  },
  {
    id: "services",
    label: "service business",
    match: /\b(services?|consult\w*|agency|agencies|software|it company|design\w*|freelanc\w*|ca firm|clinic|salon|parlou?r|repairs?|events?|contractors?|construction|interiors?|logistics|transport\w*|travels?|tours?|photography|marketing)\b/i,
    industry: "services",
    services: true,
    ledgers: ["Software Subscriptions"],
  },
];

const TRADE_LEDGERS = {
  wholesale: ["Freight Inward", "Loading & Unloading", "Discount Allowed"],
  retail: ["Carry Bags & Packing", "Discount Allowed"],
  hardware: ["Freight Inward", "Loading & Unloading"],
  medical: ["Expired Stock Written Off"],
  jewellery: ["Hallmarking Charges"],
};

const titleCase = text => String(text || "").toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
const normName = text => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Reads "electrical wholesale" or "we run a kirana store" into an industry and a starting setup. */
export function profileBusiness(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const factory = SECTORS.find(entry => entry.id === "manufacturing");
  const matched = SECTORS.find(entry => entry.match.test(raw)) || null;
  const makes = Boolean(matched && matched !== factory && !matched.services && factory.match.test(raw));
  const sector = makes ? { ...factory, label: `${matched.label} manufacturing` } : matched;
  const wholesale = WHOLESALE_RE.test(raw) && sector?.id !== "manufacturing";
  const services = Boolean(sector?.services);
  let industry = sector?.industry || (wholesale ? "wholesale" : "retail");
  if (wholesale && !services && ["retail", "hardware"].includes(industry)) industry = "wholesale";
  const label = sector
    ? `${sector.label}${wholesale && !services ? " wholesale" : ""}`
    : wholesale ? "wholesale trading" : raw.toLowerCase().slice(0, 60);
  return {
    text: raw,
    sectorId: sector?.id || "",
    label,
    industry,
    known: Boolean(sector || wholesale),
    sellsProducts: !services,
    keepsStock: !services && industry !== "finance",
    sellsOnCredit: services || wholesale || ["hardware", "manufacturing", "school"].includes(industry),
    categories: services ? [] : [...(sector?.categories || [])],
    ledgers: sector || wholesale ? [...new Set([...(TRADE_LEDGERS[industry] || []), ...(sector?.ledgers || [])])] : [],
  };
}

/** Accepts the AI's reading of the business, keeping only values FinTrack understands. */
export function normalizeBusinessProfile(raw, text = "") {
  const local = profileBusiness(text || raw?.text || "") || profileBusiness("business");
  if (!raw || typeof raw !== "object") return local;
  const list = (value, max) => [...new Set((Array.isArray(value) ? value : [])
    .map(item => String(item || "").replace(/\s+/g, " ").trim().slice(0, 40))
    .filter(Boolean))].slice(0, max);
  const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);
  const industry = SETUP_INDUSTRIES.includes(raw.industry) ? raw.industry : local.industry;
  const sellsProducts = flag(raw.sellsProducts, local.sellsProducts);
  return {
    ...local,
    label: String(raw.label || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60) || local.label,
    industry,
    known: true,
    sellsProducts,
    keepsStock: sellsProducts && flag(raw.keepsStock, local.keepsStock),
    sellsOnCredit: flag(raw.sellsOnCredit, local.sellsOnCredit),
    categories: sellsProducts ? (list(raw.categories, 8).length ? list(raw.categories, 8) : local.categories) : [],
    ledgers: list(raw.ledgers, 4).length ? list(raw.ledgers, 4) : local.ledgers,
  };
}

const BANK_LABELS = [
  [/\b(hdfc)\b/, "HDFC Bank"],
  [/\b(sbi|state bank)\b/, "State Bank of India"],
  [/\b(icici)\b/, "ICICI Bank"],
  [/\b(axis)\b/, "Axis Bank"],
  [/\b(kotak)\b/, "Kotak Mahindra Bank"],
  [/\b(canara)\b/, "Canara Bank"],
  [/\b(pnb|punjab national)\b/, "Punjab National Bank"],
  [/\b(bob|baroda)\b/, "Bank of Baroda"],
  [/\b(boi|(?<!state )bank of india)\b/, "Bank of India"],
  [/\b(union)\b/, "Union Bank"],
  [/\b(indusind)\b/, "IndusInd Bank"],
  [/\b(idfc)\b/, "IDFC First Bank"],
  [/\b(yes)\b/, "Yes Bank"],
  [/\b(federal)\b/, "Federal Bank"],
  [/\b(kvb|karur vysya)\b/, "Karur Vysya Bank"],
  [/\b(iob|indian overseas)\b/, "Indian Overseas Bank"],
  [/\b(idbi)\b/, "IDBI Bank"],
];
const NO_BANK_RE = /^(no|none|nil|nothing|not yet|only cash|cash only|just cash|cash and upi|only cash and upi|no bank\w*|we don'?t|dont)\b/i;
const NOT_BANK_RE = /^(cash|upi|gpay|google pay|phonepe|phone pe|paytm|bhim|only|and|both|we use|use)$/i;

/** "HDFC and SBI" -> ["HDFC Bank", "SBI"]. */
export function parseBankNames(text) {
  const raw = String(text || "").trim();
  if (!raw || NO_BANK_RE.test(raw)) return [];
  const names = [];
  for (const part of raw.split(/,|&|\/|\+|\band\b|\balso\b|\bplus\b/i)) {
    const token = part.replace(/\b(we use|we have|accounts?|a\/c|current|savings?|ltd|limited)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (!token || NOT_BANK_RE.test(token)) continue;
    const lower = token.toLowerCase();
    const known = BANK_LABELS.find(([pattern]) => pattern.test(lower));
    const name = known ? known[1] : /\bbank\b/i.test(token) ? titleCase(token) : `${titleCase(token)} Bank`;
    if (!names.some(existing => normName(existing) === normName(name))) names.push(name);
  }
  return names.slice(0, 5);
}

const bankKey = name => normName(name).replace(/\b(bank|of|the)\b/g, " ").trim().split(/\s+/)[0] || normName(name);

function sameBank(name, accountName) {
  const known = BANK_LABELS.find(([, label]) => label === name);
  if (known) return known[0].test(normName(accountName));
  return normName(accountName).split(" ").includes(bankKey(name));
}

export function financialYearStart(today) {
  const iso = String(today || "").slice(0, 10);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!year || !month) return "";
  return `${month >= 4 ? year : year - 1}-04-01`;
}

const yes = { value: true, label: "Yes" };
const no = { value: false, label: "No" };

/** The conversation, in order. `when` hides questions that do not apply. */
export const SETUP_QUESTIONS = [
  { id: "name", kind: "text", placeholder: "Business name" },
  { id: "business", kind: "text", placeholder: "e.g. Electrical wholesale" },
  { id: "products", kind: "choice", options: [{ value: true, label: "Yes, products" }, { value: false, label: "No, only services" }] },
  { id: "inventory", kind: "choice", options: [yes, no], when: answers => answers.products === true },
  {
    id: "gst",
    kind: "choice",
    options: [
      { value: "regular", label: "Yes, regular GST" },
      { value: "composition", label: "Yes, composition" },
      { value: "unregistered", label: "No" },
    ],
  },
  { id: "gstin", kind: "text", placeholder: "15-character GSTIN", skipLabel: "Add it later", when: answers => answers.gst && answers.gst !== "unregistered" },
  { id: "pan", kind: "text", placeholder: "10-character PAN", skipLabel: "Add it later" },
  { id: "credit", kind: "choice", options: [yes, no] },
  { id: "banks", kind: "text", placeholder: "e.g. HDFC and SBI", suggestions: ["HDFC", "SBI", "ICICI", "Axis"], skipLabel: "Only cash and UPI" },
  { id: "start", kind: "date" },
];

/** Books that already have entries keep their start date; moving it would shift opening balances. */
export function keptBooksStart(company, vouchers = []) {
  return vouchers.length && company?.booksStartedOn ? company.booksStartedOn : "";
}

/** Asked only when setting up a new company; an existing company keeps its name, GST and start date. */
export const COMPANY_QUESTIONS = new Set(["name", "gst", "gstin", "pan", "start"]);

export function nextQuestion(answers = {}, { keepStart = false, keepCompany = false } = {}) {
  return SETUP_QUESTIONS.find(question => !(question.id in answers)
    && !(keepStart && question.id === "start")
    && !(keepCompany && COMPANY_QUESTIONS.has(question.id))
    && (!question.when || question.when(answers))) || null;
}

export function questionText(question, answers = {}, profile = null) {
  if (!question) return "";
  const name = answers.name || "your business";
  const kind = profile?.label || "business";
  switch (question.id) {
    case "name": return "Let's set up your books. What is the business called?";
    case "business": return `What kind of business is ${name}? Say it the way you would to a friend.`;
    case "products": return "Do you sell products, or only services?";
    case "inventory": return "Do you keep stock that you count and reorder?";
    case "gst": return "Are you GST registered?";
    case "gstin": return "What is your GSTIN? I use it to work out your state so CGST, SGST and IGST come out right.";
    case "pan": return answers.gstin
      ? `Confirm the PAN for ${name}. I filled it from your GSTIN — change it if needed.`
      : `What is the PAN for ${name}? Optional for now; useful on invoices and filings.`;
    case "credit": return "Do customers buy on credit and pay you later?";
    case "banks": return `Which banks does ${name} use? I will add a ledger for each one.`;
    case "start": return kind === "business"
      ? "From which date should FinTrack keep your books?"
      : "Last one. From which date should FinTrack keep your books? Most businesses start at the beginning of the financial year.";
    default: return "";
  }
}

/** Default answer suggested from the business profile, shown first in the choice list. */
export function suggestedAnswer(question, profile) {
  if (!question || !profile) return undefined;
  if (question.id === "products") return profile.sellsProducts;
  if (question.id === "inventory") return profile.keepsStock;
  if (question.id === "credit") return profile.sellsOnCredit;
  return undefined;
}

/** What the assistant says right after it reads the kind of business. */
export function profileReply(profile) {
  if (!profile) return "";
  if (!profile.known) return `Got it: ${profile.label}. I will start with a general setup, and you can change anything later.`;
  const parts = [];
  if (profile.sellsOnCredit) parts.push(profile.sellsProducts ? "sell on credit" : "bill clients and collect later");
  if (profile.keepsStock) parts.push("keep stock");
  const habits = parts.length ? ` Most businesses like yours ${parts.join(" and ")}.` : "";
  const categories = profile.categories.length
    ? ` I will suggest item categories like ${profile.categories.slice(0, 3).join(", ")}.`
    : "";
  return `Got it: ${profile.label}.${habits}${categories} A few quick questions to confirm.`;
}

export function validateAnswer(question, value) {
  if (!question) return "";
  if (question.id === "name" && !String(value || "").trim()) return "Tell me the business name.";
  if (question.id === "business" && !String(value || "").trim()) return "Describe the business in a few words.";
  if (question.id === "gstin" && value) return gstinValidationMessage(value);
  if (question.id === "pan" && value) return panValidationMessage(value);
  if (question.id === "start" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "Pick a date.";
  return "";
}

const EXPENSE_LEDGER_INCOME = new Set(["fee income"]);

/**
 * Turns the answers into concrete setup steps, skipping anything the books already have.
 * Nothing here talks to the server; `applySetupPlan` runs the steps.
 */
export function buildSetupPlan(answers = {}, { profile = null, accounts = [], categories = [], vouchers = [], company = null, keepCompany = false } = {}) {
  const activeProfile = profile || profileBusiness(answers.business) || profileBusiness("business");
  const sellsProducts = answers.products !== false;
  const keepsStock = sellsProducts && (answers.inventory === undefined ? activeProfile.keepsStock : answers.inventory === true);
  const asked = keepCompany ? {} : answers;
  const gstRegistration = asked.gst || company?.gstRegistration || "unregistered";
  const gstin = gstRegistration === "unregistered" ? "" : normalizeGstin(asked.gstin || company?.gstin || "");
  const pan = normalizePan(asked.pan || panFromGstin(gstin) || company?.pan || "");
  const stateCode = gstStateFromGstin(gstin) || (gstRegistration === "unregistered" ? "" : company?.stateCode || "");
  const stateName = INDIA_STATES.find(state => state.code === stateCode)?.name || "";
  const currentName = String(company?.name || "").trim();
  const companyName = String(asked.name || currentName).trim();
  const renamedFrom = currentName && companyName !== currentName ? currentName : "";
  const keptStart = keepCompany ? company?.booksStartedOn || "" : keptBooksStart(company, vouchers);
  const booksStartedOn = keptStart || asked.start || company?.booksStartedOn || "";

  const planned = [...accounts];
  const ledgers = [];
  const renames = [];
  const existing = [];
  const hasLedger = name => planned.some(account => normName(account.name) === normName(name));
  const addLedger = (name, groupType, accountType, preferred, why) => {
    if (hasLedger(name)) {
      existing.push(name);
      return;
    }
    const ledger = { code: freeLedgerCode(planned, preferred), name, groupType, accountType, why };
    planned.push(ledger);
    ledgers.push(ledger);
  };

  const banks = parseBankNames(answers.banks);
  const bankAccounts = accounts.filter(account => account.accountType === "bank");
  const genericBank = bankAccounts.find(account => normName(account.name) === "bank"
    && !Number(account.openingBalance || 0)
    && !ledgerHasPostedLines(account, vouchers));
  let renamedGeneric = false;
  for (const bank of banks) {
    const match = bankAccounts.find(account => sameBank(bank, account.name));
    if (match) {
      existing.push(match.name);
      continue;
    }
    if (genericBank && !renamedGeneric) {
      renames.push({ account: genericBank, name: bank, why: `Your main bank account, renamed from "${genericBank.name}".` });
      renamedGeneric = true;
      continue;
    }
    addLedger(bank, "asset", "bank", "1021", "Bank account");
  }

  for (const name of activeProfile.ledgers || []) {
    if (EXPENSE_LEDGER_INCOME.has(normName(name))) addLedger(name, "income", "income", "4320", "Income");
    else addLedger(name, "expense", "expense", "5130", `Common for ${activeProfile.label}`);
  }
  if (!sellsProducts) addLedger("Service Income", "income", "income", "4310", "Income from services");

  const haveCategories = new Set((categories || []).map(category => normName(category.name)));
  const newCategories = keepsStock
    ? (activeProfile.categories || []).filter(name => !haveCategories.has(normName(name)))
    : [];

  const gstChanged = gstRegistration !== (company?.gstRegistration || "unregistered")
    || gstin !== normalizeGstin(company?.gstin || "")
    || pan !== normalizePan(company?.pan || "")
    || stateCode !== (company?.stateCode || "");
  const gst = gstChanged && !keepCompany
    ? { gstRegistration, gstin, pan, legalName: companyName, stateCode, stateName }
    : null;

  const summary = [];
  if (keepCompany) {
    summary.push({
      id: "company",
      title: companyName || "This company",
      detail: "Company name, GST and books start date stay as they are. Change them in Setup if you need to.",
    });
  } else {
    const start = keptStart
      ? `Books start on ${shortDate(keptStart)}, as before, because entries are already posted.`
      : `Books start on ${shortDate(booksStartedOn) || "the first day of this financial year"}.`;
    summary.push({
      id: "company",
      title: companyName || "Your company",
      detail: renamedFrom ? `Renamed from ${renamedFrom}. ${start}` : start,
    });
  }
  if (!keepCompany) summary.push({
    id: "gst",
    title: gstRegistration === "regular" ? "GST: regular" : gstRegistration === "composition" ? "GST: composition" : "No GST",
    detail: gstRegistration === "unregistered"
      ? `Invoices go out without GST.${pan ? ` PAN ${pan}.` : ""} You can register later in Setup.`
      : `${stateName ? `${stateName}. ` : ""}${gstin ? `GSTIN ${gstin}. ` : "Add your GSTIN in Setup before your first GST invoice. "}${pan ? `PAN ${pan}. ` : ""}Tax ledgers are ready.`,
  });
  if (banks.length) {
    summary.push({ id: "banks", title: `Bank: ${banks.join(", ")}`, detail: "Cash in Hand and UPI are already there." });
  } else {
    summary.push({ id: "banks", title: "Cash and UPI", detail: "You can add a bank account any time." });
  }
  summary.push({
    id: "selling",
    title: sellsProducts ? (keepsStock ? "Products with stock" : "Products without stock tracking") : "Services",
    detail: newCategories.length
      ? `Item categories: ${newCategories.join(", ")}.`
      : sellsProducts ? "Sales go to the Sales ledger." : "Sales go to Service Income.",
  });
  summary.push({
    id: "credit",
    title: answers.credit === false ? "Paid on the spot" : "Credit sales",
    detail: answers.credit === false
      ? "Sales are recorded as paid. You can still sell on credit when you need to."
      : "Customer balances and due dates are tracked for every credit sale. Set credit days per customer in Parties.",
  });
  const extra = ledgers.filter(ledger => ledger.accountType !== "bank").map(ledger => ledger.name);
  if (extra.length) summary.push({ id: "ledgers", title: "Extra ledgers", detail: `${extra.join(", ")}.` });

  return {
    profile: activeProfile,
    company: { companyName, booksStartedOn, industry: activeProfile.industry },
    companyChanged: !keepCompany && (companyName !== currentName || booksStartedOn !== (company?.booksStartedOn || "")),
    renamedFrom,
    gst,
    ledgers,
    renames,
    categories: newCategories,
    existing,
    summary,
  };
}

/**
 * Runs the setup. `api` holds the repository calls so this stays testable:
 * { initialize?, saveCompany, saveGst, loadAccounts, loadCategories, createLedger, renameLedger, createCategory, saveIndustry }.
 * Accounts and categories are reloaded after the books open so nothing is created twice.
 */
export async function applySetupPlan(answers, { profile, company, vouchers = [], booksOpen = true, keepCompany = false }, api, onProgress = () => {}) {
  const done = [];
  const failed = [];
  const step = async (label, work) => {
    onProgress({ label, status: "running" });
    try {
      await work();
      done.push(label);
      onProgress({ label, status: "done" });
    } catch (error) {
      failed.push({ label, message: error?.message || "Failed" });
      onProgress({ label, status: "failed", message: error?.message || "Failed" });
    }
  };
  const intended = buildSetupPlan(answers, { profile, vouchers, company, keepCompany });
  const { companyName, booksStartedOn } = intended.company;
  if (!booksOpen) {
    await step("Open the books", () => api.initialize({ companyName, booksStartedOn }));
    if (failed.length) return { done, failed };
  } else if (intended.companyChanged) {
    await step("Save company details", () => api.saveCompany({ companyName, booksStartedOn }));
  }
  if (profile?.industry) api.saveIndustry?.(profile.industry);

  const accounts = await api.loadAccounts();
  const categories = await api.loadCategories().catch(() => []);
  const plan = buildSetupPlan(answers, { profile, accounts, categories, vouchers, company, keepCompany });
  if (plan.gst) await step("Save GST settings", () => api.saveGst(plan.gst));
  for (const rename of plan.renames) await step(`Rename ${rename.account.name} to ${rename.name}`, () => api.renameLedger(rename.account, rename.name));
  for (const ledger of plan.ledgers) await step(`Add ${ledger.name} ledger`, () => api.createLedger(ledger));
  for (const name of plan.categories) await step(`Add ${name} category`, () => api.createCategory(name));
  return { done, failed, plan };
}
