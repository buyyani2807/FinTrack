export const monthlyInterestOnBalance = (balance, monthlyRatePercent) =>
  Math.round(Number(balance) * Number(monthlyRatePercent || 0) / 100);

export const dailyInstallmentAmount = collectionAmount => {
  const total = Number(collectionAmount || 0);
  if (!(total > 0) || !Number.isFinite(total)) return 0;
  return Math.round((total / 100 + Number.EPSILON) * 100) / 100;
};
