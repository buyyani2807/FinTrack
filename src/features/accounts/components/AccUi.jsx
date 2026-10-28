import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Activity, ArrowLeftRight, CalendarRange, ChevronDown, CreditCard, FileUp, History, Inbox, Landmark, ListTree, Lock, Package, Percent, Repeat, ShieldCheck, Sparkles, UserCog, Users } from "lucide-react";
import { LIST_PAGE_SIZE } from "../model/accountsList.js";
import { CloseButton, LabeledField, ModalScroll } from "../../../components/ui.jsx";
import { useDialogDismiss } from "../../../components/useDialogDismiss.js";

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
function placeMoreMenu(rect, align, menuWidth, menuHeight) {
  const view = window.visualViewport;
  const viewLeft = view?.offsetLeft || 0;
  const viewTop = view?.offsetTop || 0;
  const viewWidth = view?.width || window.innerWidth;
  const viewHeight = view?.height || window.innerHeight;
  const margin = 8;
  const nav = document.querySelector(".accounts-dashboard .acc-bottom-nav");
  let limitBottom = viewTop + viewHeight - margin;
  if (nav && getComputedStyle(nav).display !== "none") {
    const navTop = nav.getBoundingClientRect().top;
    if (navTop > viewTop + 80) limitBottom = Math.min(limitBottom, navTop - margin);
  }
  const width = Math.min(Math.max(menuWidth, 1), viewWidth - margin * 2);
  const minLeft = viewLeft + margin;
  const maxLeft = Math.max(minLeft, viewLeft + viewWidth - width - margin);
  const preferredLeft = align === "start" ? rect.left : rect.right - width;
  const left = Math.min(Math.max(minLeft, preferredLeft), maxLeft);
  const spaceBelow = Math.max(0, limitBottom - (rect.bottom + 6));
  const spaceAbove = Math.max(0, rect.top - 6 - (viewTop + margin));
  const openDown = spaceBelow >= menuHeight || spaceBelow >= spaceAbove;
  const room = openDown ? spaceBelow : spaceAbove;
  const maxHeight = Math.min(menuHeight, room > 0 ? room : viewHeight - margin * 2);
  let top = openDown ? rect.bottom + 6 : rect.top - 6 - maxHeight;
  const minTop = viewTop + margin;
  const maxTop = Math.max(minTop, limitBottom - maxHeight);
  top = Math.min(Math.max(minTop, top), maxTop);
  return {
    position: "fixed",
    zIndex: 80,
    left: Math.round(left),
    right: "auto",
    top: Math.round(top),
    bottom: "auto",
    maxWidth: Math.round(viewWidth - margin * 2),
    maxHeight: Math.max(1, Math.round(maxHeight)),
  };
}

export function AccMoreMenu({
  label = "More",
  items = [],
  align = "end",
  className = "",
  buttonClassName = "btn",
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const root = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);
  const menuId = useId();
  const visible = (items || []).filter(item => item && (item.separator || item.label));

  // Tables scroll inside an overflow box that would clip an absolute menu, so the menu is fixed to the
  // viewport next to its button. On a phone the trigger often sits on the left, so the menu is clamped
  // inside the visible viewport instead of extending off the left edge.
  const toggle = () => setOpen(current => !current);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const trigger = root.current?.querySelector("button");
    const menu = menuRef.current;
    const list = listRef.current;
    if (!trigger || !menu || !list) return undefined;
    const apply = style => {
      menu.style.position = style.position;
      menu.style.zIndex = String(style.zIndex);
      menu.style.left = `${style.left}px`;
      menu.style.right = "auto";
      menu.style.top = `${style.top}px`;
      menu.style.bottom = "auto";
      menu.style.maxWidth = `${style.maxWidth}px`;
      list.style.maxHeight = `${style.maxHeight}px`;
    };
    const measure = () => placeMoreMenu(
      trigger.getBoundingClientRect(),
      align,
      Math.ceil(menu.getBoundingClientRect().width),
      Math.ceil(list.scrollHeight),
    );
    apply(measure());
    const placed = measure();
    apply(placed);
    setMenuStyle(placed);
    const moreBelow = list.scrollHeight - list.clientHeight > 2;
    setHasMoreBelow(current => current === moreBelow ? current : moreBelow);
    return undefined;
  }, [open, align, visible.length]);

  useEffect(() => {
    if (!open) return undefined;
    const trigger = root.current?.querySelector("button");
    const origin = trigger?.getBoundingClientRect();
    let armScroll = false;
    const onDoc = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const onKey = event => {
      if (event.key === "Escape") setOpen(false);
    };
    // Tab rows scroll themselves into place after the page opens. That scroll used to
    // dismiss this menu before a choice could be made. Close only once the trigger
    // itself has moved, and not while a tab row is the thing scrolling.
    const onScroll = event => {
      if (!armScroll) return;
      const target = event.target;
      if (target instanceof Element && (root.current?.contains(target) || target.closest(".tab-scroller"))) return;
      const next = trigger?.getBoundingClientRect();
      if (!origin || !next) return;
      if (Math.abs(next.top - origin.top) > 2 || Math.abs(next.left - origin.left) > 2) setOpen(false);
    };
    const onResize = () => setOpen(false);
    const arm = window.setTimeout(() => { armScroll = true; }, 350);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
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
        onClick={toggle}
      >
        {label}
      </button>
      {open ? (
        <div ref={menuRef} className={`acc-more-menu${hasMoreBelow ? " has-more-below" : ""}`} id={menuId} role="menu" style={menuStyle ? { position: menuStyle.position, zIndex: menuStyle.zIndex, left: menuStyle.left, right: menuStyle.right, top: menuStyle.top, bottom: menuStyle.bottom, maxWidth: menuStyle.maxWidth } : undefined}>
          <div
            ref={listRef}
            className="acc-more-menu-list"
            style={menuStyle ? { maxHeight: menuStyle.maxHeight } : undefined}
            onScroll={event => {
              const list = event.currentTarget;
              const moreBelow = list.scrollHeight - list.clientHeight - list.scrollTop > 2;
              setHasMoreBelow(current => current === moreBelow ? current : moreBelow);
            }}
          >
          {visible.map(item => item.separator ? (
            <div key={item.id || "separator"} className="acc-more-sep" role="separator" />
          ) : (
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
          {hasMoreBelow ? (
            <button
              type="button"
              className="acc-more-more"
              aria-label="Show more options"
              onClick={event => {
                const list = event.currentTarget.closest(".acc-more-menu")?.querySelector(".acc-more-menu-list");
                if (!list) return;
                const next = Math.min(
                  list.scrollHeight - list.clientHeight,
                  list.scrollTop + Math.max(96, Math.round(list.clientHeight * 0.72)),
                );
                const before = list.scrollTop;
                list.scrollTo({ top: next, behavior: "smooth" });
                window.requestAnimationFrame(() => {
                  if (list.scrollTop <= before) list.scrollTop = next;
                });
              }}
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


export const Field = LabeledField;
export function FilterField({ label, children, className = "" }) {
  return <label className={`accounts-filter-field ${className}`.trim()}><span className="small">{label}</span>{children}</label>;
}
// Label/value card without the click and hint behaviour of AccMetric.
export function SimpleMetric({ label, value, tone = "" }) {
  return <article className="card acc-metric-card"><div className="metric-label">{label}</div><div className={`metric-value ${tone}`.trim()}>{value}</div></article>;
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
export const AccEmpty = ({ title, copy, actionLabel, onAction, icon: Icon = Inbox }) => (
  <div className="card acc-empty">
    <span className="acc-empty-icon" aria-hidden="true"><Icon size={22} /></span>
    <strong>{title}</strong>
    <p className="copy">{copy}</p>
    {actionLabel && onAction && <button type="button" className="btn primary" onClick={onAction}>{actionLabel}</button>}
  </div>
);
export function AccPager({ page, pages, total, from, to, onPage, noun = "rows" }) {
  if (!(pages > 1)) return null;
  const start = from || (page - 1) * LIST_PAGE_SIZE + 1;
  const end = to || Math.min(page * LIST_PAGE_SIZE, total);
  const numbers = pages <= 7 ? Array.from({ length: pages }, (_, index) => index + 1) : [];
  const go = next => { if (next !== page) onPage(next); };
  return (
    <div className="acc-pager">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
      <span className="small">Showing {start}–{end} of {total} {noun}</span>
      {numbers.length ? (
        <span className="acc-pager-pages">
          {numbers.map(number => (
            <button key={number} type="button" className={`btn${number === page ? " primary" : ""}`} aria-current={number === page ? "page" : undefined} onClick={() => go(number)}>{number}</button>
          ))}
        </span>
      ) : null}
      <button type="button" className="btn" disabled={page >= pages} onClick={() => go(page + 1)}>Next</button>
    </div>
  );
}
// Setup sections pass a short code for their icon; each maps to a line icon (unknown codes show as text).
const SETUP_ICONS = {
  FY: CalendarRange, GST: Percent, "#": ListTree, P: Users, "✓": ShieldCheck, $: CreditCard, "♥": Activity,
  "↔": ArrowLeftRight, I: Package, L: Lock, R: UserCog, "↻": Repeat, A: History, B: Landmark,
  AI: Sparkles, "↥": FileUp,
};
export function AccSetupSection({ icon, title, copy, actions, children, collapsible = false, summary = "" }) {
  const [open, setOpen] = useState(!collapsible);
  const panelId = useId();
  const toggleId = useId();
  const SetupIcon = SETUP_ICONS[icon];
  return (
    <section className={`card acc-setup-card${collapsible && !open ? " collapsed" : ""}`}>
      <header className="acc-setup-head">
        <span className="acc-setup-icon" aria-hidden="true">{SetupIcon ? <SetupIcon size={18} /> : icon}</span>
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
          <ChevronDown className="acc-setup-chevron" size={18} aria-hidden="true" />
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

/** Inline Show/Hide for a long list inside an otherwise open setup card. */
export function AccReveal({ summary, children, defaultOpen = false, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const toggleId = useId();
  return (
    <div className={`acc-reveal${className ? ` ${className}` : ""}`.trim()}>
      <button
        type="button"
        id={toggleId}
        className="acc-setup-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(current => !current)}
      >
        <span>{open ? `Hide ${summary}` : `Show ${summary}`}</span>
        <ChevronDown className="acc-setup-chevron" size={18} aria-hidden="true" />
      </button>
      <div
        id={panelId}
        className="acc-reveal-body"
        role="region"
        aria-labelledby={toggleId}
        hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}
export const AccSkeleton = () => (
  <div className="acc-skeleton" aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <div key={index} className="acc-skel" />)}
  </div>
);
export function Modal({ title, close, children, actions, className = "", wide = false, panelClassName = "" }) {
  const layerRef = useDialogDismiss(close);
  return (
    <div ref={layerRef} className={`modal-bg${className ? ` ${className}` : ""}`} role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={`modal acc-modal${wide ? " acc-modal-wide" : ""}${panelClassName ? ` ${panelClassName}` : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row modal-head">
          <h2 className="title">{title}</h2>
          <CloseButton onClick={close} />
        </div>
        <ModalScroll>{children}</ModalScroll>
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
