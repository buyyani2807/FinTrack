import { Moon, Sun } from "lucide-react";
import { toggleTheme, useTheme } from "../lib/theme.js";

// Sun/moon switch between the light and dark themes. `compact` shows only the icon.
export function ThemeToggle({ compact = false, className = "" }) {
  const theme = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={label}
      title={label}
      className={`ft-theme-toggle${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}
      onClick={toggleTheme}
    >
      <span className="ft-theme-toggle-track" aria-hidden="true">
        <span className="ft-theme-toggle-thumb">{dark ? <Moon size={14} strokeWidth={2.2} /> : <Sun size={14} strokeWidth={2.2} />}</span>
      </span>
      {!compact && <span className="ft-theme-toggle-label">{dark ? "Dark" : "Light"}</span>}
    </button>
  );
}
