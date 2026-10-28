import { roundMoney } from "./accountingModel.js";

export const PRICE_LIST_KINDS = [
  { id: "selling", label: "Selling" },
  { id: "purchase", label: "Purchase" },
];

export const emptyPriceListDraft = (kind = "selling") => ({
  id: null,
  name: "",
  kind,
  partyId: "",
  isDefault: false,
  isActive: true,
  rates: {},
});

/** Map loaded lists + rates into list rows with a rate map. */
export function assemblePriceLists(lists = [], rates = []) {
  const byList = new Map();
  for (const list of lists || []) {
    byList.set(list.id, { ...list, rates: {} });
  }
  for (const rate of rates || []) {
    const list = byList.get(rate.priceListId);
    if (!list) continue;
    list.rates[rate.itemId] = Number(rate.rate) || 0;
  }
  return [...byList.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export function priceListsForParty(lists = [], party) {
  if (!party) return [];
  const kind = party.partyType === "supplier" ? "purchase" : party.partyType === "customer" ? "selling" : "";
  if (!kind) return [];
  return (lists || []).filter(list => list.kind === kind && list.isActive !== false);
}

/**
 * Rate for an item on a sale or purchase. Party list first, then company default for that kind, then the item price.
 * Does not invent a rate when nothing is set.
 */
export function resolveItemRate({ item, party = null, lists = [], kind = "selling" } = {}) {
  if (!item) return { rate: null, source: "none", listId: null, listName: "" };
  const wanted = kind === "purchase" ? "purchase" : "selling";
  const active = (lists || []).filter(list => list.kind === wanted && list.isActive !== false);
  const partyList = party?.priceListId ? active.find(list => list.id === party.priceListId) : null;
  if (partyList && partyList.rates && Object.prototype.hasOwnProperty.call(partyList.rates, item.id)) {
    return {
      rate: roundMoney(partyList.rates[item.id]),
      source: "party_list",
      listId: partyList.id,
      listName: partyList.name,
    };
  }
  const fallback = active.find(list => list.isDefault) || null;
  if (fallback && fallback.rates && Object.prototype.hasOwnProperty.call(fallback.rates, item.id)) {
    return {
      rate: roundMoney(fallback.rates[item.id]),
      source: "default_list",
      listId: fallback.id,
      listName: fallback.name,
    };
  }
  const itemRate = wanted === "purchase" ? Number(item.purchasePrice || 0) : Number(item.sellingPrice || 0);
  if (itemRate > 0 || itemRate === 0) {
    return { rate: roundMoney(itemRate), source: "item", listId: null, listName: "" };
  }
  return { rate: null, source: "none", listId: null, listName: "" };
}

export function assertPriceListDraft(draft, { existing = [] } = {}) {
  const name = String(draft?.name || "").trim();
  if (!name) throw new Error("Price list name is required.");
  if (name.length > 80) throw new Error("Price list name is too long.");
  const kind = draft?.kind === "purchase" ? "purchase" : "selling";
  const clash = (existing || []).find(list => list.id !== draft?.id && list.kind === kind && list.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new Error(`A ${kind} list named ${name} already exists.`);
  return {
    id: draft?.id || null,
    name,
    kind,
    isDefault: Boolean(draft?.isDefault),
    isActive: draft?.isActive !== false,
    rates: draft?.rates && typeof draft.rates === "object" ? draft.rates : {},
  };
}

export function ratesPayload(rates = {}) {
  return Object.entries(rates)
    .filter(([, rate]) => String(rate ?? "").trim() !== "" && Number.isFinite(Number(rate)))
    .map(([itemId, rate]) => ({ itemId, rate: roundMoney(rate) }))
    .filter(row => row.itemId && row.rate >= 0);
}
