/** Persist Counter hold bills on this device (per company + till). */

const holdsKey = (companyId, tillId) => (
  `fintrack-accounts-counter-holds-v1:${companyId || "none"}:${tillId || "till-1"}`
);

export function readCounterHolds(companyId, tillId = "till-1") {
  if (!companyId || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(holdsKey(companyId, tillId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(row => row && row.id && Array.isArray(row.lines)) : [];
  } catch {
    return [];
  }
}

export function saveCounterHolds(companyId, tillId = "till-1", holds = []) {
  if (!companyId || typeof localStorage === "undefined") return [];
  try {
    const rows = (holds || []).filter(row => row && row.id && Array.isArray(row.lines)).slice(0, 40);
    localStorage.setItem(holdsKey(companyId, tillId), JSON.stringify(rows));
    return rows;
  } catch {
    return readCounterHolds(companyId, tillId);
  }
}
