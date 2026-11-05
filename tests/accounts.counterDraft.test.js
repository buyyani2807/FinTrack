import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearCounterDraft,
  emptyCounterDraft,
  readCounterDraft,
  saveCounterDraft,
} from "../src/features/accounts/model/counterDraft.js";

const memory = new Map();

test("counter draft survives save/read and clears when empty", () => {
  globalThis.localStorage = {
    getItem: key => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: key => { memory.delete(key); },
  };
  memory.clear();

  const companyId = "co-1";
  const tillId = "till-1";
  assert.equal(readCounterDraft(companyId, tillId), null);

  const draft = {
    ...emptyCounterDraft(),
    lines: [{ itemId: "item-1", itemName: "Chana Dal", quantity: 2, rate: 150, unit: "Kg" }],
    moneyMode: "upi",
  };
  saveCounterDraft(companyId, tillId, draft);
  const restored = readCounterDraft(companyId, tillId);
  assert.equal(restored.lines.length, 1);
  assert.equal(restored.lines[0].itemName, "Chana Dal");
  assert.equal(restored.moneyMode, "upi");

  saveCounterDraft(companyId, tillId, { ...draft, lines: [] });
  assert.equal(readCounterDraft(companyId, tillId), null);

  saveCounterDraft(companyId, tillId, draft);
  clearCounterDraft(companyId, tillId);
  assert.equal(readCounterDraft(companyId, tillId), null);
});
