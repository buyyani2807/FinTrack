import { dailyFirstDueDate, today } from "./loanState.js";

const isoDate = value => String(value || "").slice(0, 10);

/** Earliest date a collection may be recorded for this account (India business dates). */
export function earliestPaymentDate(loan) {
  const start = isoDate(loan?.startDate);
  if (!start) return "";
  return loan?.kind === "daily" ? dailyFirstDueDate(start) : start;
}

/**
 * Why a payment date is not allowed, or "" when it is.
 * Collections cannot be dated in the future or before the account could first be collected.
 */
export function paymentDateError(loan, date, asOf = today()) {
  const value = isoDate(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Choose a payment date.";
  if (value > isoDate(asOf)) return "A payment cannot be dated in the future.";
  const earliest = earliestPaymentDate(loan);
  if (earliest && value < earliest) {
    return loan?.kind === "daily"
      ? `Daily collections start the day after the account opens (${earliest}).`
      : `A payment cannot be dated before the account start date (${earliest}).`;
  }
  return "";
}
