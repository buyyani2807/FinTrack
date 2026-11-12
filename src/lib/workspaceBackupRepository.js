async function callBackups(token, { method = "GET", query = "", body } = {}) {
  const response = await fetch(`/api/workspace/backups${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Backup request failed.");
  return data;
}

export const listWorkspaceBackups = token => callBackups(token);

export const createWorkspaceBackup = (token, note = "") =>
  callBackups(token, { method: "POST", body: { action: "create", note } });

export const restoreWorkspaceBackup = (token, { backupId, modules = null }) =>
  callBackups(token, { method: "POST", body: { action: "restore", backupId, modules } });

export const setWorkspaceBackupSchedule = (token, enabled) =>
  callBackups(token, { method: "POST", body: { action: "schedule", enabled } });

export async function downloadWorkspaceBackup(token, backupId) {
  const response = await fetch(`/api/workspace/backups?id=${encodeURIComponent(backupId)}&download=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Could not download the backup.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `myfintracker-workspace-backup-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
