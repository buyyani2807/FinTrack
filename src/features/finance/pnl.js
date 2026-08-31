export function paidOnLoan(loan) {
  const rows = loan.transactions || [];
  if (loan.kind === "daily") {
    return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }
  return rows.reduce((sum, row) => (
    sum + Number(row.principalAmount || 0) + Number(row.interestAmount || 0) + Number(row.penaltyAmount || 0)
  ), 0);
}

export function principalCollected(loan) {
  if (loan.kind === "daily") return paidOnLoan(loan);
  return (loan.transactions || []).reduce((sum, row) => sum + Number(row.principalAmount || 0), 0);
}

export function investedAmount(loan) {
  return loan.kind === "daily" ? Number(loan.disbursedAmount || 0) : Number(loan.principal || 0);
}

export function realizedProfit(loan) {
  if (loan.kind === "daily") return Math.max(0, paidOnLoan(loan) - investedAmount(loan));
  return (loan.transactions || []).reduce((sum, row) => (
    sum + Number(row.interestAmount || 0) + Number(row.penaltyAmount || 0)
  ), 0);
}

export function realizedLoss(loan) {
  if (loan.status !== "bankrupt") return 0;
  return Math.max(0, investedAmount(loan) - principalCollected(loan));
}

export function netPosition(loan) {
  return paidOnLoan(loan) - investedAmount(loan);
}
