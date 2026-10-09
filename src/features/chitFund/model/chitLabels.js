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
  record: "Lift Chit",
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

export const MEMBER_STANDINGS = {
  regular: { label: "Regular", tone: "active" },
  defaulter: { label: "Defaulter", tone: "overdue" },
  bankrupt: { label: "Bankrupt", tone: "bankrupt" },
};

export function memberStanding(enrollment = {}) {
  const value = String(enrollment.member_standing || "regular").toLowerCase();
  return MEMBER_STANDINGS[value] ? value : "regular";
}

export function memberStandingAction(standing) {
  if (standing === "defaulter") return {
    title: "Mark member defaulter",
    description: "The member stays in the scheme. Installments, lifts, dividends, and commission do not change. Add a reason for your records.",
    noteLabel: "Defaulter reason",
  };
  if (standing === "bankrupt") return {
    title: "Mark member bankrupt",
    description: "The member stays in the scheme and the outstanding dues stay on record. Installments, lifts, dividends, and commission do not change. Add a reason for your records.",
    noteLabel: "Bankruptcy reason",
  };
  return {
    title: "Mark member regular",
    description: "The defaulter or bankrupt flag is removed. Payments and dues do not change.",
    noteLabel: "",
  };
}

export function memberStandingError(standing, note) {
  if (!MEMBER_STANDINGS[standing]) return "Choose a valid standing.";
  if (standing !== "regular" && !String(note || "").trim()) return "A reason is required.";
  return "";
}
