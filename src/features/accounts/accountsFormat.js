import { PARTY_TYPES } from "./model/accountingModel.js";
import { formatInr } from "../../lib/formatMoney.js";

export const money = formatInr;
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
  { id: "employee", label: "Employees", emptyTitle: "No employees found", emptyCopy: "No employee parties match this search." },
  { id: "agent", label: "Agents", emptyTitle: "No agents found", emptyCopy: "No agent parties match this search." },
  { id: "other", label: "Other", emptyTitle: "No other parties found", emptyCopy: "No other parties match this search." },
];
