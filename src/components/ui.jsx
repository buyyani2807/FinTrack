import { Children, cloneElement, isValidElement, useId, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Eye, EyeOff, Inbox, Search, X } from "lucide-react";

// Shared presentational building blocks used across the finance app.
export const Button = ({
  children,
  className = "",
  ...props
}) => <button className={`btn ${className}`} {...props}>{children}</button>;
// The label is tied to its control (htmlFor/id) so screen readers announce the field name.
export function Field({ label, children, className = "" }) {
  const generatedId = useId();
  const single = isValidElement(children) && (["input", "select", "textarea"].includes(children.type) || children.type?.fieldControl);
  const id = single ? children.props.id || generatedId : undefined;
  return <div className={`field ${className}`}><label htmlFor={id}>{label}</label>{single && !children.props.id ? cloneElement(children, { id }) : children}</div>;
}
export const Metric = ({
  label,
  value,
  color = "",
  onClick
}) => {
  const inner = <><div className="metric-label">{label}</div><div className={`metric-value ${color}`}>{value}</div></>;
  return onClick
    ? <button type="button" className="card metric-link" onClick={onClick}>{inner}</button>
    : <div className="card">{inner}</div>;
};
// Form field whose <label> wraps the control; `required` adds a marker after the label text.
export const LabeledField = ({ label, children, required, className }) => (
  <label className={`field${className ? ` ${className}` : ""}`}>
    <span>{label}{required ? <span className="acc-req"> *</span> : null}</span>
    {children}
  </label>
);
// `tone` picks the badge colour class when it differs from the label.
export const Badge = ({
  status,
  tone = status
}) => <span className={`badge ${tone}`}>{status}</span>;
// Popups close with the ✕ in the top-right corner (shown when `close` is given); there is no Cancel button.
// `isolateClicks` stops clicks inside the dialog reaching clickable parents (e.g. cards).
export const Modal = ({
  children,
  close,
  isolateClicks = false
}) => {
  const stop = isolateClicks ? event => event.stopPropagation() : undefined;
  return <div className="modal-bg" onClick={stop}><div className={`modal${close ? " has-corner-close" : ""}`} role="dialog" aria-modal="true" onClick={stop}>{close && <span className="modal-corner-close"><CloseButton onClick={close} /></span>}{children}</div></div>;
};
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, busy = false, error = "", close, onConfirm }) {
  return <Modal close={() => !busy && close()}><h2 className="title">{title}</h2><p className="copy">{message}</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className={danger ? "danger primary" : "primary"} disabled={busy} onClick={onConfirm}>{busy ? "Please wait…" : confirmLabel}</Button></div></Modal>;
}
// Dialog with a title row and Close button; `actions` render after the body.
export function DialogModal({ title, close, children, actions, className = "" }) {
  return <div className="modal-bg"><div className={`modal${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="row"><h2 className="title">{title}</h2><CloseButton onClick={close} /></div>{children}{actions}</div></div>;
}
// ✕ icon button for dialogs and drawers; its accessible name is "Close".
export function CloseButton({ onClick, label = "Close" }) {
  return <button type="button" className="ft-icon-btn ft-dialog-close" aria-label={label} title={label} onClick={onClick}><X size={22} strokeWidth={2} aria-hidden="true" /></button>;
}

/* Finebank page patterns ------------------------------------------------- */

// Grey section title above a card (Finebank "Total Balance", "Recent Transaction" …), with an optional action on the right.
export function SectionCard({ title, action = null, children, className = "", bodyClassName = "" }) {
  return <section className={`ft-section${className ? ` ${className}` : ""}`}>
    <div className="ft-section-head"><h2 className="ft-section-title">{title}</h2>{action}</div>
    <div className={`card ft-section-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
  </section>;
}

// "View All ›" style link button used in section headers.
export function ViewAllLink({ onClick, children = "View All" }) {
  return <button type="button" className="ft-view-all" onClick={onClick}>{children}<ChevronRight size={16} aria-hidden="true" /></button>;
}

// List row: icon tile, title + subtitle on the left, amount + meta on the right. Renders a button when clickable.
export function ListRow({ icon = null, title, subtitle = "", amount = null, meta = "", tone = "", onClick, className = "" }) {
  const Tag = onClick ? "button" : "div";
  return <Tag {...(onClick ? { type: "button", onClick } : {})} className={`ft-list-row${onClick ? " clickable" : ""}${className ? ` ${className}` : ""}`}>
    {icon && <span className="ft-icon-tile" aria-hidden="true">{icon}</span>}
    <span className="ft-list-row-main"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</span>
    {(amount !== null || meta) && <span className="ft-list-row-side"><strong className={tone}>{amount}</strong>{meta && <span>{meta}</span>}</span>}
  </Tag>;
}

// Month/day tile (Finebank "Upcoming Bill").
export function DateTile({ month, day }) {
  return <span className="ft-date-tile"><span>{month}</span><strong>{day}</strong></span>;
}

export function EmptyState({ title, copy = "", action = null, icon = <Inbox size={28} strokeWidth={1.6} /> }) {
  return <div className="ft-empty" role="status">
    <span className="ft-empty-icon" aria-hidden="true">{icon}</span>
    <strong>{title}</strong>
    {copy && <p>{copy}</p>}
    {action}
  </div>;
}

export function LoadingState({ label = "Loading…", rows = 3 }) {
  return <div className="ft-loading" role="status" aria-live="polite">
    <span className="ft-sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <span key={index} className="ft-skeleton" aria-hidden="true" />)}
  </div>;
}

// Password field with a show/hide toggle. Passes every input prop through, so Field can label it.
export function PasswordInput({ className = "", icon: Icon = null, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return <span className={`ft-password${Icon ? " ft-input-icon" : ""}${className ? ` ${className}` : ""}`}>
    {Icon && <Icon className="ft-input-icon-glyph" size={20} aria-hidden="true" />}
    <input {...inputProps} type={visible ? "text" : "password"} />
    <button type="button" className="ft-password-toggle" aria-pressed={visible} aria-controls={inputProps.id} aria-label={visible ? "Hide characters" : "Show characters"} title={visible ? "Hide" : "Show"} onClick={() => setVisible(value => !value)}>
      {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
    </button>
  </span>;
}
PasswordInput.fieldControl = true;

// Text input with a leading icon. Passes every input prop through, so Field can label it.
export function IconInput({ icon: Icon, className = "", ...inputProps }) {
  return <span className={`ft-input-icon${className ? ` ${className}` : ""}`}>
    <Icon className="ft-input-icon-glyph" size={20} aria-hidden="true" />
    <input {...inputProps} />
  </span>;
}
IconInput.fieldControl = true;

// Sub-pages (an account, a statement, a scheme, a staff member…) start with a slim bar holding one "Back" button
// that returns to the page they were opened from.
export function BackButton({ onClick }) {
  return <div className="ft-back-bar">
    <button type="button" className="ft-back-link" onClick={onClick}><ArrowLeft size={16} aria-hidden="true" />Back</button>
  </div>;
}

// One-of-few choice shown as joined buttons (period, money in/out, chit type…). options: [{ id, label }].
export function SegmentedControl({ label, options, value, onChange, className = "" }) {
  return <div className={`ft-segmented${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
    {options.map(option => <button key={option.id} type="button" className={value === option.id ? "active" : ""} aria-pressed={value === option.id} onClick={() => value !== option.id && onChange(option.id)}>{option.label}</button>)}
  </div>;
}

// Compact filter dropdown chip: "Account  All accounts ⌄". The native select covers the whole chip (so a tap anywhere
// opens the system list); highlighted while it filters (value differs from `allValue`).
export function FilterSelect({ label, value, onChange, allValue = "all", children }) {
  const selected = Children.toArray(children).find(child => isValidElement(child) && String(child.props.value) === String(value));
  return <label className={`ft-filter-select${value !== allValue ? " is-active" : ""}`}>
    <span className="ft-filter-select-label">{label}</span>
    <span className="ft-filter-select-value" aria-hidden="true">{selected?.props.children ?? value}</span>
    <ChevronDown className="ft-filter-select-chevron" size={16} aria-hidden="true" />
    <select value={value} onChange={event => onChange(event.target.value)}>{children}</select>
  </label>;
}

// Search box with a leading icon.
export function SearchInput({ label, className = "", ...props }) {
  return <label className={`ft-search${className ? ` ${className}` : ""}`}>
    <Search className="ft-search-icon" size={18} aria-hidden="true" />
    <input type="search" aria-label={label} {...props} />
  </label>;
}
