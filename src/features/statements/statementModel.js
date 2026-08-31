import { monthlyInterestOnBalance, monthlyRateOnDate } from "../finance/calculations.js";
import {
  financeAccountId,
  financeTypeLabel,
  formatReceiptDate,
  loanBalanceAt,
  nextMonthlyPayment,
  paymentModeText,
  paymentValue,
} from "../receipts/receiptModel.js";
import { chitPaymentAmounts, chitPaymentDisplayStatus, chitPaymentOutstanding } from "../chitFund/memberPayments.js";
import { chitTypeLabel } from "../chitFund/memberPortal.js";
import { enrollmentPortalId, winsForEnrollment } from "../chitFund/liveBidding.js";
import { CHIT_TYPES } from "../chitFund/fixedChit.js";
import { formatInr } from "../../lib/formatMoney.js";

const moneyFn = formatInr;

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const elapsedDays = (start, end) => {
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000));
};

const statusLabel = status => {
  const value = String(status || "active");
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const transactionsUpTo = (loan, asOf) =>
  [...(loan.transactions || [])]
    .filter(t => String(t.date || "").slice(0, 10) <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

const financeStatusAt = (loan, asOf) => {
  if (loan.status === "bankrupt" || loan.status === "closed") return loan.status;
  const outstanding = loanBalanceAt(loan, asOf);
  if (outstanding <= 0) return "completed";
  if (loan.kind === "daily") {
    return elapsedDays(loan.startDate, asOf) >= 100 ? "overdue" : "active";
  }
  return "active";
};

function buildDailySummary(loan, asOf, payments) {
  const paid = payments.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const outstanding = loan.status === "bankrupt" ? 0 : Math.max(0, Number(loan.collectionAmount || 0) - paid);
  const completed = Math.min(100, elapsedDays(loan.startDate, asOf) + 1);
  return {
    kind: "daily",
    financeAmount: Number(loan.disbursedAmount || 0),
    totalPayable: Number(loan.collectionAmount || 0),
    totalPaid: paid,
    outstanding,
    startDate: loan.startDate,
    repaymentPeriod: "100 Days",
    daysCompleted: completed,
    daysRemaining: Math.max(0, 100 - completed),
    dailyCollection: Number(loan.dailyCollection || 0),
    status: financeStatusAt(loan, asOf),
  };
}

function buildMonthlySummary(loan, asOf, payments) {
  const principalPaid = payments.reduce((sum, t) => sum + Number(t.principalAmount || 0), 0);
  const interestPaid = payments.reduce((sum, t) => sum + Number(t.interestAmount || 0), 0);
  const penaltyPaid = payments.reduce((sum, t) => sum + Number(t.penaltyAmount || 0), 0);
  const totalPaid = principalPaid + interestPaid + penaltyPaid;
  const outstanding = loan.status === "bankrupt" ? 0 : Math.max(0, Number(loan.principal || 0) - principalPaid);
  const rate = monthlyRateOnDate(loan, asOf);
  const monthlyInstallment = outstanding > 0 ? Math.round(monthlyInterestOnBalance(outstanding, rate)) : 0;
  const next = nextMonthlyPayment({ ...loan, transactions: payments }, asOf);
  const installmentsPaid = payments.filter(t => Number(t.interestAmount || 0) > 0 || Number(t.principalAmount || 0) > 0).length;
  return {
    kind: "monthly",
    loanAmount: Number(loan.principal || 0),
    totalPayable: Number(loan.principal || 0) + interestPaid + penaltyPaid,
    totalPaid,
    outstanding,
    principalPaid,
    interestPaid,
    penaltyPaid,
    monthlyInstallment,
    installmentsPaid,
    startDate: loan.startDate,
    nextDueDate: next?.dueDate || "",
    annualRate: rate,
    status: financeStatusAt(loan, asOf),
  };
}

function buildFinancePaymentRows(loan, payments) {
  let running = loan.kind === "daily"
    ? Number(loan.collectionAmount || 0)
    : Number(loan.principal || 0);
  return payments.map(t => {
    const amount = paymentValue(loan, t);
    if (loan.kind === "daily") {
      running = Math.max(0, running - Number(t.amount || 0));
    } else {
      running = Math.max(0, running - Number(t.principalAmount || 0));
    }
    return {
      id: t.id,
      date: t.date,
      amount,
      interestAmount: Number(t.interestAmount || 0),
      principalAmount: Number(t.principalAmount || 0),
      penaltyAmount: Number(t.penaltyAmount || 0),
      paymentMode: paymentModeText(t),
      cashAmount: Number(t.cashAmount || 0),
      upiAmount: Number(t.upiAmount || 0),
      splitPayment: t.mode === "cash_upi",
      collectedBy: t.collectorName || "Financier/Admin",
      reference: t.ref || "",
      notes: t.notes || "",
      balanceAfter: running,
      receiptNumber: t.receiptNumber || "",
    };
  });
}

export function buildFinanceAccountStatement(loan, asOf = todayIso()) {
  const date = String(asOf || todayIso()).slice(0, 10);
  const payments = transactionsUpTo(loan, date);
  const summary = loan.kind === "daily"
    ? buildDailySummary(loan, date, payments)
    : buildMonthlySummary(loan, date, payments);
  return {
    type: "finance",
    accountId: financeAccountId(loan),
    financeType: financeTypeLabel(loan.kind),
    kind: loan.kind,
    loanId: loan.id,
    customerId: loan.customerId || loan.portalId || financeAccountId(loan),
    customerName: loan.customerName,
    phone: loan.phone || "",
    address: loan.address || "",
    asOf: date,
    summary,
    payments: buildFinancePaymentRows(loan, payments),
    status: summary.status,
  };
}

export function relatedFinanceAccounts(loans = [], focusLoan) {
  if (!focusLoan) return [];
  const customerId = focusLoan.customerId;
  const phone = focusLoan.phone;
  const name = focusLoan.customerName;
  return (loans || []).filter(loan => {
    if (customerId && loan.customerId === customerId) return true;
    if (!customerId && phone && loan.phone === phone && loan.customerName === name) return true;
    return loan.id === focusLoan.id;
  });
}

function chitPaymentRows(rows = [], asOf) {
  return [...rows]
    .map(row => {
      const dueDate = String(row.due_date || row.dueDate || "").slice(0, 10);
      const paidDate = String(row.paid_date || row.paidDate || "").slice(0, 10);
      if (dueDate && dueDate > asOf && (!paidDate || paidDate > asOf)) return null;
      const amounts = chitPaymentAmounts(row);
      const paidAsOf = paidDate && paidDate <= asOf ? amounts.paid : 0;
      const displayRow = { ...row, amount_paid: paidAsOf };
      return {
        id: row.id,
        month: Number(row.payment_month || row.cycle_number || row.month_number || 0),
        dueDate,
        paidDate: paidDate && paidDate <= asOf ? paidDate : "",
        expected: amounts.expected,
        paid: paidAsOf,
        balance: Math.max(0, amounts.expected - paidAsOf),
        paymentMode: paymentModeText({ mode: row.payment_mode || row.mode, cashAmount: row.cash_amount, upiAmount: row.upi_amount }),
        cashAmount: Number(row.cash_amount || 0),
        upiAmount: Number(row.upi_amount || 0),
        splitPayment: (row.payment_mode || row.mode) === "cash_upi",
        reference: row.payment_reference || row.reference || "",
        notes: row.notes || "",
        status: chitPaymentDisplayStatus(displayRow, asOf),
        lateFee: amounts.lateFee,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.month || 0) - (b.month || 0) || a.dueDate.localeCompare(b.dueDate));
}

function winningCycleDetails(cycles = [], enrollmentId) {
  const cycle = (cycles || []).find(item => item.winning_enrollment_id === enrollmentId);
  if (!cycle) return null;
  return {
    month: Number(cycle.cycle_number || 0),
    winningBid: Number(cycle.winning_bid_amount || 0),
    discount: Number(cycle.discount_amount || 0),
    commission: Number(cycle.commission_amount || 0),
    distributable: Number(cycle.distributable_amount || 0),
    dividendPerMember: Number(cycle.dividend_per_member || 0),
    chitValue: Number(cycle.chit_value || 0),
    cycleDate: cycle.cycle_date || "",
  };
}

export function buildChitMemberStatement({
  scheme,
  enrollment,
  payments = [],
  cycles = [],
  bids = [],
  lift = null,
  predefinedItem = null,
  asOf = todayIso(),
} = {}) {
  const date = String(asOf || todayIso()).slice(0, 10);
  const history = chitPaymentRows(payments, date);
  const monthsPaid = history.filter(row => row.status === "paid").length;
  const totalMonths = Number(scheme?.duration_months || 0);
  const outstanding = history.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const wins = winsForEnrollment(cycles, bids, enrollment?.id, scheme?.chit_value);
  const winCycle = winningCycleDetails(cycles, enrollment?.id);
  const chitType = scheme?.chit_type || CHIT_TYPES.AUCTION;
  const installment = Number(scheme?.installment_amount || history[0]?.expected || 0);
  return {
    type: "chit",
    accountId: enrollmentPortalId(enrollment) || `CF-${String(enrollment?.id || "").slice(0, 8).toUpperCase()}`,
    financeType: "Chit Fund",
    kind: "chit",
    customerId: enrollmentPortalId(enrollment) || enrollment?.id || "",
    customerName: enrollment?.chit_members?.full_name || enrollment?.full_name || "Member",
    phone: enrollment?.chit_members?.phone || "",
    address: enrollment?.chit_members?.address || "",
    ticketNumber: enrollment?.ticket_number || "",
    asOf: date,
    scheme: {
      name: scheme?.name || "Chit Fund",
      chitType,
      chitTypeLabel: chitTypeLabel(chitType),
      chitValue: Number(scheme?.chit_value || 0),
      memberCount: Number(scheme?.member_count || 0),
      installment,
      totalMonths,
      status: scheme?.status || "active",
      startDate: scheme?.start_date || "",
    },
    summary: {
      monthsPaid,
      monthsRemaining: Math.max(0, totalMonths - monthsPaid),
      totalPaid: history.reduce((sum, row) => sum + Number(row.paid || 0), 0),
      outstanding,
      installment,
      status: scheme?.status || "active",
    },
    bid: wins.length || lift || predefinedItem ? {
      isWinner: Boolean(wins.length || lift || predefinedItem),
      winningMonth: wins[0]?.month || lift?.month_number || predefinedItem?.month_number || "",
      winningBid: wins[0]?.bidAmount || lift?.lift_amount || predefinedItem?.bid_amount || 0,
      bidDate: wins[0]?.bidDate || lift?.lift_date || predefinedItem?.assigned_date || "",
      amountPaidToMember: lift?.amount_paid_to_member || predefinedItem?.net_receivable || 0,
      managerCommission: lift?.manager_commission || predefinedItem?.manager_commission || winCycle?.commission || 0,
      discount: winCycle?.discount || 0,
      distributable: winCycle?.distributable || 0,
      dividendPerMember: winCycle?.dividendPerMember || 0,
      chitValue: Number(scheme?.chit_value || winCycle?.chitValue || 0),
    } : {
      isWinner: false,
      winningMonth: "",
      winningBid: 0,
    },
    payments: history,
    status: scheme?.status || "active",
  };
}

export function buildCustomerStatementBundle({
  loans = [],
  focusLoan = null,
  selectedAccountId = "all",
  asOf = todayIso(),
  settings = {},
} = {}) {
  const related = relatedFinanceAccounts(loans, focusLoan);
  const accounts = related.map(loan => buildFinanceAccountStatement(loan, asOf));
  const selected = selectedAccountId === "all"
    ? accounts
    : accounts.filter(account => account.loanId === selectedAccountId || account.accountId === selectedAccountId);
  const customer = focusLoan || related[0] || {};
  return {
    mode: "finance",
    asOf: String(asOf || todayIso()).slice(0, 10),
    customerName: customer.customerName || "",
    phone: customer.phone || "",
    address: customer.address || "",
    customerId: customer.portalId || customer.customerId || financeAccountId(customer),
    companyName: settings.companyName || "FinTrack",
    companyPhone: settings.companyPhone || "",
    companyAddress: settings.companyAddress || "",
    companyEmail: settings.companyEmail || "",
    receiptFooter: settings.receiptFooter || "Thank you for your business.",
    accounts: selected,
    allAccounts: accounts,
    money: moneyFn,
  };
}

export function buildChitStatementBundle({
  scheme,
  enrollment,
  payments,
  cycles,
  bids,
  lift,
  predefinedItem,
  asOf = todayIso(),
  settings = {},
} = {}) {
  const account = buildChitMemberStatement({
    scheme, enrollment, payments, cycles, bids, lift, predefinedItem, asOf,
  });
  return {
    mode: "chit",
    asOf: String(asOf || todayIso()).slice(0, 10),
    customerName: account.customerName,
    phone: account.phone,
    address: account.address,
    customerId: account.customerId,
    companyName: settings.companyName || "FinTrack",
    companyPhone: settings.companyPhone || "",
    companyAddress: settings.companyAddress || "",
    companyEmail: settings.companyEmail || "",
    receiptFooter: settings.receiptFooter || "Thank you for your business.",
    accounts: [account],
    allAccounts: [account],
    money: moneyFn,
  };
}

export function statementWhatsAppMessage(bundle) {
  const money = bundle.money || moneyFn;
  const primary = bundle.accounts[0];
  if (!primary) {
    return `Hi ${bundle.customerName},\n\nPlease find your latest account statement.\nStatement Date: ${formatReceiptDate(bundle.asOf)}\n\nThank you.\n${bundle.companyName}`;
  }
  if (primary.type === "chit") {
    return `Hi ${bundle.customerName},

Please find your latest Chit Fund statement.

Finance Type: Chit Fund
Chit Type: ${primary.scheme.chitTypeLabel}
Scheme: ${primary.scheme.name}
Total Paid: ${money(primary.summary.totalPaid)}
Outstanding: ${money(primary.summary.outstanding)}
Statement Date: ${formatReceiptDate(bundle.asOf)}

Thank you.
${bundle.companyName}`;
  }
  const outstanding = bundle.accounts.reduce((sum, account) => sum + Number(account.summary.outstanding || 0), 0);
  const totalPaid = bundle.accounts.reduce((sum, account) => sum + Number(account.summary.totalPaid || 0), 0);
  const accountLabel = bundle.accounts.length === 1
    ? primary.accountId
    : `${bundle.accounts.length} accounts`;
  const typeLabel = bundle.accounts.length === 1
    ? primary.financeType
    : bundle.accounts.map(account => account.financeType).join(", ");
  return `Hi ${bundle.customerName},

Please find your latest account statement.

Finance Type: ${typeLabel}
Account: ${accountLabel}
Total Paid: ${money(totalPaid)}
Outstanding: ${money(outstanding)}
Statement Date: ${formatReceiptDate(bundle.asOf)}

Thank you.
${bundle.companyName}`;
}

export { formatReceiptDate, moneyFn as money, todayIso, chitPaymentOutstanding };
