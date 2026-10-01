import { formatInr as money } from "../../../lib/formatMoney.js";

export const paymentValue = (loan, transaction) => loan.kind === "daily" ? Number(transaction.amount || 0) : Number(transaction.interestAmount || 0) + Number(transaction.principalAmount || 0) + Number(transaction.penaltyAmount || 0);
export const paymentModeLabel = transaction => transaction.mode === "cash_upi" ? `Cash + UPI (Cash ${money(transaction.cashAmount)} · UPI ${money(transaction.upiAmount)})` : transaction.mode === "upi" ? "UPI" : transaction.mode === "cash" ? "Cash" : "Bank transfer";
