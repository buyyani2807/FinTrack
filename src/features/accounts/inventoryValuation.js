import { addDaysIso, roundMoney } from "./accountingModel.js";

// Periodic valuation at moving weighted-average cost (Tally's default).
// Purchases are expensed in the ledger; reports add closing stock and subtract
// opening stock, so nothing here posts journal entries.

const QTY_EPSILON = 0.0005;

export const itemOpeningRate = item => {
  const rate = item?.openingRate;
  return rate != null && rate !== "" && Number.isFinite(Number(rate)) ? Number(rate) : Number(item?.purchasePrice || 0);
};

const lineNetUnitCost = line => {
  const quantity = Number(line?.quantity || 0);
  if (!(quantity > 0)) return null;
  const net = Number(line.taxableAmount) || roundMoney(Number(line.amount || 0) - Number(line.discountAmount || 0));
  return net / quantity;
};

const sortMovements = rows => [...rows].sort((a, b) => (
  String(a.movementDate).localeCompare(String(b.movementDate))
  || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  || String(a.id || "").localeCompare(String(b.id || ""))
));

/** Movements for one product; legacy items with opening stock but no movement rows get a synthetic opening. */
function itemMovements(item, rows) {
  if (rows.length || !(Number(item.openingStock || 0) > 0)) return sortMovements(rows);
  return [{
    id: `opening:${item.id}`,
    itemId: item.id,
    movementDate: item.openingStockDate || "0000-01-01",
    quantityDelta: Number(item.openingStock),
    reason: "opening",
  }];
}

/**
 * Walk one item's movements in date order and cost each one.
 * Document cost: opening (opening rate), purchase and purchase return (net line rate).
 * Reversals undo the original movement at its own cost. Everything else moves at the running average.
 */
export function costItemMovements(item, movements = [], voucherItemLines = [], { asOf = null } = {}) {
  const linesById = new Map((voucherItemLines || []).map(line => [line.id, line]));
  return costItem(item, (movements || []).filter(row => row.itemId === item.id), linesById, asOf);
}

function valuationContext(movements, voucherItemLines) {
  const byItem = new Map();
  for (const row of movements || []) {
    if (!byItem.has(row.itemId)) byItem.set(row.itemId, []);
    byItem.get(row.itemId).push(row);
  }
  const linesById = new Map((voucherItemLines || []).map(line => [line.id, line]));
  return (item, asOf = null) => costItem(item, byItem.get(item.id) || [], linesById, asOf);
}

function costItem(item, rows, linesById, asOf) {
  const costByLine = new Map();
  const fallback = itemOpeningRate(item);
  let quantity = 0;
  let value = 0;
  let lastInDate = null;
  const costed = [];
  for (const movement of itemMovements(item, rows)) {
    if (asOf && movement.movementDate > asOf) break;
    const delta = Number(movement.quantityDelta || 0);
    if (!delta) continue;
    const average = quantity > QTY_EPSILON ? value / quantity : fallback;
    let unitCost = null;
    if (movement.reason === "opening") unitCost = itemOpeningRate(item);
    else if (movement.reason === "purchase" || movement.reason === "purchase_return") {
      unitCost = lineNetUnitCost(linesById.get(movement.voucherItemLineId));
    } else if (movement.reason === "reversal" && movement.voucherItemLineId) {
      unitCost = costByLine.get(movement.voucherItemLineId) ?? null;
    }
    if (unitCost == null) unitCost = average;
    if (movement.voucherItemLineId && movement.reason !== "reversal") costByLine.set(movement.voucherItemLineId, unitCost);
    const movementValue = delta * unitCost;
    quantity += delta;
    value += movementValue;
    if (Math.abs(quantity) <= QTY_EPSILON) {
      quantity = 0;
      value = 0;
    } else if (quantity < 0) {
      value = quantity * unitCost;
    }
    if (delta > 0) lastInDate = movement.movementDate;
    costed.push({ ...movement, unitCost: roundMoney(unitCost), value: roundMoney(movementValue) });
  }
  const roundedQty = Math.round(quantity * 1000) / 1000;
  return {
    quantity: roundedQty,
    value: roundMoney(value),
    averageCost: roundedQty > 0 ? roundMoney(value / quantity) : roundMoney(fallback),
    lastInDate,
    movements: costed,
  };
}

/** Stock summary as on a date: quantity, weighted-average cost and value per product. */
export function stockValuation({ items = [], movements = [], voucherItemLines = [], asOf = null } = {}) {
  const cost = valuationContext(movements, voucherItemLines);
  const rows = (items || [])
    .filter(item => item.itemType !== "service")
    .map(item => {
      const result = cost(item, asOf);
      return {
        itemId: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        categoryId: item.categoryId || null,
        isActive: item.isActive !== false,
        reorderLevel: Number(item.reorderLevel || 0),
        quantity: result.quantity,
        averageCost: result.averageCost,
        value: result.value,
        lastInDate: result.lastInDate,
      };
    })
    .sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name)));
  return {
    rows,
    totalValue: roundMoney(rows.reduce((sum, row) => sum + row.value, 0)),
    itemsInStock: rows.filter(row => row.quantity > 0).length,
    negativeItems: rows.filter(row => row.quantity < 0).length,
  };
}

/**
 * Trading figures for a period: opening stock (value on the day before `from`, plus item-master
 * openings dated inside the period) and closing stock (value on `to`).
 */
export function periodStockValues({ items = [], movements = [], voucherItemLines = [], from = null, to = null } = {}) {
  const products = (items || []).filter(item => item.itemType !== "service");
  if (!products.length) return { openingStock: 0, closingStock: 0, hasStock: false };
  const before = from ? addDaysIso(from, -1) : null;
  const cost = valuationContext(movements, voucherItemLines);
  let openingStock = 0;
  let closingStock = 0;
  for (const item of products) {
    const atEnd = cost(item, to);
    closingStock += atEnd.value;
    if (before) openingStock += cost(item, before).value;
    for (const movement of atEnd.movements) {
      if (movement.reason !== "opening") continue;
      if (before && movement.movementDate <= before) continue;
      openingStock += movement.value;
    }
  }
  openingStock = roundMoney(openingStock);
  closingStock = roundMoney(closingStock);
  return { openingStock, closingStock, hasStock: openingStock !== 0 || closingStock !== 0 };
}

const AGE_BUCKETS = [
  { id: "d0_30", label: "0–30 days", max: 30 },
  { id: "d31_90", label: "31–90 days", max: 90 },
  { id: "d91_180", label: "91–180 days", max: 180 },
  { id: "d180", label: "180+ days", max: Infinity },
];
export const STOCK_AGE_BUCKETS = AGE_BUCKETS.map(({ id, label }) => ({ id, label }));

const daysBetween = (from, to) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));

/** How long current stock has been held, assuming first-in-first-out issue. Valued at average cost. */
export function stockAgeing({ items = [], movements = [], voucherItemLines = [], asOf } = {}) {
  const rows = [];
  const cost = valuationContext(movements, voucherItemLines);
  for (const item of (items || []).filter(row => row.itemType !== "service")) {
    const costed = cost(item, asOf);
    if (!(costed.quantity > 0)) continue;
    const layers = [];
    for (const movement of costed.movements) {
      let delta = Number(movement.quantityDelta || 0);
      if (delta > 0) {
        layers.push({ date: movement.movementDate, quantity: delta });
        continue;
      }
      while (delta < 0 && layers.length) {
        const take = Math.min(layers[0].quantity, -delta);
        layers[0].quantity -= take;
        delta += take;
        if (layers[0].quantity <= QTY_EPSILON) layers.shift();
      }
    }
    const buckets = Object.fromEntries(AGE_BUCKETS.map(bucket => [bucket.id, 0]));
    let oldestDays = 0;
    for (const layer of layers) {
      const days = daysBetween(layer.date, asOf);
      oldestDays = Math.max(oldestDays, days);
      const bucket = AGE_BUCKETS.find(entry => days <= entry.max);
      buckets[bucket.id] = roundMoney(buckets[bucket.id] + layer.quantity * costed.averageCost);
    }
    rows.push({
      itemId: item.id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      quantity: costed.quantity,
      value: costed.value,
      oldestDays,
      ...buckets,
    });
  }
  rows.sort((a, b) => b.oldestDays - a.oldestDays);
  const totals = Object.fromEntries(AGE_BUCKETS.map(bucket => [bucket.id, roundMoney(rows.reduce((sum, row) => sum + row[bucket.id], 0))]));
  return { rows, totals, totalValue: roundMoney(rows.reduce((sum, row) => sum + row.value, 0)) };
}

/**
 * Physical stock count: compare counted quantities with book stock on the count date.
 * Returns only the items that need an adjustment (blank counts are skipped).
 */
export function physicalCountVariances({ items = [], movements = [], voucherItemLines = [], counts = {}, date } = {}) {
  const variances = [];
  const cost = valuationContext(movements, voucherItemLines);
  for (const item of (items || []).filter(row => row.itemType !== "service")) {
    const raw = counts[item.id];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const counted = Number(raw);
    if (!Number.isFinite(counted) || counted < 0) {
      throw new Error(`Enter a valid counted quantity for ${item.name}.`);
    }
    const book = cost(item, date);
    const delta = Math.round((counted - book.quantity) * 1000) / 1000;
    if (!delta) continue;
    variances.push({
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      bookQuantity: book.quantity,
      countedQuantity: counted,
      quantityDelta: delta,
      valueImpact: roundMoney(delta * book.averageCost),
    });
  }
  return variances;
}
