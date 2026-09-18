/**
 * Client entitlement helpers for SaaS hygiene.
 * Soft limits guide UX; billing is not wired yet — see SAAS_TIER_BLUEPRINT.
 */

import {
  DEFAULT_ENTITLEMENTS,
  FEATURE_PACKS,
  isModuleEnabled,
  resolveEnabledModules,
} from "./featurePacks.js";

export function resolveEntitlements(settings = {}) {
  const packs = settings.featurePacks?.length ? settings.featurePacks : DEFAULT_ENTITLEMENTS.packs;
  const limits = {
    ...DEFAULT_ENTITLEMENTS.limits,
    ...(settings.entitlementLimits && typeof settings.entitlementLimits === "object"
      ? settings.entitlementLimits
      : {}),
  };
  return {
    plan: settings.plan || DEFAULT_ENTITLEMENTS.plan,
    packs,
    modules: [...resolveEnabledModules(settings)],
    limits,
    billingWired: false,
  };
}

export function assertModuleEntitled(settings, moduleId) {
  if (isModuleEnabled(settings, moduleId)) return true;
  const packLabels = (settings.featurePacks || DEFAULT_ENTITLEMENTS.packs)
    .map(id => FEATURE_PACKS[id]?.label || id)
    .join(", ");
  throw new Error(
    `The “${moduleId}” module is not included in this workspace’s feature pack (${packLabels || "none"}). Ask the owner to enable it in organisation settings.`,
  );
}

export function canCreateAccountsCompany(settings, currentCompanyCount = 0) {
  const { limits } = resolveEntitlements(settings);
  const max = limits.companies;
  if (max == null) return { ok: true, limit: null, used: currentCompanyCount };
  return {
    ok: Number(currentCompanyCount) < Number(max),
    limit: Number(max),
    used: Number(currentCompanyCount),
  };
}

const BACKUP_USAGE_KEY = "fintrack-accounts-backup-usage-v1";

export function readBackupUsage(companyId) {
  if (typeof localStorage === "undefined" || !companyId) return { month: "", count: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(BACKUP_USAGE_KEY) || "{}");
    const row = raw[companyId] || {};
    return { month: String(row.month || ""), count: Number(row.count || 0) };
  } catch {
    return { month: "", count: 0 };
  }
}

export function recordBackupDownload(companyId, when = new Date()) {
  if (typeof localStorage === "undefined" || !companyId) return { month: "", count: 0 };
  const month = `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, "0")}`;
  try {
    const raw = JSON.parse(localStorage.getItem(BACKUP_USAGE_KEY) || "{}");
    const prev = raw[companyId] || {};
    const count = prev.month === month ? Number(prev.count || 0) + 1 : 1;
    raw[companyId] = { month, count };
    localStorage.setItem(BACKUP_USAGE_KEY, JSON.stringify(raw));
    return { month, count };
  } catch {
    return { month, count: 1 };
  }
}

export function assertBackupAllowed(settings, companyId) {
  const { limits } = resolveEntitlements(settings);
  const max = limits.backupsPerMonth;
  if (max == null) return { ok: true, used: 0, limit: null };
  const usage = readBackupUsage(companyId);
  const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const used = usage.month === month ? usage.count : 0;
  if (used >= Number(max)) {
    throw new Error(
      `Backup limit reached for this month (${used}/${max}). Export is a soft pilot limit until billing is connected.`,
    );
  }
  return { ok: true, used, limit: Number(max) };
}

export { isModuleEnabled, resolveEnabledModules, DEFAULT_ENTITLEMENTS, FEATURE_PACKS };
