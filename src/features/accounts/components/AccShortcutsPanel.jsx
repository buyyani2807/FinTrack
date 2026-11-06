import { useId, useState } from "react";
import { Keyboard } from "lucide-react";

const COUNTER_SHORTCUTS = [
  { keys: "F2", action: "Focus item search" },
  { keys: "Enter", action: "Add scanned / matched item" },
  { keys: "Esc", action: "Clear search" },
  { keys: "F4", action: "Hold current bill" },
  { keys: "F9", action: "Charge bill" },
];

const OVERVIEW_SHORTCUTS = [
  { keys: "Counter · F2", action: "Search / scan on the till" },
  { keys: "Counter · F4", action: "Hold a bill" },
  { keys: "Counter · F9", action: "Charge" },
  { keys: "Reports", action: "Open Reports for P&L, GST, expired stock" },
];

/**
 * Discoverable shortcut help (Marg-style affordance, FinTrack labels).
 * UI-only — does not register new global hotkeys beyond Counter's existing F2/F4/F9.
 */
export function AccShortcutsPanel({ variant = "counter", className = "" }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rows = variant === "overview" ? OVERVIEW_SHORTCUTS : COUNTER_SHORTCUTS;
  const title = variant === "overview" ? "Shortcuts" : "Till shortcuts";
  return (
    <div className={`acc-shortcuts ${className}`.trim()}>
      <button
        type="button"
        className="btn acc-shortcuts-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(current => !current)}
      >
        <Keyboard size={14} aria-hidden="true" />
        {title}
      </button>
      {open ? (
        <div id={panelId} className="acc-shortcuts-panel card" role="region" aria-label={title}>
          <ul className="acc-shortcuts-list">
            {rows.map(row => (
              <li key={row.keys}>
                <kbd>{row.keys}</kbd>
                <span>{row.action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
