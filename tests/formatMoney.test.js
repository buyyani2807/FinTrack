import test from "node:test";
import assert from "node:assert/strict";
import { formatInr } from "../src/lib/formatMoney.js";

test("formatInr keeps whole rupees without paise and shows paise when present", () => {
  assert.equal(formatInr(1000), "₹1,000");
  assert.equal(formatInr(1000.5), "₹1,000.50");
  assert.equal(formatInr(100.01), "₹100.01");
  assert.equal(formatInr(95000, "Rs. "), "Rs. 95,000");
});
