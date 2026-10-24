import assert from "node:assert/strict";
import test from "node:test";
import { optionMatchesQuery } from "../src/components/selectOptions.js";

test("a dropdown search matches any part of the label", () => {
  assert.equal(optionMatchesQuery("36 · Telangana", "tel"), true);
  assert.equal(optionMatchesQuery("36 · Telangana", "36"), true);
  assert.equal(optionMatchesQuery("02 · Himachal Pradesh", "tel"), false);
  assert.equal(optionMatchesQuery("Select state", ""), true);
  assert.equal(optionMatchesQuery("Sri Wholesale", "  WHOLE "), true);
});
