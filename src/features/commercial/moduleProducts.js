/**
 * Configurable paid modules for FinTrack commerce.
 *
 * Assumed default billing (change in MODULE_BILLING_DEFAULTS / DB without code churn):
 * - ₹500 per module or bundle
 * - One-time lifetime unlock per organization (not monthly)
 * - Currency INR
 * - Free 14-day org trial still grants full module access (see trial.js / 092_signup_trial.sql)
 *
 * Scope: organization (FinTrack business workspace). Daily / Monthly / Chit are org-wide;
 * Accounts companies inherit the org’s Accounts / Accounts+POS entitlements.
 */

export const MODULE_BILLING_DEFAULTS = {
  currency: "INR",
  amountPaise: 50000, // ₹500.00
  amountLabel: "₹500",
  /** lifetime | monthly | annual — default lifetime until product decides otherwise */
  period: "lifetime",
  periodLabel: "one-time",
  provider: "razorpay",
};

/** Stable product keys used in DB entitlements and payment metadata. */
export const MODULE_PRODUCTS = {
  finance_daily_monthly: {
    key: "finance_daily_monthly",
    name: "Daily + Monthly Finance",
    shortName: "Finance",
    description: "Daily collection finance and monthly interest finance for your lending business.",
    includes: [
      "Daily collection finance",
      "Monthly interest finance",
      "Customer dashboards",
      "Payment history",
      "Collection staff functionality",
    ],
    /** App module ids unlocked by this product (feature-pack surface). */
    unlocks: ["daily", "monthly", "dashboard", "reports", "receipts"],
    amountPaise: MODULE_BILLING_DEFAULTS.amountPaise,
    period: MODULE_BILLING_DEFAULTS.period,
    bundle: false,
  },
  chit_fund: {
    key: "chit_fund",
    name: "Chit Fund",
    shortName: "Chit Fund",
    description: "Run chit schemes, members, auctions, payments, and dividends.",
    includes: [
      "Chit schemes",
      "Members",
      "Monthly bids",
      "Payments",
      "Dividends",
      "Scheme reports",
    ],
    unlocks: ["chit", "dashboard", "reports", "receipts"],
    amountPaise: MODULE_BILLING_DEFAULTS.amountPaise,
    period: MODULE_BILLING_DEFAULTS.period,
    bundle: false,
  },
  accounts: {
    key: "accounts",
    name: "Accounts",
    shortName: "Accounts",
    description: "Accounting, cashbook, GST, inventory, and party ledgers — without POS Counter.",
    includes: [
      "Accounting",
      "Cashbook",
      "Reports",
      "GST",
      "Inventory",
      "Customers and suppliers",
    ],
    unlocks: ["accounts", "cashbook", "dashboard", "reports", "receipts"],
    amountPaise: MODULE_BILLING_DEFAULTS.amountPaise,
    period: MODULE_BILLING_DEFAULTS.period,
    bundle: false,
  },
  accounts_pos: {
    key: "accounts_pos",
    name: "Accounts + POS",
    shortName: "Accounts + POS",
    description: "Everything in Accounts plus Counter POS checkout and POS reports.",
    includes: [
      "All Accounts functionality",
      "POS checkout",
      "Sales and purchases",
      "Inventory integration",
      "Receipts",
      "POS reports",
    ],
    unlocks: ["accounts", "cashbook", "counter", "dashboard", "reports", "receipts"],
    amountPaise: MODULE_BILLING_DEFAULTS.amountPaise,
    period: MODULE_BILLING_DEFAULTS.period,
    bundle: true,
    /** Purchasing this satisfies these product keys for entitlement checks. */
    satisfies: ["accounts", "accounts_pos"],
  },
};

export const MODULE_PRODUCT_LIST = Object.values(MODULE_PRODUCTS);

export function getModuleProduct(key) {
  return MODULE_PRODUCTS[key] || null;
}

export function formatModulePrice(product = {}, overrides = {}) {
  const amountPaise = Number(overrides.amountPaise ?? product.amountPaise ?? MODULE_BILLING_DEFAULTS.amountPaise);
  const currency = overrides.currency || MODULE_BILLING_DEFAULTS.currency;
  const period = overrides.period || product.period || MODULE_BILLING_DEFAULTS.period;
  const rupees = (amountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const periodLabel = period === "lifetime" || period === "one_time"
    ? "one-time"
    : period === "monthly"
      ? "per month"
      : period === "annual"
        ? "per year"
        : String(period);
  return {
    amountPaise,
    currency,
    period,
    periodLabel,
    label: `₹${rupees}`,
    display: `₹${rupees} ${periodLabel}`,
  };
}

/** Map a nav/app module id → which product unlocks it (for lock copy). */
export const APP_MODULE_PRODUCT = {
  daily: "finance_daily_monthly",
  monthly: "finance_daily_monthly",
  chit: "chit_fund",
  accounts: "accounts",
  cashbook: "accounts",
  counter: "accounts_pos",
};

export function unlockCopyForAppModule(appModuleId) {
  const productKey = APP_MODULE_PRODUCT[appModuleId];
  if (appModuleId === "counter" || productKey === "accounts_pos") {
    const product = MODULE_PRODUCTS.accounts_pos;
    const price = formatModulePrice(product);
    return {
      productKey: product.key,
      title: product.name,
      body: `Available through the Accounts + POS bundle for ${price.label} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  if (appModuleId === "accounts" || appModuleId === "cashbook") {
    const product = MODULE_PRODUCTS.accounts;
    const price = formatModulePrice(product);
    return {
      productKey: product.key,
      title: product.name,
      body: `Unlock accounting, GST, inventory, cashbook, and reports for ${price.label} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  if (appModuleId === "daily" || appModuleId === "monthly") {
    const product = MODULE_PRODUCTS.finance_daily_monthly;
    const price = formatModulePrice(product);
    return {
      productKey: product.key,
      title: product.name,
      body: `Unlock daily and monthly customer finance management for ${price.label} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  if (appModuleId === "chit") {
    const product = MODULE_PRODUCTS.chit_fund;
    const price = formatModulePrice(product);
    return {
      productKey: product.key,
      title: product.name,
      body: `Unlock chit schemes, members, auctions, payments, and dividends for ${price.label} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  return null;
}

/**
 * Resolve which app module ids a set of purchased product keys unlocks.
 * accounts_pos implies accounts surfaces + counter.
 */
export function appModulesFromProductKeys(productKeys = []) {
  const keys = new Set(productKeys || []);
  if (keys.has("accounts_pos")) {
    keys.add("accounts");
  }
  const unlocked = new Set();
  for (const key of keys) {
    const product = MODULE_PRODUCTS[key];
    if (!product) continue;
    for (const moduleId of product.unlocks || []) unlocked.add(moduleId);
  }
  return unlocked;
}

export function productKeysSatisfy(ownedKeys = [], requiredProductKey) {
  const owned = new Set(ownedKeys || []);
  if (owned.has(requiredProductKey)) return true;
  if (requiredProductKey === "accounts" && owned.has("accounts_pos")) return true;
  return false;
}
