import { applyTemplate, resolveWhatsAppTemplate } from "./templateEngine.js";
import { canWhatsAppShare, openWhatsAppShare } from "./receiptWhatsApp.js";
import { formatReceiptDate } from "./receiptModel.js";
import { addDays, addMonths } from "../finance/loanState.js";
import { dailyInstallmentAmount, monthlyInterestOnBalance } from "../finance/calculations.js";
import { fixedChitPostLiftMonthlyPayment } from "../chitFund/fixedChit.js";

const EVENT = {
  daily: "daily_account_opened",
  monthly: "monthly_account_opened",
  chitLift: "chit_lift",
};

const TEMPLATE_BY_EVENT = {
  [EVENT.daily]: "daily_account_opened",
  [EVENT.monthly]: "monthly_account_opened",
  [EVENT.chitLift]: "chit_lift_confirmation",
};

const SETTING_BY_EVENT = {
  [EVENT.daily]: "daily_account",
  [EVENT.monthly]: "monthly_account",
  [EVENT.chitLift]: "chit_lift",
};

export const CONFIRMATION_EVENTS = EVENT;

export function defaultConfirmationSettings() {
  return { daily_account: true, monthly_account: true, chit_lift: true };
}

export function confirmationSettingsFromReminder(reminderSettings = {}) {
  const saved = reminderSettings?.confirmations || {};
  return {
    daily_account: saved.daily_account !== false,
    monthly_account: saved.monthly_account !== false,
    chit_lift: saved.chit_lift !== false,
  };
}

export function isConfirmationEnabled(settings = {}, eventType) {
  const key = SETTING_BY_EVENT[eventType];
  if (!key) return false;
  return confirmationSettingsFromReminder(settings.reminderSettings)[key] !== false;
}

export function formatConfirmationMoney(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function companyName(settings = {}, workspace = {}) {
  return settings.companyName || workspace.businessName || "FinTrack";
}

/** Build daily account-opened template variables from stored loan fields. */
export function buildDailyAccountOpenedVariables(loan, settings = {}, workspace = {}) {
  const financed = Number(loan.collectionAmount || 0);
  const paid = Number(loan.disbursedAmount || 0);
  const interest = Math.max(0, financed - paid);
  const rate = paid > 0 ? ((interest / paid) * 100) : 0;
  const daily = Number(loan.dailyCollection || dailyInstallmentAmount(financed) || 0);
  const completion = loan.startDate ? addDays(loan.startDate, 99) : "";
  return {
    customer_name: loan.customerName || "",
    account_number: loan.id || "",
    account_id: loan.id || "",
    financed_amount: formatConfirmationMoney(financed),
    amount_paid: formatConfirmationMoney(paid),
    interest_amount: formatConfirmationMoney(interest),
    interest_rate: rate ? `${rate.toFixed(2)}%` : "",
    total_repayment: formatConfirmationMoney(financed),
    daily_installment: formatConfirmationMoney(daily),
    monthly_installment: "",
    repayment_days: "100",
    repayment_months: "",
    repayment_frequency: "Daily",
    start_date: formatReceiptDate(loan.startDate),
    completion_date: formatReceiptDate(completion),
    first_payment_date: formatReceiptDate(loan.startDate),
    company_name: companyName(settings, workspace),
    company_phone: settings.companyPhone || "",
  };
}

/** Build monthly account-opened variables from stored loan fields (no invented tenure). */
export function buildMonthlyAccountOpenedVariables(loan, settings = {}, workspace = {}) {
  const principal = Number(loan.principal || 0);
  const rate = Number(loan.annualRate || 0);
  const firstInterest = monthlyInterestOnBalance(principal, rate);
  const firstDue = loan.startDate ? addMonths(loan.startDate, 1) : "";
  return {
    customer_name: loan.customerName || "",
    account_number: loan.id || "",
    account_id: loan.id || "",
    financed_amount: formatConfirmationMoney(principal),
    amount_paid: formatConfirmationMoney(principal),
    interest_amount: formatConfirmationMoney(firstInterest),
    interest_rate: rate ? `${rate}% per month` : "",
    total_repayment: "",
    daily_installment: "",
    monthly_installment: formatConfirmationMoney(firstInterest),
    repayment_days: "",
    repayment_months: "",
    repayment_frequency: "Monthly interest",
    start_date: formatReceiptDate(loan.startDate),
    completion_date: "",
    first_payment_date: formatReceiptDate(firstDue),
    company_name: companyName(settings, workspace),
    company_phone: settings.companyPhone || "",
  };
}

/** Build chit lift confirmation variables from existing scheme/lift/cycle fields. */
export function buildChitLiftVariables(payload = {}, settings = {}, workspace = {}) {
  const scheme = payload.scheme || {};
  const duration = Number(scheme.duration_months || scheme.durationMonths || 0);
  const monthNumber = Number(payload.monthNumber || 0);
  const remainingMonths = payload.remainingMonths != null
    ? Number(payload.remainingMonths)
    : (duration && monthNumber ? Math.max(0, duration - monthNumber) : "");
  const monthlyInstallment = payload.monthlyInstallment != null
    ? Number(payload.monthlyInstallment)
    : Number(scheme.installment_amount || scheme.installmentAmount || 0);
  return {
    customer_name: payload.memberName || "",
    member_name: payload.memberName || "",
    scheme_name: scheme.name || payload.schemeName || "",
    scheme_id: scheme.id || payload.schemeId || "",
    chit_value: formatConfirmationMoney(scheme.chit_value ?? scheme.chitValue),
    chit_type: payload.chitType || scheme.chit_type || "",
    month_number: monthNumber ? String(monthNumber) : "",
    winning_bid: payload.winningBid != null ? formatConfirmationMoney(payload.winningBid) : "",
    amount_lifted: payload.amountLifted != null ? formatConfirmationMoney(payload.amountLifted) : "",
    commission: payload.commission != null ? formatConfirmationMoney(payload.commission) : "",
    discount: payload.discount != null ? formatConfirmationMoney(payload.discount) : "",
    dividend: payload.dividend != null ? formatConfirmationMoney(payload.dividend) : "",
    monthly_installment: monthlyInstallment ? formatConfirmationMoney(monthlyInstallment) : "",
    remaining_months: remainingMonths === "" ? "" : String(remainingMonths),
    lift_date: formatReceiptDate(payload.liftDate || ""),
    company_name: companyName(settings, workspace),
    company_phone: settings.companyPhone || "",
  };
}

export function buildConfirmationMessage(eventType, variables, settings = {}) {
  const templateKey = TEMPLATE_BY_EVENT[eventType];
  const template = resolveWhatsAppTemplate(settings, templateKey);
  return applyTemplate(template, variables);
}

export function eventTypeForFinanceLoan(loan) {
  return loan?.kind === "monthly" ? EVENT.monthly : EVENT.daily;
}

/**
 * Auto-open WhatsApp confirmation after a successful transaction.
 * Never throws into the caller. Returns a small result for UI toasts.
 */
export async function sendTransactionConfirmation({
  token,
  eventType,
  sourceId,
  phone,
  variables,
  settings = {},
  claimConfirmation,
  updateConfirmationStatus,
  resend = false,
  recordResend,
}) {
  const result = {
    ok: false,
    skipped: false,
    reason: "",
    eventType,
    sourceId,
  };
  try {
    if (!sourceId || !eventType) {
      result.reason = "missing_source";
      return result;
    }
    if (!resend && !isConfirmationEnabled(settings, eventType)) {
      result.skipped = true;
      result.reason = "setting_off";
      return result;
    }
    if (!resend) {
      const claimed = await claimConfirmation(token, eventType, sourceId);
      if (!claimed) {
        result.skipped = true;
        result.reason = "already_sent";
        return result;
      }
    }
    if (!canWhatsAppShare(phone)) {
      const status = "skipped_no_phone";
      if (resend) await recordResend?.(token, eventType, sourceId, status, "No valid WhatsApp number");
      else await updateConfirmationStatus?.(token, eventType, sourceId, status, "No valid WhatsApp number");
      result.skipped = true;
      result.reason = "no_phone";
      return result;
    }
    const message = buildConfirmationMessage(eventType, variables, settings);
    const opened = openWhatsAppShare({ phone, message });
    const status = opened ? "opened" : "failed";
    const error = opened ? null : "Could not open WhatsApp";
    if (resend) await recordResend?.(token, eventType, sourceId, status, error);
    else await updateConfirmationStatus?.(token, eventType, sourceId, status, error);
    result.ok = opened;
    result.reason = opened ? "opened" : "open_failed";
    return result;
  } catch (error) {
    try {
      if (resend) await recordResend?.(token, eventType, sourceId, "failed", error?.message || "Confirmation failed");
      else await updateConfirmationStatus?.(token, eventType, sourceId, "failed", error?.message || "Confirmation failed");
    } catch {
      /* ignore log failures */
    }
    result.reason = error?.message || "failed";
    return result;
  }
}

export function financeConfirmationToast(result) {
  if (!result || result.reason === "setting_off" || result.reason === "already_sent") return "";
  if (result.ok) return "WhatsApp confirmation opened.";
  if (result.reason === "no_phone") return "WhatsApp confirmation could not be sent because no valid WhatsApp number is available.";
  if (result.reason === "open_failed" || result.reason === "failed") return "WhatsApp confirmation could not be sent.";
  return "";
}

export function buildFixedLiftPayload({ scheme, lift, enrollment, liftDate, managerCommission }) {
  const monthNumber = Number(lift.month_number);
  return {
    memberName: enrollment?.chit_members?.full_name || enrollment?.full_name || "",
    phone: enrollment?.chit_members?.phone || enrollment?.phone || "",
    scheme,
    chitType: "Fixed",
    monthNumber,
    amountLifted: Number(lift.lift_amount),
    commission: managerCommission,
    monthlyInstallment: fixedChitPostLiftMonthlyPayment(scheme.installment_amount, scheme.fixed_monthly_increment),
    remainingMonths: Math.max(0, Number(scheme.duration_months) - monthNumber),
    liftDate,
  };
}

export function buildAuctionLiftPayload({ scheme, enrollment, cycleNumber, cycleDate, winningBidAmount, commission, discount, dividend, installment }) {
  return {
    memberName: enrollment?.chit_members?.full_name || enrollment?.full_name || "",
    phone: enrollment?.chit_members?.phone || enrollment?.phone || "",
    scheme,
    chitType: "Auction",
    monthNumber: cycleNumber,
    winningBid: winningBidAmount,
    amountLifted: winningBidAmount,
    commission,
    discount,
    dividend,
    monthlyInstallment: installment ?? scheme.installment_amount,
    remainingMonths: Math.max(0, Number(scheme.duration_months) - Number(cycleNumber)),
    liftDate: cycleDate,
  };
}

export function buildPredefinedLiftPayload({ scheme, item, enrollment, assignedDate }) {
  const monthNumber = Number(item.month_number);
  return {
    memberName: enrollment?.chit_members?.full_name || enrollment?.full_name || "",
    phone: enrollment?.chit_members?.phone || enrollment?.phone || "",
    scheme,
    chitType: "Fixed Predefined Bid",
    monthNumber,
    winningBid: Number(item.bid_amount),
    amountLifted: Number(item.net_receivable),
    commission: Number(item.manager_commission),
    monthlyInstallment: Number(item.emi),
    remainingMonths: Math.max(0, Number(scheme.duration_months) - monthNumber),
    liftDate: assignedDate,
  };
}
