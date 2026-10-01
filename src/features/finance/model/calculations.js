export const monthlyInterestOnBalance = (balance, monthlyRatePercent) =>
  Math.round(Number(balance) * Number(monthlyRatePercent || 0) / 100);

const asIsoDate = value => String(value || "").slice(0, 10);

export function monthlyRateOnDate(loan, date) {
  const asOf = asIsoDate(date);
  const applied = [...(loan.rateChanges || [])]
    .sort((a, b) => asIsoDate(a.effectiveDate).localeCompare(asIsoDate(b.effectiveDate)))
    .filter(change => asIsoDate(change.effectiveDate) && asIsoDate(change.effectiveDate) <= asOf)
    .at(-1);
  return Number(applied?.annualRate ?? loan.annualRate ?? 0);
}

export function rateChangesAfterEdit({
  startDate,
  currentRate,
  rateChanges = [],
  nextRate,
  effectiveDate,
}) {
  const current = Number(currentRate);
  const next = Number(nextRate);
  const today = asIsoDate(effectiveDate);
  const start = asIsoDate(startDate);
  if (!today || !Number.isFinite(next) || next === current) return [...rateChanges];
  const rows = rateChanges.map(change => ({
    effectiveDate: asIsoDate(change.effectiveDate),
    annualRate: Number(change.annualRate),
  }));
  if (!rows.length && start && start < today) {
    rows.push({ effectiveDate: start, annualRate: current });
  }
  const todayIdx = rows.findIndex(row => row.effectiveDate === today);
  if (todayIdx >= 0) rows[todayIdx] = { effectiveDate: today, annualRate: next };
  else rows.push({ effectiveDate: today, annualRate: next });
  return rows.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export const dailyInstallmentAmount = collectionAmount => {
  const total = Number(collectionAmount || 0);
  if (!(total > 0) || !Number.isFinite(total)) return 0;
  return Math.round((total / 100 + Number.EPSILON) * 100) / 100;
};
