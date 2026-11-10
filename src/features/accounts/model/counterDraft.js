/** Persist the open Counter bill on this device (per company + till) so refresh keeps the cart. */

import { CASH_PARTY_ID } from "./accountingModel.js";

const draftKey = (companyId, tillId) => (
  `fintrack-accounts-counter-draft-v1:${companyId || "none"}:${tillId || "till-1"}`
);

export function emptyCounterDraft() {
  return {
    lines: [],
    partyId: CASH_PARTY_ID,
    moneyMode: "cash",
    settlement: "paid",
    tillMode: "sale",
    billDiscount: "",
    receivedCash: "",
    receivedUpi: "",
    tenderedCash: "",
    paymentRef: "",
    walkInName: "",
    walkInPhone: "",
  };
}

export function readCounterDraft(companyId, tillId = "till-1") {
  if (!companyId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(companyId, tillId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.lines) || !parsed.lines.length) return null;
    const lines = parsed.lines.filter(line => line && line.itemId).slice(0, 80);
    if (!lines.length) return null;
    return {
      ...emptyCounterDraft(),
      lines,
      partyId: parsed.partyId || CASH_PARTY_ID,
      moneyMode: parsed.moneyMode || "cash",
      settlement: parsed.settlement === "credit" ? "credit" : "paid",
      tillMode: parsed.tillMode === "return" ? "return" : "sale",
      billDiscount: parsed.billDiscount == null ? "" : String(parsed.billDiscount),
      receivedCash: parsed.receivedCash == null ? "" : String(parsed.receivedCash),
      receivedUpi: parsed.receivedUpi == null ? "" : String(parsed.receivedUpi),
      tenderedCash: parsed.tenderedCash == null ? "" : String(parsed.tenderedCash),
      paymentRef: parsed.paymentRef == null ? "" : String(parsed.paymentRef),
      walkInName: parsed.walkInName == null ? "" : String(parsed.walkInName),
      walkInPhone: parsed.walkInPhone == null ? "" : String(parsed.walkInPhone),
    };
  } catch {
    return null;
  }
}

export function saveCounterDraft(companyId, tillId = "till-1", draft = null) {
  if (!companyId || typeof localStorage === "undefined") return null;
  try {
    const lines = Array.isArray(draft?.lines)
      ? draft.lines.filter(line => line && line.itemId).slice(0, 80)
      : [];
    if (!lines.length) {
      localStorage.removeItem(draftKey(companyId, tillId));
      return null;
    }
    const payload = {
      lines,
      partyId: draft.partyId || CASH_PARTY_ID,
      moneyMode: draft.moneyMode || "cash",
      settlement: draft.settlement === "credit" ? "credit" : "paid",
      tillMode: draft.tillMode === "return" ? "return" : "sale",
      billDiscount: draft.billDiscount == null ? "" : String(draft.billDiscount),
      receivedCash: draft.receivedCash == null ? "" : String(draft.receivedCash),
      receivedUpi: draft.receivedUpi == null ? "" : String(draft.receivedUpi),
      tenderedCash: draft.tenderedCash == null ? "" : String(draft.tenderedCash),
      paymentRef: draft.paymentRef == null ? "" : String(draft.paymentRef),
      walkInName: draft.walkInName == null ? "" : String(draft.walkInName),
      walkInPhone: draft.walkInPhone == null ? "" : String(draft.walkInPhone),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(draftKey(companyId, tillId), JSON.stringify(payload));
    return payload;
  } catch {
    return readCounterDraft(companyId, tillId);
  }
}

export function clearCounterDraft(companyId, tillId = "till-1") {
  if (!companyId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(draftKey(companyId, tillId));
  } catch {
    /* ignore */
  }
}
