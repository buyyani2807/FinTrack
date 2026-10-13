import { affectsLedgers } from "../../accounts/model/accountingModel.js";
import { daysBetween, isoDate, median } from "./aiCommon.js";

/**
 * Days between each invoice's due date and the receipt/payment that settled it, grouped by party.
 * Uses only bill-wise settlements saved on posted receipts and payments, so the history is verified.
 */
export function partySettlementLags(vouchers = [], { settleType = "receipt" } = {}) {
  const posted = (vouchers || []).filter(affectsLedgers);
  const invoiceById = new Map(posted.map(voucher => [voucher.id, voucher]));
  const lags = new Map();
  for (const voucher of posted) {
    if (voucher.voucherType !== settleType) continue;
    for (const settlement of voucher.settlements || []) {
      const invoice = invoiceById.get(settlement.invoiceVoucherId);
      if (!invoice) continue;
      const due = isoDate(invoice.dueDate || invoice.date);
      const lag = daysBetween(due, voucher.date);
      if (lag == null) continue;
      const partyId = invoice.partyId || voucher.partyId;
      if (!partyId) continue;
      if (!lags.has(partyId)) lags.set(partyId, []);
      lags.get(partyId).push(lag);
    }
  }
  return lags;
}

/** A party's usual settlement delay: median plus the middle range, when at least two samples exist. */
export function lagProfile(samples = []) {
  const list = [...samples].sort((a, b) => a - b);
  if (list.length < 2) return { samples: list.length, typicalLag: null, lowLag: null, highLag: null };
  const low = list[Math.floor((list.length - 1) * 0.25)];
  const high = list[Math.ceil((list.length - 1) * 0.75)];
  return { samples: list.length, typicalLag: Math.round(median(list)), lowLag: low, highLag: high };
}
