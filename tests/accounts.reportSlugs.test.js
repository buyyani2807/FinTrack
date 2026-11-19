import test from "node:test";
import assert from "node:assert/strict";
import { accountsPath, accountsViewFromPath } from "../src/features/accounts/accountsNavigation.js";

test("a hyphenated report slug resolves to the real report and redirects", () => {
  // /accounting/reports/trial-balance used to render the Day Book under that URL.
  const view = accountsViewFromPath("reports", "trial-balance");
  assert.equal(view.section, "trial");
  assert.equal(view.reportTab, "trial");
  assert.equal(view.redirect, true);
  assert.equal(accountsPath(view), "/accounting/reports/trial");
});

test("other common spellings land on their report", () => {
  const cases = [
    ["balance-sheet", "balance"],
    ["profit-and-loss", "pnl"],
    ["day-book", "daybook"],
    ["cash-flow", "cashflow"],
    ["stock-movement", "stock_moves"],
    ["customer-pipeline", "crm"],
  ];
  for (const [slug, expected] of cases) {
    const view = accountsViewFromPath("reports", slug);
    assert.equal(view.reportTab, expected, `${slug} should resolve to ${expected}`);
    assert.equal(view.redirect, true, `${slug} should rewrite the address`);
  }
});

test("a canonical slug is served as-is with no redirect", () => {
  const view = accountsViewFromPath("reports", "trial");
  assert.equal(view.reportTab, "trial");
  assert.equal(Boolean(view.redirect), false);
});

test("an unrecognisable slug falls back to the Day Book and says so in the URL", () => {
  const view = accountsViewFromPath("reports", "not-a-report");
  assert.equal(view.reportTab, "daybook");
  assert.equal(view.redirect, true);
  assert.equal(accountsPath(view), "/accounting/reports/daybook");
});

test("bare /accounting/reports keeps its silent default", () => {
  const view = accountsViewFromPath("reports", undefined);
  assert.equal(view.reportTab, "daybook");
  assert.equal(Boolean(view.redirect), false);
});
