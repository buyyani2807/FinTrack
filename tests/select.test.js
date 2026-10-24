import assert from "node:assert/strict";
import test from "node:test";
import { optionMatchesQuery } from "../src/components/selectOptions.js";

test("a dropdown search keeps labels whose name starts with the typed letters", () => {
  assert.equal(optionMatchesQuery("36 · Telangana", "t"), true);
  assert.equal(optionMatchesQuery("33 · Tamil Nadu", "ta"), true);
  assert.equal(optionMatchesQuery("36 · Telangana", "ta"), false);
  assert.equal(optionMatchesQuery("05 · Uttarakhand", "t"), false);
  assert.equal(optionMatchesQuery("08 · Rajasthan", "t"), false);
  assert.equal(optionMatchesQuery("24 · Gujarat", "t"), false);
  assert.equal(optionMatchesQuery("Select state", "t"), false);
  assert.equal(optionMatchesQuery("36 · Telangana", "36"), true);
  assert.equal(optionMatchesQuery("Select state", ""), true);
  assert.equal(optionMatchesQuery("Sri Wholesale", "whole"), true);
  assert.equal(optionMatchesQuery("Sri Wholesale", "ri"), false);
});
