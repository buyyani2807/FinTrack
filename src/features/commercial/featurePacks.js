/** Vertical / commercial feature packs — same codebase, configurable surfaces. */

export const FEATURE_PACKS = {
  finance: {
    id: "finance",
    label: "FinTrack Finance",
    modules: ["dashboard", "daily", "monthly", "reports", "receipts", "ai"],
  },
  chit: {
    id: "chit",
    label: "FinTrack Chit",
    modules: ["dashboard", "chit", "reports", "receipts", "ai"],
  },
  business: {
    id: "business",
    label: "FinTrack Business",
    modules: ["dashboard", "accounts", "cashbook", "reports", "receipts", "ai"],
  },
  full: {
    id: "full",
    label: "FinTrack Full",
    modules: ["dashboard", "daily", "monthly", "chit", "accounts", "cashbook", "reports", "receipts", "ai"],
  },
};

export const DEFAULT_ENTITLEMENTS = {
  plan: "pro_pilot",
  packs: ["full"],
  limits: {
    companies: 5,
    users: 10,
    vouchersPerMonth: null,
    // Caps WhatsApp Cloud API sends per org per month (wa.me handoff stays unlimited).
    // Alias: entitlementLimits.whatsappSendsPerMonth is accepted by resolveEntitlements.
    whatsappOpensPerMonth: null,
    aiRefreshesPerDay: null,
    inventoryItems: null,
    backupsPerMonth: 30,
  },
};

/** Monthly Cloud API send cap from org settings (null = unlimited). */
export function whatsappApiSendsPerMonth(settings = {}) {
  const raw = settings?.entitlementLimits && typeof settings.entitlementLimits === "object"
    ? settings.entitlementLimits
    : {};
  const value = raw.whatsappSendsPerMonth ?? raw.whatsappOpensPerMonth
    ?? settings?.whatsappSendsPerMonth
    ?? settings?.whatsappOpensPerMonth
    ?? null;
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveEnabledModules(settings = {}) {
  const packs = settings.featurePacks?.length ? settings.featurePacks : ["full"];
  const enabled = new Set();
  for (const packId of packs) {
    const pack = FEATURE_PACKS[packId];
    if (!pack) continue;
    for (const moduleId of pack.modules) enabled.add(moduleId);
  }
  if (settings.moduleOverrides) {
    for (const [moduleId, on] of Object.entries(settings.moduleOverrides)) {
      if (on) enabled.add(moduleId);
      else enabled.delete(moduleId);
    }
  }
  if (!enabled.size) return new Set(FEATURE_PACKS.full.modules);
  return enabled;
}

export function isModuleEnabled(settings, moduleId) {
  return resolveEnabledModules(settings).has(moduleId);
}

/** Documented SaaS tiers — architecture only until billing is wired. */
export const SAAS_TIER_BLUEPRINT = {
  trial: { days: 14, packs: ["full"], note: "Full product for evaluation; soft limits only." },
  basic: { packs: ["finance"], limits: { companies: 1, users: 2 } },
  pro: { packs: ["finance", "chit"], limits: { companies: 3, users: 5 } },
  business: { packs: ["full"], limits: { companies: 10, users: 20 } },
};
