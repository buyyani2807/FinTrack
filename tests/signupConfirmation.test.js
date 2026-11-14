import test from "node:test";
import assert from "node:assert/strict";
import {
  CLEARED_PENDING_WORKSPACE,
  confirmationRedirect,
  isEmailNotConfirmed,
  pendingWorkspace,
  pendingWorkspaceMetadata,
  signupOutcome,
} from "../api/_lib/signupConfirmation.js";

test("signup with a session signs the owner in at once", () => {
  assert.equal(signupOutcome({ access_token: "a", refresh_token: "r", user: { id: "u1" } }), "session");
});

test("signup without a session waits for email confirmation", () => {
  assert.equal(signupOutcome({ id: "u1", email: "owner@shop.in", identities: [{ id: "i1" }] }), "confirm");
  assert.equal(signupOutcome({ user: { id: "u1", identities: [{ id: "i1" }] } }), "confirm");
});

test("signup for a registered email is reported as existing", () => {
  assert.equal(signupOutcome({ id: "fake", email: "owner@shop.in", identities: [] }), "exists");
});

test("business details wait in metadata and are read back at first sign-in", () => {
  const data = pendingWorkspaceMetadata({ businessName: "  Sri Lakshmi Finance ", fullName: " Ravi Teja ", inviteCode: "" });
  assert.deepEqual(data, { pending_business_name: "Sri Lakshmi Finance", pending_full_name: "Ravi Teja", pending_invite_code: null });
  assert.deepEqual(pendingWorkspace({ user_metadata: data }), { businessName: "Sri Lakshmi Finance", fullName: "Ravi Teja", inviteCode: null });
});

test("users without saved business details have nothing pending", () => {
  assert.equal(pendingWorkspace(null), null);
  assert.equal(pendingWorkspace({ user_metadata: {} }), null);
  assert.equal(pendingWorkspace({ user_metadata: CLEARED_PENDING_WORKSPACE }), null);
  assert.equal(pendingWorkspace({ user_metadata: { pending_business_name: "Shop" } }), null);
});

test("confirmation link lands on the login page of the app origin", () => {
  assert.equal(confirmationRedirect("https://staging-fintrack.vercel.app/"), "https://staging-fintrack.vercel.app/login?confirmed=1");
  assert.equal(confirmationRedirect(""), "");
});

test("unconfirmed sign-in is recognised from the Supabase message", () => {
  assert.equal(isEmailNotConfirmed("Email not confirmed"), true);
  assert.equal(isEmailNotConfirmed("Invalid login credentials"), false);
});
