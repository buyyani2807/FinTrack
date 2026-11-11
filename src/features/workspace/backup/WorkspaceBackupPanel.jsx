import { useEffect, useState } from "react";
import { Button } from "../../../components/ui.jsx";
import {
  createWorkspaceBackup,
  downloadWorkspaceBackup,
  listWorkspaceBackups,
  restoreWorkspaceBackup,
  setWorkspaceBackupSchedule,
} from "../../../lib/workspaceBackupRepository.js";

const MODULE_LABELS = {
  finance: "Daily + Monthly Finance",
  cashbook: "Cashbook",
  chit: "Chit Fund",
  accounts: "Accounts",
};

const kindLabel = kind => ({
  manual: "Manual",
  scheduled: "Nightly",
  pre_restore: "Safety checkpoint",
}[kind] || kind);

const formatBytes = value => {
  const n = Number(value || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export function WorkspaceBackupPanel({ token }) {
  const [backups, setBackups] = useState([]);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRestoreId, setConfirmRestoreId] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listWorkspaceBackups(token);
      setBackups(data.backups || []);
      setScheduleEnabled(data.scheduleEnabled !== false);
    } catch (err) {
      setError(err.message || "Could not load backups.");
      setBackups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    refresh();
    return undefined;
  }, [token]);

  const run = async (work, success) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      setNotice(typeof success === "function" ? success(result) : success);
      await refresh();
      return result;
    } catch (err) {
      setError(err.message || "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card settings-section">
      <header className="settings-section-head">
        <div>
          <h2>Workspace backup & restore</h2>
          <p>
            Back up every module this workspace uses — Finance, Cashbook, Chit Fund, and Accounts — then restore if data is wrong.
            Nightly backups run at 00:00 India time. Copies older than 14 days are removed, including manual backups and safety checkpoints.
          </p>
        </div>
      </header>

      <div className="form spacer">
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <Button
            className="primary"
            disabled={busy}
            onClick={() => run(() => createWorkspaceBackup(token, "Manual backup"), "Backup created for all modules with data.")}
          >
            {busy ? "Working…" : "Back up now"}
          </Button>
          <label className="settings-switch-row" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={scheduleEnabled}
              disabled={busy}
              onChange={event => run(
                () => setWorkspaceBackupSchedule(token, event.target.checked),
                event.target.checked ? "Nightly backups turned on (00:00 IST)." : "Nightly backups turned off.",
              )}
            />
            <span className="settings-list-text">
              <strong>Nightly backup at midnight (IST)</strong>
              <span className="small">Keeps the last 14 days of nightly, manual, and safety copies.</span>
            </span>
          </label>
        </div>
      </div>

      {error ? <p className="red small" role="alert">{error}</p> : null}
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      {loading ? <p className="small">Loading backups…</p> : null}

      {!loading && !backups.length ? (
        <p className="small">No backups yet. Create one now, or wait for the nightly run.</p>
      ) : null}

      {backups.length ? (
        <div className="table spacer">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Modules</th>
                <th>Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backups.map(row => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString("en-IN")}</td>
                  <td>
                    {kindLabel(row.kind)}
                    {row.note ? <div className="small">{row.note}</div> : null}
                  </td>
                  <td>{(row.module_keys || []).map(key => MODULE_LABELS[key] || key).join(", ") || "—"}</td>
                  <td>{formatBytes(row.bytes)}</td>
                  <td>
                    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                      <Button disabled={busy} onClick={() => run(() => downloadWorkspaceBackup(token, row.id), "Backup downloaded.")}>
                        Download
                      </Button>
                      {confirmRestoreId === row.id ? (
                        <>
                          <Button
                            className="primary"
                            disabled={busy}
                            onClick={() => run(
                              () => restoreWorkspaceBackup(token, { backupId: row.id }),
                              "Workspace restored. Sign out and back in if a screen looks stale.",
                            ).then(() => setConfirmRestoreId(""))}
                          >
                            Confirm restore
                          </Button>
                          <Button disabled={busy} onClick={() => setConfirmRestoreId("")}>Cancel</Button>
                        </>
                      ) : (
                        <Button disabled={busy} onClick={() => setConfirmRestoreId(row.id)}>Restore…</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="small">
        Restore replaces the live data for modules in that backup. A safety checkpoint is the live workspace
        immediately before that restore — if you restored twice, use the checkpoint from the first restore,
        not a newer one. Only the owner can back up or restore.
      </p>
    </section>
  );
}
