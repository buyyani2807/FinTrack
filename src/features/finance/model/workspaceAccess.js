export function workspaceAccess(workspace) {
  const role = workspace?.role;
  return {
    roleKnown: role === "owner" || role === "staff" || role === "accounts" || role === "finance_partner",
    isOwner: role === "owner",
    isStaff: role === "staff",
    isAccountsUser: role === "accounts",
    isFinancePartner: role === "finance_partner",
    canViewOwnerFinance: role === "owner" || role === "finance_partner",
    canWriteFinance: role === "owner",
  };
}

export function sessionUserRole(workspaceRole) {
  if (workspaceRole === "staff") return "agent";
  // Owner, Accounts team (CA), and finance partners use email/password Owner sign-in.
  return "financier";
}

export function financeRolesAligned(userRole, workspaceRole) {
  if (userRole === "agent") return workspaceRole === "staff";
  if (userRole === "financier") {
    return workspaceRole === "owner" || workspaceRole === "accounts" || workspaceRole === "finance_partner";
  }
  return true;
}

export function ownerChromeAllowed(userRole, workspaceRole) {
  return userRole === "financier" && workspaceRole === "owner";
}

/** Owner full chrome, Accounts-team chrome, or finance partner chrome (Daily/Monthly view-only). */
export function workspaceChromeAllowed(userRole, workspaceRole) {
  return ownerChromeAllowed(userRole, workspaceRole)
    || (userRole === "financier" && workspaceRole === "accounts")
    || (userRole === "financier" && workspaceRole === "finance_partner");
}

export function financePartnerChromeAllowed(userRole, workspaceRole) {
  return userRole === "financier" && workspaceRole === "finance_partner";
}

export function collectionDetailVisibility(canViewOwnerFinance) {
  return {
    showDisbursedAmount: Boolean(canViewOwnerFinance),
    showCustomerStatement: Boolean(canViewOwnerFinance),
  };
}

export function workspaceSessionAllowed(workspace) {
  if (!workspace || workspace.active === false) return false;
  return workspace.role === "owner"
    || workspace.role === "staff"
    || workspace.role === "accounts"
    || workspace.role === "finance_partner";
}
