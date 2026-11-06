/**
 * Ask Counter — read-only Q&A for the till (cash today, stock, khata, top items).
 * Never posts, voids, or changes ledgers.
 */
import { formatInr } from "../../../lib/formatMoney.js";
import { roundMoney, voucherTotals } from "./accountingModel.js";
import { counterDayReport, isCounterTillVoucher } from "./counterDayReport.js";
import { matchCounterItems, normalizeCounterQuery } from "./counterSearch.js";
import { currentStockForItem, stockStatus } from "./inventoryModel.js";

const money = formatInr;

export const COUNTER_ASK_PROMPTS = [
  { id: "cashToday", label: "Cash sales today?", question: "Cash sales today" },
  { id: "upiToday", label: "UPI today?", question: "UPI today" },
  { id: "khataToday", label: "Khata today?", question: "Khata sales today" },
  { id: "topItems", label: "Top items today?", question: "Top items today" },
  { id: "lowStock", label: "Low stock?", question: "Low stock" },
];

const norm = value => normalizeCounterQuery(value);

function isKhataVoucher(voucher) {
  return /·\s*khata\b/i.test(String(voucher?.narration || ""));
}

function counterBillsToday(vouchers, { today, tillLabel = "" } = {}) {
  return (vouchers || []).filter(voucher => isCounterTillVoucher(voucher, { date: today, tillLabel }));
}

function matchItemInQuestion(question, items = []) {
  const q = norm(question);
  if (!q) return null;
  // Prefer longer catalog names that appear in the question.
  let best = null;
  for (const item of items || []) {
    if (item?.isActive === false) continue;
    const name = norm(item.name);
    if (name.length < 3) continue;
    if (!q.includes(name)) continue;
    if (!best || name.length > norm(best.name).length) best = item;
  }
  if (best) return best;
  // Fallback: search ranking on remaining words after stock/how much cues.
  const stripped = q
    .replace(/\b(how much|stock|left|remaining|qty|quantity|of|for|do we have|have)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  return matchCounterItems(items, stripped, { limit: 1 })[0] || null;
}

function parseIntent(question) {
  const q = norm(question);
  if (!q) return { id: "help" };
  if (/\b(low stock|reorder|running out)\b/.test(q)) return { id: "lowStock" };
  if (/\b(top items?|best sellers?|sold most)\b/.test(q)) return { id: "topItems" };
  if (/\b(khata|credit sales?|on credit)\b/.test(q)) return { id: "khataToday" };
  if (/\bupi\b/.test(q)) return { id: "upiToday" };
  if (/\bcard\b/.test(q)) return { id: "cardToday" };
  if (/\b(cash sales?|cash today|drawer)\b/.test(q) || (/\bcash\b/.test(q) && /\btoday\b/.test(q))) {
    return { id: "cashToday" };
  }
  if (/\b(sales? today|today.?s? (sales?|total)|till total)\b/.test(q)) return { id: "salesToday" };
  if (/\b(how much|stock|left|remaining|do we have)\b/.test(q)) return { id: "stock" };
  return { id: "help" };
}

function reportAnswer(title, report, { focus } = {}) {
  const tender = report?.tender || {};
  const lines = [
    { label: "Bills", detail: `${report.billCount || 0}`, amount: null },
    { label: "Sales", detail: "", amount: report.sales || 0 },
    { label: "Cash", detail: "", amount: tender.cash || 0 },
    { label: "UPI", detail: "", amount: tender.upi || 0 },
    { label: "Card", detail: "", amount: tender.card || 0 },
  ];
  let summary = `${report.tillLabel || "Counter"} has ${report.billCount || 0} bill${report.billCount === 1 ? "" : "s"} for ${report.date}, total ${money(report.sales || 0)}.`;
  if (focus === "cash") summary = `Cash tenders today: ${money(tender.cash || 0)} on ${report.tillLabel || "Counter"} (${report.date}).`;
  if (focus === "upi") summary = `UPI tenders today: ${money(tender.upi || 0)} on ${report.tillLabel || "Counter"} (${report.date}).`;
  if (focus === "card") summary = `Card tenders today: ${money(tender.card || 0)} on ${report.tillLabel || "Counter"} (${report.date}).`;
  return {
    title,
    summary,
    lines,
    source: "From Counter day report. Read-only — nothing is posted.",
    link: null,
  };
}

/**
 * Answer a plain-language Counter question from this company's till data.
 */
export function askCounter(question, input = {}) {
  const {
    accounts = [],
    vouchers = [],
    items = [],
    stockByItem = {},
    stockMovements = [],
    voucherItemLines = [],
    tillLabel = "",
    today,
  } = input;
  const day = String(today || "").slice(0, 10);
  const intent = parseIntent(question);
  const report = counterDayReport(accounts, vouchers, { date: day, tillLabel });

  if (intent.id === "cashToday") return reportAnswer("Cash today", report, { focus: "cash" });
  if (intent.id === "upiToday") return reportAnswer("UPI today", report, { focus: "upi" });
  if (intent.id === "cardToday") return reportAnswer("Card today", report, { focus: "card" });
  if (intent.id === "salesToday") return reportAnswer("Sales today", report);

  if (intent.id === "khataToday") {
    const bills = counterBillsToday(vouchers, { today: day, tillLabel }).filter(isKhataVoucher);
    const total = roundMoney(bills.reduce((sum, bill) => sum + voucherTotals(bill.lines || []).debit, 0));
    return {
      title: "Khata today",
      summary: bills.length
        ? `${bills.length} khata bill${bills.length === 1 ? "" : "s"} for ${money(total)} on ${tillLabel || "Counter"} (${day}).`
        : `No khata Counter bills on ${tillLabel || "Counter"} for ${day}.`,
      lines: bills.slice(0, 8).map(bill => ({
        label: bill.voucherNumber || bill.reference || "Bill",
        detail: String(bill.narration || "").split(" · ").filter(part => part && !/^counter/i.test(part) && !/^cashier/i.test(part) && part.toLowerCase() !== "khata").slice(-1)[0] || "",
        amount: voucherTotals(bill.lines || []).debit,
      })),
      source: "Khata Counter sales for this till. Read-only.",
      link: null,
    };
  }

  if (intent.id === "topItems") {
    const billIds = new Set(counterBillsToday(vouchers, { today: day, tillLabel }).map(bill => bill.id));
    const qtyByItem = new Map();
    for (const line of voucherItemLines || []) {
      if (!billIds.has(line.voucherId)) continue;
      const key = line.itemId || line.itemName || "";
      if (!key) continue;
      const prev = qtyByItem.get(key) || { name: line.itemName || key, qty: 0, amount: 0 };
      prev.qty = roundMoney(prev.qty + Number(line.quantity || 0));
      prev.amount = roundMoney(prev.amount + Number(line.taxableAmount ?? line.lineTotal ?? line.amount ?? 0));
      qtyByItem.set(key, prev);
    }
    const rows = [...qtyByItem.values()].sort((a, b) => b.amount - a.amount || b.qty - a.qty).slice(0, 8);
    return {
      title: "Top items today",
      summary: rows.length
        ? `Top Counter lines on ${tillLabel || "Counter"} for ${day}.`
        : `No item lines on Counter bills for ${day}.`,
      lines: rows.map(row => ({
        label: row.name,
        detail: `Qty ${row.qty}`,
        amount: row.amount,
      })),
      source: "From Counter bill lines today. Read-only.",
      link: null,
    };
  }

  if (intent.id === "lowStock") {
    const rows = (items || [])
      .filter(item => item?.isActive !== false && item.itemType !== "service")
      .map(item => {
        const stock = stockByItem[item.id] != null
          ? Number(stockByItem[item.id])
          : currentStockForItem(item, stockMovements);
        return { item, stock, reorderLevel: Number(item.reorderLevel || 0) };
      })
      .filter(row => stockStatus(row.stock, row.reorderLevel) === "low")
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8);
    return {
      title: "Low stock",
      summary: rows.length
        ? `${rows.length} item${rows.length === 1 ? "" : "s"} at or below reorder.`
        : "No items are at reorder level right now.",
      lines: rows.map(row => ({
        label: row.item.name,
        detail: `${row.stock}${row.item.unit ? ` ${row.item.unit}` : ""} · reorder ${row.reorderLevel}`,
        amount: null,
      })),
      source: "From inventory on-hand. Read-only.",
      link: null,
    };
  }

  if (intent.id === "stock") {
    const item = matchItemInQuestion(question, items);
    if (!item) {
      return {
        title: "Stock",
        summary: "Name an item, for example “how much toor dal left”.",
        lines: [],
        source: "Ask Counter is read-only.",
        link: null,
      };
    }
    const stock = stockByItem[item.id] != null
      ? Number(stockByItem[item.id])
      : currentStockForItem(item, stockMovements);
    const status = stockStatus(stock, item.reorderLevel);
    return {
      title: item.name,
      summary: `${item.name}: ${stock}${item.unit ? ` ${item.unit}` : ""} on hand${status === "low" ? " (at or below reorder)" : ""}.`,
      lines: [
        { label: "On hand", detail: item.unit || "", amount: stock },
        { label: "Reorder at", detail: "", amount: Number(item.reorderLevel || 0) },
        { label: "List price", detail: "", amount: Number(item.sellingPrice || 0) },
      ],
      source: "From inventory. Read-only — Charge still posts the sale.",
      link: null,
    };
  }

  return {
    title: "Ask Counter",
    summary: "Try cash sales today, UPI today, khata today, top items, low stock, or “how much toor dal left”.",
    lines: [],
    source: "Answers use this company’s Counter and stock. Nothing is posted or sent.",
    link: null,
  };
}
