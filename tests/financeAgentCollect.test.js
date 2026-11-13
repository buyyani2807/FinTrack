import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../src/features/finance/FinancierDashboard.jsx", import.meta.url), "utf8");

test("collection agents get Collect and the payment form; edits stay owner-only", () => {
  assert.match(dashboard, /const canCollect = role === "owner" \|\| role === "staff";/);
  assert.equal((dashboard.match(/canCollect && modal && modal !== "new" && <Payment/g) || []).length, 3);
  assert.equal((dashboard.match(/collect=\{canCollect \? setModal : null\}/g) || []).length, 2);
  assert.match(dashboard, /canCollect=\{canCollect\}/);
  assert.match(dashboard, /edit=\{canWrite \? setEditLoan : null\}/);
  assert.match(dashboard, /canWrite && modal === "new" && <NewFinance/);
});
