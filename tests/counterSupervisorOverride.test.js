import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/144_counter_supervisor_override.sql", import.meta.url), "utf8");
const counter = readFileSync(new URL("../src/features/accounts/components/CounterWorkspace.jsx", import.meta.url), "utf8");
const product = readFileSync(new URL("../src/features/accounts/AccountingProduct.jsx", import.meta.url), "utf8");
const fn = name => {
  const start = sql.indexOf(`function public.${name}(`);
  assert.ok(start > 0, `${name} is defined`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

test("only the owner sets the supervisor PIN, stored as a hash", () => {
  const body = fn("acc_set_counter_supervisor_pin");
  assert.match(body, /acc_require_admin\(\)/);
  assert.match(body, /crypt\(pin, gen_salt\('bf'\)\)/);
  assert.match(body, /\^\[0-9\]\{4,8\}\$/);
  assert.match(sql, /revoke all on public\.acc_counter_supervisor_pins from anon, authenticated/);
});

test("a wrong supervisor PIN is counted and locks after 5 tries without raising", () => {
  const body = fn("acc_counter_override");
  const wrong = body.slice(body.indexOf("failed_attempts = failed_attempts + 1"));
  const branch = wrong.slice(0, wrong.indexOf("end if;"));
  assert.match(branch, /failed_attempts \+ 1 >= 5 then now\(\) \+ interval '15 minutes'/);
  assert.doesNotMatch(branch, /raise exception/);
  assert.match(branch, /return jsonb_build_object\('error'/);
});

test("approvals are single-use, short-lived and tied to the cashier", () => {
  assert.match(fn("acc_counter_override"), /now\(\) \+ interval '2 minutes'/);
  const guard = fn("acc_cashier_guard_voucher");
  assert.match(guard, /o\.requested_by = auth\.uid\(\)/);
  assert.match(guard, /o\.used_at is null and o\.expires_at > now\(\)/);
  assert.match(guard, /set used_at = now\(\)/);
  assert.match(guard, /A Counter return needs the supervisor PIN/);
  assert.match(guard, /Voiding a Counter bill needs the supervisor PIN/);
  assert.match(guard, /o\.voucher_id = old\.id/);
  assert.match(sql, /revoke insert, update, delete on public\.acc_counter_overrides from anon, authenticated/);
});

test("Counter sales still use the real voucher type", () => {
  assert.match(fn("acc_cashier_guard_voucher"), /voucher_type not in \('sales', 'credit_note'\)/);
});

test("the cashier Counter asks for the supervisor PIN for voids and returns", () => {
  assert.match(product, /canManage=\{false\}\s+needsSupervisor/);
  assert.match(counter, /action: "void"/);
  assert.match(counter, /action: "return"/);
  assert.match(counter, /canManage \|\| needsSupervisor \? \(/);
});
