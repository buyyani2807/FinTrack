import { formatInr } from "../../../lib/formatMoney.js";
import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { roundMoney } from "./accountingModel.js";
import { quantityInBaseUnit } from "./inventoryModel.js";

const WA_RULE = "────────────────";

/** Cash change when tendered ≥ bill total; null when tendered is empty/invalid. */
export function cashChangeDue(tendered, total) {
  const paid = Number(tendered);
  const due = Number(total);
  if (!Number.isFinite(paid) || paid <= 0 || !Number.isFinite(due)) return null;
  return roundMoney(paid - due);
}

/**
 * Lines whose billed base qty exceeds on-hand stock (services skipped).
 * Used for optional hard-block on Charge.
 */
export function counterOversellLines(lines = [], stockByItem = {}, items = []) {
  const byId = Object.fromEntries((items || []).map(item => [item.id, item]));
  const needed = new Map();
  for (const line of lines || []) {
    if (!line?.itemId) continue;
    const item = byId[line.itemId];
    if (item?.itemType === "service") continue;
    const baseUnit = line.unit || item?.unit || "Nos";
    const qty = Math.max(0, quantityInBaseUnit(line.quantity, baseUnit, line.sellUnit || baseUnit, line));
    if (!(qty > 0)) continue;
    needed.set(line.itemId, roundMoney((needed.get(line.itemId) || 0) + qty));
  }
  const bad = [];
  for (const [itemId, need] of needed) {
    const stock = Number(stockByItem[itemId] ?? 0);
    if (need > stock + 1e-9) {
      bad.push({
        itemId,
        name: byId[itemId]?.name || itemId,
        need,
        stock: Number.isFinite(stock) ? stock : 0,
      });
    }
  }
  return bad;
}

/** Line taxable after quantity × rate and line discount (₹ or %). */
export function counterLineNet(line) {
  const baseUnit = line.unit || "Nos";
  const qty = Math.max(0, quantityInBaseUnit(line.quantity, baseUnit, line.sellUnit || baseUnit, line));
  const rate = Number(line.rate || 0);
  const gross = roundMoney(qty * rate);
  const discText = String(line.discount || "").trim();
  let discount = 0;
  if (discText.endsWith("%")) {
    const pct = Number(discText.slice(0, -1));
    if (Number.isFinite(pct)) discount = roundMoney((gross * pct) / 100);
  } else if (discText) {
    const value = Number(discText);
    if (Number.isFinite(value)) discount = roundMoney(value);
  }
  return Math.max(0, roundMoney(gross - discount));
}

export function counterEstimateTotal(lines, { gstEnabled, intra }) {
  let taxable = 0;
  let tax = 0;
  for (const line of lines || []) {
    if (!line.itemId && !String(line.itemName || "").trim()) continue;
    const net = counterLineNet(line);
    taxable = roundMoney(taxable + net);
    if (gstEnabled) {
      const rate = Number(line.gstRate || 0);
      tax = roundMoney(tax + (net * rate) / 100);
    }
  }
  const half = gstEnabled && intra ? roundMoney(tax / 2) : 0;
  const cgst = half;
  const sgst = gstEnabled && intra ? roundMoney(tax - half) : 0;
  const igst = gstEnabled && !intra ? tax : 0;
  return {
    taxable,
    tax,
    cgst,
    sgst,
    igst,
    total: roundMoney(taxable + tax),
    taxLabel: !gstEnabled ? "" : intra ? "GST (CGST+SGST)" : "GST (IGST)",
  };
}

/**
 * Apply a bill-level discount (₹ or %) by writing extra ₹ into each line.discount.
 * Keeps posting on existing line discountAmount path.
 */
export function applyBillDiscountToLines(lines = [], billDiscount = "") {
  const text = String(billDiscount || "").trim();
  if (!text) return (lines || []).map(line => ({ ...line }));
  const nets = (lines || []).map(line => counterLineNet({ ...line, discount: line.discount || "" }));
  const subtotal = roundMoney(nets.reduce((sum, value) => sum + value, 0));
  if (!(subtotal > 0)) return (lines || []).map(line => ({ ...line }));

  let billOff = 0;
  if (text.endsWith("%")) {
    const pct = Number(text.slice(0, -1));
    if (!Number.isFinite(pct) || pct <= 0) return (lines || []).map(line => ({ ...line }));
    billOff = roundMoney((subtotal * Math.min(pct, 100)) / 100);
  } else {
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0) return (lines || []).map(line => ({ ...line }));
    billOff = roundMoney(Math.min(value, subtotal));
  }
  if (!(billOff > 0)) return (lines || []).map(line => ({ ...line }));

  let allocated = 0;
  const usable = (lines || []).map((line, index) => ({ line, index, net: nets[index] })).filter(row => row.net > 0);
  return (lines || []).map((line, index) => {
    const row = usable.find(item => item.index === index);
    if (!row) return { ...line };
    const isLast = row === usable[usable.length - 1];
    const share = isLast
      ? roundMoney(billOff - allocated)
      : roundMoney((billOff * row.net) / subtotal);
    if (!isLast) allocated = roundMoney(allocated + share);
    const existingText = String(line.discount || "").trim();
    let existingAmount = 0;
    if (existingText.endsWith("%")) {
      const pct = Number(existingText.slice(0, -1));
      if (Number.isFinite(pct)) {
        const baseUnit = line.unit || "Nos";
        const qty = Math.max(0, quantityInBaseUnit(line.quantity, baseUnit, line.sellUnit || baseUnit, line));
        existingAmount = roundMoney((qty * Number(line.rate || 0) * pct) / 100);
      }
    } else if (existingText) {
      const value = Number(existingText);
      if (Number.isFinite(value)) existingAmount = roundMoney(value);
    }
    return { ...line, discount: String(roundMoney(existingAmount + share)) };
  });
}

/** WhatsApp-formatted Counter receipt — retail slip layout (no bakery-only fields). */
export function buildCounterWhatsAppReceipt({
  companyName = "",
  companyPhone = "",
  companyGstin = "",
  companyAddress = "",
  tillLabel = "",
  cashierName = "",
  billNo = "",
  isReturn = false,
  isCredit = false,
  payLabel = "",
  customerName = "",
  customerPhone = "",
  lines = [],
  taxable = 0,
  tax = 0,
  cgst = 0,
  sgst = 0,
  igst = 0,
  taxLabel = "",
  total = 0,
  date = "",
} = {}) {
  const store = String(companyName || "Store").trim();
  const title = isReturn
    ? "RETURN BILL"
    : (Number(tax) > 0 && companyGstin ? "TAX INVOICE" : "BILL");
  const dateLabel = formatReceiptDate(date) || String(date || "").trim();
  const phone = String(customerPhone || "").trim();
  const name = String(customerName || "").trim();
  const nameLine = name
    ? (phone ? `Name: ${name} (M: ${phone})` : `Name: ${name}`)
    : (phone ? `Name: Customer (M: ${phone})` : "");

  const usableLines = (lines || []).filter(line => line?.itemId || String(line?.itemName || line?.name || "").trim());
  const totalQty = usableLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  const header = [
    `*${title}*`,
    `*${store}*`,
    companyAddress ? String(companyAddress).trim() : "",
    companyPhone ? `Mobile No: ${String(companyPhone).trim()}` : "",
    companyGstin ? `GSTIN: ${String(companyGstin).trim()}` : "",
    WA_RULE,
    nameLine,
    dateLabel ? `Date: ${dateLabel}` : "",
    cashierName ? `Cashier: ${cashierName}` : "",
    tillLabel ? `Till: ${tillLabel}` : "",
    billNo ? `Bill No.: ${billNo}` : "",
    WA_RULE,
  ].filter(Boolean);

  const itemLines = usableLines.flatMap(line => {
    const itemName = String(line.itemName || line.name || "Item").trim();
    const qty = Number(line.quantity || 0);
    const rate = Number(line.rate);
    const amount = formatInr(counterLineNet(line));
    const rateText = Number.isFinite(rate) && rate > 0 ? formatInr(rate) : "";
    return [
      `*${itemName}*`,
      `  ${qty}${rateText ? `  ${rateText}` : ""}  ${amount}`,
    ];
  });

  const hasGstBreakup = Number(cgst) > 0 || Number(sgst) > 0 || Number(igst) > 0;
  const totals = [
    WA_RULE,
    totalQty > 0 ? `Total Qty: ${totalQty}` : "",
    Number(tax) > 0 || Number(taxable) > 0 ? `Sub Total: ${formatInr(taxable || total)}` : "",
    hasGstBreakup && Number(cgst) > 0 ? `CGST: ${formatInr(cgst)}` : "",
    hasGstBreakup && Number(sgst) > 0 ? `SGST: ${formatInr(sgst)}` : "",
    hasGstBreakup && Number(igst) > 0 ? `IGST: ${formatInr(igst)}` : "",
    !hasGstBreakup && Number(tax) > 0 && taxLabel ? `${taxLabel}: ${formatInr(tax)}` : "",
    `*Grand Total ${formatInr(total)}*`,
    WA_RULE,
    payLabel ? `${dateLabel ? `${dateLabel}  ` : ""}${payLabel}  ${isCredit ? formatInr(0) : formatInr(total)}` : "",
    isCredit ? "_Amount added to customer khata_" : "",
    WA_RULE,
  ].filter(Boolean);

  return [
    ...header,
    ...(itemLines.length ? ["Item  Qty  Price  Amount", ...itemLines, ""] : []),
    ...totals,
    "*Thank You & Visit Again..!*",
  ].join("\n");
}

/** Active lots that share name or barcode with the item, FEFO-sorted (earliest expiry first). */
export function fefoLotsForItem(item, items = [], { today = "" } = {}) {
  if (!item) return [];
  const name = String(item.name || "").trim().toLowerCase();
  const barcode = String(item.barcode || "").trim().toLowerCase();
  const asOf = String(today || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const lots = (items || []).filter(row => {
    if (!row || row.isActive === false || row.itemType === "service") return false;
    if (row.id === item.id) return true;
    const rowName = String(row.name || "").trim().toLowerCase();
    const rowBarcode = String(row.barcode || "").trim().toLowerCase();
    if (barcode && rowBarcode && barcode === rowBarcode) return true;
    if (name && rowName && name === rowName) return true;
    return false;
  });
  return lots.slice().sort((a, b) => {
    const ae = String(a.expiryDate || "").slice(0, 10);
    const be = String(b.expiryDate || "").slice(0, 10);
    if (ae && be && ae !== be) return ae.localeCompare(be);
    if (ae && !be) return -1;
    if (!ae && be) return 1;
    return String(a.sku || "").localeCompare(String(b.sku || ""));
  }).filter(row => {
    const expiry = String(row.expiryDate || "").slice(0, 10);
    return !expiry || expiry >= asOf;
  });
}
