import { roundMoney } from "../../accounts/model/accountingModel.js";

export const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

/** Words an advisory insight must never use; outputs describe patterns, not intent. */
const ACCUSATORY = /\b(fraud|fraudulent|theft|stole|stolen|scam|cheat|cheating|embezzle|criminal)\b/i;

export const n = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const isoDate = value => String(value || "").slice(0, 10);

export const addDaysIso = (iso, days) => {
  const date = new Date(`${isoDate(iso)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};

export const daysBetween = (fromIso, toIso) => {
  const from = new Date(`${isoDate(fromIso)}T12:00:00Z`);
  const to = new Date(`${isoDate(toIso)}T12:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to - from) / 86400000);
};

export const monthKeyOf = iso => isoDate(iso).slice(0, 7);

export const shiftMonthKey = (key, offset) => {
  const [year, month] = String(key).split("-").map(Number);
  if (!year || !month) return "";
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const pctChange = (current, baseline) => {
  if (!(Math.abs(n(baseline)) > 0)) return null;
  return roundMoney(((n(current) - n(baseline)) / Math.abs(n(baseline))) * 100);
};

export const average = values => {
  const list = (values || []).map(Number).filter(Number.isFinite);
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
};

export const median = values => {
  const list = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
};

export const stdDev = values => {
  const list = (values || []).map(Number).filter(Number.isFinite);
  if (list.length < 2) return 0;
  const mean = average(list);
  return Math.sqrt(list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (list.length - 1));
};

/** Confidence as a label and a percentage, from how much comparable history backs the insight. */
export function confidenceFor(samples, { high = 6, medium = 3 } = {}) {
  const count = n(samples);
  if (count >= high) return { confidence: "high", confidencePct: 85 };
  if (count >= medium) return { confidence: "medium", confidencePct: 65 };
  return { confidence: "low", confidencePct: 40 };
}

export const severityFromPct = (pct, { medium = 20, high = 50 } = {}) => {
  const value = Math.abs(n(pct));
  if (value >= high) return "high";
  if (value >= medium) return "medium";
  return "low";
};

export const bySeverity = (a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);

export function assertAdvisoryText(text) {
  if (ACCUSATORY.test(String(text || ""))) throw new Error(`Advisory text must not accuse: ${text}`);
  return text;
}

/** Every AI insight carries the same advisory contract: no writes, an explanation, and a source. */
export function advisory(insight) {
  const result = {
    severity: "low",
    confidence: "low",
    confidencePct: 40,
    source: null,
    ...insight,
    advisory: true,
    writeAction: "none",
  };
  assertAdvisoryText(result.title);
  assertAdvisoryText(result.explanation);
  return result;
}

export const source = (section, label, extra = {}) => ({ section, label, ...extra });

export const formatInr = value => `₹${roundMoney(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export { roundMoney };
