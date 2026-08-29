import test from "node:test";
import assert from "node:assert/strict";

const hasViteEnv = typeof import.meta !== "undefined" && import.meta.env;

test("public signup is allowed by default", { skip: !hasViteEnv }, async () => {
  const { isPublicSignupAllowed } = await import("../src/lib/signupGate.js");
  assert.equal(isPublicSignupAllowed(), true);
});

test("invite validation passes when no invite code is configured", { skip: !hasViteEnv }, async () => {
  const { signupInviteRequired, validateSignupInvite } = await import("../src/lib/signupGate.js");
  assert.equal(signupInviteRequired(), false);
  assert.equal(validateSignupInvite(""), true);
  assert.equal(validateSignupInvite("anything"), true);
});
