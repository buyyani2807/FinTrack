/**
 * Counter (POS) AI advisories — stock, till anomalies, day-close coach.
 * Advisory only: never posts, voids, or changes Accounts ledgers.
 */
import { isCancelled, roundMoney, voucherTotals } from "./accountingModel.js";
import { isCounterTillVoucher } from "./counterDayReport.js";

const n = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const lineGross = line => {
  const qty = Math.max(0, Math.trunc(n(line.quantity)));
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
    const qtyOnBill = (lines || [])
      .filter(row => row.itemId === line.itemId)
      .reduce((sum, row) => sum + Math.max(0, Math.trunc(n(row.quantity))), 0);
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
