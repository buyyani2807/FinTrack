/** Local per-company Counter (POS) settings: enable, payment ledgers, tills, day-close. */

const COUNTER_INDUSTRIES = new Set(["retail", "kirana", "medical", "hardware", "jewellery"]);

const storageKey = companyId => `fintrack-accounts-counter-v1:${companyId || "none"}`;
const settingsKey = companyId => `fintrack-accounts-counter-settings-v1:${companyId || "none"}`;
const dayCloseKey = (companyId, date, tillId) => (
  `fintrack-accounts-counter-dayclose-v1:${companyId || "none"}:${date || ""}:${tillId || "till-1"}`
);
const sessionKey = companyId => `fintrack-accounts-counter-session-v1:${companyId || "none"}`;

const newTillId = () => `till-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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
  const till = { id: "till-1", label: "Till 1" };
  return {
    tills: [till],
    activeTillId: till.id,
    tillLabel: till.label,
    paymentMap: { cash: "", upi: "", bank: "" },
    favouriteItemIds: [],
  };
}

function normalizeTills(parsed, fallback) {
  const fromList = Array.isArray(parsed?.tills)
    ? parsed.tills
      .map((row, index) => ({
        id: String(row?.id || `till-${index + 1}`).trim() || `till-${index + 1}`,
        label: String(row?.label || `Till ${index + 1}`).trim() || `Till ${index + 1}`,
      }))
      .filter(row => row.id && row.label)
    : [];
  if (fromList.length) return fromList;
  const legacyLabel = String(parsed?.tillLabel || fallback.tillLabel).trim() || "Till 1";
  return [{ id: "till-1", label: legacyLabel }];
}

export function readCounterSettings(companyId) {
  const fallback = emptyCounterSettings();
  if (!companyId || typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(settingsKey(companyId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const tills = normalizeTills(parsed, fallback);
    const activeTillId = tills.some(till => till.id === parsed?.activeTillId)
      ? parsed.activeTillId
      : tills[0].id;
    const active = tills.find(till => till.id === activeTillId) || tills[0];
    const favouriteItemIds = Array.isArray(parsed?.favouriteItemIds)
      ? parsed.favouriteItemIds.map(id => String(id || "").trim()).filter(Boolean).slice(0, 48)
      : [];
    return {
      tills,
      activeTillId: active.id,
      tillLabel: active.label,
      paymentMap: {
        cash: parsed?.paymentMap?.cash || "",
        upi: parsed?.paymentMap?.upi || "",
        bank: parsed?.paymentMap?.bank || "",
      },
      favouriteItemIds,
    };
  } catch {
    return fallback;
  }
}

export function saveCounterSettings(companyId, next) {
  if (!companyId || typeof localStorage === "undefined") return readCounterSettings(companyId);
  try {
    const current = readCounterSettings(companyId);
    let tills = normalizeTills({ tills: next?.tills ?? current.tills, tillLabel: next?.tillLabel }, current);
    if (!tills.length) tills = emptyCounterSettings().tills;
    if (next?.tillLabel && tills.length === 1 && next.tills == null) {
      tills = [{ ...tills[0], label: String(next.tillLabel).trim() || tills[0].label }];
    }
    const activeTillId = tills.some(till => till.id === (next?.activeTillId ?? current.activeTillId))
      ? (next?.activeTillId ?? current.activeTillId)
      : tills[0].id;
    const active = tills.find(till => till.id === activeTillId) || tills[0];
    const favouriteItemIds = Array.isArray(next?.favouriteItemIds)
      ? next.favouriteItemIds.map(id => String(id || "").trim()).filter(Boolean).slice(0, 48)
      : (current.favouriteItemIds || []);
    const merged = {
      tills,
      activeTillId: active.id,
      tillLabel: active.label,
      paymentMap: {
        cash: next?.paymentMap?.cash ?? current.paymentMap.cash ?? "",
        upi: next?.paymentMap?.upi ?? current.paymentMap.upi ?? "",
        bank: next?.paymentMap?.bank ?? current.paymentMap.bank ?? "",
      },
      favouriteItemIds,
    };
    localStorage.setItem(settingsKey(companyId), JSON.stringify(merged));
    return merged;
  } catch {
    return readCounterSettings(companyId);
  }
}

export function addCounterTill(companyId, label = "") {
  const current = readCounterSettings(companyId);
  const nextLabel = String(label || `Till ${current.tills.length + 1}`).trim() || `Till ${current.tills.length + 1}`;
  const till = { id: newTillId(), label: nextLabel };
  return saveCounterSettings(companyId, {
    ...current,
    tills: [...current.tills, till],
    activeTillId: till.id,
  });
}

export function removeCounterTill(companyId, tillId) {
  const current = readCounterSettings(companyId);
  if (current.tills.length <= 1) return current;
  const tills = current.tills.filter(till => till.id !== tillId);
  const activeTillId = tills.some(till => till.id === current.activeTillId) ? current.activeTillId : tills[0].id;
  return saveCounterSettings(companyId, { ...current, tills, activeTillId });
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

export function readDayClose(companyId, date, tillId = "till-1") {
  if (!companyId || !date || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(dayCloseKey(companyId, date, tillId));
    if (raw) return JSON.parse(raw);
    // Legacy key without till (Phase 2) — only for default till.
    if (tillId === "till-1") {
      const legacy = localStorage.getItem(`fintrack-accounts-counter-dayclose-v1:${companyId}:${date}`);
      return legacy ? JSON.parse(legacy) : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDayClose(companyId, date, payload, tillId = "till-1") {
  if (!companyId || !date || typeof localStorage === "undefined") return null;
  try {
    const row = {
      ...payload,
      date,
      tillId,
      closedAt: new Date().toISOString(),
    };
    localStorage.setItem(dayCloseKey(companyId, date, tillId), JSON.stringify(row));
    return row;
  } catch {
    return null;
  }
}

export function readCounterSession(companyId) {
  if (!companyId || typeof sessionStorage === "undefined") return { cashierName: "" };
  try {
    const raw = sessionStorage.getItem(sessionKey(companyId));
    if (!raw) return { cashierName: "" };
    const parsed = JSON.parse(raw);
    return { cashierName: String(parsed?.cashierName || "").trim() };
  } catch {
    return { cashierName: "" };
  }
}

export function saveCounterSession(companyId, next = {}) {
  if (!companyId || typeof sessionStorage === "undefined") return { cashierName: "" };
  try {
    const row = { cashierName: String(next.cashierName || "").trim() };
    sessionStorage.setItem(sessionKey(companyId), JSON.stringify(row));
    return row;
  } catch {
    return { cashierName: String(next.cashierName || "").trim() };
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

/** Expiry status for Counter warnings (item-level batch metadata). */
export function itemExpiryStatus(expiryDate, { today = "" } = {}) {
  const expiry = String(expiryDate || "").slice(0, 10);
  if (!expiry) return { tone: "ok", label: "" };
  const asOf = String(today || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (expiry < asOf) return { tone: "expired", label: `Expired ${expiry}` };
  const inDays = Math.round((new Date(`${expiry}T00:00:00`) - new Date(`${asOf}T00:00:00`)) / 86400000);
  if (inDays <= 30) return { tone: "soon", label: `Expires ${expiry}` };
  return { tone: "ok", label: expiry };
}
