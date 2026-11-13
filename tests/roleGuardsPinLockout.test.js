import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/141_role_guards_and_pin_lockout.sql", import.meta.url), "utf8");
const body = name => {
  const start = sql.indexOf(`function public.${name}(`);
  assert.ok(start > 0, `${name} is defined`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

test("Accounts role checks are false, not NULL, for users without an Accounts role", () => {
  for (const name of ["can_accounts_admin", "can_accounts_write", "can_accounts_read"]) {
    assert.match(body(name), /coalesce\(public\.accounts_access_role\(\)/, name);
    assert.match(body(name), /, false\)/, name);
  }
});

test("only the owner can switch accounting integration", () => {
  assert.match(body("acc_set_integration"), /acc_require_admin\(\)/);
  assert.doesNotMatch(body("acc_set_integration"), /acc_require_owner\(\)/);
});

test("a wrong portal PIN keeps the failed-attempt count instead of raising", () => {
  for (const name of ["customer_portal_login", "chit_customer_portal_login", "agent_portal_login"]) {
    const fn = body(name);
    const wrongPin = fn.slice(fn.indexOf("failed_attempts = failed_attempts + 1"));
    const branchEnd = wrongPin.indexOf("end if;");
    const branch = wrongPin.slice(0, branchEnd);
    assert.doesNotMatch(branch, /raise exception/, `${name} must not raise after counting a failure`);
    assert.match(branch, /return /, `${name} returns after counting a failure`);
  }
});

test("portal sign-in turns an { error } result back into a thrown error", async () => {
  const { portalResult } = await import("../src/lib/portalResult.js");
  assert.throws(() => portalResult({ error: "Invalid portal ID or PIN" }), /Invalid portal ID or PIN/);
  assert.deepEqual(portalResult({ id: "x" }), { id: "x" });
});
