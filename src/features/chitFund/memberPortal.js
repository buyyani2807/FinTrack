import { CHIT_TYPES } from "./fixedChit.js";

export function portalMemberships(state = {}) {
  return Array.isArray(state.memberships) ? state.memberships : [];
}

export function chitTypeLabel(type) {
  if (type === CHIT_TYPES.FIXED) return "Fixed";
  if (type === CHIT_TYPES.FIXED_PREDEFINED_BID) return "Fixed Predefined Bid";
  return "Auction";
}

export function membershipEnrollmentId(row = {}) {
  return row.enrollmentId || row.enrollment_id || "";
}
