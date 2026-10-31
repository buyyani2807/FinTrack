export function workspaceAccess(workspace) {
  const role = workspace?.role;
  return {
    roleKnown: role === "owner" || role === "staff" || role === "accounts",
    isOwner: role === "owner",
    isStaff: role === "staff",
    isAccountsUser: role === "accounts",
  };
}

export function sessionUserRole(workspaceRole) {
  if (workspaceRole === "staff") return "agent";
  // Owner and Accounts team (CA) both use email/password Owner sign-in.
  return "financier";
}

export function financeRolesAligned(userRole, workspaceRole) {
  if (userRole === "agent") return workspaceRole === "staff";
  if (userRole === "financier") return workspaceRole === "owner" || workspaceRole === "accounts";
  return true;
}

export function ownerChromeAllowed(userRole, workspaceRole) {
  return userRole === "financier" && workspaceRole === "owner";
}

/** Owner full chrome, or Accounts-team chrome (Accounts module only). */
export function workspaceChromeAllowed(userRole, workspaceRole) {
  return ownerChromeAllowed(userRole, workspaceRole)
    || (userRole === "financier" && workspaceRole === "accounts");
}

export function collectionDetailVisibility(isOwner) {
  return {
    showDisbursedAmount: Boolean(isOwner),
    showCustomerStatement: Boolean(isOwner),
  };
}

export function workspaceSessionAllowed(workspace) {
  if (!workspace || workspace.active === false) return false;
  return workspace.role === "owner" || workspace.role === "staff" || workspace.role === "accounts";
}
