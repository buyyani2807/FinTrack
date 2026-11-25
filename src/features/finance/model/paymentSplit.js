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

const MODE_ORDER = ["cash", "upi", "bank", "other"];
const MODE_LABELS = { cash: "Cash", upi: "UPI", bank: "Bank", other: "Not recorded" };

// Splits received amounts by payment mode. A Cash + UPI payment is counted in both, by its split.
// Each entry is { mode, amount, cashAmount, upiAmount }. Modes with nothing received are left out.
export function receivedByMode(entries) {
  const totals = { cash: 0, upi: 0, bank: 0, other: 0 };
  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (!amount) continue;
    const mode = String(entry.mode || "").toLowerCase();
    if (mode === "cash_upi") {
      const cash = Number(entry.cashAmount) || 0;
      const upi = Number(entry.upiAmount) || 0;
      totals.cash += cash;
      totals.upi += upi;
      const rest = amount - cash - upi;
      if (Math.abs(rest) > 0.001) totals.other += rest;
    } else if (mode in totals && mode !== "other") {
      totals[mode] += amount;
    } else {
      totals.other += amount;
    }
  }
  return MODE_ORDER.filter(mode => Math.abs(totals[mode]) > 0.001).map(mode => ({ mode, label: MODE_LABELS[mode], amount: totals[mode] }));
}
