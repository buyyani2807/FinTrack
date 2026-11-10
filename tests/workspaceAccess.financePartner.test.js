import assert from "node:assert/strict";
import {
  financePartnerChromeAllowed,
  financeRolesAligned,
  ownerChromeAllowed,
  sessionUserRole,
  workspaceAccess,
  workspaceChromeAllowed,
  workspaceSessionAllowed,
} from "../src/features/finance/model/workspaceAccess.js";
import { workspaceModuleAccess } from "../src/features/workspace/paths.js";

const partner = { role: "finance_partner", active: true };
const owner = { role: "owner", active: true };

assert.equal(workspaceAccess(partner).isFinancePartner, true);
assert.equal(workspaceAccess(partner).canViewOwnerFinance, true);
assert.equal(workspaceAccess(partner).canWriteFinance, false);
assert.equal(workspaceAccess(owner).canWriteFinance, true);

assert.equal(sessionUserRole("finance_partner"), "financier");
assert.equal(financeRolesAligned("financier", "finance_partner"), true);
assert.equal(ownerChromeAllowed("financier", "finance_partner"), false);
assert.equal(financePartnerChromeAllowed("financier", "finance_partner"), true);
assert.equal(workspaceChromeAllowed("financier", "finance_partner"), true);
assert.equal(workspaceSessionAllowed(partner), true);

const access = workspaceModuleAccess({ featurePacks: ["full"] }, partner, null);
assert.equal(access.isFinancePartner, true);
assert.equal(access.canViewOwnerFinance, true);
assert.equal(access.canWriteFinance, false);
assert.equal(access.showDaily, true);
assert.equal(access.showMonthly, true);
assert.equal(access.showChit, false);
assert.equal(access.showAccounts, false);
assert.equal(access.isOwner, false);

console.log("workspaceAccess.financePartner.test.js ok");
