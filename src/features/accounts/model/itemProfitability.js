import { addDaysIso, roundMoney } from "./accountingModel.js";
import { itemPurchasesReport, itemSalesReport, stockReasonLabel, stockStatus } from "./inventoryModel.js";
import { costItemMovements } from "./inventoryValuation.js";
import { pageSlice } from "./accountsList.js";

const QTY_EPSILON = 0.0005;

const roundQty = value => Math.round((Number(value) || 0) * 1000) / 1000;
const sameQty = (left, right) => Math.abs(roundQty(left) - roundQty(right)) <= QTY_EPSILON;

/** Margin is undefined when there is no sales revenue. */
export function grossMarginPercent(profit, revenue) {
  const sales = Number(revenue) || 0;
  if (Math.abs(sales) < 0.005) return null;
  return Math.round(((Number(profit) || 0) / sales) * 10000) / 100;
}

const VIEW_ROLES = new Set(["owner", "accountant", "viewer"]);

/** Accounts is owner-only. A collection agent workspace role cannot open these books. */
export function canViewItemProfitability({ workspaceRole, accountsRole } = {}) {
  return workspaceRole === "owner" && VIEW_ROLES.has(accountsRole);
}

export const ITEM_PROFIT_LIMITATIONS = [
  "Gross profit is sales revenue minus cost of goods sold. Cost is the moving weighted average already used for stock valuation.",
  "Adjustments, delivery challans, and purchase returns change stock. They are not sales and are not included in gross profit.",
  "Damaged stock, wastage, and transfers between warehouses are not stored as their own movement types. A write-off is an adjustment. A delivery challan is stock that left without a sale.",
  "The warehouse is not stored. The user who recorded a movement is stored only as an internal id, so the report says whether it was recorded.",
  "Items have a category. They do not have a brand.",
];

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

const voucherFor = (movement, vouchersById, linesById) => {
  if (movement.voucherId && vouchersById.has(movement.voucherId)) return vouchersById.get(movement.voucherId);
  const line = linesById.get(movement.voucherItemLineId);
  if (line?.voucherId && vouchersById.has(line.voucherId)) return vouchersById.get(line.voucherId);
  return null;
};

const movementIsLive = (movement, vouchersById, linesById) => {
  const voucher = voucherFor(movement, vouchersById, linesById);
  if (!voucher) return true;
  return voucher.status === "posted";
};

const countsAsCogs = (movement, vouchersById, linesById) => {
  if (movement.reason === "sale" || movement.reason === "sales_return") return true;
  if (movement.reason !== "reversal") return false;
  const line = linesById.get(movement.voucherItemLineId);
  const voucher = line?.voucherId ? vouchersById.get(line.voucherId) : null;
  return voucher?.voucherType === "sales" || voucher?.voucherType === "credit_note";
};

const needsReference = new Set(["purchase", "sale", "sales_return", "purchase_return", "delivery", "goods_receipt", "reversal"]);

const recordedOn = createdAt => {
  const text = String(createdAt || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
};

const emptyFlow = () => ({
  opening: 0,
  purchase: 0,
  goodsReceipt: 0,
  sale: 0,
  salesReturn: 0,
  purchaseReturn: 0,
  delivery: 0,
  adjustmentIn: 0,
  adjustmentOut: 0,
  reversalIn: 0,
  reversalOut: 0,
  otherIn: 0,
  otherOut: 0,
});

const addFlow = (flow, values, movement) => {
  const qty = roundQty(movement.quantityDelta);
  const value = roundMoney(movement.value);
  const into = (qtyKey, valueKey) => {
    flow[qtyKey] = roundQty(flow[qtyKey] + Math.abs(qty));
    values[valueKey] = roundMoney(values[valueKey] + Math.abs(value));
  };
  if (movement.reason === "opening") into("opening", "opening");
  else if (movement.reason === "purchase") into("purchase", "purchase");
  else if (movement.reason === "goods_receipt") into("goodsReceipt", "goodsReceipt");
  else if (movement.reason === "sale") into("sale", "sale");
  else if (movement.reason === "sales_return") into("salesReturn", "salesReturn");
  else if (movement.reason === "purchase_return") into("purchaseReturn", "purchaseReturn");
  else if (movement.reason === "delivery") into("delivery", "delivery");
  else if (movement.reason === "adjustment") into(qty >= 0 ? "adjustmentIn" : "adjustmentOut", qty >= 0 ? "adjustmentIn" : "adjustmentOut");
  else if (movement.reason === "reversal") into(qty >= 0 ? "reversalIn" : "reversalOut", qty >= 0 ? "reversalIn" : "reversalOut");
  else into(qty >= 0 ? "otherIn" : "otherOut", qty >= 0 ? "otherIn" : "otherOut");
};

const flowNet = flow => roundQty(
  flow.opening + flow.purchase + flow.goodsReceipt + flow.salesReturn + flow.adjustmentIn + flow.reversalIn + flow.otherIn
  - flow.sale - flow.purchaseReturn - flow.delivery - flow.adjustmentOut - flow.reversalOut - flow.otherOut,
);

function analyzeItem(item, movements, costingLines, voucherItemLines, vouchersById, linesById, salesById, purchasesById, partiesById, from, to) {
  const costed = costItemMovements(item, movements, costingLines, { asOf: to || null });
  const before = from ? costItemMovements(item, movements, costingLines, { asOf: addDaysIso(from, -1) }) : null;
  const openingQuantity = roundQty(before?.quantity || 0);
  const periodMoves = costed.movements.filter(movement => inRange(movement.movementDate, from, to));
  const flow = emptyFlow();
  const flowValue = emptyFlow();
  let cogsRaw = 0;
  const seen = new Map();
  const warnings = [];
  const ledger = [];
  let balance = openingQuantity;

  for (const movement of periodMoves) {
    addFlow(flow, flowValue, movement);
    const voucher = voucherFor(movement, vouchersById, linesById);
    if (voucher && !movementIsLive(movement, vouchersById, linesById)) {
      warnings.push({ code: "cancelled", message: `${voucher.voucherNumber || "A voucher"} is not posted, and its stock movement is still in the balance.` });
    } else if (countsAsCogs(movement, vouchersById, linesById)) {
      cogsRaw -= Number(movement.value || 0);
    }
    const lineKey = movement.voucherItemLineId || movement.documentLineId || "";
    if (lineKey) {
      const key = `${movement.reason}|${lineKey}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    if (needsReference.has(movement.reason) && !movement.voucherId && !movement.documentId && !voucher) {
      warnings.push({ code: "missing_reference", message: `${stockReasonLabel(movement.reason)} on ${movement.movementDate} has no source voucher.` });
    }
    if (movement.reason === "reversal" && !linesById.get(movement.voucherItemLineId)) {
      warnings.push({ code: "reversal", message: `Reversal on ${movement.movementDate} is not tied to a sale or purchase line.` });
    }
    const recorded = recordedOn(movement.createdAt);
    if (recorded && movement.movementDate < recorded) {
      warnings.push({ code: "backdated", message: `${stockReasonLabel(movement.reason)} is dated ${movement.movementDate} and was recorded on ${recorded}.` });
    }
    const next = roundQty(balance + Number(movement.quantityDelta || 0));
    if (movement.reason === "adjustment" && next < -QTY_EPSILON) {
      warnings.push({ code: "unusual_adjustment", message: `Adjustment on ${movement.movementDate} takes stock below zero.` });
    }
    balance = next;
    ledger.push({
      id: movement.id,
      date: movement.movementDate,
      reason: movement.reason,
      reasonLabel: stockReasonLabel(movement.reason),
      reference: movement.voucherNumber || "",
      voucherId: voucher?.id || movement.voucherId || null,
      voucherType: voucher?.voucherType || "",
      documentId: movement.documentId || null,
      quantityIn: Number(movement.quantityDelta) > 0 ? roundQty(movement.quantityDelta) : 0,
      quantityOut: Number(movement.quantityDelta) < 0 ? roundQty(Math.abs(movement.quantityDelta)) : 0,
      balance,
      unitCost: movement.unitCost,
      value: movement.value,
      note: movement.note || "",
      recorded: Boolean(movement.createdBy),
    });
  }

  for (const count of seen.values()) {
    if (count > 1) warnings.push({ code: "duplicate", message: "The same source line was posted to stock more than once." });
  }

  const sales = salesById.get(item.id) || { quantity: 0, amount: 0 };
  const purchases = purchasesById.get(item.id) || { quantity: 0, amount: 0 };
  const revenue = roundMoney(sales.amount);
  const cogs = roundMoney(cogsRaw);
  const grossProfit = roundMoney(revenue - cogs);
  const soldQty = roundQty(flow.sale - flow.salesReturn);
  if (!sameQty(soldQty, sales.quantity)) {
    warnings.push({ code: "sales_gap", message: "Quantity on sales invoices does not match sale movements." });
  }
  const closingQuantity = roundQty(costed.quantity);
  const expected = roundQty(openingQuantity + flowNet(flow));
  const reconciled = sameQty(expected, closingQuantity);
  if (!reconciled) {
    warnings.push({ code: "unreconciled", message: "Stock movement requires review. The recorded movements do not fully reconcile with the current stock balance." });
  }
  if (closingQuantity < -QTY_EPSILON) warnings.push({ code: "negative", message: "Stock quantity is negative." });
  if (sales.quantity > QTY_EPSILON && cogs === 0) warnings.push({ code: "zero_cost", message: "Goods were sold with no cost on record." });

  const invoices = invoiceBreakdown(item, voucherItemLines, vouchersById, partiesById, linesById, periodMoves, from, to);
  const invoiceProfit = roundMoney(invoices.reduce((sum, row) => sum + row.profit, 0));
  if (invoices.length && Math.abs(invoiceProfit - grossProfit) > 0.05) {
    warnings.push({ code: "invoice_gap", message: "Profit on the invoices does not add up to this item because a stock movement has no invoice line." });
  }

  return {
    itemId: item.id,
    name: item.name,
    sku: item.sku || "",
    unit: item.unit || "",
    categoryId: item.categoryId || null,
    quantitySold: roundQty(sales.quantity),
    revenue,
    cogs,
    grossProfit,
    marginPercent: grossMarginPercent(grossProfit, revenue),
    averageSellingPrice: sales.quantity ? roundMoney(revenue / sales.quantity) : null,
    averageCostPrice: sales.quantity ? roundMoney(cogs / sales.quantity) : (closingQuantity > 0 ? costed.averageCost : null),
    averagePurchasePrice: purchases.quantity ? roundMoney(purchases.amount / purchases.quantity) : null,
    stockQuantity: closingQuantity,
    stockValue: costed.value,
    stockStatus: closingQuantity < -QTY_EPSILON ? "negative" : stockStatus(closingQuantity, item.reorderLevel),
    reorderLevel: Number(item.reorderLevel || 0),
    openingQuantity,
    purchasedQuantity: roundQty(purchases.quantity),
    purchaseValue: roundMoney(purchases.amount),
    returnedQuantity: roundQty(flow.salesReturn),
    flow,
    flowValue,
    adjustmentValue: roundMoney(flowValue.adjustmentIn - flowValue.adjustmentOut),
    reconciled,
    expectedQuantity: expected,
    warnings,
    needsReview: !reconciled || closingQuantity < -QTY_EPSILON || warnings.length > 0,
    ledger,
    invoices,
    profitByDate: profitByDate(invoices),
    from: from || "",
    to: to || "",
  };
}

function invoiceBreakdown(item, voucherItemLines, vouchersById, partiesById, linesById, periodMoves, from, to) {
  const cogsByLine = new Map();
  for (const movement of periodMoves) {
    if (!countsAsCogs(movement, vouchersById, linesById)) continue;
    const source = voucherFor(movement, vouchersById, linesById);
    if (source && !movementIsLive(movement, vouchersById, linesById)) continue;
    const key = movement.voucherItemLineId || "";
    if (!key) continue;
    cogsByLine.set(key, roundMoney((cogsByLine.get(key) || 0) - Number(movement.value || 0)));
  }
  const byVoucher = new Map();
  for (const line of voucherItemLines || []) {
    if ((line.itemId || "") !== item.id) continue;
    const voucher = vouchersById.get(line.voucherId);
    if (!voucher || voucher.status !== "posted") continue;
    if (!inRange(voucher.date, from, to)) continue;
    const sign = voucher.voucherType === "sales" ? 1 : voucher.voucherType === "credit_note" ? -1 : 0;
    if (!sign) continue;
    const row = byVoucher.get(voucher.id) || {
      voucherId: voucher.id,
      voucherNumber: voucher.voucherNumber || "",
      voucherType: voucher.voucherType,
      date: voucher.date,
      partyName: partiesById.get(voucher.partyId)?.name || "",
      quantity: 0,
      revenue: 0,
      cogs: 0,
    };
    row.quantity = roundQty(row.quantity + sign * Number(line.quantity || 0));
    row.revenue = roundMoney(row.revenue + sign * Number(line.taxableAmount ?? line.amount ?? 0));
    row.cogs = roundMoney(row.cogs + (cogsByLine.get(line.id) || 0));
    byVoucher.set(voucher.id, row);
  }
  return [...byVoucher.values()]
    .map(row => {
      const profit = roundMoney(row.revenue - row.cogs);
      return { ...row, profit, marginPercent: grossMarginPercent(profit, row.revenue) };
    })
    .sort((a, b) => `${a.date}|${a.voucherNumber}`.localeCompare(`${b.date}|${b.voucherNumber}`));
}

function profitByDate(invoices) {
  const map = new Map();
  for (const row of invoices) {
    const current = map.get(row.date) || { date: row.date, revenue: 0, cogs: 0 };
    current.revenue = roundMoney(current.revenue + row.revenue);
    current.cogs = roundMoney(current.cogs + row.cogs);
    map.set(row.date, current);
  }
  return [...map.values()]
    .map(row => {
      const profit = roundMoney(row.revenue - row.cogs);
      return { ...row, profit, marginPercent: grossMarginPercent(profit, row.revenue) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Item profit and stock destination for one company’s already loaded books.
 * Revenue comes from posted item sales. Cost comes from the existing weighted-average movements.
 */
export function itemProfitability({
  items = [],
  movements = [],
  voucherItemLines = [],
  costLines = null,
  vouchers = [],
  parties = [],
  from = null,
  to = null,
} = {}) {
  const products = (items || []).filter(item => item.itemType !== "service");
  const itemIds = new Set(products.map(item => item.id));
  const ownMovements = (movements || []).filter(row => itemIds.has(row.itemId));
  const costingLines = costLines || voucherItemLines || [];
  const vouchersById = new Map((vouchers || []).map(voucher => [voucher.id, voucher]));
  const linesById = new Map((costingLines || []).map(line => [line.id, line]));
  const salesById = new Map(itemSalesReport(voucherItemLines, vouchers, { from, to }).map(row => [row.itemId, row]));
  const purchasesById = new Map(itemPurchasesReport(voucherItemLines, vouchers, { from, to }).map(row => [row.itemId, row]));
  const partiesById = new Map((parties || []).map(party => [party.id, party]));
  const rows = products.map(item => analyzeItem(
    item,
    ownMovements,
    costingLines,
    voucherItemLines,
    vouchersById,
    linesById,
    salesById,
    purchasesById,
    partiesById,
    from,
    to,
  ));
  return { rows, from: from || "", to: to || "", limitations: ITEM_PROFIT_LIMITATIONS };
}

export function itemProfitTotals(rows = []) {
  const revenue = roundMoney(rows.reduce((sum, row) => sum + row.revenue, 0));
  const cogs = roundMoney(rows.reduce((sum, row) => sum + row.cogs, 0));
  const grossProfit = roundMoney(revenue - cogs);
  return {
    revenue,
    cogs,
    grossProfit,
    marginPercent: grossMarginPercent(grossProfit, revenue),
    stockValue: roundMoney(rows.reduce((sum, row) => sum + row.stockValue, 0)),
    count: rows.length,
  };
}

const numberSort = (pick, direction) => (left, right) => {
  const a = pick(left);
  const b = pick(right);
  const aMissing = a == null;
  const bMissing = b == null;
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  return (a - b) * direction;
};

export function filterItemProfit(rows = [], { search = "", categoryId = "", stockStatus: status = "all", sort = "revenue" } = {}) {
  const query = search.trim().toLowerCase();
  const filtered = rows.filter(row => {
    if (categoryId && row.categoryId !== categoryId) return false;
    if (query && !`${row.name} ${row.sku}`.toLowerCase().includes(query)) return false;
    if (status === "in" && !(row.stockQuantity > 0)) return false;
    if (status === "low" && row.stockStatus !== "low") return false;
    if (status === "out" && row.stockQuantity !== 0) return false;
    if (status === "negative" && !(row.stockQuantity < 0)) return false;
    return true;
  });
  const direction = String(sort).endsWith("_asc") ? 1 : -1;
  const key = String(sort).replace(/_asc$/, "");
  const pick = {
    revenue: row => row.revenue,
    profit: row => row.grossProfit,
    margin: row => row.marginPercent,
    qty: row => row.quantitySold,
    stock: row => row.stockQuantity,
  }[key] || (row => row.revenue);
  return [...filtered].sort((left, right) => numberSort(pick, direction)(left, right) || left.name.localeCompare(right.name) || String(left.itemId).localeCompare(String(right.itemId)));
}

export function pageItemProfit(rows = [], page = 1) {
  return pageSlice(rows, page);
}

/** Stable key for a mark-reviewed decision. A new warning reopens review. */
export function itemProfitReviewKey(row) {
  const from = row?.from || "";
  const to = row?.to || "";
  const itemId = row?.itemId || "";
  const text = (row?.warnings || []).map(warning => `${warning.code}:${warning.message}`).sort().join("\n");
  let digest = 0;
  for (let index = 0; index < text.length; index += 1) {
    digest = ((digest << 5) - digest + text.charCodeAt(index)) | 0;
  }
  return `ip:${from}:${to}:${itemId}:${(digest >>> 0).toString(36)}`.slice(0, 200);
}

export function itemProfitHighlights(rows = []) {
  const sold = rows.filter(row => row.quantitySold > 0);
  const by = (list, pick) => [...list].sort((a, b) => pick(b) - pick(a) || a.name.localeCompare(b.name));
  const names = list => list.slice(0, 3).map(row => row.name);
  return {
    best: names(by(sold, row => row.grossProfit)),
    lowestMargin: names([...sold].filter(row => row.marginPercent != null).sort((a, b) => a.marginPercent - b.marginPercent || a.name.localeCompare(b.name))),
    fast: names(by(sold, row => row.quantitySold)),
    slow: names(by(rows.filter(row => row.quantitySold === 0 && row.stockQuantity > 0), row => row.stockValue)),
    negativeMargin: names(sold.filter(row => row.grossProfit < 0)),
    review: names(rows.filter(row => row.needsReview)),
    lowStock: names(rows.filter(row => row.stockStatus === "low" && row.stockQuantity > 0)),
  };
}

export function itemProfitExportRows(rows = [], totals = itemProfitTotals(rows)) {
  return [
    ["Item", "SKU", "Qty sold", "Revenue", "Cost", "Gross profit", "Margin %", "Current stock", "Stock value"],
    ...rows.map(row => [row.name, row.sku, row.quantitySold, row.revenue, row.cogs, row.grossProfit, row.marginPercent == null ? "" : row.marginPercent, row.stockQuantity, row.stockValue]),
    ["Total", "", "", totals.revenue, totals.cogs, totals.grossProfit, totals.marginPercent == null ? "" : totals.marginPercent, "", totals.stockValue],
  ];
}
