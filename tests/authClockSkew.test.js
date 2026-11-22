import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Measured on production (22 Nov 2026): right after sign-in, a request with the brand-new token
// got 401 PGRST303 "JWT issued at future", and the app paid ~1 s for a refresh through the
// server function before the dashboard could load.
const source = readFileSync(new URL("../src/lib/supabase.js", import.meta.url), "utf8");

test("'issued at future' waits and resends the same token before any refresh", () => {
  const wait = source.indexOf("isIssuedInFuture(body)) {");
  const refresh = source.indexOf("const refreshedToken = await refreshSession();");
  assert.ok(wait > 0 && refresh > wait, "the wait-and-resend branch must come before the refresh branch");
  assert.match(source, /return request\(path, options, accessToken, false, true\);/);
  assert.match(source, /!retried && !waited && isIssuedInFuture\(body\)/);
});

test("isIssuedInFuture only matches that error", async () => {
  const match = source.match(/export const isIssuedInFuture = (body => [^;]+);/);
  const isIssuedInFuture = eval(match[1]);
  assert.equal(isIssuedInFuture({ code: "PGRST303", message: "JWT issued at future" }), true);
  assert.equal(isIssuedInFuture({ code: "PGRST303", message: "JWT expired" }), false);
  assert.equal(isIssuedInFuture({ code: "PGRST301", message: "JWT issued at future" }), false);
  assert.equal(isIssuedInFuture(null), false);
});

test("serverless functions run in Mumbai, next to the users and Supabase", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(vercel.regions, ["bom1"]);
});
