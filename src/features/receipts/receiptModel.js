import { monthlyInterestOnBalance } from "../finance/calculations.js";

const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const financeAccountId = loan => loan.portalId || `${loan.kind === "daily" ? "DF" : "MF"}-${String(loan.id || "").slice(0, 8).toUpperCase()}`;

export const financeTypeLabel = kind => (kind === "daily" ? "Daily Finance" : kind === "monthly" ? "Monthly Finance" : "Finance");

export const paymentModeText = transaction => {
  if (!transaction?.mode) return "—";
  if (transaction.mode === "cash_upi") return "Cash + UPI";
  if (transaction.mode === "upi") return "UPI";
  if (transaction.mode === "cash") return "Cash";
  if (transaction.mode === "bank") return "Bank Transfer";
  return String(transaction.mode);
};

export const paymentValue = (loan, transaction) => {
  if (loan?.kind === "monthly") {
    return Number(transaction.interestAmount || 0) + Number(transaction.principalAmount || 0) + Number(transaction.penaltyAmount || 0);
  }
  return Number(transaction.amount || 0);
};

export const loanBalanceAt = (loan, beforeDate, excludeId = "") => {
  if (loan.status === "bankrupt") return 0;
  if (loan.kind === "daily") {
    const paid = loan.transactions
      .filter(t => t.id !== excludeId && t.date <= beforeDate)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    return Math.max(0, Number(loan.collectionAmount || 0) - paid);
  }
  const principalPaid = loan.transactions
    .filter(t => t.id !== excludeId && t.date < beforeDate)
    .reduce((sum, t) => sum + Number(t.principalAmount || 0), 0);
  return Math.max(0, Number(loan.principal || 0) - principalPaid);
};

export function financeReceiptBalances(loan, transaction) {
  const previous = loanBalanceAt(loan, transaction.date, transaction.id);
  if (loan.kind === "monthly") {
    const remaining = Math.max(0, previous - Number(transaction.principalAmount || 0));
    return { previous, remaining };
  }
  return { previous, remaining: Math.max(0, previous - paymentValue(loan, transaction)) };
}

export function buildFinanceReceipt({ loan, transaction, settings = {}, workspace = {} }) {
  const balances = financeReceiptBalances(loan, transaction);
  const amount = paymentValue(loan, transaction);
  const isAgent = workspace.role === "staff";
  const dayProgress = loan.kind === "daily"
    ? Math.min(100, Math.max(0, Math.floor((new Date(`${transaction.date}T12:00:00`) - new Date(`${loan.startDate}T12:00:00`)) / 86400000) + 1))
    : 0;
  return {
    source: "finance",
    paymentId: transaction.id,
    receiptNumber: transaction.receiptNumber || "",
    paymentDate: transaction.date,
    paymentTime: transaction.createdAt
      ? new Date(transaction.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
      : new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }),
    companyName: settings.companyName || "FinTrack",
    companyAddress: settings.companyAddress || "",
    companyPhone: settings.companyPhone || "",
    companyEmail: settings.companyEmail || "",
    companyLogoUrl: settings.companyLogoUrl || "",
    receiptFooter: settings.receiptFooter || "Thank you for your payment.",
    receiptTerms: settings.receiptTerms || "",
    customerName: loan.customerName,
    customerPhone: loan.phone,
    accountId: financeAccountId(loan),
    financeType: financeTypeLabel(loan.kind),
    amount,
    paymentMode: paymentModeText(transaction),
    cashAmount: Number(transaction.cashAmount || 0),
    upiAmount: Number(transaction.upiAmount || 0),
    splitPayment: transaction.mode === "cash_upi",
    collectedBy: transaction.collectorName || workspace.fullName || "Financier",
    collectedByRole: isAgent ? "Collection Agent" : "Financier",
    previousBalance: balances.previous,
    remainingBalance: balances.remaining,
    totalFinanced: loan.kind === "daily" ? loan.collectionAmount : loan.principal,
    reference: transaction.ref || "",
    notes: transaction.notes || "",
    dailyFields: loan.kind === "daily" ? {
      dailyCollection: loan.dailyCollection,
      daysCompleted: dayProgress,
      daysRemaining: Math.max(0, 100 - dayProgress),
    } : null,
    monthlyFields: loan.kind === "monthly" ? {
      interestPaid: Number(transaction.interestAmount || 0),
      principalPaid: Number(transaction.principalAmount || 0),
      penaltyPaid: Number(transaction.penaltyAmount || 0),
    } : null,
    money,
  };
}

export function buildChitReceipt({
  source,
  paymentRow,
  memberName,
  memberPhone,
  schemeName,
  schemeDuration,
  settings = {},
  collectorName = "Financier",
}) {
  const amount = Number(paymentRow.amount_paid ?? paymentRow.paid ?? 0);
  const due = Number(paymentRow.net_amount_due ?? paymentRow.amount_due ?? paymentRow.expected ?? 0);
  const month = Number(paymentRow.payment_month ?? paymentRow.cycle_number ?? paymentRow.month_number ?? 0);
  return {
    source,
    paymentId: paymentRow.id,
    receiptNumber: paymentRow.receipt_number || paymentRow.receiptNumber || "",
    paymentDate: paymentRow.paid_date || paymentRow.paidDate || "",
    paymentTime: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }),
    companyName: settings.companyName || "FinTrack",
    companyAddress: settings.companyAddress || "",
    companyPhone: settings.companyPhone || "",
    companyEmail: settings.companyEmail || "",
    companyLogoUrl: settings.companyLogoUrl || "",
    receiptFooter: settings.receiptFooter || "Thank you for your payment.",
    receiptTerms: settings.receiptTerms || "",
    customerName: memberName,
    customerPhone: memberPhone,
    accountId: `CF-${String(paymentRow.enrollment_id || paymentRow.id || "").slice(0, 8).toUpperCase()}`,
    financeType: "Chit Fund",
    amount,
    paymentMode: paymentModeText({ mode: paymentRow.payment_mode || paymentRow.mode, cashAmount: paymentRow.cash_amount, upiAmount: paymentRow.upi_amount }),
    cashAmount: Number(paymentRow.cash_amount || 0),
    upiAmount: Number(paymentRow.upi_amount || 0),
    splitPayment: (paymentRow.payment_mode || paymentRow.mode) === "cash_upi",
    collectedBy: collectorName,
    collectedByRole: "Financier",
    previousBalance: Math.max(0, due),
    remainingBalance: Math.max(0, due - amount),
    totalFinanced: due,
    schemeName,
    chitFields: { month, totalMonths: schemeDuration, installmentDue: due },
    reference: paymentRow.payment_reference || paymentRow.reference || "",
    notes: paymentRow.notes || "",
    money,
  };
}

export function receiptWhatsAppVariables(receipt) {
  return {
    customer_name: receipt.customerName,
    amount: receipt.money(receipt.amount),
    receipt_number: receipt.receiptNumber,
    account_id: receipt.accountId,
    payment_date: formatReceiptDate(receipt.paymentDate),
    payment_mode: receipt.paymentMode,
    remaining_balance: receipt.money(receipt.remainingBalance),
    company_name: receipt.companyName,
    company_phone: receipt.companyPhone || "",
    due_date: formatReceiptDate(receipt.dueDate || receipt.paymentDate),
    days_remaining: receipt.daysRemaining != null ? String(receipt.daysRemaining) : "",
    scheme_name: receipt.schemeName || "",
    chit_type: receipt.chitType || "",
    month_number: receipt.chitFields?.month ? String(receipt.chitFields.month) : "",
    total_months: receipt.chitFields?.totalMonths ? String(receipt.chitFields.totalMonths) : "",
  };
}

export function formatReceiptDate(value = "") {
  if (!value) return "";
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function withReceiptBranding(receipt, settings = {}) {
  if (!receipt) return receipt;
  return {
    ...receipt,
    companyName: settings.companyName || receipt.companyName || "FinTrack",
    companyAddress: settings.companyAddress ?? receipt.companyAddress ?? "",
    companyPhone: settings.companyPhone ?? receipt.companyPhone ?? "",
    companyEmail: settings.companyEmail ?? receipt.companyEmail ?? "",
    companyLogoUrl: settings.companyLogoUrl ?? receipt.companyLogoUrl ?? "",
    receiptFooter: settings.receiptFooter || receipt.receiptFooter || "Thank you for your payment.",
    receiptTerms: settings.receiptTerms ?? receipt.receiptTerms ?? "",
  };
}

const addMonths = (start, n) => {
  const d = new Date(`${start}T12:00:00`);
  const day = d.getDate();
  d.setMonth(d.getMonth() + n, 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
};

export function nextMonthlyPayment(loan, asOf = "") {
  if (loan.kind !== "monthly" || loan.status === "closed" || loan.status === "bankrupt") return null;
  const balance = loanBalanceAt(loan, asOf || "9999-12-31");
  if (balance <= 0) return null;
  const today = asOf || new Date().toISOString().slice(0, 10);
  for (let n = 1; n <= 600; n += 1) {
    const dueDate = addMonths(loan.startDate, n);
    if (dueDate >= today) {
      const rate = [...(loan.rateChanges || [])].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
        .filter(r => r.effectiveDate <= dueDate).at(-1)?.annualRate || loan.annualRate || 0;
      const amount = Math.round(monthlyInterestOnBalance(balance, rate));
      const daysRemaining = Math.max(0, Math.floor((new Date(`${dueDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000));
      return { dueDate, amount, daysRemaining, outstanding: balance, cycleKey: dueDate };
    }
  }
  return null;
}
