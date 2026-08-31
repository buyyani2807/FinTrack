import test from "node:test";
import assert from "node:assert/strict";
import { sessionUserRole, workspaceAccess } from "../src/features/finance/workspaceAccess.js";

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
