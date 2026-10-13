import { currentStockForItem } from "../../accounts/model/inventoryModel.js";
import { addDaysIso, advisory, average, daysBetween, isoDate, n, roundMoney, source, stdDev } from "./aiCommon.js";

const OUT_REASONS = new Set(["sale", "delivery"]);
const RETURN_REASONS = new Set(["sales_return"]);
const WEEKS = 12;
const DEFAULT_LEAD_DAYS = 7;
const COVER_DAYS = 14;

/** Purchase-order to goods-receipt days per item, from saved trade documents. */
export function leadTimesByItem(tradeDocuments = []) {
  const docs = tradeDocuments || [];
  const orders = new Map(docs.filter(doc => doc.docType === "purchase_order" && doc.status !== "cancelled").map(doc => [doc.id, doc]));
  const byItem = new Map();
  for (const receipt of docs.filter(doc => doc.docType === "goods_receipt" && doc.status !== "cancelled" && doc.sourceDocumentId)) {
    const order = orders.get(receipt.sourceDocumentId);
    if (!order) continue;
    const days = daysBetween(order.docDate, receipt.docDate);
    if (days == null || days < 0) continue;
    for (const line of receipt.lines || []) {
      if (!line.itemId) continue;
      if (!byItem.has(line.itemId)) byItem.set(line.itemId, []);
      byItem.get(line.itemId).push({ date: isoDate(receipt.docDate), days });
    }
  }
  for (const list of byItem.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return byItem;
}

function weeklySales(movements, itemId, asOf) {
  const weeks = Array.from({ length: WEEKS }, () => 0);
  let samples = 0;
  for (const movement of movements) {
    if (movement.itemId !== itemId) continue;
    const age = daysBetween(movement.movementDate, asOf);
    if (age == null || age < 0 || age >= WEEKS * 7) continue;
    const week = Math.floor(age / 7);
    if (OUT_REASONS.has(movement.reason)) {
      weeks[week] += Math.abs(n(movement.quantityDelta));
      samples += 1;
    } else if (RETURN_REASONS.has(movement.reason)) {
      weeks[week] -= Math.abs(n(movement.quantityDelta));
    }
  }
  return { weeks: weeks.map(value => Math.max(0, value)), samples };
}

/**
 * Stock forecast per product from saved stock movements and trade documents. Advisory only: it never creates
 * purchase orders or changes quantities.
 */
export function buildInventoryForecast({ items = [], stockMovements = [], tradeDocuments = [], asOf } = {}) {
  const today = isoDate(asOf);
  const movements = stockMovements || [];
  const leadTimes = leadTimesByItem(tradeDocuments);
  const rows = [];
  for (const item of (items || []).filter(row => row.itemType !== "service" && row.isActive !== false)) {
    const stock = currentStockForItem(item, movements);
    if (stock == null) continue;
    const { weeks, samples } = weeklySales(movements, item.id, today);
    const firstMovement = movements.filter(row => row.itemId === item.id).reduce((min, row) => (!min || row.movementDate < min ? row.movementDate : min), "");
    const historyWeeks = firstMovement ? Math.min(WEEKS, Math.floor((daysBetween(firstMovement, today) || 0) / 7)) : 0;
    const insufficientHistory = samples < 3 || historyWeeks < 4;
    const recent = weeks.slice(0, 4);
    const earlier = weeks.slice(4, Math.max(4, historyWeeks));
    const avgWeekly = roundMoney(average(weeks.slice(0, Math.max(4, Math.min(8, historyWeeks)))));
    const recentAvg = average(recent);
    const earlierAvg = earlier.length ? average(earlier) : null;
    const daily = avgWeekly / 7;
    const leadHistory = leadTimes.get(item.id) || [];
    const leadDays = leadHistory.length ? Math.round(average(leadHistory.map(row => row.days))) : null;
    const usedLead = leadDays ?? DEFAULT_LEAD_DAYS;
    const daysOfCover = daily > 0 ? Math.floor(stock / daily) : null;
    const stockoutDate = daysOfCover != null ? addDaysIso(today, daysOfCover) : null;
    const safety = Math.max(n(item.reorderLevel), roundMoney(avgWeekly));
    const reorderQty = daily > 0 ? Math.max(0, Math.ceil(daily * (usedLead + COVER_DAYS) + safety - stock)) : 0;

    const signals = [];
    if (!insufficientHistory && daysOfCover != null && daysOfCover <= usedLead) signals.push("likely_stockout");
    if (!insufficientHistory && earlierAvg != null && earlierAvg > 0 && recentAvg < earlierAvg * 0.7) signals.push("declining_sales");
    if (stock > 0 && ((daily > 0 && daysOfCover > 120) || (!samples && historyWeeks >= 8))) signals.push("overstock");
    const sd = stdDev(weeks.slice(1));
    if (!insufficientHistory && historyWeeks >= 8 && sd > 0 && weeks[0] > average(weeks.slice(1)) + 3 * sd) signals.push("unusual_demand");
    if (leadHistory.length >= 3) {
      const last = leadHistory.at(-1).days;
      const before = average(leadHistory.slice(0, -1).map(row => row.days));
      if (before > 0 && Math.abs(last - before) / before >= 0.5) signals.push("lead_time_change");
    }
    const doNotReorder = !insufficientHistory && daysOfCover != null && daysOfCover > usedLead + 30;
    if (doNotReorder || (signals.includes("declining_sales") && daysOfCover != null && daysOfCover > usedLead + COVER_DAYS)) signals.push("do_not_reorder_yet");

    const status = insufficientHistory ? "Insufficient history"
      : signals.includes("likely_stockout") ? "Likely stockout"
        : signals.includes("overstock") ? "Overstock"
          : signals.includes("do_not_reorder_yet") ? "Do not reorder yet"
            : signals.includes("declining_sales") ? "Declining sales" : "Normal";
    const severity = status === "Likely stockout" ? (daysOfCover <= 3 ? "high" : "medium") : signals.includes("unusual_demand") || signals.includes("lead_time_change") ? "medium" : "low";
    const parts = [
      insufficientHistory ? `Only ${samples} sale movement(s) in ${historyWeeks} week(s); no forecast is made.` : `Average ${avgWeekly} ${item.unit || "units"} sold per week over the last ${Math.max(4, Math.min(8, historyWeeks))} weeks.`,
      !insufficientHistory && daysOfCover != null ? `Current stock covers about ${daysOfCover} day(s).` : null,
      leadDays != null ? `Lead time ${leadDays} day(s) from ${leadHistory.length} purchase order(s).` : `Lead time unknown; ${DEFAULT_LEAD_DAYS} days assumed.`,
      signals.includes("declining_sales") ? `Recent weekly sales ${roundMoney(recentAvg)} vs ${roundMoney(earlierAvg)} earlier.` : null,
      signals.includes("unusual_demand") ? `This week's sales (${weeks[0]}) are well above normal.` : null,
      signals.includes("lead_time_change") ? `Latest lead time ${leadHistory.at(-1).days} day(s) differs from the usual ${Math.round(average(leadHistory.slice(0, -1).map(row => row.days)))}.` : null,
    ].filter(Boolean);

    rows.push(advisory({
      id: `inventory-${item.id}`,
      itemId: item.id,
      itemName: item.name,
      unit: item.unit || "",
      title: `${item.name}: ${status}`,
      status,
      signals,
      currentStock: stock,
      averageWeeklySales: avgWeekly,
      forecastDemand30Days: insufficientHistory ? null : roundMoney(daily * 30),
      period: `${addDaysIso(today, -WEEKS * 7)} to ${today}`,
      daysOfCover: insufficientHistory ? null : daysOfCover,
      stockoutDate: insufficientHistory ? null : stockoutDate,
      leadTimeDays: leadDays,
      leadTimeAssumed: leadDays == null,
      suggestedReorderQty: insufficientHistory || signals.includes("do_not_reorder_yet") || signals.includes("overstock") ? 0 : reorderQty,
      insufficientHistory,
      severity,
      confidence: insufficientHistory ? "low" : historyWeeks >= 8 && leadDays != null ? "high" : "medium",
      confidencePct: insufficientHistory ? 30 : historyWeeks >= 8 && leadDays != null ? 80 : 60,
      explanation: parts.join(" "),
      recommendedAction: status === "Likely stockout" ? `Consider ordering about ${reorderQty} ${item.unit || "units"}.`
        : status === "Do not reorder yet" ? "Do not reorder yet; current stock is sufficient."
          : status === "Overstock" ? "Pause purchases and review slow-moving stock."
            : status === "Insufficient history" ? "Keep recording sales; a forecast appears after a few weeks." : "No action needed now.",
      source: source("inventory", "Open inventory", { itemId: item.id }),
    }));
  }
  const order = { "Likely stockout": 0, "Declining sales": 1, Overstock: 2, "Do not reorder yet": 3, Normal: 4, "Insufficient history": 5 };
  return rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (a.daysOfCover ?? 9999) - (b.daysOfCover ?? 9999));
}
