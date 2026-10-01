import { CHIT_TYPES } from "./fixedChit";
import { formatInr } from "../../../lib/formatMoney.js";

const indiaCalendarDate = date => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
export const today = () => indiaCalendarDate(new Date());
export const money = formatInr;
export const formatChitDate = iso => {
  if (!iso) return "—";
  const [year, month, day] = String(iso).slice(0, 10).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day}-${months[Number(month) - 1]}-${year}`;
};
export const formatTime = iso => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }); }
  catch { return String(iso); }
};
export const schemeStatusLabel = status => status === "closed" ? "Completed" : status === "active" ? "Active" : "Draft";
export const enrollmentName = enrollment => enrollment?.chit_members?.full_name || enrollment?.full_name || "Member";
export const canEnrollMoreMembers = (scheme, enrollments = []) =>
  ["draft", "active"].includes(scheme?.status) && enrollments.length < Number(scheme?.member_count || 0);
export const nextAvailableTicket = (enrollments = [], memberCount = 0) => {
  const used = new Set(enrollments.map(item => Number(item.ticket_number) || 0));
  const limit = Math.max(Number(memberCount) || 0, enrollments.length + 1);
  for (let ticket = 1; ticket <= limit; ticket += 1) {
    if (!used.has(ticket)) return ticket;
  }
  return Math.max(0, ...used) + 1;
};
export const byMemberName = (a, b) => enrollmentName(a).localeCompare(enrollmentName(b), undefined, { sensitivity: "base" });
export const paymentsByMemberName = (payments, enrollments, cycles = []) => [...(payments || [])].sort((a, b) => {
  const order = byMemberName(
    enrollments.find(item => item.id === a.enrollment_id),
    enrollments.find(item => item.id === b.enrollment_id),
  );
  if (order) return order;
  const monthA = Number(a.payment_month || cycles.find(item => item.id === a.cycle_id)?.cycle_number || 0);
  const monthB = Number(b.payment_month || cycles.find(item => item.id === b.cycle_id)?.cycle_number || 0);
  return monthA - monthB;
});
export const latestCycle = cycles => cycles.length ? [...cycles].sort((a, b) => a.cycle_number - b.cycle_number).at(-1) : null;
export const paymentStatusClass = status => status === "paid" ? "completed" : status === "overdue" ? "overdue" : status === "partially paid" ? "active" : status === "waived" ? "closed" : "";
export const emptySchemeForm = (chitType = CHIT_TYPES.AUCTION) => ({ chitType, name: "", chitValue: "", durationMonths: "", memberCount: "", installmentAmount: "", commissionPercent: "", fixedCommissionAmount: "", fixedInitialLiftAmount: "", fixedMonthlyIncrement: "", predefinedStartingEmi: "", predefinedEmiIncrement: "", predefinedStartingComm: "", predefinedCommDecrement: "", predefinedStartingAuctionAmount: "", predefinedAuctionDecrement: "", predefinedStartingBidAmount: "", predefinedBidIncrement: "", predefinedManagerCommissionPercent: "", startDate: today(), minBidPercent: "70", maxBidPercent: "95", latePenaltyAmount: "0", securityDepositAmount: "0" });
export function groupRowsBySchemeId(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const key = row.scheme_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}
