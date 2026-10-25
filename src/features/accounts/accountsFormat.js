import { PARTY_TYPES } from "./model/accountingModel.js";
import { formatInr } from "../../lib/formatMoney.js";

export const money = formatInr;
// Short rupee amounts for chart axes and bar labels: ₹950, ₹4.5K, ₹1.2L, ₹3Cr.
export const axisMoney = value => {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const trim = text => text.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
  if (abs >= 10000000) return `₹${trim((n / 10000000).toFixed(1))}Cr`;
  if (abs >= 100000) return `₹${trim((n / 100000).toFixed(1))}L`;
  if (abs >= 1000) return `₹${trim((n / 1000).toFixed(1))}K`;
  return `₹${Math.round(n)}`;
};
// A round gridline step (1, 2, 2.5 or 5 × a power of ten) at least `raw` wide.
export const niceStep = raw => {
  if (raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(factor => factor * power).find(step => step >= raw);
};
export const sharePercent = share => (share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`);
export const qty = (value, unit) => `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
export const formatOverviewDate = iso => {
  if (!iso) return "—";
  const [year, month, day] = String(iso).split("-").map(Number);
  if (!year || !month || !day) return String(iso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};
export const partyTypeLabel = id => PARTY_TYPES.find(type => type.id === id)?.label || id;
export const gstStatusLabel = company => {
  const reg = company?.gstRegistration || "unregistered";
  if (reg === "regular") return company.gstin ? `GST Regular · ${company.gstin}` : "GST Regular";
  if (reg === "composition") return "GST Composition";
  return "GST unregistered";
};
export const bankMatchLabel = status => (status === "matched" ? "Reconciled" : status === "suggested" ? "Suggested" : status === "ignored" ? "Ignored" : "Unmatched");
export const bankMatchTone = status => (status === "matched" ? "active" : status === "suggested" ? "suggested" : status === "ignored" ? "inactive" : "inactive");
export const PARTY_TYPE_FILTERS = [
  { id: "all", label: "All", emptyTitle: "No parties found", emptyCopy: "Try a different search or clear the filter." },
  { id: "customer", label: "Customers", emptyTitle: "No customers found", emptyCopy: "No customer parties match this search." },
  { id: "supplier", label: "Suppliers", emptyTitle: "No suppliers found", emptyCopy: "No supplier parties match this search." },
  { id: "agent", label: "Agents", emptyTitle: "No agents found", emptyCopy: "No agent parties match this search." },
  { id: "other", label: "Other", emptyTitle: "No other parties found", emptyCopy: "No other parties match this search." },
];
