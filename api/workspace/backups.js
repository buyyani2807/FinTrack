/* global process */
// Owner workspace backups + nightly cron (merged for Vercel Hobby 12-function limit).
// `/api/cron/workspace-backups` rewrites here in vercel.json.
import {
  anonKey,
  callerOwnerProfile,
  createWorkspaceBackup,
  downloadBackupObject,
  getBackupRow,
  listBackupRows,
  listOrgsForScheduledBackup,
  parseWorkspaceBackup,
  pruneOldBackups,
  restoreWorkspaceBackup,
  serviceKey,
  supabaseUrl,
} from "../_lib/workspaceBackup.js";

const json = (res, status, body) => res.status(status).json(body);

const missingConfig = () => [
  !supabaseUrl() && "VITE_SUPABASE_URL (or SUPABASE_URL)",
  !anonKey() && "VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)",
  !serviceKey() && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean);

function cronAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const header = String(req.headers.authorization || "");
  if (secret && header === `Bearer ${secret}`) return true;
  if (secret && String(req.query?.secret || "") === secret) return true;
  return false;
}

async function runScheduledBackups(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }
  if (!supabaseUrl() || !serviceKey()) {
    return json(res, 500, { error: "Supabase is not configured for scheduled backups." });
  }
  if (!cronAuthorized(req)) {
    return json(res, 401, { error: "Unauthorized cron call." });
  }

  const orgs = await listOrgsForScheduledBackup().catch(() => []);
  const results = [];
  for (const org of orgs) {
    try {
      const status = org.subscription_status;
      if (status === "expired" || status === "cancelled") {
        results.push({ orgId: org.id, skipped: true, reason: status });
        continue;
      }
      const { row } = await createWorkspaceBackup({
        orgId: org.id,
        kind: "scheduled",
        createdBy: null,
        note: "Scheduled nightly backup (00:00 IST)",
      });
      await pruneOldBackups(org.id).catch(() => {});
      results.push({ orgId: org.id, backupId: row.id, ok: true, modules: row.module_keys });
    } catch (err) {
      results.push({ orgId: org.id, ok: false, error: err.message || "backup failed" });
    }
  }

  return json(res, 200, {
    ok: true,
    ranAt: new Date().toISOString(),
    orgCount: orgs.length,
    results,
  });
}

async function setSchedule(orgId, enabled) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/organizations?id=eq.${orgId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ backup_schedule_enabled: Boolean(enabled) }),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(rows?.message || "Could not update backup schedule.");
  return Array.isArray(rows) ? rows[0] : rows;
}

async function readSchedule(orgId) {
  const response = await fetch(
    `${supabaseUrl()}/rest/v1/organizations?id=eq.${orgId}&select=backup_schedule_enabled&limit=1`,
    {
      headers: {
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
      },
    },
  );
  const rows = await response.json().catch(() => []);
  return Boolean(Array.isArray(rows) ? rows[0]?.backup_schedule_enabled !== false : true);
}

export default async function handler(req, res) {
  // Cron Bearer secret must be checked before treating the token as an owner JWT.
  if (cronAuthorized(req)) {
    return runScheduledBackups(req, res);
  }

  const missing = missingConfig();
  if (missing.length) {
    return json(res, 500, {
      error: `Workspace backups are not configured. Missing: ${missing.join(", ")}.`,
      missing,
    });
  }

  const auth = String(req.headers.authorization || "");
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return json(res, 401, { error: "Sign in required." });

  try {
    const profile = await callerOwnerProfile(accessToken);
    if (!profile) return json(res, 403, { error: "Only the business owner can manage workspace backups." });
    const orgId = profile.organization_id;

    if (req.method === "GET") {
      const backupId = String(req.query?.id || "").trim();
      if (backupId) {
        const row = await getBackupRow(orgId, backupId);
        if (!row) return json(res, 404, { error: "Backup not found." });
        if (String(req.query?.download || "") === "1") {
          const text = await downloadBackupObject(row.storage_path);
          const snapshot = parseWorkspaceBackup(text);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="myfintracker-backup-${orgId.slice(0, 8)}-${row.created_at.slice(0, 10)}.json"`,
          );
          return res.status(200).send(JSON.stringify(snapshot, null, 2));
        }
        return json(res, 200, { backup: row });
      }
      const [backups, scheduleEnabled] = await Promise.all([
        listBackupRows(orgId),
        readSchedule(orgId),
      ]);
      return json(res, 200, {
        backups,
        scheduleEnabled,
        scheduleNote: "Scheduled backups run every day at 00:00 India time (IST).",
      });
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "create").trim();
      if (action === "create") {
        const { row } = await createWorkspaceBackup({
          orgId,
          kind: "manual",
          createdBy: profile.userId,
          note: String(req.body?.note || "").trim() || "Manual backup",
        });
        return json(res, 200, {
          backup: row,
          message: "Workspace backup created. It includes every module that has data in this workspace.",
        });
      }
      if (action === "restore") {
        const backupId = String(req.body?.backupId || "").trim();
        if (!backupId) return json(res, 400, { error: "Choose a backup to restore." });
        const modules = Array.isArray(req.body?.modules) ? req.body.modules.map(String) : null;
        const result = await restoreWorkspaceBackup({
          orgId,
          backupId,
          actorId: profile.userId,
          modules,
        });
        return json(res, 200, {
          ok: true,
          restored: result.restored,
          message: "Workspace restored. A safety checkpoint backup was saved first.",
        });
      }
      if (action === "schedule") {
        const enabled = Boolean(req.body?.enabled);
        await setSchedule(orgId, enabled);
        return json(res, 200, {
          scheduleEnabled: enabled,
          message: enabled
            ? "Nightly backups at 00:00 IST are on."
            : "Nightly backups are off. You can still create a backup any time.",
        });
      }
      return json(res, 400, { error: "Unknown backup action." });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    return json(res, 400, { error: err.message || "Backup request failed." });
  }
}
