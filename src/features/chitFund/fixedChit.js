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

export function fixedCommissionPercentFromAmount(chitValue, commissionAmount) {
  const value = Number(chitValue);
  const amount = Number(commissionAmount);
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(amount)) return "";
  return String(roundMoney((amount / value) * 100));
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
    : roundMoney(Number(config.commissionAmount));
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
