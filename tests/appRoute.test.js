import test from "node:test";
import assert from "node:assert/strict";
import { buildAppPath, parseAppPath, updateAppRoute, getAppRoute } from "../src/lib/appRoute.js";

test("dashboard and unknown paths", () => {
  assert.deepEqual(
    { ...parseAppPath("/"), known: undefined },
    { panel: null, module: "all", section: "overview", detailId: null, sub: [], known: undefined },
  );
  assert.equal(parseAppPath("/").known, true);
  assert.equal(parseAppPath("/nope").known, false);
  assert.equal(parseAppPath("/nope").module, "all");
  assert.equal(buildAppPath({}), "/");
});

test("panels round-trip with their sub-paths", () => {
  const cashbook = parseAppPath("/cashbook");
  assert.equal(cashbook.panel, "cashbook");
  assert.deepEqual(cashbook.sub, []);
  assert.equal(buildAppPath(cashbook), "/cashbook");

  const expenses = parseAppPath("/cashbook/expenses");
  assert.deepEqual(expenses.sub, ["expenses"]);
  assert.equal(buildAppPath(expenses), "/cashbook/expenses");

  const gst = parseAppPath("/accounts/reports/gst");
  assert.equal(gst.panel, "accounts");
  assert.deepEqual(gst.sub, ["reports", "gst"]);
  assert.equal(buildAppPath(gst), "/accounts/reports/gst");

  assert.equal(parseAppPath("/staff").panel, "agents");
  assert.equal(buildAppPath({ panel: "agents" }), "/staff");
  assert.equal(buildAppPath({ panel: "settings" }), "/settings");
  assert.deepEqual(parseAppPath("/chit/scheme/abc-123").sub, ["scheme", "abc-123"]);
});

test("finance modules, sections and account detail", () => {
  const daily = parseAppPath("/daily");
  assert.equal(daily.module, "daily");
  assert.equal(daily.section, "overview");
  assert.equal(buildAppPath(daily), "/daily");

  const collections = parseAppPath("/monthly/collections");
  assert.equal(collections.module, "monthly");
  assert.equal(collections.section, "collections");
  assert.equal(buildAppPath(collections), "/monthly/collections");

  const customers = parseAppPath("/customers");
  assert.equal(customers.module, "all");
  assert.equal(customers.section, "customers");
  assert.equal(buildAppPath(customers), "/customers");

  const detail = parseAppPath("/daily/customers/account/loan-1");
  assert.equal(detail.module, "daily");
  assert.equal(detail.section, "customers");
  assert.equal(detail.detailId, "loan-1");
  assert.equal(buildAppPath(detail), "/daily/customers/account/loan-1");

  assert.equal(parseAppPath("/account/loan-9").detailId, "loan-9");
  assert.equal(buildAppPath({ module: "all", detailId: "loan-9" }), "/account/loan-9");
});

test("an open panel wins over the finance module in the URL", () => {
  assert.equal(buildAppPath({ panel: "accounts", module: "daily", section: "customers", sub: ["vouchers"] }), "/accounts/vouchers");
  assert.equal(buildAppPath({ panel: "more", module: "daily" }), "/daily");
});

test("switching panel clears the previous panel's sub-path", () => {
  updateAppRoute({ panel: "accounts", sub: ["vouchers"] });
  assert.deepEqual(getAppRoute().sub, ["vouchers"]);
  updateAppRoute({ panel: "cashbook" });
  assert.equal(getAppRoute().panel, "cashbook");
  assert.deepEqual(getAppRoute().sub, []);
  updateAppRoute({ panel: "customers" });
  assert.equal(getAppRoute().panel, null);
  updateAppRoute({ module: "daily", section: "reports" });
  assert.equal(buildAppPath(getAppRoute()), "/daily/reports");
});
