const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function monthlyComponentsMatch(total, interest, principal, penalty) {
  return roundMoney(Number(interest || 0) + Number(principal || 0) + Number(penalty || 0)) === roundMoney(total);
}

export function remainingCollectable(loan, { excludePaymentId } = {}) {
  const rows = (loan.transactions || []).filter(row => row.id !== excludePaymentId);
  if (loan.kind === "monthly") {
    const paid = rows.reduce((sum, row) => sum + Number(row.principalAmount || 0), 0);
    return roundMoney(Math.max(0, Number(loan.principal || 0) - paid));
  }
  const paid = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return roundMoney(Math.max(0, Number(loan.collectionAmount || 0) - paid));
}

export function paymentExceedsRemaining(loan, { amount = 0, principalAmount = 0, excludePaymentId } = {}) {
  const remaining = remainingCollectable(loan, { excludePaymentId });
  if (loan.kind === "monthly") return roundMoney(principalAmount) > remaining;
  return roundMoney(amount) > remaining;
}
