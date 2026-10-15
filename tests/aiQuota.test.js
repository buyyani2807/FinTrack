import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { readFileSync } from "node:fs";
import { refuseOverQuota, takeAiQuota } from "../api/_lib/aiQuota.js";

const env = { supabaseUrl: "https://example.supabase.co", anonKey: "anon" };
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  return res;
}

test("AI quota passes the user's token and the kind of call to Supabase", async () => {
  let seen = null;
  const quota = await takeAiQuota("user-token", "bill_scan", {
    ...env,
    fetchImpl: async (url, options) => { seen = { url, options }; return { ok: true, json: async () => ({ allowed: true, remainingToday: 5 }) }; },
  });
  assert.deepEqual(quota, { allowed: true, checked: true, scope: "", retryAfter: 0 });
  assert.equal(seen.url, "https://example.supabase.co/rest/v1/rpc/ai_take_quota");
  assert.equal(seen.options.headers.Authorization, "Bearer user-token");
  assert.deepEqual(JSON.parse(seen.options.body), { input_kind: "bill_scan" });
});

test("a refused AI call becomes a 429 with Retry-After", async () => {
  const quota = await takeAiQuota("t", "bookkeeper", { ...env, fetchImpl: reply(200, { allowed: false, scope: "minute", retryAfter: 42 }) });
  const res = fakeRes();
  assert.equal(refuseOverQuota(res, quota), true);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "42");
  assert.match(res.body.error, /Try again in a minute/);

  const daily = fakeRes();
  refuseOverQuota(daily, { allowed: false, scope: "day", retryAfter: 3600 });
  assert.match(daily.body.error, /today's AI limit/);
  assert.equal(refuseOverQuota(fakeRes(), { allowed: true }), false);
});

test("AI calls go ahead when the limit cannot be checked", async () => {
  assert.equal((await takeAiQuota("t", "bookkeeper", { ...env, fetchImpl: reply(404, { code: "PGRST202" }) })).allowed, true);
  assert.equal((await takeAiQuota("t", "bookkeeper", { ...env, fetchImpl: async () => { throw new Error("offline"); } })).allowed, true);
  assert.equal((await takeAiQuota("t", "bookkeeper", { ...env, fetchImpl: reply(200, "not json") })).allowed, true);
  assert.equal((await takeAiQuota("t", "bookkeeper", { supabaseUrl: "", anonKey: "", fetchImpl: reply(200, { allowed: false }) })).allowed, true);
});

test("migration 100 keeps AI usage private and checked on the server", () => {
  const sql = readFileSync(new URL("../supabase/100_ai_rate_limit.sql", import.meta.url), "utf8");
  assert.match(sql, /alter table public\.ai_usage enable row level security/);
  assert.match(sql, /revoke all on public\.ai_usage from anon, authenticated/);
  assert.match(sql, /security definer set search_path = public/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /revoke all on function public\.ai_take_quota\(text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.ai_take_quota\(text\) to authenticated/);
  const columns = sql.match(/create table if not exists public\.ai_usage \(([\s\S]*?)\n\);/)[1];
  assert.doesNotMatch(columns, /prompt|text_|photo|narration|payload/i);
});

test("the bookkeeper endpoint does not call Gemini once the user is over the limit", async () => {
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "anon";
  process.env.GEMINI_API_KEY = "test-key";
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).endsWith("/auth/v1/user")) return { ok: true, json: async () => ({ id: "u1" }) };
    if (String(url).endsWith("/rpc/ai_take_quota")) return { ok: true, json: async () => ({ allowed: false, scope: "minute", retryAfter: 30 }) };
    throw new Error(`Unexpected call to ${url}`);
  };
  try {
    const { default: handler } = await import(`../api/accounts/bookkeeper.js?quota=${Date.now()}`);
    const res = fakeRes();
    await handler({ method: "POST", headers: { authorization: "Bearer t" }, body: { text: "Paid rent 25000 by UPI" } }, res);
    assert.equal(res.statusCode, 429);
    assert.ok(!calls.some(url => url.includes("generativelanguage")));
  } finally {
    globalThis.fetch = realFetch;
  }
});
