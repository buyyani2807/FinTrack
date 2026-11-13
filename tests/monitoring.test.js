import test from "node:test";
import assert from "node:assert/strict";
import { scrubEvent, scrubText, scrubUrl } from "../src/lib/monitoring.js";

test("scrubText removes phones, emails, PAN, Aadhaar and JWTs", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
  const out = scrubText(`call 9876543210 or +91 9123456789, mail ravi@example.com, PAN ABCDE1234F, Aadhaar 1234 5678 9012, token ${jwt}`);
  for (const leaked of ["9876543210", "9123456789", "ravi@example.com", "ABCDE1234F", "1234 5678 9012", jwt]) {
    assert.ok(!out.includes(leaked), leaked);
  }
  assert.match(out, /\[phone\].*\[email\].*\[pan\].*\[aadhaar\].*\[jwt\]/);
});

test("amounts and ids that are not personal stay readable", () => {
  assert.equal(scrubText("Charge ₹1,168.20 failed for SALE-000005"), "Charge ₹1,168.20 failed for SALE-000005");
});

test("scrubUrl drops query strings such as Supabase filters", () => {
  assert.equal(scrubUrl("https://x.supabase.co/rest/v1/customers?phone=eq.9876543210&select=*"), "https://x.supabase.co/rest/v1/customers");
});

test("scrubEvent strips request data, user identity fields and secret keys", () => {
  const event = scrubEvent({
    user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
    request: { url: "https://app/x?pin=123456", headers: { Authorization: "Bearer x" }, cookies: "c" },
    message: "Login failed for 9876543210",
    exception: { values: [{ type: "Error", value: "PIN 123456 wrong for ravi@example.com" }] },
    breadcrumbs: [{ category: "fetch", message: "GET", data: { url: "https://x/rest/v1/p?phone=eq.9876543210", input_pin: "4826", company: "Acme" } }],
    extra: { payload: { pan: "ABCDE1234F", company_id: "c1", note: "ok" } },
  });
  assert.deepEqual(event.user, { id: "u1" });
  assert.deepEqual(event.request, { url: "https://app/x" });
  assert.equal(event.message, "Login failed for [phone]");
  assert.ok(!event.exception.values[0].value.includes("ravi@example.com"));
  assert.equal(event.breadcrumbs[0].data.url, "https://x/rest/v1/p");
  assert.equal(event.breadcrumbs[0].data.input_pin, "[removed]");
  assert.equal(event.breadcrumbs[0].data.company, "Acme");
  assert.equal(event.extra.payload.pan, "[removed]");
  assert.equal(event.extra.payload.company_id, "c1");
});
