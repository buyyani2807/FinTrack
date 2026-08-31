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
