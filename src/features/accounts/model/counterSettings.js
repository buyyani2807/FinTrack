/** Local per-company Counter (POS) settings: enable, payment ledgers, till label, day-close. */

const COUNTER_INDUSTRIES = new Set(["retail", "medical", "hardware", "jewellery"]);

const storageKey = companyId => `fintrack-accounts-counter-v1:${companyId || "none"}`;
const settingsKey = companyId => `fintrack-accounts-counter-settings-v1:${companyId || "none"}`;
const dayCloseKey = (companyId, date) => `fintrack-accounts-counter-dayclose-v1:${companyId || "none"}:${date || ""}`;

export function defaultCounterEnabled(industry = "retail") {
  return COUNTER_INDUSTRIES.has(String(industry || "").toLowerCase());
}

export function readCounterEnabled(companyId, industry = "retail") {
  if (!companyId || typeof localStorage === "undefined") return defaultCounterEnabled(industry);
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return defaultCounterEnabled(industry);
  } catch {
    return defaultCounterEnabled(industry);
  }
}

export function saveCounterEnabled(companyId, enabled) {
  if (!companyId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(companyId), enabled ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function emptyCounterSettings() {
  return {
    tillLabel: "Till 1",
    paymentMap: { cash: "", upi: "", bank: "" },
  };
}

export function readCounterSettings(companyId) {
  const fallback = emptyCounterSettings();
  if (!companyId || typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(settingsKey(companyId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      tillLabel: String(parsed?.tillLabel || fallback.tillLabel).trim() || fallback.tillLabel,
      paymentMap: {
        cash: parsed?.paymentMap?.cash || "",
        upi: parsed?.paymentMap?.upi || "",
        bank: parsed?.paymentMap?.bank || "",
      },
    };
  } catch {
    return fallback;
  }
}

export function saveCounterSettings(companyId, next) {
  if (!companyId || typeof localStorage === "undefined") return;
  try {
    const current = readCounterSettings(companyId);
    const merged = {
      tillLabel: String(next?.tillLabel ?? current.tillLabel).trim() || "Till 1",
      paymentMap: {
        cash: next?.paymentMap?.cash ?? current.paymentMap.cash ?? "",
        upi: next?.paymentMap?.upi ?? current.paymentMap.upi ?? "",
        bank: next?.paymentMap?.bank ?? current.paymentMap.bank ?? "",
      },
    };
    localStorage.setItem(settingsKey(companyId), JSON.stringify(merged));
    return merged;
  } catch {
    return readCounterSettings(companyId);
  }
}

/** Prefer mapped money ledgers when posting Counter sales. */
export function accountsForCounterPay(accounts = [], paymentMap = {}) {
  const map = paymentMap || {};
  if (!map.cash && !map.upi && !map.bank) return accounts;
  return (accounts || []).map(account => {
    const type = account.accountType;
    if (type === "cash" && map.cash && account.id !== map.cash) return { ...account, accountType: "other_asset" };
    if (type === "upi" && map.upi && account.id !== map.upi) return { ...account, accountType: "other_asset" };
    if (type === "bank" && map.bank && account.id !== map.bank) return { ...account, accountType: "other_asset" };
    return account;
  });
}

export function readDayClose(companyId, date) {
  if (!companyId || !date || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(dayCloseKey(companyId, date));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDayClose(companyId, date, payload) {
  if (!companyId || !date || typeof localStorage === "undefined") return null;
  try {
    const row = {
      ...payload,
      date,
      closedAt: new Date().toISOString(),
    };
    localStorage.setItem(dayCloseKey(companyId, date), JSON.stringify(row));
    return row;
  } catch {
    return null;
  }
}

export function roleLabel(role) {
  if (role === "cashier") return "Cashier (Counter only)";
  if (role === "accountant") return "Accountant (can post)";
  if (role === "viewer") return "Viewer (read only)";
  if (role === "owner") return "Owner";
  return role || "—";
}

export function isCashierRole(role) {
  return role === "cashier";
}

export function canCounterWrite(role) {
  return role === "owner" || role === "accountant" || role === "cashier";
}

export function canCounterManage(role) {
  return role === "owner" || role === "accountant";
}
