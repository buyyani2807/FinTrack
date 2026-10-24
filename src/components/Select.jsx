import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { optionMatchesQuery } from "./selectOptions.js";

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
// A short list stays a plain menu. Longer lists get a box you can type into.
const SEARCH_AT = 8;

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
 * there is no room. Lists of eight or more options open with a search box that matches any part of the label.
 * Shorter lists keep keyboard type-ahead, also matching any part of the label.
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
  const [moreBelow, setMoreBelow] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState("");
  const typed = useRef({ text: "", at: 0 });
  const highlightFromPointer = useRef(false);
  const searchRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const listId = useId();
  const optionId = index => `${listId}-o${index}`;
  const searchable = items.length >= SEARCH_AT;
  const filtered = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => optionMatchesQuery(item.text, query));

  const firstEnabled = (from, step) => {
    for (let index = from; index >= 0 && index < items.length; index += step) if (!items[index].disabled) return index;
    return -1;
  };
  const openMenu = (initialQuery = "") => {
    if (disabled) return;
    setQuery(initialQuery);
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1));
    setPosition(placeMenu(triggerRef.current));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };
  const stepFiltered = (fromIndex, step) => {
    const pos = filtered.findIndex(row => row.index === fromIndex);
    const start = pos < 0 ? (step > 0 ? -1 : filtered.length) : pos;
    for (let index = start + step; index >= 0 && index < filtered.length; index += step) {
      if (!filtered[index].item.disabled) return filtered[index].index;
    }
    return fromIndex;
  };
  const choose = index => {
    const item = items[index];
    if (!item || item.disabled) return;
    close();
    if (item.value !== current) onChange?.({ target: { value: item.value, name }, currentTarget: { value: item.value, name } });
  };

  // Keep the list under the trigger while the page scrolls or resizes.
  // Scrolling inside the list must not count: that was resetting the position and
  // jumping the list back to the top on phones.
  useEffect(() => {
    if (!open) return undefined;
    const follow = event => {
      const list = listRef.current;
      const target = event?.target;
      if (list && target instanceof Node && (target === list || list.contains(target))) return;
      const next = placeMenu(triggerRef.current);
      setPosition(current => {
        if (!next) return null;
        if (current && current.left === next.left && current.width === next.width && current.maxHeight === next.maxHeight && current.top === next.top && current.bottom === next.bottom) return current;
        return next;
      });
    };
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

  // Keep the highlighted option in view when it changes from the keyboard or type-ahead.
  // Position updates must not scroll the list, or a finger scroll snaps back to the top.
  useEffect(() => {
    if (!open || active < 0) return;
    if (highlightFromPointer.current) { highlightFromPointer.current = false; return; }
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const syncMore = () => {
    const list = listRef.current;
    if (!list) return;
    const more = list.scrollHeight - list.clientHeight - list.scrollTop > 2;
    setMoreBelow(current => current === more ? current : more);
  };

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(syncMore);
    return () => cancelAnimationFrame(frame);
  }, [open, position, filtered.length]);

  // A long list opens on its search box, so the first letters filter instead of picking an item.
  useEffect(() => {
    if (!open || !searchable) return undefined;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const list = itemsRef.current;
    const q = query.trim().toLowerCase();
    if (!q) {
      const currentIndex = list.findIndex(item => item.value === String(value ?? ""));
      setActive(currentIndex >= 0 ? currentIndex : list.findIndex(item => !item.disabled));
      return;
    }
    setActive(list.findIndex(item => !item.disabled && optionMatchesQuery(item.text, q)));
  }, [open, query, value]);

  const scrollMore = event => {
    event.preventDefault();
    event.stopPropagation();
    const list = listRef.current;
    if (!list) return;
    const next = Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + Math.max(96, Math.round(list.clientHeight * 0.72)));
    const before = list.scrollTop;
    list.scrollTo({ top: next, behavior: "smooth" });
    requestAnimationFrame(() => { if (list.scrollTop <= before) list.scrollTop = next; });
  };

  const typeAhead = (key, now) => {
    typed.current = { text: (now - typed.current.at > 700 ? "" : typed.current.text) + key.toLowerCase(), at: now };
    const q = typed.current.text;
    const matches = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.disabled && item.text.toLowerCase().includes(q));
    if (!matches.length) return;
    const start = open ? active : selectedIndex;
    const ordered = [...matches.filter(row => row.index > start), ...matches.filter(row => row.index <= start)];
    const preferred = ordered.find(row => row.item.text.toLowerCase().startsWith(q)) || ordered[0];
    if (open) setActive(preferred.index);
    else choose(preferred.index);
  };

  const moveInList = event => {
    const { key } = event;
    if (key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return true; }
    if (key === "Tab") { setOpen(false); setQuery(""); return true; }
    if (key === "ArrowDown") { event.preventDefault(); setActive(index => stepFiltered(index, 1)); return true; }
    if (key === "ArrowUp") { event.preventDefault(); setActive(index => stepFiltered(index, -1)); return true; }
    if (key === "Home") { event.preventDefault(); setActive(filtered.find(row => !row.item.disabled)?.index ?? -1); return true; }
    if (key === "End") {
      event.preventDefault();
      const last = [...filtered].reverse().find(row => !row.item.disabled);
      setActive(last?.index ?? -1);
      return true;
    }
    if (key === "Enter") { event.preventDefault(); choose(active); return true; }
    return false;
  };

  const onKeyDown = event => {
    if (disabled) return;
    const { key } = event;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) { event.preventDefault(); openMenu(); return; }
      if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (searchable) openMenu(key);
        else typeAhead(key, event.timeStamp);
      }
      return;
    }
    if (searchable && key === "Backspace") { event.preventDefault(); setQuery(current => current.slice(0, -1)); return; }
    if (searchable && key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      setQuery(current => current + key);
      return;
    }
    if (moveInList(event)) return;
    if (key === " ") { event.preventDefault(); choose(active); return; }
    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) typeAhead(key, event.timeStamp);
  };

  const onSearchKeyDown = event => {
    if (moveInList(event)) return;
    event.stopPropagation();
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
      <div
        ref={menuRef}
        className={`ft-select-popover${moreBelow ? " has-more-below" : ""}`}
        style={{ left: position.left, width: position.width, ...(position.top != null ? { top: position.top } : { bottom: position.bottom }) }}
        onMouseDown={event => { if (event.target instanceof HTMLInputElement) return; event.preventDefault(); }}
        onClick={event => event.stopPropagation()}
      >
      {searchable && (
        <div className="ft-select-search">
          <input
            ref={searchRef}
            value={query}
            placeholder="Type to search"
            aria-label="Search options"
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>
      )}
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel || textOf(shown) || "Options"}
        className={`ft-select-menu${menuClassName ? ` ${menuClassName}` : ""}`}
        style={{ maxHeight: Math.max(120, position.maxHeight - (searchable ? 52 : 0)) }}
        onScroll={syncMore}
      >
        {filtered.map(({ item, index }) => <li
          key={`${item.value}-${index}`}
          id={optionId(index)}
          data-index={index}
          role="option"
          aria-selected={index === selectedIndex}
          aria-disabled={item.disabled || undefined}
          className={`ft-select-option${index === active ? " is-active" : ""}${index === selectedIndex ? " is-selected" : ""}${item.disabled ? " is-disabled" : ""}`}
          onMouseEnter={() => { if (item.disabled) return; highlightFromPointer.current = true; setActive(index); }}
          onClick={() => choose(index)}
        >
          <span className="ft-select-option-label">{item.label}</span>
          {index === selectedIndex && <Check className="ft-select-check" size={16} aria-hidden="true" />}
        </li>)}
        {!filtered.length && <li className="ft-select-empty" role="presentation">{items.length ? "No matches" : "No options"}</li>}
      </ul>
      {moreBelow ? <button type="button" className="ft-select-more" aria-label="Show more options" onClick={scrollMore}><ChevronDown size={16} aria-hidden="true" /></button> : null}
      </div>,
      document.body,
    )}
  </>;
}

// Field (components/ui.jsx) gives a single control an id for its <label htmlFor>; the trigger button takes it.
Select.fieldControl = true;
