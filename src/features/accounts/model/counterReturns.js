/**
 * Counter returns must come from goods that were actually sold, at no more than the price billed.
 * A return is posted without a bill link, so the limits are per item across the company's books:
 * returnable = quantity on posted sales − quantity already on posted credit notes, and the refund
 * rate may not exceed the highest net (after-discount, before-GST) rate the item was billed at.
 * The database enforces the same rule (migration 154); this gives the cashier the reason first.
 */
import { isCancelled, isReversed, roundMoney } from "./accountingModel.js";
import { counterLineNet } from "./counterBillMath.js";
import { quantityInBaseUnit } from "./inventoryModel.js";

const live = voucher => voucher && !isCancelled(voucher) && !isReversed(voucher);

export function counterReturnLimits({ vouchers = [], voucherItemLines = [] } = {}) {
  const typeById = new Map((vouchers || []).filter(live).map(voucher => [voucher.id, voucher.voucherType]));
  const byItem = new Map();
  for (const line of voucherItemLines || []) {
    if (!line?.itemId) continue;
    const type = typeById.get(line.voucherId);
    if (type !== "sales" && type !== "credit_note") continue;
    const row = byItem.get(line.itemId) || { sold: 0, returned: 0, maxNetRate: 0 };
    const qty = Number(line.quantity || 0);
    if (type === "sales") {
      row.sold = roundMoney(row.sold + qty);
      if (qty > 0) row.maxNetRate = Math.max(row.maxNetRate, roundMoney(Number(line.taxableAmount || 0) / qty));
    } else {
      row.returned = roundMoney(row.returned + qty);
    }
    byItem.set(line.itemId, row);
  }
  for (const row of byItem.values()) row.returnable = roundMoney(Math.max(0, row.sold - row.returned));
  return byItem;
}

/** First problem with a Counter return bill, or "" when every line is within what was sold. */
export function counterReturnError(lines = [], limits = new Map()) {
  const wanted = new Map();
  for (const line of lines || []) {
    if (!line?.itemId) continue;
    const baseUnit = line.unit || "Nos";
    const qty = Math.max(0, quantityInBaseUnit(line.quantity, baseUnit, line.sellUnit || baseUnit, line));
    if (!(qty > 0)) continue;
    const prev = wanted.get(line.itemId) || { name: line.name || line.itemName || "This item", qty: 0, net: 0 };
    prev.qty = roundMoney(prev.qty + qty);
    prev.net = roundMoney(prev.net + counterLineNet(line));
    wanted.set(line.itemId, prev);
  }
  for (const [itemId, want] of wanted) {
    const limit = limits.get(itemId);
    const returnable = limit?.returnable || 0;
    if (want.qty > returnable + 0.0005) {
      return returnable > 0
        ? `${want.name}: only ${returnable} can be returned — that is what was sold and not yet returned.`
        : `${want.name}: there is no posted sale of this item to return against.`;
    }
    const rate = want.qty > 0 ? roundMoney(want.net / want.qty) : 0;
    if (limit && rate > limit.maxNetRate + 0.01) {
      return `${want.name}: refund rate ${rate} is above the billed price after discount (${limit.maxNetRate}). Use the price the customer paid.`;
    }
  }
  return "";
}
