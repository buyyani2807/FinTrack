import { formatInr } from "../../../lib/formatMoney.js";
import { roundMoney } from "./accountingModel.js";
import { quantityInBaseUnit } from "./inventoryModel.js";

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
  return {
    taxable,
    tax,
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

/** Plain-text Counter receipt for WhatsApp (wa.me). */
export function buildCounterWhatsAppReceipt({
  companyName = "",
  tillLabel = "",
  isReturn = false,
  isCredit = false,
  payLabel = "",
  customerName = "",
  lines = [],
  taxable = 0,
  tax = 0,
  taxLabel = "",
  total = 0,
  date = "",
} = {}) {
  const title = isReturn ? "Return receipt" : isCredit ? "Khata bill" : "Sale receipt";
  const header = [
    `*${String(companyName || "Store").trim()}*`,
    title,
    tillLabel ? `Till: ${tillLabel}` : "",
    date ? `Date: ${date}` : "",
    customerName ? `Customer: ${customerName}` : "",
    payLabel ? `Payment: ${payLabel}` : "",
  ].filter(Boolean);

  const itemLines = (lines || [])
    .filter(line => line?.itemId || String(line?.itemName || "").trim())
    .map(line => {
      const name = String(line.itemName || "Item").trim();
      const unit = line.sellUnit || line.unit || "";
      const qty = `${line.quantity || 0}${unit ? ` ${unit}` : ""}`;
      return `• ${name} × ${qty} = ${formatInr(counterLineNet(line))}`;
    });

  const totals = [
    taxable ? `Taxable: ${formatInr(taxable)}` : "",
    tax && taxLabel ? `${taxLabel}: ${formatInr(tax)}` : "",
    `*Total: ${formatInr(total)}*`,
  ].filter(Boolean);

  return [
    ...header,
    "",
    ...(itemLines.length ? ["Items", ...itemLines, ""] : []),
    ...totals,
    "",
    "Thank you.",
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
