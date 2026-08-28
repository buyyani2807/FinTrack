import test from "node:test";
import assert from "node:assert/strict";
import { isPublicSignupAllowed, signupInviteRequired, validateSignupInvite } from "../src/lib/signupGate.js";

test("public signup is allowed by default", () => {
  const original = process.env.VITE_ALLOW_PUBLIC_SIGNUP;
  delete process.env.VITE_ALLOW_PUBLIC_SIGNUP;
  assert.equal(isPublicSignupAllowed(), true);
  process.env.VITE_ALLOW_PUBLIC_SIGNUP = "false";
  assert.equal(isPublicSignupAllowed(), false);
  process.env.VITE_ALLOW_PUBLIC_SIGNUP = original;
});

test("invite validation accepts matching code when configured", () => {
  const original = process.env.VITE_SIGNUP_INVITE_CODE;
  process.env.VITE_SIGNUP_INVITE_CODE = "PILOT-2026";
  assert.equal(signupInviteRequired(), true);
  assert.equal(validateSignupInvite("PILOT-2026"), true);
  assert.equal(validateSignupInvite("wrong"), false);
  process.env.VITE_SIGNUP_INVITE_CODE = original;
});

test("invite validation passes when no invite code is configured", () => {
  const original = process.env.VITE_SIGNUP_INVITE_CODE;
  delete process.env.VITE_SIGNUP_INVITE_CODE;
  assert.equal(signupInviteRequired(), false);
  assert.equal(validateSignupInvite(""), true);
  process.env.VITE_SIGNUP_INVITE_CODE = original;
});
