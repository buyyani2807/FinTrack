export function memberRemovalCopy(memberName, schemeName) {
  const member = memberName || "this member";
  const scheme = schemeName || "this scheme";
  return {
    title: `Remove ${member}?`,
    body: `Remove ${member} from ${scheme}? Unpaid schedule rows for this member are deleted. Paid payments, auctions, lifts, and other financial records are kept and will block removal if they exist.`,
    confirm: "Remove member",
  };
}

export function schemeRemovalCopy(schemeName, memberCount = 0) {
  const scheme = schemeName || "this scheme";
  const members = Number(memberCount) || 0;
  const memberText = members === 1 ? "1 enrolled member" : `${members} enrolled members`;
  return {
    title: `Delete ${scheme}?`,
    body: `Permanently delete ${scheme} and its ${memberText}? Unpaid member schedules and draft auction records are removed. If this scheme has payments, auctions, completed lifts, or other financial records, deletion is blocked so that history is not corrupted.`,
    confirm: "Delete scheme",
  };
}

export function memberHasBlockingActivity({
  cycles = [],
  bids = [],
  installments = [],
  lifts = [],
  payments = [],
  predefinedSchedule = [],
} = {}, enrollmentId) {
  if (!enrollmentId) return false;
  if ((cycles || []).some(cycle => cycle.winning_enrollment_id === enrollmentId)) return true;
  if ((bids || []).some(bid => bid.enrollment_id === enrollmentId)) return true;
  if ((lifts || []).some(lift => lift.enrollment_id === enrollmentId && lift.status === "completed")) return true;
  if ((predefinedSchedule || []).some(item => item.enrollment_id === enrollmentId && item.status === "completed")) return true;
  const paid = row => Number(row.amount_paid || 0) > 0;
  if ((installments || []).some(row => row.enrollment_id === enrollmentId && paid(row))) return true;
  if ((payments || []).some(row => row.enrollment_id === enrollmentId && paid(row))) return true;
  return false;
}
