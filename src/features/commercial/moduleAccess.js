/**
 * Company/org module access resolution.
 *
 * Safety rules (must not break existing customers):
 * 1. Grandfathered orgs (subscription.grandfathered) → full access via feature packs.
 * 2. Active 14-day trial → full access (free trial continues).
 * 3. Orgs with no module entitlement rows → legacy feature_packs (default "full").
 * 4. Orgs with entitlement rows (module commerce) → only purchased products (+ trial override).
 */

import { isModuleEnabled, resolveEnabledModules } from "./featurePacks.js";
import {
  MODULE_PRODUCTS,
  appModulesFromProductKeys,
  productKeysSatisfy,
  unlockCopyForAppModule,
} from "./moduleProducts.js";
import { workspaceAccessAllowed } from "./trial.js";

export function subscriptionGrantsFullModules(subscription) {
  if (!subscription) return true; // missing payload: do not lock existing sessions
  if (subscription.grandfathered) return true;
  if (subscription.status === "trialing" && subscription.entitled !== false) return true;
  return false;
}

export function normalizeEntitlementRows(rows = []) {
  return (rows || [])
    .filter(row => row && (row.status === "active" || row.status == null))
    .map(row => ({
      id: row.id,
      organizationId: row.organization_id || row.organizationId,
      moduleKey: row.module_key || row.moduleKey,
      productKey: row.product_key || row.productKey || row.module_key || row.moduleKey,
      pricePaise: Number(row.price_paise ?? row.pricePaise ?? 0),
      currency: row.currency || "INR",
      period: row.billing_period || row.period || "lifetime",
      status: row.status || "active",
      purchasedAt: row.purchased_at || row.purchasedAt || "",
      startsAt: row.starts_at || row.startsAt || "",
      endsAt: row.ends_at || row.endsAt || "",
      paymentRef: row.payment_ref || row.paymentRef || "",
    }));
}

export function activeProductKeys(entitlements = []) {
  return [...new Set(normalizeEntitlementRows(entitlements).map(row => row.productKey).filter(Boolean))];
}

/**
 * @param {object} options
 * @param {object} options.orgSettings - featurePacks / moduleOverrides
 * @param {object} options.subscription - normalizeSubscription payload
 * @param {array} options.entitlements - organization_module_entitlements rows
 * @param {boolean} [options.moduleCommerce] - force commerce mode when entitlements exist
 */
export function resolveWorkspaceModuleState({
  orgSettings = {},
  subscription = null,
  entitlements = [],
} = {}) {
  const entitledRows = normalizeEntitlementRows(entitlements);
  const productKeys = activeProductKeys(entitledRows);
  const commerceActive = productKeys.length > 0;
  const trialOrLegacyFull = subscriptionGrantsFullModules(subscription);
  const packModules = resolveEnabledModules(orgSettings);

  let enabled;
  let mode;
  if (trialOrLegacyFull) {
    enabled = new Set(packModules);
    mode = subscription?.grandfathered ? "grandfathered" : subscription?.status === "trialing" ? "trial" : "legacy_full";
  } else if (commerceActive) {
    enabled = appModulesFromProductKeys(productKeys);
    // Always allow dashboard shell
    enabled.add("dashboard");
    mode = "modules";
  } else {
    enabled = new Set(packModules);
    mode = "legacy_packs";
  }

  return {
    mode,
    enabled,
    productKeys,
    entitlements: entitledRows,
    commerceActive,
    trialOrLegacyFull,
    workspaceEntitled: workspaceAccessAllowed(subscription),
  };
}

export function isAppModuleOpen(state, moduleId) {
  if (!state) return true;
  if (moduleId === "dashboard") return true;
  return state.enabled.has(moduleId);
}

export function moduleLockInfo(state, moduleId) {
  if (isAppModuleOpen(state, moduleId)) return null;
  return unlockCopyForAppModule(moduleId);
}

export function hasPurchasedProduct(state, productKey) {
  if (!state) return false;
  if (state.trialOrLegacyFull) return true;
  return productKeysSatisfy(state.productKeys, productKey);
}

export function catalogWithPurchaseState(state) {
  return Object.values(MODULE_PRODUCTS).map(product => {
    const owned = hasPurchasedProduct(state, product.key)
      || (product.key === "accounts" && hasPurchasedProduct(state, "accounts_pos"));
    return {
      ...product,
      owned: Boolean(owned),
      locked: !owned && !state?.trialOrLegacyFull,
    };
  });
}

/** Merge commerce into orgSettings-shaped object for isModuleEnabled callers. */
export function orgSettingsWithModuleState(orgSettings = {}, state) {
  if (!state || state.trialOrLegacyFull || state.mode === "legacy_packs") {
    return orgSettings;
  }
  const overrides = { ...(orgSettings.moduleOverrides || {}) };
  for (const id of ["daily", "monthly", "chit", "accounts", "cashbook", "counter", "reports", "receipts", "ai", "dashboard"]) {
    overrides[id] = state.enabled.has(id);
  }
  return {
    ...orgSettings,
    moduleOverrides: overrides,
  };
}

export function assertAppModuleOpen(state, moduleId) {
  if (isAppModuleOpen(state, moduleId)) return true;
  const info = moduleLockInfo(state, moduleId);
  throw new Error(info?.body || `The “${moduleId}” module is locked. Purchase it to unlock.`);
}

export { isModuleEnabled };
