import { createContext, useContext, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import "./accordion.css";

const AccordionContext = createContext(null);
const ItemContext = createContext(null);

const cx = (...names) => names.filter(Boolean).join(" ");

// Single-open accordion. `collapsible` lets the open item close again.
export function Accordion({ defaultValue = null, collapsible = false, className, children }) {
  const [value, setValue] = useState(defaultValue);
  const toggle = itemValue => setValue(current => (current === itemValue ? (collapsible ? null : current) : itemValue));
  return <AccordionContext.Provider value={{ value, toggle }}>
    <div className={cx("ui-accordion", className)}>{children}</div>
  </AccordionContext.Provider>;
}

export function AccordionItem({ value, className, children }) {
  const accordion = useContext(AccordionContext);
  const id = useId();
  const open = accordion.value === value;
  return <ItemContext.Provider value={{ value, open, triggerId: `${id}-trigger`, contentId: `${id}-content` }}>
    <div className={cx("ui-accordion-item", className)} data-state={open ? "open" : "closed"}>{children}</div>
  </ItemContext.Provider>;
}

export function AccordionTrigger({ className, children }) {
  const { toggle } = useContext(AccordionContext);
  const { value, open, triggerId, contentId } = useContext(ItemContext);
  return <h3 className="ui-accordion-header">
    <button
      type="button"
      id={triggerId}
      className={cx("ui-accordion-trigger", className)}
      aria-expanded={open}
      aria-controls={contentId}
      data-state={open ? "open" : "closed"}
      onClick={() => toggle(value)}
    >
      <span>{children}</span>
      <ChevronDown className="ui-accordion-chevron" size={16} aria-hidden="true" />
    </button>
  </h3>;
}

export function AccordionContent({ className, children }) {
  const { open, triggerId, contentId } = useContext(ItemContext);
  return <div
    id={contentId}
    role="region"
    aria-labelledby={triggerId}
    className="ui-accordion-content"
    data-state={open ? "open" : "closed"}
    inert={!open}
  >
    <div className="ui-accordion-content-inner">
      <div className={cx("ui-accordion-content-body", className)}>{children}</div>
    </div>
  </div>;
}
