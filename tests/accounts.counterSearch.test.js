import test from "node:test";
import assert from "node:assert/strict";
import {
  editDistance,
  findCounterItemByCode,
  matchCounterItems,
  scoreCounterItem,
} from "../src/features/accounts/model/counterSearch.js";

const items = [
  { id: "1", name: "Toor Dal", sku: "TD-1", barcode: "8901001", brand: "Organic", isActive: true },
  { id: "2", name: "Chana Dal", sku: "CD-1", barcode: "8901002", isActive: true },
  { id: "3", name: "Sunflower Oil 1L", sku: "SO-1", barcode: "8901003", isActive: true },
  { id: "4", name: "Inactive Item", sku: "XX", isActive: false },
];

test("exact barcode and sku win", () => {
  assert.equal(findCounterItemByCode(items, "8901001")?.id, "1");
  assert.equal(findCounterItemByCode(items, "cd-1")?.id, "2");
  assert.equal(matchCounterItems(items, "8901003")[0]?.id, "3");
});

test("transliteration aliases match toor via tur", () => {
  const hits = matchCounterItems(items, "tur");
  assert.ok(hits.some(item => item.id === "1"));
  assert.ok(scoreCounterItem(items[0], "tuar") >= 30);
});

test("fuzzy token tolerates a single character slip", () => {
  assert.ok(editDistance("toor", "tour", 2) === 1);
  const hits = matchCounterItems(items, "chan");
  assert.ok(hits.some(item => item.id === "2"));
});

test("empty query returns no catalog dump", () => {
  assert.deepEqual(matchCounterItems(items, ""), []);
  assert.equal(findCounterItemByCode(items, ""), null);
});

test("inactive items stay out", () => {
  assert.equal(matchCounterItems(items, "Inactive").length, 0);
});
