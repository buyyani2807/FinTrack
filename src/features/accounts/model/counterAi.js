/**
 * Counter (POS) AI advisories — stock, till anomalies, day-close coach,
 * khata risk chip, and day-close WhatsApp brief.
 * Advisory only: never posts, voids, or changes Accounts ledgers.
 */
import { formatInr } from "../../../lib/formatMoney.js";
import { compactCreditScore } from "../../creditScore/creditScoreModel.js";
import { isCancelled, roundMoney, voucherTotals } from "./accountingModel.js";
import { isCounterTillVoucher } from "./counterDayReport.js";
import { quantityInBaseUnit } from "./inventoryModel.js";
import { partyProfile } from "./partyProfile.js";
import { creditCheck } from "./tradeDocumentModel.js";

const n = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** Bill qty in the item's stock unit (500 g → 0.5 Kg when sellUnit is Gram). */
const lineStockQty = line => {
  const baseUnit = line.unit || "Nos";
  return Math.max(0, quantityInBaseUnit(line.quantity, baseUnit, line.sellUnit || baseUnit, line));
};

const lineGross = line => {
  const qty = lineStockQty(line);
  return roundMoney(qty * n(line.rate));
};

const lineDiscountAmount = line => {
  const gross = lineGross(line);
  const discText = String(line.discount || "").trim();
  if (!discText || !(gross > 0)) return 0;
  if (discText.endsWith("%")) {
    const pct = Number(discText.slice(0, -1));
    return Number.isFinite(pct) ? roundMoney((gross * pct) / 100) : 0;
  }
  const value = Number(discText);
  return Number.isFinite(value) ? roundMoney(value) : 0;
};

const lineNet = line => Math.max(0, roundMoney(lineGross(line) - lineDiscountAmount(line)));

/** Sale qty leaving stock in the last `days` (stock movements reason sale/delivery). */
export function recentDailySalesQty(stockMovements = [], itemId, { today, days = 14 } = {}) {
  if (!itemId || !today) return { daily: 0, samples: 0 };
  const since = (() => {
    const date = new Date(`${String(today).slice(0, 10)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - Number(days || 14));
    return date.toISOString().slice(0, 10);
  })();
  let sold = 0;
  let samples = 0;
  for (const move of stockMovements || []) {
    if (move.itemId !== itemId) continue;
    const day = String(move.movementDate || "").slice(0, 10);
    if (!day || day < since || day > today) continue;
    const reason = String(move.reason || "");
    if (reason !== "sale" && reason !== "delivery") continue;
    const qty = Math.abs(n(move.quantityDelta));
    if (!(qty > 0)) continue;
    sold += qty;
    samples += 1;
  }
  return { daily: sold / Math.max(1, days), samples };
}

/**
 * Stock advisories for the open bill. Does not block charge.
 */
export function counterStockAlerts({
  items = [],
  stockByItem = {},
  lines = [],
  stockMovements = [],
  today,
} = {}) {
  const byId = Object.fromEntries((items || []).map(item => [item.id, item]));
  const alerts = [];
  const seen = new Set();
  for (const line of lines || []) {
    if (!line.itemId || seen.has(line.itemId)) continue;
    const item = byId[line.itemId];
    if (!item || item.itemType === "service") continue;
    seen.add(line.itemId);
    const qtyOnBill = roundMoney((lines || [])
      .filter(row => row.itemId === line.itemId)
      .reduce((sum, row) => sum + lineStockQty(row), 0));
    const stock = n(stockByItem[line.itemId]);
    const remaining = roundMoney(stock - qtyOnBill);
    const reorder = n(item.reorderLevel);
    const { daily, samples } = recentDailySalesQty(stockMovements, line.itemId, { today, days: 14 });
    const daysOfCover = daily > 0 ? Math.floor(Math.max(0, remaining) / daily) : null;

    if (stock <= 0) {
      alerts.push({
        id: `stock-out-${line.itemId}`,
        kind: "stock",
        severity: "high",
        title: `${item.name} is out of stock`,
        detail: `Bill asks for ${qtyOnBill}; on-hand is ${stock}. Charge still posts — correct stock after if needed.`,
      });
      continue;
    }
    if (remaining < 0) {
      alerts.push({
        id: `stock-short-${line.itemId}`,
        kind: "stock",
        severity: "high",
        title: `${item.name}: bill exceeds stock`,
        detail: `On-hand ${stock}, on this bill ${qtyOnBill} (short ${Math.abs(remaining)}).`,
      });
      continue;
    }
    if (reorder > 0 && remaining <= reorder) {
      alerts.push({
        id: `stock-reorder-${line.itemId}`,
        kind: "stock",
        severity: "medium",
        title: `${item.name}: near reorder level`,
        detail: `About ${remaining} left after this bill (reorder at ${reorder}).`,
      });
    } else if (remaining > 0 && remaining <= 3) {
      alerts.push({
        id: `stock-low-${line.itemId}`,
        kind: "stock",
        severity: "medium",
        title: `${item.name}: only ${remaining} left after this bill`,
        detail: "Low units remaining on the shelf.",
      });
    }
    if (samples >= 3 && daysOfCover != null && daysOfCover <= 3 && remaining > 0) {
      alerts.push({
        id: `stock-cover-${line.itemId}`,
        kind: "stock",
        severity: daysOfCover <= 1 ? "high" : "medium",
        title: `${item.name}: about ${daysOfCover} day${daysOfCover === 1 ? "" : "s"} of cover left`,
        detail: `Recent Counter/sales pace ≈ ${roundMoney(daily)} ${item.unit || "units"}/day.`,
      });
    }
  }
  const rank = { high: 3, medium: 2, low: 1 };
  return alerts.sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0)).slice(0, 6);
}

/**
 * Till pattern flags for the open cart and today’s Counter activity.
 */
export function counterTillAnomalies({
  items = [],
  lines = [],
  vouchers = [],
  tillLabel = "",
  today,
  now = Date.now(),
  cartTotal = null,
} = {}) {
  const alerts = [];
  const byId = Object.fromEntries((items || []).map(item => [item.id, item]));
  const total = cartTotal == null
    ? roundMoney((lines || []).reduce((sum, line) => sum + lineNet(line), 0))
    : roundMoney(cartTotal);

  for (const line of lines || []) {
    if (!line.itemId) continue;
    const item = byId[line.itemId];
    if (!item) continue;
    const list = n(item.sellingPrice);
    const rate = n(line.rate);
    if (list > 0 && rate > 0 && rate < list * 0.7) {
      alerts.push({
        id: `rate-low-${line.itemId}`,
        kind: "anomaly",
        severity: "medium",
        title: `${item.name}: rate well below list`,
        detail: `Charging ${roundMoney(rate)} vs list ${roundMoney(list)}. Confirm before charge.`,
      });
    }
    const gross = lineGross(line);
    const disc = lineDiscountAmount(line);
    if (gross > 0 && disc / gross >= 0.25) {
      alerts.push({
        id: `disc-high-${line.itemId}-${line.quantity}`,
        kind: "anomaly",
        severity: "medium",
        title: `${item.name}: high discount on this line`,
        detail: `Discount ${roundMoney(disc)} is ${Math.round((disc / gross) * 100)}% of line value.`,
      });
    }
  }

  if (total > 0 && today) {
    const recent = (vouchers || []).filter(voucher => isCounterTillVoucher(voucher, { date: today, tillLabel }));
    const sameAmount = recent.filter(voucher => roundMoney(voucherTotals(voucher.lines || []).debit) === total);
    if (sameAmount.length) {
      const latest = sameAmount
        .slice()
        .sort((a, b) => String(b.postedAt || b.createdAt || "").localeCompare(String(a.postedAt || a.createdAt || "")))[0];
      const stamp = latest?.postedAt || latest?.createdAt || "";
      const ageMs = stamp ? Math.max(0, now - new Date(stamp).getTime()) : null;
      const withinFiveMin = ageMs != null && Number.isFinite(ageMs) && ageMs <= 5 * 60 * 1000;
      alerts.push({
        id: `dup-amount-${total}`,
        kind: "anomaly",
        severity: withinFiveMin ? "high" : "medium",
        title: withinFiveMin ? "Possible repeat charge" : "Same amount already sold today",
        detail: withinFiveMin
          ? `Another Counter bill for ${roundMoney(total)} posted in the last few minutes (${latest.voucherNumber || "bill"}).`
          : `${sameAmount.length} Counter bill(s) today already total ${roundMoney(total)} (e.g. ${latest.voucherNumber || "bill"}).`,
      });
    }

    const voidsToday = (vouchers || []).filter(voucher => (
      voucher.sourceType === "pos_counter"
      && String(voucher.date || "").slice(0, 10) === today
      && isCancelled(voucher)
      && (!tillLabel || String(voucher.narration || "").toLowerCase().includes(`counter sale · ${String(tillLabel).toLowerCase()}`))
    ));
    if (voidsToday.length >= 3) {
      alerts.push({
        id: "voids-many",
        kind: "anomaly",
        severity: "medium",
        title: `${voidsToday.length} voids on this till today`,
        detail: "Higher than a quiet day — worth a quick owner glance at day close.",
      });
    }
  }

  const rank = { high: 3, medium: 2, low: 1 };
  return alerts.sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0)).slice(0, 6);
}

/**
 * Plain-language day-close coach from tender split vs counted cash.
 */
export function counterDayCloseCoach({
  report = null,
  openingFloat = 0,
  countedCash = 0,
  expectedCash = null,
  variance = null,
} = {}) {
  const tips = [];
  const float = roundMoney(n(openingFloat));
  const cashTender = roundMoney(report?.tender?.cash || 0);
  const upi = roundMoney(report?.tender?.upi || 0);
  const card = roundMoney(report?.tender?.card || 0);
  const sales = roundMoney(report?.sales || 0);
  const expected = expectedCash == null ? roundMoney(float + cashTender) : roundMoney(expectedCash);
  const counted = roundMoney(n(countedCash));
  const gap = variance == null ? roundMoney(counted - expected) : roundMoney(variance);

  tips.push({
    id: "close-summary",
    severity: "info",
    title: "How expected cash is built",
    detail: `Opening float ${roundMoney(float)} + cash tenders ${roundMoney(cashTender)} = expected ${roundMoney(expected)}. UPI ${roundMoney(upi)} and Card ${roundMoney(card)} stay out of the drawer.`,
  });

  if (sales > 0 && cashTender + upi + card < sales - 0.05) {
    tips.push({
      id: "close-tender-gap",
      severity: "medium",
      title: "Tender split is short of sales",
      detail: `Sales ${roundMoney(sales)} vs cash+UPI+card ${roundMoney(cashTender + upi + card)}. Check a bill’s payment ledgers.`,
    });
  }

  if (Math.abs(gap) < 0.005) {
    tips.push({
      id: "close-ok",
      severity: "info",
      title: "Drawer matches expected cash",
      detail: "No cash variance on this close.",
    });
  } else if (gap < 0) {
    tips.push({
      id: "close-short",
      severity: "high",
      title: `Cash short by ${roundMoney(Math.abs(gap))}`,
      detail: [
        "Re-count notes and coins.",
        upi > 0 || card > 0 ? "Confirm a Cash+UPI/Card split was not counted as drawer cash twice." : null,
        "Check for a voided cash bill still in the physical drawer expectation.",
      ].filter(Boolean).join(" "),
    });
  } else {
    tips.push({
      id: "close-over",
      severity: "medium",
      title: `Cash over by ${roundMoney(gap)}`,
      detail: [
        "Someone may have put a UPI/Card settlement’s change into the drawer, or float was understated.",
        upi > 0 ? `UPI today is ${roundMoney(upi)} — it should not be in counted cash.` : null,
        card > 0 ? `Card today is ${roundMoney(card)} — keep terminal slips separate from cash.` : null,
      ].filter(Boolean).join(" "),
    });
  }

  return tips;
}

/** Combined Counter advisories for the open till session. */
export function counterSessionAdvisories(input = {}) {
  const stock = counterStockAlerts(input);
  const anomalies = counterTillAnomalies(input);
  return [...stock, ...anomalies];
}

/**
 * Khata risk before credit charge — outstanding, overdue, limit, credit score.
 * Feeds creditCheck with real overdue days (Counter previously passed 0).
 */
export function counterKhataRisk({
  accounts = [],
  vouchers = [],
  parties = [],
  party = null,
  invoiceTotal = 0,
  today = "",
  settings = {},
} = {}) {
  if (!party) return null;
  const profile = partyProfile({ accounts, vouchers, parties, party, today });
  const receivable = profile?.receivable || profile?.primary;
  const outstanding = Number(receivable?.outstanding || 0);
  const overdue = Number(receivable?.overdue || 0);
  const overdueDays = Number(receivable?.maxDaysOverdue || 0);
  const creditLimit = Number(party.creditLimit || 0);
  const exposure = roundMoney(outstanding + Number(invoiceTotal || 0));
  const limitUsedPct = creditLimit > 0
    ? Math.round((Math.max(0, exposure) / creditLimit) * 100)
    : null;
  const advice = creditCheck({
    party,
    outstanding,
    invoiceTotal,
    overdueDays,
    settings,
  });
  const score = compactCreditScore({
    invoices: receivable?.creditInvoices || [],
    asOf: today,
  });

  let severity = "info";
  if (advice.level === "block") severity = "high";
  else if (advice.level === "warn" || overdue > 0 || (limitUsedPct != null && limitUsedPct >= 90)) severity = "medium";
  else if (score.available && (score.band === "attention" || score.band === "high_risk")) severity = "medium";

  const chips = [
    { id: "outstanding", label: "Outstanding", value: formatInr(outstanding) },
    overdue > 0
      ? { id: "overdue", label: "Overdue", value: `${formatInr(overdue)}${overdueDays ? ` · ${overdueDays}d` : ""}` }
      : null,
    creditLimit > 0
      ? { id: "limit", label: "After this bill", value: `${formatInr(exposure)} / ${formatInr(creditLimit)}${limitUsedPct != null ? ` (${limitUsedPct}%)` : ""}` }
      : { id: "this-bill", label: "This bill", value: formatInr(invoiceTotal) },
    score.available
      ? { id: "score", label: "Credit score", value: score.label }
      : { id: "score", label: "Credit score", value: "Not enough history" },
  ].filter(Boolean);

  return {
    outstanding,
    overdue,
    overdueDays,
    creditLimit,
    exposure,
    limitUsedPct,
    advice,
    score,
    severity,
    chips,
    messages: advice.messages || [],
  };
}

/**
 * Plain-language day-close brief for the owner (WhatsApp-ready).
 */
export function counterDayCloseBrief({
  companyName = "",
  tillLabel = "",
  report = null,
  openingFloat = 0,
  countedCash = 0,
  expectedCash = 0,
  variance = 0,
  reason = "",
  topItems = [],
  cashierName = "",
} = {}) {
  const day = report?.date || "";
  const tender = report?.tender || {};
  const lines = [
    `*${companyName || "MyFinTracker"} — Day close*`,
    tillLabel ? `Till: ${tillLabel}` : null,
    day ? `Date: ${day}` : null,
    cashierName ? `Cashier: ${cashierName}` : null,
    "",
    `Bills: ${report?.billCount || 0}`,
    `Sales: ${formatInr(report?.sales || 0)}`,
    `Cash: ${formatInr(tender.cash || 0)} · UPI: ${formatInr(tender.upi || 0)} · Card: ${formatInr(tender.card || 0)}`,
    "",
    `Opening float: ${formatInr(openingFloat)}`,
    `Expected cash: ${formatInr(expectedCash)}`,
    `Counted cash: ${formatInr(countedCash)}`,
    `Variance: ${formatInr(variance)}${Number(variance) < 0 ? " (short)" : Number(variance) > 0 ? " (over)" : ""}`,
    String(reason || "").trim() ? `Note: ${String(reason).trim()}` : null,
  ].filter(row => row != null);

  if (topItems?.length) {
    lines.push("", "*Top items*");
    for (const item of topItems.slice(0, 5)) {
      lines.push(`• ${item.name}: qty ${item.qty}${item.amount != null ? ` · ${formatInr(item.amount)}` : ""}`);
    }
  }

  lines.push("", "_Advisory brief from Counter. Does not post a journal._");
  return lines.join("\n");
}

/** Aggregate Counter bill lines for day-close top items. */
export function counterDayTopItems({ vouchers = [], voucherItemLines = [], today = "", tillLabel = "" } = {}) {
  const billIds = new Set(
    (vouchers || [])
      .filter(voucher => isCounterTillVoucher(voucher, { date: today, tillLabel }))
      .map(voucher => voucher.id),
  );
  const byItem = new Map();
  for (const line of voucherItemLines || []) {
    if (!billIds.has(line.voucherId)) continue;
    const key = line.itemId || line.itemName || "";
    if (!key) continue;
    const prev = byItem.get(key) || { name: line.itemName || key, qty: 0, amount: 0 };
    prev.qty = roundMoney(prev.qty + Number(line.quantity || 0));
    prev.amount = roundMoney(prev.amount + Number(line.taxableAmount ?? line.lineTotal ?? line.amount ?? 0));
    byItem.set(key, prev);
  }
  return [...byItem.values()].sort((a, b) => b.amount - a.amount || b.qty - a.qty).slice(0, 8);
}
