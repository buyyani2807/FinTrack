import { prepareGstAmount, roundMoney, gstDocumentLine, saleLines, purchaseLines, creditNoteLines, debitNoteLines, assertVoucherDateNotFuture, addDaysIso, assertMoneyModeSplit } from "./accountingModel.js";

export const ITEMIZED_KINDS = {
  sale: { voucherType: "sales", partyLabel: "customer", returnKind: false },
  purchase: { voucherType: "purchase", partyLabel: "supplier", returnKind: false },
  credit_note: { voucherType: "credit_note", partyLabel: "customer", returnKind: true },
  debit_note: { voucherType: "debit_note", partyLabel: "supplier", returnKind: true },
};

export const supportsItemLines = kind => Boolean(ITEMIZED_KINDS[kind]);

/** Sales/purchases default to line items; credit/debit notes default to a single amount (price adjustments). */
export function usesItemLines(kind, form = {}) {
  const config = ITEMIZED_KINDS[kind];
  if (!config) return false;
  return config.returnKind ? form.noteEntryMode === "items" : form.entryMode !== "amount";
}

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
  openingRate: "",
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
  discount: "",
  gstRate: "18",
  hsnSac: "",
  rateTouched: false,
});

/** Discount input is a rupee amount ("50") or a percent of quantity x rate ("10%"). */
export function parseLineDiscount(input, grossAmount) {
  const text = String(input ?? "").trim();
  if (!text) return 0;
  const gross = Number(grossAmount || 0);
  if (text.endsWith("%")) {
    const percent = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(percent)) return Number.NaN;
    return roundMoney((gross * percent) / 100);
  }
  const value = Number(text);
  return Number.isFinite(value) ? roundMoney(value) : Number.NaN;
}

export function validateItemForm(form = {}) {
  if (!String(form.name || "").trim()) return "Item name is required.";
  if (!String(form.sku || "").trim()) return "Item code / SKU is required.";
  if (!ITEM_TYPES.some(type => type.id === form.itemType)) return "Choose product or service.";
  if (!ITEM_UNITS.includes(form.unit) && !String(form.unit || "").trim()) return "Unit is required.";
  if (Number(form.sellingPrice || 0) < 0 || Number(form.purchasePrice || 0) < 0) return "Prices cannot be negative.";
  if (Number(form.gstRate || 0) < 0 || Number(form.gstRate || 0) > 100) return "GST rate must be between 0 and 100.";
  if (form.itemType === "product" && Number(form.openingStock || 0) < 0) return "Opening stock cannot be negative.";
  if (form.itemType === "product" && String(form.openingRate ?? "").trim() !== "" && !(Number(form.openingRate) >= 0)) {
    return "Opening rate must be zero or more.";
  }
  return "";
}

export function normalizeItemLine(line = {}) {
  const quantity = Number(line.quantity || 0);
  const rate = Number(line.rate || 0);
  const amount = roundMoney(quantity * rate);
  const discountAmount = line.discountAmount != null && line.discount == null
    ? roundMoney(Number(line.discountAmount || 0))
    : parseLineDiscount(line.discount, amount);
  return {
    itemId: line.itemId || null,
    itemName: String(line.itemName || "").trim(),
    itemSku: String(line.itemSku || "").trim(),
    itemType: line.itemType === "service" ? "service" : "product",
    unit: String(line.unit || "Nos").trim() || "Nos",
    quantity,
    rate,
    amount,
    discountAmount,
    netAmount: Number.isFinite(discountAmount) ? roundMoney(amount - discountAmount) : amount,
    gstRate: Number(line.gstRate || 0),
    hsnSac: String(line.hsnSac || "").trim(),
    sourceDocumentLineId: line.sourceDocumentLineId || null,
  };
}

export function mapVoucherItemLinesForRpc(lines = []) {
  return (lines || []).map(line => ({
    item_id: line.itemId || line.item_id || null,
    item_name: line.itemName || line.item_name || line.name || "",
    item_sku: line.itemSku || line.item_sku || line.sku || "",
    item_type: line.itemType || line.item_type || "product",
    unit: line.unit || "Nos",
    quantity: Number(line.quantity || 0),
    rate: Number(line.rate || 0),
    amount: Number(line.amount || line.taxableAmount || line.taxable_amount || 0),
    discount_amount: Number(line.discountAmount ?? line.discount_amount ?? 0),
    gst_rate: Number(line.gstRate ?? line.gst_rate ?? 0),
    hsn_sac: line.hsnSac || line.hsn_sac || "",
    taxable_amount: Number(line.taxableAmount ?? line.taxable_amount ?? line.amount ?? 0),
    cgst_amount: Number(line.cgstAmount ?? line.cgst_amount ?? 0),
    sgst_amount: Number(line.sgstAmount ?? line.sgst_amount ?? 0),
    igst_amount: Number(line.igstAmount ?? line.igst_amount ?? 0),
    ...(line.sourceDocumentLineId ? { source_document_line_id: line.sourceDocumentLineId } : {}),
  })).filter(line => String(line.item_name || "").trim() || line.item_id);
}

export function validateItemLines(lines = []) {
  if (!lines.length) return "Add at least one item.";
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeItemLine(lines[index]);
    if (!line.itemId && !line.itemName) return `Choose an item on line ${index + 1}.`;
    if (!(line.quantity > 0)) return `Quantity must be greater than zero on line ${index + 1}.`;
    if (line.rate < 0) return `Rate cannot be negative on line ${index + 1}.`;
    if (!Number.isFinite(line.discountAmount)) return `Enter the discount as an amount or a percent (e.g. 10%) on line ${index + 1}.`;
    if (line.discountAmount < 0) return `Discount cannot be negative on line ${index + 1}.`;
    if (line.discountAmount > line.amount) return `Discount cannot be more than the line amount on line ${index + 1}.`;
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
    const prepared = prepareGstAmount(line.netAmount, {
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
  moneyParts = null,
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
  const config = ITEMIZED_KINDS[kind];
  if (!config) throw new Error("Itemized entry supports sale, purchase, credit note and debit note only");
  const lineError = validateItemLines(itemLines);
  if (lineError) throw new Error(lineError);
  if ((config.returnKind || settlement === "credit") && !partyId) {
    throw new Error(`Choose the ${config.partyLabel}`);
  }
  const aggregate = aggregateItemizedGst(itemLines, { intra, taxInclusive: gstEnabled ? taxInclusive : false });
  if (!(aggregate.taxable > 0)) throw new Error("Enter an amount greater than zero");
  const description = String(narration || "").trim();
  const invoiceDue = !config.returnKind && settlement === "credit" ? (dueDate || addDaysIso(date, 7)) : null;
  const gstForLines = gstEnabled
    ? { enabled: true, rate: 0, intra, taxInclusive: false, preparedOverride: aggregate.prepared }
    : undefined;
  // Pass taxable as amount with preparedOverride so COA matches summed item GST.
  const amount = aggregate.taxable;
  let lines;
  if (kind === "credit_note") {
    lines = creditNoteLines({ accounts, amount, partyId, description, gst: gstForLines });
  } else if (kind === "debit_note") {
    lines = debitNoteLines({ accounts, amount, partyId, description, gst: gstForLines });
  } else {
    const totalForMoney = gstEnabled ? roundMoney(aggregate.prepared?.total ?? aggregate.total) : aggregate.taxable;
    const split = moneyParts ? assertMoneyModeSplit(moneyMode, totalForMoney, moneyParts) : null;
    const buildLines = kind === "sale" ? saleLines : purchaseLines;
    lines = buildLines({ accounts, amount, settlement, moneyMode, moneyParts: split, partyId, description, gst: gstForLines });
  }

  return {
    voucherType: config.voucherType,
    date,
    narration: description || (kind === "credit_note" ? "Sales return" : kind === "debit_note" ? "Purchase return" : ""),
    partyId: partyId || null,
    dueDate: invoiceDue,
    lines,
    gstLines: gstEnabled ? aggregate.gstLines : [],
    itemLines: aggregate.lines.map(line => ({
      itemId: line.itemId,
      itemName: line.itemName,
      itemSku: line.itemSku,
      itemType: line.itemType,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.rate,
      amount: line.amount,
      discountAmount: line.discountAmount,
      gstRate: line.gstRate,
      hsnSac: line.hsnSac,
      taxableAmount: line.taxableAmount,
      cgstAmount: line.cgstAmount,
      sgstAmount: line.sgstAmount,
      igstAmount: line.igstAmount,
      sourceDocumentLineId: line.sourceDocumentLineId,
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

function itemMovementValueReport(voucherItemLines, vouchers, { from, to }, forwardType, returnType) {
  const byVoucher = Object.fromEntries((vouchers || []).map(v => [v.id, v]));
  const map = new Map();
  for (const line of voucherItemLines || []) {
    const voucher = byVoucher[line.voucherId];
    if (!voucher || voucher.status !== "posted") continue;
    const sign = voucher.voucherType === forwardType ? 1 : voucher.voucherType === returnType ? -1 : 0;
    if (!sign) continue;
    if (from && voucher.date < from) continue;
    if (to && voucher.date > to) continue;
    const key = line.itemId || line.itemSku || line.itemName;
    if (!map.has(key)) map.set(key, { itemId: line.itemId, name: line.itemName, sku: line.itemSku, quantity: 0, amount: 0, returnedQuantity: 0 });
    const row = map.get(key);
    const quantity = Number(line.quantity || 0);
    row.quantity = roundMoney(row.quantity + sign * quantity);
    row.amount = roundMoney(row.amount + sign * Number(line.taxableAmount ?? line.amount ?? 0));
    if (sign < 0) row.returnedQuantity = roundMoney(row.returnedQuantity + quantity);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** Net of sales returns (credit notes with item lines). */
export function itemSalesReport(voucherItemLines = [], vouchers = [], { from, to } = {}) {
  return itemMovementValueReport(voucherItemLines, vouchers, { from, to }, "sales", "credit_note");
}

/** Net of purchase returns (debit notes with item lines). */
export function itemPurchasesReport(voucherItemLines = [], vouchers = [], { from, to } = {}) {
  return itemMovementValueReport(voucherItemLines, vouchers, { from, to }, "purchase", "debit_note");
}

const STOCK_REASON_LABELS = {
  opening: "Opening",
  purchase: "Purchase",
  sale: "Sale",
  sales_return: "Sales return",
  purchase_return: "Purchase return",
  adjustment: "Adjustment",
  reversal: "Reversal",
  delivery: "Delivery challan",
  goods_receipt: "Goods receipt",
};

export const stockReasonLabel = reason => STOCK_REASON_LABELS[reason] || String(reason || "").replaceAll("_", " ") || "—";

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
