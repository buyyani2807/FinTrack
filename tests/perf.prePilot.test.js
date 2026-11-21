// Pre-pilot performance audit (2026-11-21): guards for the request and bundle fixes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("restoring a session does not load the workspace a second time", () => {
  const src = read("src/app/useFinTrackSession.js");
  const restore = src.slice(src.indexOf("supabase.auth.restoreSession()"), src.indexOf("const refreshLoans"));
  assert.ok(restore.indexOf("skipNextWorkspaceRefresh.current = true") > -1, "restore path must skip the token-change refresh");
  assert.ok(restore.indexOf("skipNextWorkspaceRefresh.current = true") < restore.indexOf("flushSync("), "flag must be set before the token is stored");
});

test("loadWorkspace fetches the subscription alongside the profile, not after it", () => {
  const src = read("src/lib/financeRepository.js");
  const body = src.slice(src.indexOf("export async function loadWorkspace"), src.indexOf("async function loadSubscription"));
  const sub = body.indexOf("const subscriptionPromise = loadSubscription(token);");
  const profile = body.indexOf("await loadProfileOrganization(");
  assert.ok(sub > -1 && profile > -1 && sub < profile);
  assert.match(body, /subscriptionPromise\.catch\(\(\) => \{\}\);/);
  assert.match(body, /subscription: await subscriptionPromise/);
});

test("upcoming chit payments load the schedules together, not one after another", () => {
  const src = read("src/lib/financeRepository.js");
  const body = src.slice(src.indexOf("async function loadUpcomingChitPaymentsFromSchemes"), src.indexOf("const UPCOMING_SHARE_MS"));
  assert.match(body, /await Promise\.all\(\[\s*supabase\.query\(\s*`\/rest\/v1\/chit_enrollments/);
  for (const table of ["fixed_chit_payments", "fixed_chit_lifts", "predefined_chit_payments", "predefined_chit_schedule"]) {
    assert.match(body, new RegExp(`querySchemeRows\\(token, "${table}"`), table);
  }
  // Output order is unchanged: auction rows, then Fixed, then Predefined.
  assert.ok(body.indexOf("auctionSchemes.forEach") < body.indexOf("fixedSchemes.forEach"));
  assert.ok(body.indexOf("fixedSchemes.forEach") < body.indexOf("predefinedSchemes.forEach"));
});

test("only calls that start together share an upcoming-chit request", () => {
  const src = read("src/lib/financeRepository.js");
  assert.match(src, /const UPCOMING_SHARE_MS = 250;/);
  assert.match(src, /now - upcomingChitInFlight\.at <= UPCOMING_SHARE_MS/);
  assert.match(src, /if \(upcomingChitInFlight === entry\) upcomingChitInFlight = null;/);
});

test("the dashboard waits for the active-scheme list before loading chit reminders", () => {
  const dash = read("src/features/finance/FinancierDashboard.jsx");
  assert.match(dash, /if \(!activeChitSchemesLoaded\) return undefined;/);
  assert.match(dash, /\[canWrite, authToken, activeChitSchemes, activeChitSchemesLoaded, dashboardExtrasReady\]/);
  const layout = read("src/features/workspace/WorkspaceLayout.jsx");
  assert.match(layout, /setChitSchemesLoaded\(true\)/);
  assert.match(layout, /chitSchemes, chitSchemesLoaded, setChitSchemes/);
  assert.match(read("src/features/workspace/routes/FinanceRoute.jsx"), /activeChitSchemesLoaded=\{chitSchemesLoaded\}/);
});

test("the app shell does not import the marketing catalog", () => {
  const lean = read("src/features/marketing/routePaths.js");
  assert.doesNotMatch(lean, /^import /m);
  for (const path of ["src/App.jsx", "src/app/SessionLayout.jsx"]) {
    assert.match(read(path), /from "\.{1,2}\/(features\/marketing\/)?routePaths\.js"|marketing\/routePaths\.js"/, path);
  }
  const routes = read("src/app/AppRoutes.jsx");
  assert.doesNotMatch(routes, /import \{ MarketingLayout \} from/);
  assert.match(routes, /const MarketingLayout = withLazy\(\(\) => import\("\.\.\/features\/marketing\/MarketingLayout\.jsx"\)/);
});

test("marketing path helpers behave as before", async () => {
  const lean = await import("../src/features/marketing/routePaths.js");
  const full = await import("../src/features/marketing/paths.js");
  for (const path of ["/", "/chit-fund", "/chit-fund/schemes", "/finance/features/x", "/login", "/pay", "/dashboard", "/accounting", "/accounts", "/pricing/"]) {
    assert.equal(full.isMarketingPath(path), lean.isMarketingPath(path), path);
    assert.equal(full.isGuestThemePath(path), lean.isGuestThemePath(path), path);
  }
  assert.equal(lean.isMarketingPath("/chit-fund/schemes"), false);
  assert.equal(lean.isMarketingPath("/pricing"), true);
  assert.equal(typeof full.featurePath, "function");
  assert.equal(full.marketingPaths, lean.marketingPaths);
});
