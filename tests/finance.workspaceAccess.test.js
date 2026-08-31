import test from "node:test";
import assert from "node:assert/strict";
import { collectionDetailVisibility, financeRolesAligned, ownerChromeAllowed, sessionUserRole, workspaceAccess, workspaceSessionAllowed } from "../src/features/finance/workspaceAccess.js";

test("owner tools stay hidden until the workspace role is known", () => {
  assert.deepEqual(workspaceAccess(null), { roleKnown: false, isOwner: false, isStaff: false });
  assert.deepEqual(workspaceAccess({}), { roleKnown: false, isOwner: false, isStaff: false });
  assert.equal(workspaceAccess({ role: "owner" }).isOwner, true);
  assert.equal(workspaceAccess({ role: "staff" }).isOwner, false);
  assert.equal(workspaceAccess({ role: "staff" }).isStaff, true);
});

test("sessionUserRole maps profile role without defaulting staff to financier", () => {
  assert.equal(sessionUserRole("staff"), "agent");
  assert.equal(sessionUserRole("owner"), "financier");
});

test("owner chrome is only allowed for a confirmed owner workspace", () => {
  const canShowOwnerChrome = workspace => workspaceAccess(workspace).isOwner;
  assert.equal(canShowOwnerChrome(null), false);
  assert.equal(canShowOwnerChrome({ role: "staff" }), false);
  assert.equal(canShowOwnerChrome({ role: "owner" }), true);
});

test("agent login stays blocked while a leftover owner workspace is still in memory", () => {
  assert.equal(financeRolesAligned("agent", "owner"), false);
  assert.equal(financeRolesAligned("agent", undefined), false);
  assert.equal(financeRolesAligned("agent", "staff"), true);
  assert.equal(financeRolesAligned("financier", "staff"), false);
  assert.equal(financeRolesAligned("financier", "owner"), true);
  assert.equal(ownerChromeAllowed("agent", "owner"), false);
  assert.equal(ownerChromeAllowed("financier", "owner"), true);
});

test("agents do not see disbursed amount or customer statements", () => {
  assert.deepEqual(collectionDetailVisibility(true), { showDisbursedAmount: true, showCustomerStatement: true });
  assert.deepEqual(collectionDetailVisibility(false), { showDisbursedAmount: false, showCustomerStatement: false });
});

test("inactive workspace sessions are not allowed", () => {
  assert.equal(workspaceSessionAllowed({ role: "staff", active: true }), true);
  assert.equal(workspaceSessionAllowed({ role: "owner", active: true }), true);
  assert.equal(workspaceSessionAllowed({ role: "staff", active: false }), false);
  assert.equal(workspaceSessionAllowed({ role: "owner", active: false }), false);
  assert.equal(workspaceSessionAllowed(null), false);
  assert.equal(workspaceSessionAllowed({ role: "staff" }), true);
});
