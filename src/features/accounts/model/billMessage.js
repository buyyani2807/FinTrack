// WhatsApp message for a bill sent to the customer's number with a link to its PDF.
// Short and friendly, like the invoice notes big billing apps send: the itemised bill
// lives in the PDF (and the link preview card), not in the chat.

const rupees = value => {
  const amount = Number(value || 0);
  const paise = Math.round(amount * 100) % 100 !== 0;
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const clean = value => String(value ?? "").replace(/\*/g, "").trim();

/** First name only, the way a shopkeeper would greet; "Cash customer" gets no name. */
export function greetingName(customerName) {
  const name = clean(customerName);
  if (!name || /^(cash|walk[- ]?in)\s*customer$/i.test(name)) return "";
  return name.replace(/\s*\(M:.*\)\s*$/i, "").split(/\s+/)[0];
}

export function customerBillMessage({
  businessName = "",
  businessPhone = "",
  customerName = "",
  billNo = "",
  amount = 0,
  balance = 0,
  paidBy = "",
  link = "",
  isReturn = false,
  // "invoice" for sales invoices from Accounts; Counter bills keep "bill".
  documentLabel = "bill",
  dueDate = "",
} = {}) {
  const shop = clean(businessName) || "our store";
  const name = greetingName(customerName);
  const due = Math.max(0, Number(balance || 0));
  const noun = documentLabel === "invoice" ? "invoice" : "bill";
  const Noun = noun === "invoice" ? "Invoice" : "Bill";
  const details = [
    billNo ? `${Noun} No: ${clean(billNo)}` : null,
    `${Noun} Amount: *${rupees(amount)}*`,
    due > 0
      ? `Balance Due: *${rupees(due)}*`
      : `Paid${clean(paidBy) ? ` (${clean(paidBy)})` : ""}: ${rupees(amount)}`,
    due > 0 && clean(dueDate) ? `Due Date: ${clean(dueDate)}` : null,
  ].filter(Boolean);
  const lines = [
    name ? `Hi ${name},` : "Hi,",
    "",
    `Thank you for shopping at *${shop}*.`,
    "",
    isReturn ? "Your return bill is ready." : `Your ${noun} is ready.`,
    ...details,
  ];
  if (link) lines.push("", `View your ${noun}:`, link);
  lines.push("", "Happy to serve you!", shop);
  if (clean(businessPhone)) lines.push(clean(businessPhone));
  return lines.join("\n");
}
