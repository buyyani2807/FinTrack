import { roundMoney } from "./calculations.js";

export function predefinedBidMonth({
  month,
  durationMonths,
  chitValue,
  startingEmi,
  emiIncrement,
  startingComm,
  commDecrement,
  startingAuctionAmount,
  auctionAmountDecrement,
  startingBidAmount,
  bidAmountIncrement,
  managerCommissionPercent,
} = {}) {
  const monthNumber = Number(month);
  const duration = Number(durationMonths);
  const values = [
    chitValue, startingEmi, emiIncrement, startingComm, commDecrement,
    startingAuctionAmount, auctionAmountDecrement, startingBidAmount,
    bidAmountIncrement, managerCommissionPercent,
  ].map(Number);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || !Number.isInteger(duration) || duration < 1 || monthNumber > duration) {
    throw new Error("Invalid predefined-bid month");
  }
  if (!values.every(Number.isFinite) || values.some(value => value < 0) || values[0] <= 0) {
    throw new Error("Invalid predefined-bid configuration");
  }
  const offset = monthNumber - 1;
  const managerCommission = roundMoney(values[0] * values[9] / 100);
  const bidAmount = roundMoney(values[7] + offset * values[8]);
  return {
    month: monthNumber,
    emi: roundMoney(values[1] + offset * values[2]),
    comm: roundMoney(Math.max(0, values[3] - offset * values[4])),
    auctionAmount: roundMoney(Math.max(0, values[5] - offset * values[6])),
    bidAmount,
    managerCommissionPercent: values[9],
    managerCommission,
    netReceivable: roundMoney(bidAmount - managerCommission),
  };
}

export function predefinedBidSchedule(config = {}) {
  const duration = Number(config.durationMonths);
  if (!Number.isInteger(duration) || duration < 1) throw new Error("Duration must be positive");
  return Array.from({ length: duration }, (_, index) => predefinedBidMonth({ ...config, month: index + 1 }));
}

export function validatePredefinedBidChit(config = {}) {
  const chitValue = Number(config.chitValue);
  const memberCount = Number(config.memberCount);
  const durationMonths = Number(config.durationMonths);
  const commissionPercent = Number(config.managerCommissionPercent);
  if (!Number.isFinite(chitValue) || chitValue <= 0) throw new Error("Chit value must be positive");
  if (!Number.isInteger(memberCount) || memberCount <= 0) throw new Error("Member count must be positive");
  if (!Number.isInteger(durationMonths) || durationMonths <= 0 || durationMonths > memberCount) throw new Error("Duration cannot exceed member count");
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) throw new Error("Manager commission percentage is invalid");
  const schedule = predefinedBidSchedule(config);
  if (schedule.some(row => row.netReceivable < 0)) throw new Error("Net receivable cannot be negative");
  return { ...config, schedule };
}
