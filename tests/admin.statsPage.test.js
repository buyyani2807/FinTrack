import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Admin signup-stats page: not in any nav menu, and shows the same "not available"
// state for anyone the server-side admin_signup_stats RPC rejects — access is
// enforced in Postgres (supabase/153_admin_platform_stats.sql), not by hiding a link.
test("Admin stats route exists but is not referenced by any nav/menu label", () => {
  const routes = readFileSync(new URL("../src/app/AppRoutes.jsx", import.meta.url), "utf8");
  assert.match(routes, /path="\/admin\/platform-stats"/);
});

test("AdminStatsPage shows a plain not-available state on any RPC failure, with no leak of why", () => {
  const source = readFileSync(new URL("../src/features/admin/AdminStatsPage.jsx", import.meta.url), "utf8");
  assert.match(source, /catch\(\(\) => \{[\s\S]*?setState\("denied"\);/);
  assert.match(source, /This page isn't available\./);
});

test("The admin_signup_stats SQL function checks identity server-side via is_platform_admin, not a user-editable role", () => {
  const sql = readFileSync(new URL("../supabase/153_admin_platform_stats.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.is_platform_admin\(\)/);
  assert.match(sql, /u\.email = '[^']+@[^']+'/);
  assert.match(sql, /if not public\.is_platform_admin\(\) then\s*\n\s*raise exception 'Not authorized';/);
  // Must not key off profiles.role / any client-settable flag.
  assert.doesNotMatch(sql, /profiles\.role = 'owner'/);
});
