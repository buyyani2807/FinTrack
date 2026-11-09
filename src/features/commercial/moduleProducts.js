/**
 * Configurable paid modules for FinTrack commerce.
 *
 * Billing (confirmed):
 * - Monthly: ₹498 + GST 18% per module/bundle
 * - Annual: ₹5,976 + GST 18% per module/bundle
 * - No lifetime membership
 * - Currency INR
 * - Free 14-day org trial still grants full module access
 *
 * Scope: organization (FinTrack business workspace). Daily / Monthly / Chit are org-wide;
 * Accounts companies inherit the org’s Accounts / Accounts+POS entitlements.
 */

export const MODULE_BILLING_DEFAULTS = {
  currency: "INR",
  gstRate: 0.18,
  /** Base prices before GST (paise). */
  monthlyBasePaise: 49800, // ₹498
  annualBasePaise: 597600, // ₹5,976
  /** Default selection on unlock UI */
  period: "monthly",
  provider: "razorpay",
};

function gstPaise(basePaise, rate = MODULE_BILLING_DEFAULTS.gstRate) {
  const base = Math.max(0, Number(basePaise) || 0);
  return Math.round(base * Number(rate));
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
  const formatInr = paise => `₹${(Number(paise) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: Number(paise) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
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
    description: "Daily collection finance and monthly interest finance for your lending business.",
    includes: [
      "Daily collection finance",
      "Monthly interest finance",
      "Customer dashboards",
      "Payment history",
      "Collection staff functionality",
    ],
    unlocks: ["daily", "monthly", "dashboard", "reports", "receipts"],
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
  },
};

export const MODULE_PRODUCT_LIST = Object.values(MODULE_PRODUCTS);

export function getModuleProduct(key) {
  return MODULE_PRODUCTS[key] || null;
}

/** @deprecated Prefer priceForPeriod — kept for older call sites. */
export function formatModulePrice(product = {}, overrides = {}) {
  const period = overrides.period || product.period || MODULE_BILLING_DEFAULTS.period;
  return priceForPeriod(period, overrides);
}

export const APP_MODULE_PRODUCT = {
  daily: "finance_daily_monthly",
  monthly: "finance_daily_monthly",
  chit: "chit_fund",
  accounts: "accounts",
  cashbook: "accounts",
  counter: "accounts_pos",
};

export function unlockCopyForAppModule(appModuleId, period = MODULE_BILLING_DEFAULTS.period) {
  const price = priceForPeriod(period);
  if (appModuleId === "counter" || APP_MODULE_PRODUCT[appModuleId] === "accounts_pos") {
    const product = MODULE_PRODUCTS.accounts_pos;
    return {
      productKey: product.key,
      title: product.name,
      body: `Available through the Accounts + POS bundle for ${price.breakdown} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  if (appModuleId === "accounts" || appModuleId === "cashbook") {
    const product = MODULE_PRODUCTS.accounts;
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
    return {
      productKey: product.key,
      title: product.name,
      body: `Unlock daily and monthly customer finance management for ${price.breakdown} (${price.periodLabel}).`,
      price,
      product,
    };
  }
  if (appModuleId === "chit") {
    const product = MODULE_PRODUCTS.chit_fund;
    return {
      productKey: product.key,
      title: product.name,
      body: `Unlock chit schemes, members, auctions, payments, and dividends for ${price.breakdown} (${price.periodLabel}).`,
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
  const keys = [...new Set(productKeys || [])];
  const unit = priceForPeriod(period);
  const count = keys.length;
  return {
    ...unit,
    moduleCount: count,
    basePaise: unit.basePaise * count,
    taxPaise: unit.taxPaise * count,
    totalPaise: unit.totalPaise * count,
    amountPaise: unit.totalPaise * count,
    baseLabel: priceForPeriod(period, { basePaise: unit.basePaise * count }).baseLabel,
    taxLabel: priceForPeriod(period, { basePaise: unit.basePaise * count }).taxLabel,
    totalLabel: priceForPeriod(period, { basePaise: unit.basePaise * count }).totalLabel,
    label: priceForPeriod(period, { basePaise: unit.basePaise * count }).totalLabel,
    display: `${priceForPeriod(period, { basePaise: unit.basePaise * count }).totalLabel} ${unit.periodLabel} (incl. GST)`,
    breakdown: `${count} × (${unit.breakdown})`,
  };
}
