import { chitTypeLabel } from "./memberPortal.js";
import { schemeStatusLabel } from "./chitFormat.js";

// Same order for every type: Overview, Members, the month-by-month lifts, Payments, then Reports.
// Auction adds its live auction next to its lifts, and Dividends after Payments (only auctions pay dividends).
// Tab ids are part of the URL (/chit-fund/schemes/:id/:tab) and are kept as they were.
export const CHIT_SCHEME_TABS = {
  auction: [
    ["overview", "Overview"],
    ["members", "Members"],
    ["bids", "Bids & lifts"],
    ["live", "Live bidding"],
    ["payments", "Payments"],
    ["dividends", "Dividends"],
    ["reports", "Reports"],
  ],
  fixed: [
    ["overview", "Overview"],
    ["members", "Members"],
    ["schedule", "Lift schedule"],
    ["payments", "Payments"],
    ["reports", "Reports"],
  ],
  predefined: [
    ["overview", "Overview"],
    ["members", "Members"],
    ["schedule", "Lift schedule"],
    ["payments", "Payments"],
    ["reports", "Reports"],
  ],
};

export const chitSchemeTabIds = kind => (CHIT_SCHEME_TABS[kind] || CHIT_SCHEME_TABS.auction).map(([id]) => id);

export function chitSchemeSubtitle(scheme, enrollments = []) {
  const count = Array.isArray(enrollments) ? enrollments.length : Number(enrollments) || 0;
  return `${chitTypeLabel(scheme?.chit_type)} · ${scheme?.duration_months || "—"} months · ${count}/${scheme?.member_count || "—"} members · ${schemeStatusLabel(scheme?.status)}`;
}

export function chitPaymentActionLabel(paid) {
  return Number(paid) > 0 ? "Edit payment" : "Record payment";
}

export function chitScheduleStatusLabel(status) {
  if (status === "completed") return "Lifted";
  if (status === "pending") return "Pending";
  return status || "—";
}
