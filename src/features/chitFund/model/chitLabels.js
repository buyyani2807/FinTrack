export const CHIT_PAYMENT_MODES = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "cash_upi", label: "Cash + UPI" },
];

export const CHIT_LIFT_LABELS = {
  lift: "Lift",
  amount: "Lift amount",
  member: "Lift member",
  date: "Lift date",
  method: "Lift method",
  status: "Lift status",
  history: "Lift history",
  record: "Record Lift",
  details: "View Lift details",
  report: "Lift report",
};

export function chitPaymentModeLabel(mode) {
  const match = CHIT_PAYMENT_MODES.find(item => item.id === mode);
  if (match) return match.label;
  const text = String(mode || "").trim();
  return text || "—";
}

export function paymentReversalPrompt(payment = {}) {
  return {
    title: "Reverse this payment?",
    lines: [
      ["Member", payment.memberName || "—"],
      ["Scheme", payment.schemeName || "—"],
      ["Amount", payment.amount || "—"],
      ["Payment date", payment.paidDate || "—"],
      ["Payment mode", chitPaymentModeLabel(payment.mode)],
      ["Reference", payment.reference || "—"],
    ],
    effect: "The collected amount is cleared on the existing payment row. The payment id stays in the audit trail. This updates the member balance, installment status, statement, scheme collections, receipt, and the linked cashbook and accounts entries. Auction results, lift amounts, dividends, and commission stay as they are.",
  };
}

export function paymentReversalReasonError(reason) {
  if (!String(reason || "").trim()) return "Enter a reason for this reversal.";
  return "";
}
