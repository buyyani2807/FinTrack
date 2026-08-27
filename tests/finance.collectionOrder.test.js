import test from "node:test";
import assert from "node:assert/strict";
import { byCollectionOrderThenName, mergeAccountOrder, reorderIds } from "../src/features/finance/collectionOrder.js";

test("reorders ids without mutating the source list", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(reorderIds(ids, "a", "c"), ["b", "c", "a"]);
  assert.deepEqual(ids, ["a", "b", "c"]);
  assert.deepEqual(reorderIds(ids, "missing", "a"), ids);
});

test("merges a daily dashboard reorder into the full collection order", () => {
  const loans = [
    { id: "m1", kind: "monthly", customerName: "Zara", collectionOrder: 1 },
    { id: "d1", kind: "daily", customerName: "Ann", collectionOrder: 2 },
    { id: "d2", kind: "daily", customerName: "Ben", collectionOrder: 3 },
    { id: "m2", kind: "monthly", customerName: "Omar", collectionOrder: 4 },
  ];
  const moving = ["d1", "d2"];
  const nextDaily = reorderIds(moving, "d1", "d2");
  assert.deepEqual(nextDaily, ["d2", "d1"]);
  assert.deepEqual(mergeAccountOrder(loans, moving, nextDaily), ["m1", "d2", "d1", "m2"]);
});

test("sorts by saved collection order then customer name", () => {
  const rows = [
    { id: "b", customerName: "Bina", collectionOrder: 2 },
    { id: "a", customerName: "Anita", collectionOrder: 2 },
    { id: "c", customerName: "Chet", collectionOrder: 1 },
  ].sort(byCollectionOrderThenName);
  assert.deepEqual(rows.map(row => row.id), ["c", "a", "b"]);
});
