import { useEffect, useId, useRef, useState } from "react";

/**
 * Shared Accounts UI primitives (presentation only).
 * Keep handlers/business logic in the parent screen.
 */

export function AccButtonGroup({ children, className = "", align = "start" }) {
  return (
    <div className={`acc-btn-group align-${align} ${className}`.trim()} role="group">
      {children}
    </div>
  );
}

export function AccToolbar({ start = null, end = null, className = "" }) {
  return (
    <div className={`acc-toolbar ${className}`.trim()}>
      <div className="acc-toolbar-start">{start}</div>
      <div className="acc-toolbar-end">{end}</div>
    </div>
  );
}

/**
 * items: [{ id?, label, onClick, danger?, disabled? }]
 * Renders nothing when items is empty.
 */
export function AccMoreMenu({
  label = "More",
  items = [],
  align = "end",
  className = "",
  buttonClassName = "btn",
}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const menuId = useId();
  const visible = (items || []).filter(item => item && item.label);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const onKey = event => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible.length) return null;

  return (
    <div className={`acc-more align-${align} ${className}`.trim()} ref={root}>
      <button
        type="button"
        className={`${buttonClassName} acc-more-trigger`.trim()}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(current => !current)}
      >
        {label}
      </button>
      {open ? (
        <div className="acc-more-menu" id={menuId} role="menu">
          {visible.map(item => (
            <button
              key={item.id || item.label}
              type="button"
              role="menuitem"
              className={`acc-more-item${item.danger ? " is-danger" : ""}`}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
