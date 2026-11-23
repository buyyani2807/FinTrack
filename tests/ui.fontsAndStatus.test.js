import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { badgeLabel } from "../src/lib/statusLabel.js";

test("status badges read as words, not raw values", () => {
  assert.equal(badgeLabel("active"), "Active");
  assert.equal(badgeLabel("overdue"), "Overdue");
  assert.equal(badgeLabel("part_paid"), "Part paid");
  assert.equal(badgeLabel("bankrupt"), "Defaulter");
  assert.equal(badgeLabel("Completed"), "Completed");
  assert.equal(badgeLabel("Reorder 5"), "Reorder 5");
  assert.equal(badgeLabel(undefined), undefined);
});

const files = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : [path];
});

test("app styles use only Inter", () => {
  const stray = /\b(Syne|DM Sans|Plus Jakarta Sans|Poppins)\b/;
  const offenders = files("src").filter(path => /\.(css|jsx)$/.test(path) && stray.test(readFileSync(path, "utf8")));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(readFileSync("index.html", "utf8"), /Plus\+Jakarta|Poppins/);
});
