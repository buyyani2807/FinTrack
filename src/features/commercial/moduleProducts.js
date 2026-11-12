/**
 * Configurable paid modules for MyFinTracker commerce.
 *
 * Billing (confirmed):
 * - Monthly: ₹498 + GST 18% per standard module
 * - Annual: ₹5,976 + GST 18% per standard module
 * - Accounts + POS: ₹598 + GST 18% / month, ₹7,176 + GST 18% / year (+₹100 vs Accounts)
 * - No lifetime membership
 * - Currency INR
 * - Free 14-day org trial still grants full module access
 *
 * Scope: organization (MyFinTracker business workspace). Daily / Monthly / Chit are org-wide;
 * Accounts companies inherit the org’s Accounts / Accounts+POS entitlements.
 */

export const MODULE_BILLING_DEFAULTS = {
  currency: "INR",
  gstRate: 0.18,
  /** Base prices before GST (paise) — standard module. */
  monthlyBasePaise: 49800, // ₹498
  annualBasePaise: 597600, // ₹5,976
  /** Accounts + POS premium (+₹100 / month vs Accounts). */
  accountsPosMonthlyBasePaise: 59800, // ₹598
  accountsPosAnnualBasePaise: 717600, // ₹7,176
  /** Default selection on unlock UI */
  period: "monthly",
  provider: "razorpay",
};

function gstPaise(basePaise, rate = MODULE_BILLING_DEFAULTS.gstRate) {
  const base = Math.max(0, Number(basePaise) || 0);
  return Math.round(base * Number(rate));
}

function formatInr(paise) {
  return `₹${(Number(paise) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: Number(paise) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function priceForPeriod(period = MODULE_BILLING_DEFAULTS.period, overrides = {}) {
  const billingPeriod = period === "annual" ? "annual" : "monthly";
  const basePaise = Number(
    overrides.basePaise
    ?? (billingPeriod === "annual"
      ? MODULE_BILLING_DEFAULTS.annualBasePaise
      : MODULE_BILLING_DEFAULTS.monthlyBasePaise),
  );
  const rate = Number(overrides.gstRate ?? MODULE_BILLING_DEFAULTS.gstRate);
  const taxPaise = gstPaise(basePaise, rate);
  const totalPaise = basePaise + taxPaise;
  const currency = overrides.currency || MODULE_BILLING_DEFAULTS.currency;
  return {
    period: billingPeriod,
    periodLabel: billingPeriod === "annual" ? "per year" : "per month",
    currency,
    gstRate: rate,
    gstPercentLabel: `${Math.round(rate * 100)}%`,
    basePaise,
    taxPaise,
    totalPaise,
    /** Charged amount (base + GST) */
    amountPaise: totalPaise,
    baseLabel: formatInr(basePaise),
    taxLabel: formatInr(taxPaise),
    totalLabel: formatInr(totalPaise),
    label: formatInr(totalPaise),
    display: `${formatInr(totalPaise)} ${billingPeriod === "annual" ? "per year" : "per month"} (incl. GST)`,
    breakdown: `${formatInr(basePaise)} + GST ${Math.round(rate * 100)}% (${formatInr(taxPaise)}) = ${formatInr(totalPaise)}`,
  };
}

/** Stable product keys used in DB entitlements and payment metadata. */
export const MODULE_PRODUCTS = {
  finance_daily_monthly: {
    key: "finance_daily_monthly",
    name: "Daily + Monthly Finance",
    shortName: "Finance",
    description: "Daily collection finance, monthly interest finance, and cashbook for cash in and out.",
    includes: [
      "Daily collection finance",
      "Monthly interest finance",
      "Cashbook (cash, bank, UPI movements)",
      "Customer dashboards",
      "Payment history",
      "Collection staff functionality",
    ],
    unlocks: ["daily", "monthly", "cashbook", "dashboard", "reports", "receipts"],
    bundle: true,
  },
  chit_fund: {
    key: "chit_fund",
    name: "Chit Fund",
    shortName: "Chit Fund",
    description: "Run chit schemes, members, auctions, payments, dividends, and cashbook for cash in and out.",
    includes: [
      "Chit schemes",
      "Members",
      "Monthly bids",
      "Payments",
      "Dividends",
      "Scheme reports",
      "Cashbook (cash, bank, UPI movements)",
    ],
    unlocks: ["chit", "cashbook", "dashboard", "reports", "receipts"],
    bundle: true,
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
    bundle: true,
    satisfies: ["accounts", "accounts_pos"],
    /** +₹100 / month vs Accounts (annual = 12 × monthly base). */
    monthlyBasePaise: MODULE_BILLING_DEFAULTS.accountsPosMonthlyBasePaise,
    annualBasePaise: MODULE_BILLING_DEFAULTS.accountsPosAnnualBasePaise,
  },
};

export const MODULE_PRODUCT_LIST = Object.values(MODULE_PRODUCTS);

export function getModuleProduct(key) {
  return MODULE_PRODUCTS[key] || null;
}

export function basePaiseForProduct(productOrKey, period = MODULE_BILLING_DEFAULTS.period) {
  const product = typeof productOrKey === "string"
    ? getModuleProduct(productOrKey)
    : productOrKey;
  const billingPeriod = period === "annual" ? "annual" : "monthly";
  if (billingPeriod === "annual") {
    return Number(
      product?.annualBasePaise
      ?? MODULE_BILLING_DEFAULTS.annualBasePaise,
    );
  }
  return Number(
    product?.monthlyBasePaise
    ?? MODULE_BILLING_DEFAULTS.monthlyBasePaise,
  );
}

export function priceForProduct(productOrKey, period = MODULE_BILLING_DEFAULTS.period, overrides = {}) {
  return priceForPeriod(period, {
    ...overrides,
    basePaise: overrides.basePaise ?? basePaiseForProduct(productOrKey, period),
  });
}

/** @deprecated Prefer priceForPeriod / priceForProduct — kept for older call sites. */
export function formatModulePrice(product = {}, overrides = {}) {
  const period = overrides.period || product.period || MODULE_BILLING_DEFAULTS.period;
  return priceForProduct(product, period, overrides);
}

export const APP_MODULE_PRODUCT = {
  daily: "finance_daily_monthly",
  monthly: "finance_daily_monthly",
  chit: "chit_fund",
  accounts: "accounts",
  // Cashbook ships with Finance, Chit, or Accounts — store deep-link prefers Finance.
  cashbook: "finance_daily_monthly",
  counter: "accounts_pos",
};

/** Product keys that unlock the Cashbook app module (cash in/out). */
export const CASHBOOK_PRODUCT_KEYS = ["finance_daily_monthly", "chit_fund", "accounts", "accounts_pos"];

export function productUnlocksCashbook(productKey) {
  return CASHBOOK_PRODUCT_KEYS.includes(productKey);
}

export function unlockCopyForAppModule(appModuleId, period = MODULE_BILLING_DEFAULTS.period) {
  if (appModuleId === "counter" || APP_MODULE_PRODUCT[appModuleId] === "accounts_pos") {
    const product = MODULE_PRODUCTS.accounts_pos;
    const price = priceForProduct(product, period);
    return {
      productKey: product.key,
      title: product.name,
      body: `Available through the Accounts + POS bundle for ${price.breakdown} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  if (appModuleId === "cashbook") {
    const product = MODULE_PRODUCTS.finance_daily_monthly;
    const price = priceForProduct(product, period);
    return {
      productKey: product.key,
      title: "Cashbook",
      body: `Cashbook is included with Daily + Monthly Finance, Chit Fund, or Accounts. Unlock Finance for ${price.breakdown} (${price.periodLabel}), or choose Chit Fund / Accounts under Subscriptions.`,
      price,
      product,
    };
  }
  if (appModuleId === "accounts") {
    const product = MODULE_PRODUCTS.accounts;
    const price = priceForProduct(product, period);
    return {
      productKey: product.key,
      title: product.name,
      body: `Unlock accounting, GST, inventory, cashbook, and reports for ${price.breakdown} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  if (appModuleId === "daily" || appModuleId === "monthly") {
    const product = MODULE_PRODUCTS.finance_daily_monthly;
    const price = priceForProduct(product, period);
    return {
      productKey: product.key,
      title: product.name,
      body: `Unlock daily and monthly customer finance plus cashbook for ${price.breakdown} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  if (appModuleId === "chit") {
    const product = MODULE_PRODUCTS.chit_fund;
    const price = priceForProduct(product, period);
    return {
      productKey: product.key,
      title: product.name,
      body: `Unlock chit schemes, members, auctions, payments, dividends, and cashbook for ${price.breakdown} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  return null;
}

export function appModulesFromProductKeys(productKeys = []) {
  const keys = new Set(productKeys || []);
  if (keys.has("accounts_pos")) keys.add("accounts");
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

export function cartTotals(productKeys = [], period = MODULE_BILLING_DEFAULTS.period) {
  const keys = [...new Set(productKeys || [])].filter(key => MODULE_PRODUCTS[key]);
  let basePaise = 0;
  let taxPaise = 0;
  let totalPaise = 0;
  const lines = keys.map(key => {
    const price = priceForProduct(key, period);
    basePaise += price.basePaise;
    taxPaise += price.taxPaise;
    totalPaise += price.totalPaise;
    return { key, ...price };
  });
  const periodMeta = priceForPeriod(period);
  const summed = priceForPeriod(period, { basePaise });
  return {
    ...periodMeta,
    moduleCount: keys.length,
    lines,
    basePaise,
    taxPaise,
    totalPaise,
    amountPaise: totalPaise,
    baseLabel: summed.baseLabel,
    taxLabel: summed.taxLabel,
    totalLabel: summed.totalLabel,
    label: summed.totalLabel,
    display: `${summed.totalLabel} ${periodMeta.periodLabel} (incl. GST)`,
    breakdown: keys.length
      ? `${keys.length} module${keys.length === 1 ? "" : "s"} · ${summed.breakdown}`
      : summed.breakdown,
  };
}
