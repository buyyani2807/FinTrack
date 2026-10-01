import { cashUpiSplit, cashUpiSplitIsValid } from "./paymentSplit.js";

export function disbursementPayoutTotal(kind, disbursedAmount, principal) {
  return kind === "monthly" ? Number(principal || 0) : Number(disbursedAmount || 0);
}

export function disbursementPayoutSplit(mode, total, cashAmount, upiAmount) {
  const split = cashUpiSplit(mode || "cash", total, cashAmount, upiAmount);
  return {
    mode: mode || "cash",
    cashAmount: split.cash,
    upiAmount: split.upi,
  };
}

export function disbursementPayoutError(mode, total, cashAmount, upiAmount) {
  if (!(Number(total) > 0)) return "";
  if (!cashUpiSplitIsValid(mode || "cash", total, cashAmount, upiAmount)) {
    return "Cash and UPI payout amounts must both be positive and equal the amount paid to the customer.";
  }
  return "";
}
