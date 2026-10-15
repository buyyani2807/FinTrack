/* global process */
import { normalizeEntryIntent } from "../../src/features/accounts/model/bookkeeper.js";
import { SETUP_INDUSTRIES, normalizeBusinessProfile } from "../../src/features/accounts/model/setupAssistant.js";
import { modelCandidates } from "./bill-scan.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

const json = (res, status, body) => res.status(status).json(body);

const ACTIONS = "expense, asset_purchase, stock_purchase, sale, receipt, supplier_payment, transfer, other_income, capital, drawings, loan_received, loan_repayment";

export function bookkeeperPrompt({ text, today, moneyAccounts = [], expenseLedgers = [] }) {
  return `A small Indian business owner described one transaction in plain words. Read it and return JSON only.
Use this shape:
{"action":"","amount":0,"date":"","item":"","party":"","paidVia":"","toAccount":"","settlement":"","expenseHint":"","service":false,"gstRate":null,"gstIncluded":null,"gstMentioned":false}
action is one of: ${ACTIONS}.
- asset_purchase is something the business keeps and uses for years, such as a laptop, furniture, a vehicle, or a machine.
- stock_purchase is goods bought to sell. expense is a running cost such as rent, salary, electricity, fuel, or repairs.
- receipt is money received from a customer. supplier_payment is money paid to a supplier against what is owed.
- transfer moves money between cash, bank, and UPI accounts of the same business. capital is the owner putting in money. drawings is the owner taking money for personal use.
amount is the rupee amount as a number: ₹1.2 lakh is 120000 and 85k is 85000. date is YYYY-MM-DD, or empty when no date is said. Today is ${today}.
item is the thing bought, such as "laptop". party is the customer or supplier name exactly as written, or empty.
paidVia is the account the money left from or came into, such as "HDFC", "cash", or "UPI". For a transfer, paidVia is where the money came from and toAccount is where it went.
settlement is "credit" when it is not paid yet, "paid" when it is paid now, or empty when not said.
expenseHint is the kind of expense, such as "Rent". service is true when a service was sold rather than goods.
gstRate is the GST percent when said. gstIncluded is true when the amount includes GST, false when GST is on top, or null when not said.
The business's money accounts are: ${moneyAccounts.join(", ") || "Cash, Bank, UPI"}. Its expense ledgers are: ${expenseLedgers.join(", ") || "Rent, Salary, Electricity"}.
Copy only what the sentence says. Do not invent a party, an amount, or a date.
Sentence: ${JSON.stringify(text)}`;
}

export function businessPrompt(text) {
  return `A small Indian business owner described their business in a few words. Return JSON only, in this shape:
{"label":"","industry":"","sellsProducts":true,"keepsStock":true,"sellsOnCredit":false,"categories":[],"ledgers":[]}
label is a short lowercase description such as "electrical goods wholesale".
industry is one of: ${SETUP_INDUSTRIES.join(", ")}.
sellsProducts, keepsStock and sellsOnCredit are what is usual for this kind of business in India.
categories are up to 6 item categories for the stock this business sells, or [] when it sells only services.
ledgers are up to 3 expense ledgers this kind of business commonly needs beyond Rent, Salary, Electricity, Internet, Fuel, Travel, Marketing, Maintenance, Bank Charges and Professional Fees.
Description: ${JSON.stringify(text)}`;
}

export function ledgerMappingPrompt(ledgers, targets) {
  return `An Indian business is moving its books from Tally, Zoho Books or Excel to FinTrack.
For each old ledger below, choose where it belongs in FinTrack. Return JSON only, in this shape:
{"suggestions":[{"name":"","target":""}]}
target must be one of these values exactly:
${targets.map(target => `${target.value} = ${target.label}`).join("\n")}
Use "skip" only for ledgers that hold no money, such as a heading. Do not invent values.
Old ledgers (name, then its group in the old books):
${ledgers.map(ledger => `- ${JSON.stringify(ledger.name)} · ${JSON.stringify(ledger.group || "no group")}`).join("\n")}`;
}

export function normalizeLedgerSuggestions(raw, ledgers, targets) {
  const allowed = new Set(targets.map(target => target.value));
  const names = new Set(ledgers.map(ledger => ledger.name));
  return (Array.isArray(raw?.suggestions) ? raw.suggestions : [])
    .map(item => ({ name: String(item?.name || ""), target: String(item?.target || "") }))
    .filter(item => names.has(item.name) && allowed.has(item.target));
}

const pairs = (value, max, fields) => (Array.isArray(value) ? value : [])
  .slice(0, max)
  .map(item => Object.fromEntries(fields.map(field => [field, String(item?.[field] || "").replace(/\s+/g, " ").trim().slice(0, 80)])))
  .filter(item => item[fields[0]]);

async function signedIn(token) {
  if (!supabaseUrl || !anonKey || !token) return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

function modelText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part.text || "").join("").trim();
}

export function parseIntentJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The assistant did not return an entry.");
  }
}

const names = value => (Array.isArray(value) ? value : [])
  .map(item => String(item || "").replace(/\s+/g, " ").trim().slice(0, 60))
  .filter(Boolean)
  .slice(0, 40);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!await signedIn(token)) return json(res, 401, { error: "Sign in required" });
  if (!geminiKey) return json(res, 503, { error: "The assistant is not set up on this server yet." });

  const kind = req.body?.kind === "business" || req.body?.kind === "ledgers" ? req.body.kind : "entry";
  const text = String(req.body?.text || "").replace(/\s+/g, " ").trim();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.today || "")) ? req.body.today : new Date().toISOString().slice(0, 10);
  const ledgers = kind === "ledgers" ? pairs(req.body?.ledgers, 80, ["name", "group"]) : [];
  const targets = kind === "ledgers" ? pairs(req.body?.targets, 200, ["value", "label"]) : [];
  if (kind === "ledgers" && (!ledgers.length || !targets.length)) return json(res, 400, { error: "Nothing to map." });
  if (kind !== "ledgers" && !text) return json(res, 400, { error: kind === "business" ? "Describe the business." : "Describe what happened." });
  if (text.length > 500) return json(res, 413, { error: "Keep it to a sentence or two." });

  const prompt = kind === "ledgers" ? ledgerMappingPrompt(ledgers, targets)
    : kind === "business" ? businessPrompt(text)
      : bookkeeperPrompt({
        text,
        today,
        moneyAccounts: names(req.body?.moneyAccounts),
        expenseLedgers: names(req.body?.expenseLedgers),
      });
  const shape = reply => {
    if (kind === "ledgers") return { suggestions: normalizeLedgerSuggestions(parseIntentJson(reply), ledgers, targets) };
    if (kind === "business") return { profile: normalizeBusinessProfile(parseIntentJson(reply), text) };
    return { intent: normalizeEntryIntent({ ...parseIntentJson(reply), text }) };
  };
  try {
    let status = 502;
    for (const model of modelCandidates()) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      status = response.status;
      if (response.ok) {
        const reply = modelText(payload);
        if (!reply) break;
        return json(res, 200, shape(reply));
      }
      if (status !== 404) break;
    }
    return json(res, 502, { error: "The assistant could not read that sentence." });
  } catch {
    return json(res, 502, { error: "The assistant could not read that sentence." });
  }
}
