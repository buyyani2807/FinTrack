/** Local per-company flag: show the Counter (POS) till under Accounts. */

const COUNTER_INDUSTRIES = new Set(["retail", "medical", "hardware", "jewellery"]);

const storageKey = companyId => `fintrack-accounts-counter-v1:${companyId || "none"}`;

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
