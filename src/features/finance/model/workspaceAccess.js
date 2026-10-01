export function workspaceAccess(workspace) {
  const role = workspace?.role;
  return {
    roleKnown: role === "owner" || role === "staff",
    isOwner: role === "owner",
    isStaff: role === "staff",
  };
}

export function sessionUserRole(workspaceRole) {
  return workspaceRole === "staff" ? "agent" : "financier";
}

export function financeRolesAligned(userRole, workspaceRole) {
  if (userRole === "agent") return workspaceRole === "staff";
  if (userRole === "financier") return workspaceRole === "owner";
  return true;
}

export function ownerChromeAllowed(userRole, workspaceRole) {
  return userRole === "financier" && workspaceRole === "owner";
}

export function collectionDetailVisibility(isOwner) {
  return {
    showDisbursedAmount: Boolean(isOwner),
    showCustomerStatement: Boolean(isOwner),
  };
}

export function workspaceSessionAllowed(workspace) {
  if (!workspace || workspace.active === false) return false;
  return workspace.role === "owner" || workspace.role === "staff";
}
