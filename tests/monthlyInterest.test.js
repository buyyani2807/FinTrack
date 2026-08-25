import test from "node:test";
import assert from "node:assert/strict";

import { monthlyInterestOnBalance } from "../src/features/finance/calculations.js";

test("monthly interest uses the monthly percent, not annual/12", () => {
  assert.equal(monthlyInterestOnBalance(100000, 3), 3000);
  assert.equal(Math.round(100000 * 3 / 1200), 250);
});
