import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWaTo } from "../api/_lib/whatsappGraph.js";
import { decryptWhatsAppToken, encryptWhatsAppToken } from "../api/_lib/whatsappCrypto.js";
import {
  buildMetaTemplateComponents,
  metaTemplateForKey,
} from "../src/features/receipts/model/whatsappCloudTemplates.js";
import { whatsappApiSendsPerMonth } from "../src/features/commercial/featurePacks.js";
import { resolveEntitlements } from "../src/features/commercial/entitlements.js";
import { idempotencyKey, resolveWhatsAppMonthlyCap } from "../api/_lib/whatsappHelpers.js";
import webhookHandler from "../api/whatsapp.js";
import { openManualWhatsAppShare, whatsAppShareUrl } from "../src/features/receipts/io/receiptWhatsApp.js";

test("normalizes WhatsApp destination phones for Graph API", () => {
  assert.equal(normalizeWaTo("9876543210"), "919876543210");
  assert.equal(normalizeWaTo("+91 98765 43210"), "919876543210");
  assert.equal(normalizeWaTo(""), "");
});

test("maps FinTrack receipt variables onto Meta template body params", () => {
  const components = buildMetaTemplateComponents("payment_receipt", {
    customer_name: "Ravi",
    amount: "5000",
    receipt_number: "FT-1",
    account_id: "A-1",
    payment_date: "06-Nov-2026",
    remaining_balance: "0",
    company_name: "Demo Finance",
  });
  assert.equal(metaTemplateForKey("payment_receipt")?.name, "payment_receipt");
  assert.equal(components[0].type, "body");
  assert.equal(components[0].parameters[0].text, "Ravi");
  assert.equal(components[0].parameters[6].text, "Demo Finance");
});

test("idempotency key is stable for the same source and kind", () => {
  const a = idempotencyKey({
    sourceType: "receipt",
    sourceId: "pay-1",
    kind: "receipt",
    templateKey: "payment_receipt",
  });
  const b = idempotencyKey({
    sourceType: "receipt",
    sourceId: "pay-1",
    kind: "receipt",
    templateKey: "payment_receipt",
  });
  assert.equal(a, "receipt:pay-1:receipt:payment_receipt");
  assert.equal(a, b);
  assert.equal(idempotencyKey({ sourceType: "", sourceId: "x" }), "");
});

test("encrypts and decrypts Cloud API tokens with the workspace key", () => {
  const previous = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = "fintrack-test-whatsapp-key";
  try {
    const cipher = encryptWhatsAppToken("EAAB_test_token");
    assert.match(cipher, /^v1:/);
    assert.equal(decryptWhatsAppToken(cipher), "EAAB_test_token");
    assert.equal(decryptWhatsAppToken("garbage"), "");
  } finally {
    if (previous == null) delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
    else process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = previous;
  }
});

test("feature pack whatsappOpensPerMonth gates Cloud API sends", () => {
  assert.equal(whatsappApiSendsPerMonth({}), null);
  assert.equal(whatsappApiSendsPerMonth({ entitlementLimits: { whatsappOpensPerMonth: 100 } }), 100);
  assert.equal(whatsappApiSendsPerMonth({ entitlementLimits: { whatsappSendsPerMonth: 50 } }), 50);
  const entitlements = resolveEntitlements({ entitlementLimits: { whatsappSendsPerMonth: 25 } });
  assert.equal(entitlements.limits.whatsappOpensPerMonth, 25);
  assert.equal(resolveWhatsAppMonthlyCap({
    moduleOverrides: { entitlementLimits: { whatsappOpensPerMonth: 40 } },
    envCap: 10,
  }), 40);
  assert.equal(resolveWhatsAppMonthlyCap({ moduleOverrides: {}, envCap: 10 }), 10);
});

test("webhook verify challenge succeeds with the configured token", async () => {
  const previous = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-me";
  let status = 0;
  let body = null;
  const res = {
    status(code) { status = code; return this; },
    send(value) { body = value; return this; },
    json(value) { body = value; return this; },
  };
  try {
    await webhookHandler({
      method: "GET",
      query: {
        route: "webhook",
        "hub.mode": "subscribe",
        "hub.verify_token": "verify-me",
        "hub.challenge": "12345",
      },
    }, res);
    assert.equal(status, 200);
    assert.equal(body, "12345");

    await webhookHandler({
      method: "GET",
      query: {
        route: "webhook",
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong",
        "hub.challenge": "12345",
      },
    }, res);
    assert.equal(status, 403);
  } finally {
    if (previous == null) delete process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    else process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = previous;
  }
});

test("wa.me manual share still builds a click-to-chat URL", () => {
  const url = whatsAppShareUrl("9876543210", "Hello");
  assert.match(url, /^https:\/\/wa\.me\/919876543210\?text=/);
  const opened = openManualWhatsAppShare({ phone: "9876543210", message: "Hello" });
  // In node tests there is no window, so open falls back to copy/handoff without crash.
  assert.equal(typeof opened.opened, "boolean");
  assert.ok(opened.reason === "opened" || opened.reason === "open_failed");
});

test("send route requires a signed-in session", async () => {
  const { default: sendHandler } = await import("../api/whatsapp.js");
  let status = 0;
  let body = null;
  const res = {
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  };
  await sendHandler({
    method: "POST",
    headers: {},
    query: { route: "send" },
    body: { to: "9876543210", message: "hi" },
  }, res);
  assert.equal(status, 401);
  assert.match(String(body?.error || ""), /sign in/i);
});
