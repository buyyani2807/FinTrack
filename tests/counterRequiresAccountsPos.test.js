import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  counterIncludedInPlan,
  orgSettingsWithModuleState,
  resolveWorkspaceModuleState,
} from "../src/features/commercial/moduleAccess.js";
import { FEATURE_PACKS, isModuleEnabled } from "../src/features/commercial/featurePacks.js";

// The same path WorkspaceLayout takes: module state → orgSettings handed to Accounts.
const planSettings = ({ orgSettings = { featurePacks: ["full"] }, subscription, entitlements = [] }) => {
  const state = resolveWorkspaceModuleState({ orgSettings, subscription, entitlements });
  return orgSettingsWithModuleState(orgSettings, state);
};
const paid = { status: "active", entitled: true, grandfathered: false, plan: "monthly" };
const row = key => ({ module_key: key, product_key: key, status: "active" });

test("a paid Accounts-only workspace does not get the Counter", () => {
  const settings = planSettings({ subscription: paid, entitlements: [row("accounts")] });
  assert.equal(isModuleEnabled(settings, "accounts"), true);
  assert.equal(counterIncludedInPlan(settings), false);
});

test("Accounts + POS gets the Counter", () => {
  const settings = planSettings({ subscription: paid, entitlements: [row("accounts_pos")] });
  assert.equal(isModuleEnabled(settings, "accounts"), true);
  assert.equal(counterIncludedInPlan(settings), true);
});

test("Accounts plus another product still has no Counter without accounts_pos", () => {
  const settings = planSettings({ subscription: paid, entitlements: [row("accounts"), row("chit_fund")] });
  assert.equal(counterIncludedInPlan(settings), false);
});

test("an expired or refunded Accounts + POS purchase no longer gives the Counter", () => {
  for (const status of ["expired", "refunded", "cancelled"]) {
    const settings = planSettings({
      subscription: paid,
      entitlements: [row("accounts"), { ...row("accounts_pos"), status }],
    });
    assert.equal(counterIncludedInPlan(settings), false, status);
  }
});

test("the free trial keeps the Counter", () => {
  const settings = planSettings({ subscription: { status: "trialing", entitled: true, grandfathered: false } });
  assert.equal(counterIncludedInPlan(settings), true);
});

test("trial keeps the Counter even if the workspace already bought Accounts only", () => {
  const settings = planSettings({
    subscription: { status: "trialing", entitled: true, grandfathered: false },
    entitlements: [row("accounts")],
  });
  assert.equal(counterIncludedInPlan(settings), true);
});

test("grandfathered workspaces keep the Counter on the Full or Business pack", () => {
  for (const pack of ["full", "business"]) {
    const settings = planSettings({
      orgSettings: { featurePacks: [pack] },
      subscription: { grandfathered: true, entitled: true, status: "active" },
    });
    assert.equal(counterIncludedInPlan(settings), true, pack);
  }
});

test("a legacy workspace with no purchases keeps the Counter", () => {
  const settings = planSettings({ subscription: paid });
  assert.equal(counterIncludedInPlan(settings), true);
});

test("a missing subscription payload does not lock the Counter (no flicker while loading)", () => {
  assert.equal(planSettings({ subscription: null }).moduleOverrides, undefined);
  assert.equal(counterIncludedInPlan(planSettings({ subscription: null })), true);
  assert.equal(counterIncludedInPlan({}), true);
  assert.equal(counterIncludedInPlan(null), true);
});

test("Finance and Chit packs never include the Counter", () => {
  assert.equal(FEATURE_PACKS.finance.modules.includes("counter"), false);
  assert.equal(FEATURE_PACKS.chit.modules.includes("counter"), false);
  assert.equal(FEATURE_PACKS.full.modules.includes("counter"), true);
  assert.equal(FEATURE_PACKS.business.modules.includes("counter"), true);
});

// --- Accounts screen wiring ---------------------------------------------------

const product = readFileSync(new URL("../src/features/accounts/AccountingProduct.jsx", import.meta.url), "utf8");
const setupPanel = readFileSync(new URL("../src/features/accounts/sections/setup/CompanySetupPanel.jsx", import.meta.url), "utf8");

test("the Counter tab, screen and Setup switch all follow the plan, not just the company switch", () => {
  assert.match(product, /const counterInPlan = counterIncludedInPlan\(orgSettings\);/);
  assert.match(product, /const counterOn = counterInPlan && counterEnabled;/);
  assert.match(product, /manufacturingEnabled=\{manufacturingEnabled\} counterEnabled=\{counterOn\}/);
  assert.match(product, /section === "counter" && counterOn && <CounterWorkspace/);
  assert.match(product, /\(!enabled \|\| !counterInPlan\) && section === "counter"/);
  assert.match(product, /!counterInPlan \? <div className="notice"/, "cashier sees a notice instead of a spinner");
  assert.match(product, /counterInPlan=\{counterInPlan\}/);
  assert.doesNotMatch(product, /section === "counter" && counterEnabled &&/);
});

test("Setup shows a locked Counter switch with an upgrade link for Accounts-only", () => {
  assert.match(setupPanel, /onCounterEnabledChange && !counterInPlan \?/);
  assert.match(setupPanel, /<Link to=\{workspacePaths\.moduleStore\}>Upgrade to Accounts \+ POS<\/Link>/);
});

// --- Server guard (152) ------------------------------------------------------

const sql = readFileSync(new URL("../supabase/152_counter_requires_accounts_pos.sql", import.meta.url), "utf8");
const fn = name => {
  const start = sql.indexOf(`function public.${name}(`);
  assert.ok(start > 0, `${name} is defined`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

test("server: the plan check mirrors the client rule", () => {
  const body = fn("acc_org_has_pos");
  assert.match(body, /if status is null then\s+return true;/, "grandfathered");
  assert.match(body, /status = 'trialing' and \(ends_at is null or now\(\) < ends_at\)/, "trial");
  assert.match(body, /e\.module_key = 'accounts_pos'/);
  assert.match(body, /e\.status = 'active'/);
  assert.match(body, /e\.ends_at is null or e\.ends_at > now\(\)/);
  assert.doesNotMatch(body, /module_key = 'accounts'\b(?!_)/, "plain Accounts must not satisfy POS");
  assert.match(body, /if not exists \(\s+select 1 from public\.organization_module_entitlements e\s+where e\.organization_id = target_org_id\s+\) then\s+return true;/, "legacy");
});

test("server: Counter vouchers and cash movements are refused without the plan", () => {
  const body = fn("acc_pos_plan_guard");
  assert.match(body, /new\.source_type is distinct from 'pos_counter'/);
  assert.match(body, /acc_org_has_pos\(new\.organization_id\)/);
  assert.match(body, /raise exception 'The Counter \(POS\) is part of Accounts \+ POS/);
  assert.match(sql, /create trigger acc_pos_plan_guard\s+before insert on public\.acc_vouchers/);
  assert.match(sql, /create trigger acc_pos_plan_guard\s+before insert on public\.acc_counter_cash_movements/);
});

test("server: restore and the service role are not blocked, and old bills stay editable", () => {
  const body = fn("acc_pos_plan_guard");
  assert.match(body, /if auth\.uid\(\) is null then\s+return new;/);
  assert.match(body, /current_setting\('myfin\.backup_org', true\)/);
  assert.doesNotMatch(sql, /before insert or update/, "UPDATE is not checked, so voids after a downgrade work");
});
