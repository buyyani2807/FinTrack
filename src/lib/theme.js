import { useSyncExternalStore } from "react";

// Light/dark theme: light by default. A choice made in the app (the toggle is only shown after sign-in) is remembered
// per browser. public/theme-init.js applies the same rule before first paint, so there is no flash of the wrong theme.
const STORAGE_KEY = "fintrack-theme";
const THEME_COLORS = { light: "#eef4f4", dark: "#111315" };
const listeners = new Set();

export function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme() {
  if (typeof document !== "undefined" && document.documentElement.dataset.theme) return document.documentElement.dataset.theme;
  return storedTheme() || "light";
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  listeners.forEach(listener => listener());
}

export function setTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* private mode: still switch for this visit */ }
  applyTheme(theme);
}

export const toggleTheme = () => setTheme(currentTheme() === "dark" ? "light" : "dark");

const subscribe = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTheme() {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}
