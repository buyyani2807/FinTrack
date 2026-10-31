import test from "node:test";
import assert from "node:assert/strict";
import {
  financeRolesAligned,
  ownerChromeAllowed,
  sessionUserRole,
  workspaceAccess,
  workspaceChromeAllowed,
  workspaceSessionAllowed,
} from "../src/features/finance/model/workspaceAccess.js";
import { workspaceModuleAccess } from "../src/features/workspace/paths.js";

test("accounts-team users are financiers for session role", () => {
  assert.equal(sessionUserRole("accounts"), "financier");
  assert.equal(sessionUserRole("owner"), "financier");
  assert.equal(sessionUserRole("staff"), "agent");
});

test("financier session aligns with owner and accounts workspace roles", () => {
  assert.equal(financeRolesAligned("financier", "owner"), true);
  assert.equal(financeRolesAligned("financier", "accounts"), true);
  assert.equal(financeRolesAligned("financier", "staff"), false);
  assert.equal(financeRolesAligned("agent", "accounts"), false);
});

test("owner chrome is owner-only; workspace chrome includes accounts-team", () => {
  assert.equal(ownerChromeAllowed("financier", "owner"), true);
  assert.equal(ownerChromeAllowed("financier", "accounts"), false);
  assert.equal(workspaceChromeAllowed("financier", "owner"), true);
  assert.equal(workspaceChromeAllowed("financier", "accounts"), true);
  assert.equal(workspaceChromeAllowed("agent", "staff"), false);
});

test("workspace access helpers recognize accounts role", () => {
  assert.deepEqual(workspaceAccess({ role: "accounts" }), {
    roleKnown: true,
    isOwner: false,
    isStaff: false,
    isAccountsUser: true,
  });
  assert.equal(workspaceSessionAllowed({ role: "accounts", active: true }), true);
  assert.equal(workspaceSessionAllowed({ role: "accounts", active: false }), false);
});

test("accounts-team module access is Accounts only", () => {
  const access = workspaceModuleAccess({ featurePacks: ["full"] }, { role: "accounts" });
  assert.equal(access.isOwner, false);
  assert.equal(access.isAccountsUser, true);
  assert.equal(access.accounts, true);
  assert.equal(access.daily, false);
  assert.equal(access.monthly, false);
  assert.equal(access.chit, false);
  assert.equal(access.cashbook, false);
});
