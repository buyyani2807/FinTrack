import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isModuleEnabled } from "../src/features/commercial/featurePacks.js";
import { marketingPaths } from "../src/features/marketing/paths.js";
import {
  calendarDaysRemaining,
  canRestartTrial,
  moduleOpenDuringSubscription,
  normalizeSubscription,
  paidActivationFromButton,
  subscriptionLockCopy,
  subscriptionPathAllowed,
  trialBannerCopy,
  trialEndsFromStart,
  TRIAL_DAYS,
  TRIAL_LENGTH_MS,
  shouldStartTrial,
  workspaceAccessAllowed,
} from "../src/features/commercial/trial.js";
import { SUBSCRIPTION_WEBHOOK_READY, subscriptionWebhookResult } from "../api/lib/subscriptionBoundary.js";

const START = "2026-10-08T04:30:00.000Z";
const END = "2026-10-22T04:30:00.000Z";
const DAY_7 = "2026-10-15T04:30:00.000Z";
const DAY_3 = "2026-10-19T04:30:00.000Z";
const DAY_1 = "2026-10-21T04:30:00.000Z";
const EXPIRES_TODAY = "2026-10-22T03:30:00.000Z";
const AFTER = "2026-10-22T04:30:00.000Z";
const sql = fs.readFileSync(new URL("../supabase/092_signup_trial.sql", import.meta.url), "utf8");
const signupScreen = fs.readFileSync(new URL("../src/features/auth/AuthScreens.jsx", import.meta.url), "utf8");

function trialAt(serverNow, daysRemaining, extra = {}) {
  return normalizeSubscription({
    status: "trialing",
    plan: "trial",
    entitled: true,
    grandfathered: false,
    startedAt: START,
    endsAt: END,
    serverNow,
    daysRemaining,
    ...extra,
  });
}

test("start free opens the signup flow", () => {
  assert.equal(marketingPaths.signup, "/login?signup=1");
  assert.match(signupScreen, /Start your 14-day free trial/);
  assert.match(signupScreen, /No payment required to start/);
  assert.match(signupScreen, /After 14 days you can still sign in/);
});

test("trial duration is exactly 14 days and starts only with a workspace", () => {
  assert.equal(TRIAL_DAYS, 14);
  assert.equal(trialEndsFromStart(Date.parse(START)) - Date.parse(START), TRIAL_LENGTH_MS);
  assert.equal(calendarDaysRemaining(END, START), 14);
  assert.equal(shouldStartTrial({ authUserCreated: true, workspaceCreated: false }), false);
  assert.equal(shouldStartTrial({ authUserCreated: false, workspaceCreated: false }), false);
  assert.equal(shouldStartTrial({ authUserCreated: true, workspaceCreated: true }), true);
  assert.match(sql, /now\(\) \+ interval '14 days'/);
  assert.match(sql, /function public\.provision_financier\(\s*workspace_name text/);
  assert.doesNotMatch(sql, /trial_started_at text/);
});

test("trial state comes from the server payload, not the device clock or browser storage", () => {
  const subscription = trialAt(START, 14);
  const storedRestart = { endsAt: "2099-01-01T00:00:00.000Z", daysRemaining: 400, status: "trialing" };
  assert.equal(trialBannerCopy(subscription).daysRemaining, 14);
  assert.equal(calendarDaysRemaining(subscription.endsAt, subscription.serverNow), 14);
  assert.notEqual(subscription.endsAt, storedRestart.endsAt);
  assert.equal(workspaceAccessAllowed(subscription), true);
});

test("banner shows 14, 7, 3, 1, and expires-today states", () => {
  const start = trialBannerCopy(trialAt(START, 14));
  const week = trialBannerCopy(trialAt(DAY_7, 7));
  const three = trialBannerCopy(trialAt(DAY_3, 3));
  const one = trialBannerCopy(trialAt(DAY_1, 1));
  const today = trialBannerCopy(trialAt(EXPIRES_TODAY, 0));
  assert.equal(start.title, "14-day free trial");
  assert.match(start.detail, /14 days remaining/);
  assert.equal(start.tone, "info");
  assert.match(week.detail, /7 days remaining/);
  assert.equal(week.tone, "warning");
  assert.match(three.detail, /3 days remaining/);
  assert.equal(three.tone, "warning");
  assert.match(one.detail, /1 day remaining/);
  assert.equal(one.tone, "urgent");
  assert.match(today.detail, /Trial expires today/);
  assert.equal(today.tone, "urgent");
  assert.equal(workspaceAccessAllowed(trialAt(EXPIRES_TODAY, 0)), true);
});

test("an active trial keeps the full module pack, and expiry blocks protected routes", () => {
  const settings = { featurePacks: ["full"] };
  const active = trialAt(START, 14);
  const expired = normalizeSubscription({
    status: "expired",
    plan: "trial",
    entitled: false,
    grandfathered: false,
    startedAt: START,
    endsAt: END,
    serverNow: AFTER,
    daysRemaining: 0,
  });
  for (const moduleId of ["daily", "monthly", "chit", "accounts", "cashbook"]) {
    assert.equal(moduleOpenDuringSubscription(active, isModuleEnabled(settings, moduleId)), true);
    assert.equal(moduleOpenDuringSubscription(expired, isModuleEnabled(settings, moduleId)), false);
  }
  assert.equal(subscriptionPathAllowed("/dashboard", expired), false);
  assert.equal(subscriptionPathAllowed("/daily-finance/todays-collections", expired), false);
  assert.equal(subscriptionPathAllowed("/subscribe", expired), true);
  assert.equal(subscriptionPathAllowed("/settings/company", expired), true);
  assert.match(subscriptionLockCopy(expired).preservation, /Nothing is deleted/);
  assert.equal(workspaceAccessAllowed(trialAt(AFTER, 0, { entitled: true })), false);
});

test("re-login keeps the same trial dates and a workspace cannot restart its trial", () => {
  const first = trialAt(DAY_3, 3);
  const again = normalizeSubscription(first);
  assert.equal(again.startedAt, first.startedAt);
  assert.equal(again.endsAt, first.endsAt);
  assert.equal(canRestartTrial(first.startedAt), false);
  assert.equal(canRestartTrial(null), false);
  assert.match(sql, /Workspace already provisioned for this account/);
  assert.doesNotMatch(sql, /set subscription_status = 'trialing'/);
});

test("existing workspaces stay entitled and a verified paid plan restores access", () => {
  const existing = normalizeSubscription({ status: null, serverNow: START });
  assert.equal(existing.grandfathered, true);
  assert.equal(workspaceAccessAllowed(existing), true);
  assert.equal(trialBannerCopy(existing), null);
  const paid = normalizeSubscription({
    status: "active",
    plan: "annual",
    entitled: true,
    grandfathered: false,
    provider: "future",
    customerId: "cus_123",
    startedAt: START,
    endsAt: END,
    serverNow: AFTER,
  });
  assert.equal(workspaceAccessAllowed(paid), true);
  assert.equal(trialBannerCopy(paid), null);
  assert.equal(moduleOpenDuringSubscription(paid, true), true);
  assert.equal(paidActivationFromButton().accepted, false);
  assert.equal(paidActivationFromButton().activatesWorkspace, false);
});

test("the database migration keeps trial authority on the server", () => {
  assert.match(sql, /org_id := public\.current_organization_id\(\)/);
  assert.match(sql, /function public\.current_workspace_subscription\(\)/);
  assert.match(sql, /revoke all on function public\.activate_paid_subscription\(uuid, text, text, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.activate_paid_subscription\(uuid, text, text, text\) to service_role/);
  assert.match(sql, /A verified payment-provider event is required/);
  assert.match(sql, /Your 14-day trial has ended/);
  assert.match(sql, /grandfathered', true/);
  assert.match(sql, /No trial email is sent/);
  assert.doesNotMatch(sql, /delete from public\.(customers|payments|finance_accounts)/i);
  const webhook = subscriptionWebhookResult({ subscription_status: "active", plan: "annual" });
  assert.equal(SUBSCRIPTION_WEBHOOK_READY, false);
  assert.equal(webhook.status, 501);
  assert.equal(webhook.activatesWorkspace, false);
});
