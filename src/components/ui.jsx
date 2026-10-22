import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";
import { useDialogDismiss } from "./useDialogDismiss.js";
import { Select } from "./Select.jsx";
import { Reveal } from "./ui/Reveal.jsx";
import { ArrowLeft, ChevronRight, Download, Eye, EyeOff, Inbox, Search, X } from "lucide-react";

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
  onClick,
  index = 0
}) => {
  const inner = <><div className="metric-label">{label}</div><div className={`metric-value ${color}`}>{value}</div></>;
  return onClick
    ? <Reveal as="button" type="button" index={index} className="card metric-link" onClick={onClick}>{inner}</Reveal>
    : <Reveal index={index} className="card">{inner}</Reveal>;
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
const classTokens = value => String(value || "").split(/\s+/).filter(Boolean);

function nodeHasButton(node) {
  if (!isValidElement(node)) return false;
  if (node.type === "button" || node.type === Button) return true;
  if (classTokens(node.props?.className).includes("btn")) return true;
  return Children.toArray(node.props?.children).some(nodeHasButton);
}

function isDialogTitle(node) {
  if (!isValidElement(node)) return false;
  return node.type === "h2" || classTokens(node.props?.className).includes("title");
}

function isDialogFooter(node) {
  if (!isValidElement(node) || node.type === "form") return false;
  const tokens = classTokens(node.props?.className);
  const isBar = tokens.includes("row") || tokens.includes("tabs") || tokens.includes("tool-stack");
  return isBar && nodeHasButton(node);
}

function splitDialogChildren(children) {
  const items = Children.toArray(children);
  let head = null;
  let foot = null;
  let body = items;
  if (body.length && isDialogTitle(body[0])) {
    head = body[0];
    body = body.slice(1);
  }
  if (body.length && isDialogFooter(body[body.length - 1])) {
    foot = body[body.length - 1];
    body = body.slice(0, -1);
  }
  return { head, body, foot };
}

// Scroll region for dialogs. The header and actions stay put; only this region moves.
// Scroll for more is only offered at the top. A click glides to the end, and any
// manual scroll hides it until the body is back at the top.
export function ModalScroll({ children }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ above: false, below: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const overflow = el.scrollHeight > el.clientHeight + 2;
      const next = {
        above: overflow && el.scrollTop > 1,
        below: overflow && el.scrollTop + el.clientHeight < el.scrollHeight - 8,
      };
      setEdges(current => (current.above === next.above && current.below === next.below ? current : next));
    };
    update();
    const frame = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    const watch = node => { if (node instanceof Element) observer.observe(node); };
    [...el.children].forEach(watch);
    const mutations = new MutationObserver(() => {
      [...el.children].forEach(watch);
      update();
    });
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  const classes = `modal-scroll${edges.above ? " has-more-above" : ""}${edges.below ? " has-more-below" : ""}`;
  return (
    <div className={classes}>
      <div ref={ref} className="modal-scroll-body">{children}</div>
      {edges.below && !edges.above ? (
        <button
          type="button"
          className="modal-scroll-hint"
          onClick={event => {
            const body = event.currentTarget.closest(".modal-scroll")?.querySelector(".modal-scroll-body");
            if (!body) return;
            body.scrollTo({ top: body.scrollHeight - body.clientHeight, behavior: "smooth" });
          }}
        >
          Scroll for more
        </button>
      ) : null}
    </div>
  );
}

export function Modal({ children, close, isolateClicks = false }) {
  const stop = isolateClicks ? event => event.stopPropagation() : undefined;
  const layerRef = useDialogDismiss(close);
  const { head, body, foot } = splitDialogChildren(children);
  return (
    <div className="modal-bg" ref={layerRef} onClick={stop}>
      <div className={`modal${close ? " has-corner-close" : ""}`} role="dialog" aria-modal="true" onClick={stop}>
        {close && <span className="modal-corner-close"><CloseButton onClick={close} /></span>}
        {head}
        <ModalScroll>{body}</ModalScroll>
        {foot ? <div className="modal-foot">{foot}</div> : null}
      </div>
    </div>
  );
}
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, busy = false, error = "", close, onConfirm }) {
  return <Modal close={() => !busy && close()}><h2 className="title">{title}</h2><p className="copy">{message}</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className={danger ? "danger primary" : "primary"} disabled={busy} onClick={onConfirm}>{busy ? "Please wait…" : confirmLabel}</Button></div></Modal>;
}
// Dialog with a title row and Close button; `actions` render after the body.
export function DialogModal({ title, close, children, actions, className = "" }) {
  const layerRef = useDialogDismiss(close);
  const { body, foot } = splitDialogChildren(children);
  const footer = actions || foot;
  return (
    <div className="modal-bg" ref={layerRef}>
      <div className={`modal${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row modal-head">
          <h2 className="title">{title}</h2>
          <CloseButton onClick={close} />
        </div>
        <ModalScroll>{body}</ModalScroll>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
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

// Loading indicator: a spinning ring, with the label for screen readers only. `size="sm"` sits inline (status lines,
// table cells); the default is centred in its block with breathing room.
export function Spinner({ label = "Loading", size = "md", className = "" }) {
  return <span className={`ft-spinner-wrap is-${size}${className ? ` ${className}` : ""}`} role="status" aria-live="polite">
    <span className="ft-spinner" aria-hidden="true" />
    <span className="ft-sr-only">{label}</span>
  </span>;
}

export function LoadingState({ label = "Loading" }) {
  return <Spinner label={label} />;
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

// Compact filter dropdown chip: "Account  All accounts ⌄", opening the themed list; highlighted while it filters
// (value differs from `allValue`).
export function FilterSelect({ label, value, onChange, allValue = "all", children }) {
  return <Select
    className={`ft-filter-select${String(value) !== String(allValue) ? " is-active" : ""}`}
    aria-label={label}
    value={value}
    onChange={event => onChange(event.target.value)}
    renderValue={option => <><span className="ft-filter-select-label">{label}</span><span className="ft-filter-select-value">{option?.label ?? value}</span></>}
  >{children}</Select>;
}

// Search box with a leading icon.
export function SearchInput({ label, className = "", ...props }) {
  return <label className={`ft-search${className ? ` ${className}` : ""}`}>
    <Search className="ft-search-icon" size={18} aria-hidden="true" />
    <input type="search" aria-label={label} {...props} />
  </label>;
}

// Download action: icon, "Export" and the file format as a small badge ("Export · CSV").
export function ExportButton({ format = "CSV", label = "Export", className = "", ...props }) {
  return <button type="button" className={`btn ft-export-btn${className ? ` ${className}` : ""}`} {...props}>
    <Download size={16} aria-hidden="true" />{label}<span className="ft-export-format">{format}</span>
  </button>;
}

// Several formats of the same export as one joined control: "⤓ Export | CSV | Excel | PDF".
export function ExportGroup({ formats, className = "" }) {
  return <div className={`ft-export-group${className ? ` ${className}` : ""}`} role="group" aria-label="Export">
    <span className="ft-export-group-label"><Download size={16} aria-hidden="true" />Export</span>
    {formats.map(item => <button key={item.id} type="button" onClick={item.onClick} disabled={item.disabled}>{item.label}</button>)}
  </div>;
}
