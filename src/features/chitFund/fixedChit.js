import { roundMoney } from "./calculations.js";

export const CHIT_TYPES = Object.freeze({
  AUCTION: "auction",
  FIXED: "fixed",
  FIXED_PREDEFINED_BID: "fixed_predefined_bid",
});

export function fixedChitMonth({
  month,
  durationMonths,
  initialLiftAmount,
  monthlyLiftIncrement,
  monthlyContribution,
} = {}) {
  const monthNumber = Number(month);
  const duration = Number(durationMonths);
  const initial = roundMoney(Number(initialLiftAmount));
  const increment = roundMoney(Number(monthlyLiftIncrement));
  const contribution = roundMoney(Number(monthlyContribution));
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || !Number.isInteger(duration) || duration < 1 || monthNumber > duration) {
    throw new Error("Invalid Fixed Chit month");
  }
  if (![initial, increment, contribution].every(Number.isFinite) || initial < 0 || increment < 0 || contribution <= 0) {
    throw new Error("Invalid Fixed Chit amounts");
  }
  const liftAmount = roundMoney(initial + (monthNumber - 1) * increment);
  const monthlyPayment = roundMoney(contribution + increment);
  const remainingMonths = duration - monthNumber;
  return {
    month: monthNumber,
    liftAmount,
    monthlyPayment,
    remainingMonths,
    totalRemainingPayment: roundMoney(monthlyPayment * remainingMonths),
  };
}

export function fixedChitSchedule(config = {}) {
  const duration = Number(config.durationMonths);
  if (!Number.isInteger(duration) || duration < 1) throw new Error("Fixed Chit duration must be positive");
  return Array.from({ length: duration }, (_, index) => fixedChitMonth({ ...config, month: index + 1 }));
}

export function fixedCommissionFromPercent(chitValue, commissionPercent) {
  const value = roundMoney(Number(chitValue));
  const percent = Number(commissionPercent);
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(percent)) return 0;
  return roundMoney(value * percent / 100);
}

export function normalizeFixedCommissionAmount(chitValue, storedAmount) {
  const value = roundMoney(Number(chitValue));
  const amount = roundMoney(Number(storedAmount));
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(amount) || amount < 0) return 0;
  if (
    amount > 0
    && amount <= 100
    && amount < value / 1000
    && roundMoney(value * amount / 100) >= 100
  ) {
    return roundMoney(value * amount / 100);
  }
  return amount;
}

export function fixedCommissionPercentFromAmount(chitValue, commissionAmount) {
  const value = Number(chitValue);
  const amount = Number(commissionAmount);
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(amount)) return "";
  return String(roundMoney((amount / value) * 100));
}

export function resolveFixedManagerCommission({ chitValue, fixedCommissionAmount, commissionPercent, lifts = [] } = {}) {
  const normalizedSchemeAmount = fixedCommissionAmount != null && fixedCommissionAmount !== ""
    ? normalizeFixedCommissionAmount(chitValue, fixedCommissionAmount)
    : null;
  if (normalizedSchemeAmount != null && Number.isFinite(normalizedSchemeAmount) && normalizedSchemeAmount >= 0) {
    return {
      amount: normalizedSchemeAmount,
      percent: fixedCommissionPercentFromAmount(chitValue, normalizedSchemeAmount),
    };
  }
  if (commissionPercent != null && commissionPercent !== "") {
    const amount = fixedCommissionFromPercent(chitValue, commissionPercent);
    if (amount > 0) {
      return { amount, percent: String(Number(commissionPercent)) };
    }
  }
  const fromLift = (lifts || []).find(row => Number.isFinite(Number(row?.manager_commission)));
  if (fromLift) {
    const amount = normalizeFixedCommissionAmount(chitValue, fromLift.manager_commission);
    return { amount, percent: fixedCommissionPercentFromAmount(chitValue, amount) };
  }
  return { amount: 0, percent: "" };
}

export function formatFixedManagerCommissionSummary({ chitValue, fixedCommissionAmount, commissionPercent, lifts = [] } = {}, money = value => String(value ?? "")) {
  const { amount, percent } = resolveFixedManagerCommission({ chitValue, fixedCommissionAmount, commissionPercent, lifts });
  if (!amount) return "—";
  return percent ? `${money(amount)} / month · ${percent}% of chit value` : `${money(amount)} / month`;
}

export function validateFixedChit(config = {}) {
  const chitValue = roundMoney(Number(config.chitValue));
  const memberCount = Number(config.memberCount);
  const durationMonths = Number(config.durationMonths);
  const monthlyContribution = roundMoney(Number(config.monthlyContribution));
  const hasPercent = config.commissionPercent != null && config.commissionPercent !== "";
  const commissionPercent = hasPercent ? Number(config.commissionPercent) : null;
  const commissionAmount = hasPercent
    ? fixedCommissionFromPercent(chitValue, commissionPercent)
    : normalizeFixedCommissionAmount(chitValue, config.commissionAmount);
  const initialLiftAmount = roundMoney(Number(config.initialLiftAmount));
  const monthlyLiftIncrement = roundMoney(Number(config.monthlyLiftIncrement));
  if (!Number.isFinite(chitValue) || chitValue <= 0) throw new Error("Chit value must be positive");
  if (!Number.isInteger(memberCount) || memberCount <= 0) throw new Error("Member count must be positive");
  if (!Number.isInteger(durationMonths) || durationMonths <= 0 || durationMonths > memberCount) throw new Error("Duration cannot exceed member count");
  if (!Number.isFinite(monthlyContribution) || monthlyContribution <= 0) throw new Error("Monthly contribution must be positive");
  if (roundMoney(monthlyContribution * memberCount) !== chitValue) throw new Error("Monthly contribution multiplied by members must equal chit value");
  if (hasPercent && (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)) {
    throw new Error("Manager commission percentage is invalid");
  }
  if (!Number.isFinite(commissionAmount) || commissionAmount < 0) throw new Error("Commission cannot be negative");
  if (!Number.isFinite(initialLiftAmount) || initialLiftAmount < 0) throw new Error("Initial lift amount cannot be negative");
  if (!Number.isFinite(monthlyLiftIncrement) || monthlyLiftIncrement < 0) throw new Error("Monthly lift increment cannot be negative");
  return {
    chitValue, memberCount, durationMonths, monthlyContribution,
    commissionPercent: hasPercent ? commissionPercent : roundMoney((commissionAmount / chitValue) * 100),
    commissionAmount, initialLiftAmount, monthlyLiftIncrement,
    schedule: fixedChitSchedule({ durationMonths, initialLiftAmount, monthlyLiftIncrement, monthlyContribution }),
  };
}
