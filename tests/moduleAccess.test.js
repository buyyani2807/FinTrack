import test from "node:test";
import assert from "node:assert/strict";
import {
  activeProductKeys,
  hasPurchasedProduct,
  resolveWorkspaceModuleState,
  subscriptionGrantsFullModules,
} from "../src/features/commercial/moduleAccess.js";
import {
  MODULE_BILLING_DEFAULTS,
  MODULE_PRODUCTS,
  appModulesFromProductKeys,
  cartTotals,
  priceForPeriod,
  productKeysSatisfy,
  unlockCopyForAppModule,
} from "../src/features/commercial/moduleProducts.js";
import { subscriptionPathAllowed } from "../src/features/commercial/trial.js";

test("module price is monthly ₹498 or annual ₹5976 plus 18% GST — no lifetime", () => {
  assert.equal(MODULE_BILLING_DEFAULTS.monthlyBasePaise, 49800);
  assert.equal(MODULE_BILLING_DEFAULTS.annualBasePaise, 597600);
  assert.equal(MODULE_BILLING_DEFAULTS.gstRate, 0.18);
  assert.equal(MODULE_BILLING_DEFAULTS.period, "monthly");
  assert.notEqual(MODULE_BILLING_DEFAULTS.period, "lifetime");

  const monthly = priceForPeriod("monthly");
  assert.equal(monthly.basePaise, 49800);
  assert.equal(monthly.taxPaise, 8964);
  assert.equal(monthly.totalPaise, 58764);
  assert.match(monthly.breakdown, /GST 18%/);

  const annual = priceForPeriod("annual");
  assert.equal(annual.basePaise, 597600);
  assert.equal(annual.taxPaise, 107568);
  assert.equal(annual.totalPaise, 705168);
});

test("cart totals multiply modules and keep GST", () => {
  const two = cartTotals(["chit_fund", "accounts"], "monthly");
  assert.equal(two.moduleCount, 2);
  assert.equal(two.basePaise, 99600);
  assert.equal(two.taxPaise, 17928);
  assert.equal(two.totalPaise, 117528);
});

test("accounts_pos unlocks accounts surfaces and counter", () => {
  const unlocked = appModulesFromProductKeys(["accounts_pos"]);
  assert.equal(unlocked.has("accounts"), true);
  assert.equal(unlocked.has("cashbook"), true);
  assert.equal(unlocked.has("counter"), true);
  assert.equal(productKeysSatisfy(["accounts_pos"], "accounts"), true);
  assert.equal(productKeysSatisfy(["accounts"], "accounts_pos"), false);
  assert.ok(MODULE_PRODUCTS.accounts_pos.bundle);
});

test("grandfathered and trial keep full access without entitlement rows", () => {
  const packs = { featurePacks: ["full"] };
  const grandpa = resolveWorkspaceModuleState({
    orgSettings: packs,
    subscription: { grandfathered: true, entitled: true, status: "active" },
    entitlements: [],
  });
  assert.equal(grandpa.trialOrLegacyFull, true);
  assert.equal(grandpa.enabled.has("daily"), true);
  assert.equal(grandpa.enabled.has("accounts"), true);

  const trial = resolveWorkspaceModuleState({
    orgSettings: packs,
    subscription: { status: "trialing", entitled: true, grandfathered: false },
    entitlements: [],
  });
  assert.equal(trial.mode, "trial");
  assert.equal(trial.enabled.has("chit"), true);
});

test("commerce mode locks unpurchased modules after trial", () => {
  const state = resolveWorkspaceModuleState({
    orgSettings: { featurePacks: ["full"] },
    subscription: { status: "active", entitled: true, grandfathered: false, plan: "monthly" },
    entitlements: [{ module_key: "chit_fund", product_key: "chit_fund", status: "active" }],
  });
  assert.equal(state.mode, "modules");
  assert.equal(state.enabled.has("chit"), true);
  assert.equal(state.enabled.has("daily"), false);
  assert.equal(state.enabled.has("accounts"), false);
  assert.equal(hasPurchasedProduct(state, "chit_fund"), true);
  assert.equal(hasPurchasedProduct(state, "accounts"), false);
});

test("duplicate product keys collapse; unlock copy shows GST price", () => {
  assert.deepEqual(activeProductKeys([
    { module_key: "accounts", status: "active" },
    { module_key: "accounts", status: "active" },
  ]), ["accounts"]);
  const copy = unlockCopyForAppModule("daily", "monthly");
  assert.match(copy.body, /₹498/);
  assert.match(copy.body, /GST 18%/);
  assert.equal(copy.productKey, "finance_daily_monthly");
});

test("expired workspace can still open module store path", () => {
  const locked = { status: "expired", entitled: false, grandfathered: false };
  assert.equal(subscriptionPathAllowed("/subscribe/modules", locked), true);
  assert.equal(subscriptionPathAllowed("/daily-finance", locked), false);
});

test("subscriptionGrantsFullModules treats missing payload as open", () => {
  assert.equal(subscriptionGrantsFullModules(null), true);
  assert.equal(subscriptionGrantsFullModules({ status: "expired", entitled: false }), false);
});
