import { roundMoney } from "./accountingModel.js";

const roundQty = value => Math.round((Number(value) || 0) * 1000) / 1000;
const QTY = 0.0005;
const sameQty = (left, right) => Math.abs(roundQty(left) - roundQty(right)) <= QTY;

/**
 * Three-way match for purchase orders: ordered vs received (GRN) vs billed (posted purchase).
 * Uses source-line links only. Does not post or change documents.
 */
export function purchaseMatchReport({
  documents = [],
  voucherItemLines = [],
  vouchers = [],
  parties = [],
} = {}) {
  const partyName = Object.fromEntries((parties || []).map(party => [party.id, party.name]));
  const docsById = new Map((documents || []).map(doc => [doc.id, doc]));
  const linesById = new Map();
  for (const doc of documents || []) {
    for (const line of doc.lines || []) linesById.set(line.id, { ...line, docType: doc.docType, documentId: doc.id, partyId: doc.partyId });
  }

  const postedPurchases = new Set(
    (vouchers || [])
      .filter(voucher => voucher.status === "posted" && (!voucher.voucherType || voucher.voucherType === "purchase"))
      .map(voucher => voucher.id),
  );

  const resolvePoLineId = lineId => {
    let current = linesById.get(lineId);
    let guard = 0;
    while (current && guard < 6) {
      if (current.docType === "purchase_order") return current.id;
      const sourceId = current.sourceLineId || current.sourceDocumentLineId;
      if (!sourceId) return null;
      current = linesById.get(sourceId);
      guard += 1;
    }
    return null;
  };

  const buckets = new Map();
  const bucketFor = poLineId => {
    if (!buckets.has(poLineId)) {
      const line = linesById.get(poLineId);
      const doc = line ? docsById.get(line.documentId) : null;
      buckets.set(poLineId, {
        poLineId,
        documentId: doc?.id || "",
        docNumber: doc?.docNumber || "",
        docDate: doc?.docDate || "",
        partyId: doc?.partyId || "",
        partyName: partyName[doc?.partyId] || "",
        itemId: line?.itemId || null,
        itemName: line?.itemName || "",
        unit: line?.unit || "",
        ordered: roundQty(line?.quantity || 0),
        orderRate: roundMoney(line?.rate || 0),
        received: 0,
        billed: 0,
        billedAmount: 0,
        receiptRefs: [],
        billRefs: [],
      });
    }
    return buckets.get(poLineId);
  };

  for (const doc of documents || []) {
    if (doc.docType !== "goods_receipt" || doc.status === "cancelled") continue;
    for (const line of doc.lines || []) {
      const poLineId = resolvePoLineId(line.id) || (line.sourceLineId && linesById.get(line.sourceLineId)?.docType === "purchase_order" ? line.sourceLineId : null);
      if (!poLineId || !linesById.get(poLineId) || linesById.get(poLineId).docType !== "purchase_order") continue;
      const row = bucketFor(poLineId);
      row.received = roundQty(row.received + Number(line.quantity || 0));
      if (doc.docNumber && !row.receiptRefs.includes(doc.docNumber)) row.receiptRefs.push(doc.docNumber);
    }
  }

  for (const line of voucherItemLines || []) {
    if (!postedPurchases.has(line.voucherId) || !line.sourceDocumentLineId) continue;
    const poLineId = resolvePoLineId(line.sourceDocumentLineId);
    if (!poLineId) continue;
    const row = bucketFor(poLineId);
    const qty = Number(line.quantity || 0);
    row.billed = roundQty(row.billed + qty);
    row.billedAmount = roundMoney(row.billedAmount + Number(line.taxableAmount ?? (qty * Number(line.rate || 0))));
    const voucher = (vouchers || []).find(item => item.id === line.voucherId);
    if (voucher?.voucherNumber && !row.billRefs.includes(voucher.voucherNumber)) row.billRefs.push(voucher.voucherNumber);
  }

  const orders = (documents || [])
    .filter(doc => doc.docType === "purchase_order" && doc.status !== "cancelled")
    .map(doc => {
      const lines = (doc.lines || []).map(line => {
        const row = buckets.get(line.id) || {
          poLineId: line.id,
          documentId: doc.id,
          docNumber: doc.docNumber,
          docDate: doc.docDate,
          partyId: doc.partyId,
          partyName: partyName[doc.partyId] || "",
          itemId: line.itemId || null,
          itemName: line.itemName,
          unit: line.unit,
          ordered: roundQty(line.quantity || 0),
          orderRate: roundMoney(line.rate || 0),
          received: 0,
          billed: 0,
          billedAmount: 0,
          receiptRefs: [],
          billRefs: [],
        };
        const billedRate = row.billed > 0 ? roundMoney(row.billedAmount / row.billed) : null;
        const warnings = [];
        if (row.received > row.ordered + QTY) warnings.push({ code: "over_received", message: "Received more than ordered." });
        if (row.billed > row.received + QTY) warnings.push({ code: "billed_over_received", message: "Billed more than received." });
        if (row.billed > row.ordered + QTY) warnings.push({ code: "billed_over_ordered", message: "Billed more than ordered." });
        if (billedRate != null && row.orderRate > 0 && billedRate > row.orderRate + 0.049) {
          warnings.push({ code: "rate_over_order", message: `Bill rate ${billedRate} is above order rate ${row.orderRate}.` });
        }
        if (row.received > QTY && row.billed + QTY < row.received) {
          warnings.push({ code: "unbilled_receipt", message: "Received quantity is not fully billed." });
        }
        const matched = warnings.length === 0 && (
          (sameQty(row.ordered, row.received) && sameQty(row.received, row.billed))
          || (row.ordered > 0 && row.received === 0 && row.billed === 0)
        );
        const open = row.received === 0 && row.billed === 0;
        return {
          ...row,
          billedRate,
          pendingReceive: roundQty(Math.max(0, row.ordered - row.received)),
          pendingBill: roundQty(Math.max(0, row.received - row.billed)),
          warnings,
          status: open ? "open" : warnings.length ? "review" : matched || sameQty(row.received, row.billed) ? "matched" : "review",
        };
      });
      const reviewLines = lines.filter(line => line.status === "review");
      const openLines = lines.filter(line => line.status === "open");
      const status = reviewLines.length ? "review" : openLines.length === lines.length ? "open" : "matched";
      return {
        documentId: doc.id,
        docNumber: doc.docNumber,
        docDate: doc.docDate,
        partyId: doc.partyId,
        partyName: partyName[doc.partyId] || "",
        status,
        ordered: roundQty(lines.reduce((sum, line) => sum + line.ordered, 0)),
        received: roundQty(lines.reduce((sum, line) => sum + line.received, 0)),
        billed: roundQty(lines.reduce((sum, line) => sum + line.billed, 0)),
        lines,
        warnings: reviewLines.flatMap(line => line.warnings.map(warning => `${line.itemName}: ${warning.message}`)),
      };
    })
    .sort((a, b) => String(b.docDate).localeCompare(String(a.docDate)) || String(b.docNumber).localeCompare(String(a.docNumber)));

  return {
    orders,
    totals: {
      orders: orders.length,
      review: orders.filter(row => row.status === "review").length,
      matched: orders.filter(row => row.status === "matched").length,
      open: orders.filter(row => row.status === "open").length,
    },
  };
}

export function filterPurchaseMatch(orders = [], { search = "", status = "all" } = {}) {
  const needle = String(search || "").trim().toLowerCase();
  return (orders || []).filter(row => {
    if (status !== "all" && row.status !== status) return false;
    if (!needle) return true;
    return [row.docNumber, row.partyName, ...(row.lines || []).map(line => line.itemName)]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}
