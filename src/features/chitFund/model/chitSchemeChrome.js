import { chitTypeLabel } from "./memberPortal";
import { schemeStatusLabel } from "./chitFormat.js";

export const CHIT_SCHEME_TABS = {
  auction: [
    ["overview", "Overview"],
    ["members", "Members"],
    ["bids", "Monthly Bids"],
    ["payments", "Payments"],
    ["dividends", "Dividends"],
    ["live", "Live Bidding"],
  ],
  fixed: [
    ["overview", "Overview"],
    ["members", "Members"],
    ["schedule", "Schedule"],
    ["payments", "Payments"],
  ],
  predefined: [
    ["overview", "Overview"],
    ["members", "Members"],
    ["schedule", "Schedule"],
    ["payments", "Payments"],
  ],
};

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
