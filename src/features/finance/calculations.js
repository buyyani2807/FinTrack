export const monthlyInterestOnBalance = (balance, monthlyRatePercent) =>
  Math.round(Number(balance) * Number(monthlyRatePercent || 0) / 100);
