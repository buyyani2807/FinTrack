export function cashUpiSplit(mode, total, cashInput = 0, upiInput = 0) {
  const amount = Number(total) || 0;
  if (mode === "cash") return { cash: amount, upi: 0 };
  if (mode === "upi" || mode === "bank") return { cash: 0, upi: mode === "upi" ? amount : 0 };
  return { cash: Number(cashInput) || 0, upi: Number(upiInput) || 0 };
}

export function cashUpiSplitIsValid(mode, total, cash, upi) {
  if (mode !== "cash_upi") return Number(total) > 0;
  const amount = Number(total) || 0;
  const cashAmt = Number(cash) || 0;
  const upiAmt = Number(upi) || 0;
  return cashAmt > 0 && upiAmt > 0 && Math.abs(cashAmt + upiAmt - amount) <= 0.001;
}
