/** Counter offline billing helpers — Phase 1 (paid till queue, 48h window). */
import { formatInr } from "../../../lib/formatMoney.js";
import { roundMoney } from "./accountingModel.js";
import { counterPayLabel } from "./counterDayReport.js";

export const OFFLINE_MAX_MS = 48 * 60 * 60 * 1000;
export const OFFLINE_MAX_LABEL = "2 days";

export function isBrowserOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function isLikelyNetworkError(err) {
  if (!isBrowserOnline()) return true;
  const name = String(err?.name || "");
  const msg = String(err?.message || err || "").toLowerCase();
  return name === "TypeError"
    || /failed to fetch|networkerror|network request failed|load failed|offline|timeout|temporarily unavailable/i.test(msg);
}

export function nextOfflineReference(dateIso, existingRefs = []) {
  const day = String(dateIso || "").slice(0, 10).replace(/-/g, "");
  const prefix = `OFF-${day}-`;
  let max = 0;
  for (const ref of existingRefs) {
    const text = String(ref || "");
    if (!text.startsWith(prefix)) continue;
    const n = Number(text.slice(prefix.length));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function pendingOfflineBills(bills = []) {
  return (bills || []).filter(bill => bill && (bill.syncStatus === "pending" || bill.syncStatus === "error" || bill.syncStatus === "syncing"));
}

/** Block new offline charges when any pending bill is older than 48 hours. */
export function offlineChargeBlocked(bills = [], now = Date.now()) {
  const pending = pendingOfflineBills(bills).filter(bill => bill.syncStatus !== "synced");
  if (!pending.length) return { blocked: false, reason: "" };
  const oldest = Math.min(...pending.map(bill => Date.parse(bill.createdAt) || now));
  if (Number.isFinite(oldest) && now - oldest > OFFLINE_MAX_MS) {
    return {
      blocked: true,
      reason: `Offline bills are older than ${OFFLINE_MAX_LABEL}. Connect to the internet and sync before charging more.`,
    };
  }
  return { blocked: false, reason: "" };
}

export function buildOfflineReceiptInvoice({
  bill,
  companyName = "MyFinTracker",
  companyAddress = "",
  companyGstin = "",
  companyPhone = "",
} = {}) {
  if (!bill) return null;
  const rawLines = bill.payload?.itemLines || bill.itemLines || [];
  const itemLines = rawLines.map(line => ({
    name: line.itemName || line.name || "Item",
    sku: line.itemSku || line.sku || "",
    quantity: Number(line.quantity || 0),
    unit: line.unit || "",
    rate: Number(line.rate || 0),
    discount: Number(line.discountAmount || 0),
    amount: Number(line.taxableAmount ?? line.amount ?? 0),
    gstRate: Number(line.gstRate || 0),
    hsnSac: line.hsnSac || "",
  }));
  const taxable = roundMoney(
    Number(bill.payload?.totals?.taxable)
    || itemLines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );
  const cgst = roundMoney(rawLines.reduce((sum, line) => sum + Number(line.cgstAmount || 0), 0));
  const sgst = roundMoney(rawLines.reduce((sum, line) => sum + Number(line.sgstAmount || 0), 0));
  const igst = roundMoney(rawLines.reduce((sum, line) => sum + Number(line.igstAmount || 0), 0));
  const tax = roundMoney(Number(bill.payload?.totals?.tax) || cgst + sgst + igst);
  const amount = roundMoney(Number(bill.amount || bill.payload?.totals?.total || taxable + tax));
  const customerName = bill.customerName || bill.payload?.customerName || "Cash customer";
  const customerPhone = bill.customerPhone || bill.payload?.customerPhone || "";
  return {
    kind: "sales_invoice",
    title: tax > 0 && companyGstin ? "TAX INVOICE" : "BILL",
    invoiceNumber: bill.offlineRef || bill.id,
    invoiceDate: bill.date || "",
    soldAt: bill.createdAt || "",
    showSaleTime: true,
    dueDate: "",
    settlement: counterPayLabel(bill.moneyMode),
    customerName,
    customerPhone,
    customerGstin: "",
    customerAddress: "",
    cashier: bill.cashierName || "",
    tillLabel: bill.tillLabel || "",
    narration: [
      bill.payload?.narration || "",
      bill.syncStatus === "pending" ? "Offline bill · pending sync" : "",
    ].filter(Boolean).join(" · "),
    amount,
    taxable,
    cgst,
    sgst,
    igst,
    tax,
    outstanding: 0,
    itemLines,
    companyName,
    companyLegalName: "",
    companyAddress,
    companyGstin,
    companyPhone,
    companyEmail: "",
    receiptFooter: bill.syncStatus === "synced"
      ? "Thank You & Visit Again..!"
      : "Thank You & Visit Again..! Offline — final bill no. after sync.",
    receiptTerms: "",
    documentTemplate: "thermal",
    autoPrint: true,
    posSlip: true,
    money: formatInr,
  };
}
