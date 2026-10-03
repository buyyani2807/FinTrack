import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

// Plain text of option children, for type-ahead and the hidden validity input.
const textOf = node => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf(node.props.children);
  return "";
};

// <option> children (arrays, fragments and conditionals included) as { value, label, text, disabled }.
const optionsFrom = children => {
  const list = [];
  const walk = nodes => Children.forEach(nodes, child => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) return walk(child.props.children);
    if (child.type === "option") {
      const text = textOf(child.props.children);
      list.push({ value: String(child.props.value ?? text), label: child.props.children, text, disabled: Boolean(child.props.disabled) });
    }
  });
  walk(children);
  return list;
};

const MENU_GAP = 4;
const MENU_MAX = 320;

// Under the trigger, or above it when the space below is short; never wider than the screen.
const placeMenu = trigger => {
  const rect = trigger?.getBoundingClientRect();
  if (!rect) return null;
  const viewH = window.innerHeight;
  const viewW = document.documentElement.clientWidth;
  const below = viewH - rect.bottom - MENU_GAP - 8;
  const above = rect.top - MENU_GAP - 8;
  const up = below < Math.min(MENU_MAX, 200) && above > below;
  const width = Math.min(Math.max(rect.width, 180), viewW - 16);
  const left = Math.min(Math.max(8, rect.left), viewW - width - 8);
  return { left, width, maxHeight: Math.min(MENU_MAX, up ? above : below), ...(up ? { bottom: viewH - rect.top + MENU_GAP } : { top: rect.bottom + MENU_GAP }) };
};

/**
 * Themed replacement for <select>. Takes the same <option> children (or `options`) and calls onChange with an
 * event-like object, so `onChange={event => set(event.target.value)}` keeps working. The trigger is a combobox
 * button (labelled by a wrapping <label> or aria-label); the list opens in a portal under it, or above it when
 * there is no room, and supports arrows, Home/End, Enter, Escape and type-ahead.
 * `renderValue(option)` customises the trigger content; `bare` drops the field look and the chevron, for pickers
 * whose trigger is a whole card (avatar, name, their own chevron) styled by `className`.
 */
export function Select({
  value, onChange, children, options, disabled = false, required = false, placeholder = "", className = "",
  menuClassName = "", renderValue, bare = false, id, name, title, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy,
}) {
  const items = options ? options.map(option => ({ ...option, value: String(option.value), text: option.text ?? textOf(option.label) })) : optionsFrom(children);
  const current = String(value ?? "");
  const selectedIndex = items.findIndex(item => item.value === current);
  const selected = items[selectedIndex] || null;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const optionId = index => `${listId}-o${index}`;

  const firstEnabled = (from, step) => {
    for (let index = from; index >= 0 && index < items.length; index += step) if (!items[index].disabled) return index;
    return -1;
  };
  const openMenu = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1));
    setPosition(placeMenu(triggerRef.current));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const choose = index => {
    const item = items[index];
    if (!item || item.disabled) return;
    close();
    if (item.value !== current) onChange?.({ target: { value: item.value, name }, currentTarget: { value: item.value, name } });
  };

  // Keep the list under the trigger while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return undefined;
    const follow = () => setPosition(placeMenu(triggerRef.current));
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => { window.removeEventListener("resize", follow); window.removeEventListener("scroll", follow, true); };
  }, [open]);

  // Close on a press outside the trigger and the list.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open && active >= 0) menuRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, position]);

  const typeAhead = (key, now) => {
    typed.current = { text: (now - typed.current.at > 700 ? "" : typed.current.text) + key.toLowerCase(), at: now };
    const start = open ? active : selectedIndex;
    const order = items.map((_, index) => (start + 1 + index) % items.length);
    const match = order.find(index => !items[index].disabled && items[index].text.toLowerCase().startsWith(typed.current.text));
    if (match === undefined) return;
    if (open) setActive(match);
    else choose(match);
  };

  const onKeyDown = event => {
    if (disabled) return;
    const { key } = event;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) { event.preventDefault(); openMenu(); return; }
      if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) typeAhead(key, event.timeStamp);
      return;
    }
    if (key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (key === "Tab") { setOpen(false); return; }
    if (key === "ArrowDown") { event.preventDefault(); setActive(index => { const next = firstEnabled(index + 1, 1); return next < 0 ? index : next; }); return; }
    if (key === "ArrowUp") { event.preventDefault(); setActive(index => { const next = firstEnabled(index - 1, -1); return next < 0 ? index : next; }); return; }
    if (key === "Home") { event.preventDefault(); setActive(firstEnabled(0, 1)); return; }
    if (key === "End") { event.preventDefault(); setActive(firstEnabled(items.length - 1, -1)); return; }
    if (key === "Enter" || key === " ") { event.preventDefault(); choose(active); return; }
    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) typeAhead(key, event.timeStamp);
  };

  const shown = renderValue ? renderValue(selected) : (selected ? selected.label : placeholder || "Select…");
  return <>
    <button
      ref={triggerRef}
      type="button"
      id={id}
      title={title}
      className={`ft-select${bare ? " ft-select-bare" : ""}${open ? " is-open" : ""}${!selected ? " is-placeholder" : ""}${className ? ` ${className}` : ""}`}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-required={required || undefined}
      disabled={disabled}
      onClick={() => (open ? close() : openMenu())}
      onKeyDown={onKeyDown}
    >
      <span className="ft-select-value">{shown}</span>
      {!bare && <ChevronDown className="ft-select-chevron" size={16} aria-hidden="true" />}
    </button>
    {required && <input className="ft-select-validity" tabIndex={-1} aria-hidden="true" required value={selected?.value || ""} onChange={() => {}} onFocus={() => triggerRef.current?.focus()} />}
    {open && position && createPortal(
      <ul
        ref={menuRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel || textOf(shown) || "Options"}
        className={`ft-select-menu${menuClassName ? ` ${menuClassName}` : ""}`}
        style={position}
        onMouseDown={event => event.preventDefault()}
        onClick={event => event.stopPropagation()}
      >
        {items.map((item, index) => <li
          key={`${item.value}-${index}`}
          id={optionId(index)}
          data-index={index}
          role="option"
          aria-selected={index === selectedIndex}
          aria-disabled={item.disabled || undefined}
          className={`ft-select-option${index === active ? " is-active" : ""}${index === selectedIndex ? " is-selected" : ""}${item.disabled ? " is-disabled" : ""}`}
          onMouseEnter={() => !item.disabled && setActive(index)}
          onClick={() => choose(index)}
        >
          <span className="ft-select-option-label">{item.label}</span>
          {index === selectedIndex && <Check className="ft-select-check" size={16} aria-hidden="true" />}
        </li>)}
        {!items.length && <li className="ft-select-empty" role="presentation">No options</li>}
      </ul>,
      document.body,
    )}
  </>;
}

// Field (components/ui.jsx) gives a single control an id for its <label htmlFor>; the trigger button takes it.
Select.fieldControl = true;
