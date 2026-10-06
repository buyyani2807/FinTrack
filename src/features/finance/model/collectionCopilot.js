import { formatInr } from "../../../lib/formatMoney.js";
import { hasWhatsAppPhone } from "../../receipts/model/phoneNormalize.js";
import { buildDailyFinanceFacts, buildMonthlyFinanceFacts } from "./financeIntelligence.js";

const money = formatInr;

export const REMINDER_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "te", label: "Telugu" },
  { id: "ta", label: "Tamil" },
  { id: "kn", label: "Kannada" },
];

const REMINDER_TEMPLATES = {
  en: "Hello {name}, {due} is due on {date}. Outstanding is {outstanding}. — {business}",
  hi: "नमस्ते {name}, {date} को {due} देय है। कुल बकाया {outstanding} है। — {business}",
  te: "నమస్కారం {name}, {date} న {due} చెల్లించాలి. మిగిలిన బకాయి {outstanding}. — {business}",
  ta: "வணக்கம் {name}, {date} அன்று {due} செலுத்த வேண்டும். மீதமுள்ள தொகை {outstanding}. — {business}",
  kn: "ನಮಸ್ಕಾರ {name}, {date} ರಂದು {due} ಬಾಕಿ ಇದೆ. ಒಟ್ಟು ಬಾಕಿ {outstanding}. — {business}",
};

function fill(template, fields) {
  return Object.entries(fields).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value ?? ""),
    template,
  );
}

export function draftCollectionReminder({ name, due, outstanding, date, businessName }, language = "en") {
  const template = REMINDER_TEMPLATES[language] || REMINDER_TEMPLATES.en;
  return fill(template, {
    name: name || "Customer",
    due: money(due || 0),
    outstanding: money(outstanding || 0),
    date: date || "",
    business: businessName || "FinTrack",
  });
}

export function reminderSendAllowed({ confirmed = false, phone = "", message = "" } = {}) {
  return Boolean(confirmed && String(message || "").trim() && hasWhatsAppPhone(phone));
}

function withPhone(rows, loans) {
  const byId = new Map((loans || []).map(loan => [loan.id, loan]));
  return (rows || []).map(row => ({
    ...row,
    phone: byId.get(row.id)?.phone || "",
    why: row.why || [],
  }));
}

export function buildCollectionCopilot(loans = [], { kind = "daily", asOf, isOwner = true, businessName = "" } = {}) {
  const monthly = kind === "monthly";
  const facts = monthly
    ? buildMonthlyFinanceFacts(loans, { asOf, isOwner })
    : buildDailyFinanceFacts(loans, { asOf, isOwner });
  const ranked = withPhone(facts.priorities, loans);
  const actions = [
    ranked.length ? `Visit ${ranked[0].name} first.` : null,
    monthly && facts.missedRepeatCount ? `${facts.missedRepeatCount} customer${facts.missedRepeatCount === 1 ? " has" : "s have"} missed more than one month.` : null,
    !monthly && facts.repeatedMissCount ? `${facts.repeatedMissCount} customer${facts.repeatedMissCount === 1 ? " has" : "s have"} missed several recent daily collections.` : null,
    "Collect still records the payment. This list does not change balances, credit scores, or assignments.",
  ].filter(Boolean);
  const summary = monthly
    ? `This month: ${money(facts.collectedThisMonth)} collected of ${money(facts.expectedThisMonth)} expected. ${money(facts.pendingThisMonth)} is still pending.`
    : `Today: ${money(facts.collectedToday)} collected of ${money(facts.expectedToday)} expected. ${money(facts.pendingToday)} is still pending.`;
  return {
    kind,
    asOf,
    businessName,
    scopedToAssigned: !isOwner,
    summary,
    collected: monthly ? facts.collectedThisMonth : facts.collectedToday,
    expected: monthly ? facts.expectedThisMonth : facts.expectedToday,
    pending: monthly ? facts.pendingThisMonth : facts.pendingToday,
    ranked,
    actions,
    disclaimer: "Advisory only. A reminder is sent only after you confirm it. Nothing here closes the day or changes the books.",
  };
}
