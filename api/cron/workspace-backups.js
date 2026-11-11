/* global process */
// Nightly workspace backups for every org with backup_schedule_enabled.
// Vercel cron: 00:00 IST = 18:30 UTC previous day → "30 18 * * *"
import {
  createWorkspaceBackup,
  listOrgsForScheduledBackup,
  pruneOldBackups,
  serviceKey,
  supabaseUrl,
} from "../_lib/workspaceBackup.js";

const json = (res, status, body) => res.status(status).json(body);

function cronAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const header = String(req.headers.authorization || "");
  if (secret && header === `Bearer ${secret}`) return true;
  if (secret && String(req.query?.secret || "") === secret) return true;
  // Vercel Cron invokes with this header on configured schedules.
  if (String(req.headers["x-vercel-cron"] || "") === "1" && secret && header === `Bearer ${secret}`) return true;
  return false;
}

export default async function handler(req, res) {
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
      // Skip clearly expired trials with no paid path — still back up active/grandfathered/trialing.
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
