import { useEffect, useId, useRef, useState } from "react";
import { LIST_PAGE_SIZE } from "../model/accountsList.js";
import { LabeledField } from "../../../components/ui.jsx";

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


export const Field = LabeledField;
export function FilterField({ label, children, className = "" }) {
  return <label className={`accounts-filter-field ${className}`.trim()}><span className="small">{label}</span>{children}</label>;
}
export const AccMetric = ({ label, value, tone = "", onClick, hint = "" }) => (
  <article
    className={`card acc-metric-card tone-${tone || "plain"}${onClick ? " clickable" : ""}`}
    {...(onClick ? {
      role: "button",
      tabIndex: 0,
      onClick,
      onKeyDown: event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } },
    } : {})}
  >
    <div className="metric-label">{label}</div>
    <div className={`metric-value ${tone}`}>{value}</div>
    {hint ? <div className="metric-hint">{hint}</div> : null}
  </article>
);
export const AccEmpty = ({ title, copy, actionLabel, onAction }) => (
  <div className="card acc-empty">
    <strong>{title}</strong>
    <p className="copy">{copy}</p>
    {actionLabel && onAction && <button type="button" className="btn primary" onClick={onAction}>{actionLabel}</button>}
  </div>
);
export function AccPager({ page, pages, total, onPage, noun = "rows" }) {
  if (total <= LIST_PAGE_SIZE) return null;
  return (
    <div className="acc-pager">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="small">Page {page} of {pages} · {total} {noun}</span>
      <button type="button" className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
export function AccSetupSection({ icon, title, copy, actions, children, collapsible = false, summary = "" }) {
  const [open, setOpen] = useState(!collapsible);
  const panelId = useId();
  const toggleId = useId();
  return (
    <section className={`card acc-setup-card${collapsible && !open ? " collapsed" : ""}`}>
      <header className="acc-setup-head">
        <span className="acc-setup-icon" aria-hidden="true">{icon}</span>
        <div className="acc-setup-copy">
          <h2>{title}</h2>
          {copy ? <p className="copy">{copy}</p> : null}
        </div>
        {actions ? <div className="acc-setup-actions">{actions}</div> : null}
      </header>
      {collapsible && (
        <button
          type="button"
          id={toggleId}
          className="acc-setup-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(current => !current)}
        >
          <span>{open ? `Hide ${summary}` : `Show ${summary}`}</span>
          <span className="acc-setup-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
        </button>
      )}
      <div
        id={panelId}
        className="acc-setup-body"
        role={collapsible ? "region" : undefined}
        aria-labelledby={collapsible ? toggleId : undefined}
        hidden={collapsible && !open}
      >
        <div className="acc-setup-stack">{children}</div>
      </div>
    </section>
  );
}
export const AccSkeleton = () => (
  <div className="acc-skeleton" aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <div key={index} className="acc-skel" />)}
  </div>
);
export function Modal({ title, close, children, actions }) {
  return (
    <div className="modal-bg" role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="modal acc-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row">
          <h2 className="title">{title}</h2>
          <button type="button" className="btn ghost" aria-label="Close" onClick={close}>Close</button>
        </div>
        {children}
        {actions ? <div className="acc-modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
export function ReasonModal({ title, label, value, onChange, onConfirm, onClose, saving, confirmLabel = "Continue" }) {
  return <Modal title={title} close={() => !saving && onClose()} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving || !String(value || "").trim()} onClick={onConfirm}>{saving ? "Saving…" : confirmLabel}</button></div>}>
    <p className="copy">This is stored on the audit trail. Posted amounts are not edited.</p>
    <div className="form">
      <Field className="span" label={label}><input value={value} onChange={event => onChange(event.target.value)} autoFocus /></Field>
    </div>
  </Modal>;
}
/**
 * Standard Accounts table. columns: ["Label", { label, num: true }] (num right-aligns).
 * `empty` (truthy) renders a single full-width row, e.g. empty={!rows.length && "No rows yet."}.
 * `spaced={false}` drops the top margin for tables inside cards and dialogs.
 */
export function AccTable({ columns, empty = null, spaced = true, children }) {
  return (
    <div className={`table${spaced ? " spacer" : ""} acc-table-wrap`}><table><thead><tr>{columns.map(column => {
      const { label, num } = typeof column === "string" ? { label: column } : column;
      return <th key={typeof label === "string" ? label : undefined} className={num ? "acc-num" : undefined}>{label}</th>;
    })}</tr></thead><tbody>
      {children}
      {empty ? <tr><td colSpan={columns.length}>{empty}</td></tr> : null}
    </tbody></table></div>
  );
}
