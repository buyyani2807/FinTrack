import test from "node:test";
import assert from "node:assert/strict";
import {
  assemblePriceLists,
  assertPriceListDraft,
  priceListsForParty,
  ratesPayload,
  resolveItemRate,
} from "../src/features/accounts/model/priceLists.js";

const item = { id: "i1", name: "Cement", sellingPrice: 400, purchasePrice: 320 };

test("assemblePriceLists nests rates under each list", () => {
  const lists = assemblePriceLists(
    [{ id: "pl1", name: "Retail", kind: "selling", isDefault: true, isActive: true }],
    [{ priceListId: "pl1", itemId: "i1", rate: 450 }],
  );
  assert.equal(lists.length, 1);
  assert.equal(lists[0].rates.i1, 450);
});

test("resolveItemRate prefers party list, then default, then item price", () => {
  const lists = [
    { id: "def", name: "Default sell", kind: "selling", isDefault: true, isActive: true, rates: { i1: 410 } },
    { id: "vip", name: "VIP", kind: "selling", isDefault: false, isActive: true, rates: { i1: 380 } },
  ];
  assert.equal(resolveItemRate({ item, lists, kind: "selling" }).rate, 410);
  assert.equal(resolveItemRate({ item, lists, kind: "selling" }).source, "default_list");
  assert.equal(resolveItemRate({ item, party: { priceListId: "vip" }, lists, kind: "selling" }).rate, 380);
  assert.equal(resolveItemRate({ item, party: { priceListId: "vip" }, lists, kind: "selling" }).source, "party_list");
  assert.equal(resolveItemRate({ item, lists: [], kind: "selling" }).rate, 400);
  assert.equal(resolveItemRate({ item, lists: [], kind: "purchase" }).rate, 320);
});

test("priceListsForParty filters by customer or supplier kind", () => {
  const lists = [
    { id: "s1", name: "Retail", kind: "selling", isActive: true },
    { id: "p1", name: "Trade buy", kind: "purchase", isActive: true },
    { id: "s2", name: "Old", kind: "selling", isActive: false },
  ];
  assert.deepEqual(priceListsForParty(lists, { partyType: "customer" }).map(row => row.id), ["s1"]);
  assert.deepEqual(priceListsForParty(lists, { partyType: "supplier" }).map(row => row.id), ["p1"]);
  assert.deepEqual(priceListsForParty(lists, { partyType: "both" }), []);
});

test("assertPriceListDraft validates name and uniqueness", () => {
  assert.throws(() => assertPriceListDraft({ name: "  ", kind: "selling" }), /required/i);
  assert.throws(
    () => assertPriceListDraft({ name: "Retail", kind: "selling" }, { existing: [{ id: "x", name: "retail", kind: "selling" }] }),
    /already exists/i,
  );
  const ready = assertPriceListDraft({ name: " Retail ", kind: "purchase", isDefault: true, rates: { i1: "12.5" } });
  assert.equal(ready.name, "Retail");
  assert.equal(ready.kind, "purchase");
  assert.equal(ready.isDefault, true);
});

test("ratesPayload keeps non-negative numeric rates", () => {
  assert.deepEqual(ratesPayload({ i1: "10.55", i2: "", i3: -1, i4: 0 }), [
    { itemId: "i1", rate: 10.55 },
    { itemId: "i4", rate: 0 },
  ]);
});
