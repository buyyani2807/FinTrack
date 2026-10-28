import { useCallback, useState } from "react";

const STORAGE_KEY = "ft-reports-prefs";
const MAX_RECENT = 8;

function readPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter(Boolean) : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter(Boolean) : [],
    };
  } catch {
    return { recent: [], pinned: [] };
  }
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

/** Personal recent + favourite report ids (browser only). */
export function useReportPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);

  const touchRecent = useCallback(id => {
    if (!id) return;
    setPrefs(current => {
      const recent = [id, ...current.recent.filter(item => item !== id)].slice(0, MAX_RECENT);
      const next = { ...current, recent };
      writePrefs(next);
      return next;
    });
  }, []);

  const togglePinned = useCallback(id => {
    if (!id) return;
    setPrefs(current => {
      const pinned = current.pinned.includes(id)
        ? current.pinned.filter(item => item !== id)
        : [...current.pinned, id];
      const next = { ...current, pinned };
      writePrefs(next);
      return next;
    });
  }, []);

  return { recent: prefs.recent, pinned: prefs.pinned, touchRecent, togglePinned };
}
