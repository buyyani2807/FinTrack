import { prepareGstAmount, roundMoney, gstDocumentLine, saleLines, purchaseLines, assertVoucherDateNotFuture, addDaysIso } from "./accountingModel.js";

export const ITEM_UNITS = [
  "Nos", "Kg", "Gram", "Litre", "Meter", "Box", "Pack", "Bag", "Piece", "Set", "Hour", "Day",
];

export const ITEM_TYPES = [
  { id: "product", label: "Product" },
  { id: "service", label: "Service" },
];

export const emptyItemForm = () => ({
  id: null,
  itemType: "product",
  name: "",
  sku: "",
  categoryId: "",
  unit: "Nos",
  description: "",
  sellingPrice: "",
  purchasePrice: "",
  gstRate: "18",
  hsnSac: "",
  openingStock: "0",
  openingStockDate: "",
  reorderLevel: "0",
  isActive: true,
});

export const emptyItemLine = () => ({
  itemId: "",
  itemName: "",
  itemSku: "",
  itemType: "product",
  unit: "Nos",
  quantity: "1",
  rate: "",
  gstRate: "18",
  hsnSac: "",
  rateTouched: false,
});

export function validateItemForm(form = {}) {
  if (!String(form.name || "").trim()) return "Item name is required.";
  if (!String(form.sku || "").trim()) return "Item code / SKU is required.";
  if (!ITEM_TYPES.some(type => type.id === form.itemType)) return "Choose product or service.";
  if (!ITEM_UNITS.includes(form.unit) && !String(form.unit || "").trim()) return "Unit is required.";
  if (Number(form.sellingPrice || 0) < 0 || Number(form.purchasePrice || 0) < 0) return "Prices cannot be negative.";
  if (Number(form.gstRate || 0) < 0 || Number(form.gstRate || 0) > 100) return "GST rate must be between 0 and 100.";
  if (form.itemType === "product" && Number(form.openingStock || 0) < 0) return "Opening stock cannot be negative.";
  return "";
}

export function normalizeItemLine(line = {}) {
  const quantity = Number(line.quantity || 0);
  const rate = Number(line.rate || 0);
  const amount = roundMoney(quantity * rate);
  return {
    itemId: line.itemId || null,
    itemName: String(line.itemName || "").trim(),
    itemSku: String(line.itemSku || "").trim(),
    itemType: line.itemType === "service" ? "service" : "product",
    unit: String(line.unit || "Nos").trim() || "Nos",
    quantity,
    rate,
    amount,
    gstRate: Number(line.gstRate || 0),
    hsnSac: String(line.hsnSac || "").trim(),
  };
}

export function validateItemLines(lines = []) {
  if (!lines.length) return "Add at least one item.";
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeItemLine(lines[index]);
    if (!line.itemId && !line.itemName) return `Choose an item on line ${index + 1}.`;
    if (!(line.quantity > 0)) return `Quantity must be greater than zero on line ${index + 1}.`;
    if (line.rate < 0) return `Rate cannot be negative on line ${index + 1}.`;
    if (line.itemId) {
      if (seen.has(line.itemId)) return "Duplicate items in the same voucher are not allowed.";
      seen.add(line.itemId);
    }
  }
  return "";
}

export function aggregateItemizedGst(lines = [], { intra = true, taxInclusive = false } = {}) {
  const gstLines = [];
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const enriched = [];
  lines.forEach((raw, index) => {
    const line = normalizeItemLine(raw);
    const prepared = prepareGstAmount(line.amount, {
      enabled: line.gstRate > 0,
      rate: line.gstRate,
      intra,
      taxInclusive,
      hsnSac: line.hsnSac,
      itcEligible: true,
    });
    taxable = roundMoney(taxable + prepared.taxable);
    cgst = roundMoney(cgst + prepared.cgst);
    sgst = roundMoney(sgst + prepared.sgst);
    igst = roundMoney(igst + prepared.igst);
    const doc = gstDocumentLine(prepared, line.itemName);
    if (doc) gstLines.push({ ...doc, line_no: gstLines.length + 1 });
    enriched.push({
      ...line,
      taxableAmount: prepared.taxable,
      cgstAmount: prepared.cgst,
      sgstAmount: prepared.sgst,
      igstAmount: prepared.igst,
      lineNo: index + 1,
    });
  });
  return {
    lines: enriched,
    taxable,
    cgst,
    sgst,
    igst,
    tax: roundMoney(cgst + sgst + igst),
    total: roundMoney(taxable + cgst + sgst + igst),
    gstLines,
    prepared: {
      taxable,
      cgst,
      sgst,
      igst,
      total: roundMoney(taxable + cgst + sgst + igst),
      rate: 0,
      supplyType: igst > 0 ? "inter" : cgst > 0 || sgst > 0 ? "intra" : "none",
      hsnSac: "",
      itcEligible: true,
    },
  };
}

export function itemizedEntryDraft({
  kind,
  accounts,
  date,
  partyId = null,
  moneyMode = "cash",
  settlement = "credit",
  dueDate = null,
  narration = "",
  today,
  itemLines = [],
  intra = true,
  taxInclusive = false,
  gstEnabled = false,
} = {}) {
  assertVoucherDateNotFuture(date, today);
  if (kind !== "sale" && kind !== "purchase") throw new Error("Itemized entry supports sale and purchase only");
  const lineError = validateItemLines(itemLines);
  if (lineError) throw new Error(lineError);
  if (settlement === "credit" && !partyId) {
    throw new Error(kind === "sale" ? "Choose the customer" : "Choose the supplier");
  }
  const aggregate = aggregateItemizedGst(itemLines, { intra, taxInclusive: gstEnabled ? taxInclusive : false });
  if (!(aggregate.taxable > 0)) throw new Error("Enter an amount greater than zero");
  const description = String(narration || "").trim();
  const invoiceDue = settlement === "credit" ? (dueDate || addDaysIso(date, 7)) : null;
  const gstForLines = gstEnabled
    ? { enabled: true, rate: 0, intra, taxInclusive: false, preparedOverride: aggregate.prepared }
    : undefined;
  // Pass taxable as amount with preparedOverride so COA matches summed item GST.
  const amount = aggregate.taxable;
  const lines = kind === "sale"
    ? saleLines({ accounts, amount, settlement, moneyMode, partyId, description, gst: gstForLines })
    : purchaseLines({ accounts, amount, settlement, moneyMode, partyId, description, gst: gstForLines });

  return {
    voucherType: kind === "sale" ? "sales" : "purchase",
    date,
    narration: description,
    partyId: partyId || null,
    dueDate: invoiceDue,
    lines,
    gstLines: gstEnabled ? aggregate.gstLines : [],
    itemLines: aggregate.lines.map(line => ({
      item_id: line.itemId,
      item_name: line.itemName,
      item_sku: line.itemSku,
      item_type: line.itemType,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.rate,
      amount: line.amount,
      gst_rate: line.gstRate,
      hsn_sac: line.hsnSac,
      taxable_amount: line.taxableAmount,
      cgst_amount: line.cgstAmount,
      sgst_amount: line.sgstAmount,
      igst_amount: line.igstAmount,
    })),
    totals: {
      taxable: aggregate.taxable,
      tax: aggregate.tax,
      total: aggregate.total,
    },
  };
}

/** Deterministic stock: opening movement(s) + all later deltas. */
export function currentStockForItem(item, movements = []) {
  if (!item || item.itemType === "service") return null;
  const rows = (movements || []).filter(row => row.itemId === item.id);
  if (rows.length) {
    return roundMoney(rows.reduce((sum, row) => sum + Number(row.quantityDelta || 0), 0));
  }
  return roundMoney(Number(item.openingStock || 0));
}

export function stockStatus(current, reorderLevel) {
  if (current == null) return "service";
  if (Number(reorderLevel || 0) > 0 && Number(current) < Number(reorderLevel)) return "low";
  return "normal";
}

export function itemSalesReport(voucherItemLines = [], vouchers = [], { from, to } = {}) {
  const byVoucher = Object.fromEntries((vouchers || []).map(v => [v.id, v]));
  const map = new Map();
  for (const line of voucherItemLines || []) {
    const voucher = byVoucher[line.voucherId];
    if (!voucher || voucher.voucherType !== "sales" || voucher.status === "cancelled") continue;
    if (from && voucher.date < from) continue;
    if (to && voucher.date > to) continue;
    const key = line.itemId || line.itemSku || line.itemName;
    if (!map.has(key)) map.set(key, { itemId: line.itemId, name: line.itemName, sku: line.itemSku, quantity: 0, amount: 0 });
    const row = map.get(key);
    row.quantity = roundMoney(row.quantity + Number(line.quantity || 0));
    row.amount = roundMoney(row.amount + Number(line.taxableAmount ?? line.amount ?? 0));
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function itemPurchasesReport(voucherItemLines = [], vouchers = [], { from, to } = {}) {
  const byVoucher = Object.fromEntries((vouchers || []).map(v => [v.id, v]));
  const map = new Map();
  for (const line of voucherItemLines || []) {
    const voucher = byVoucher[line.voucherId];
    if (!voucher || voucher.voucherType !== "purchase" || voucher.status === "cancelled") continue;
    if (from && voucher.date < from) continue;
    if (to && voucher.date > to) continue;
    const key = line.itemId || line.itemSku || line.itemName;
    if (!map.has(key)) map.set(key, { itemId: line.itemId, name: line.itemName, sku: line.itemSku, quantity: 0, amount: 0 });
    const row = map.get(key);
    row.quantity = roundMoney(row.quantity + Number(line.quantity || 0));
    row.amount = roundMoney(row.amount + Number(line.taxableAmount ?? line.amount ?? 0));
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function stockMovementReport(movements = [], items = [], { from, to, itemId } = {}) {
  const byItem = Object.fromEntries((items || []).map(item => [item.id, item]));
  return (movements || [])
    .filter(row => {
      if (itemId && row.itemId !== itemId) return false;
      if (from && row.movementDate < from) return false;
      if (to && row.movementDate > to) return false;
      return true;
    })
    .map(row => ({
      ...row,
      itemName: byItem[row.itemId]?.name || row.itemId,
      itemSku: byItem[row.itemId]?.sku || "",
      unit: byItem[row.itemId]?.unit || "",
      direction: Number(row.quantityDelta) >= 0 ? "In" : "Out",
    }))
    .sort((a, b) => `${b.movementDate}${b.createdAt || ""}`.localeCompare(`${a.movementDate}${a.createdAt || ""}`));
}
