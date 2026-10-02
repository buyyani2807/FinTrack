import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Wraps one tab row (its only child). When the tabs are wider than the screen the row scrolls sideways; the hidden
// side then fades out and shows an arrow, so it is clear there are more tabs. Classes are toggled on the wrapper
// directly (no state), and the arrows line up with the row whatever margins it has.
export function TabScroller({ children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const wrap = ref.current;
    const row = wrap?.querySelector(":scope > :not(.tab-scroller-arrow)");
    if (!row) return undefined;
    const update = () => {
      const max = row.scrollWidth - row.clientWidth;
      wrap.classList.toggle("has-start", max > 1 && row.scrollLeft > 2);
      wrap.classList.toggle("has-end", max > 1 && row.scrollLeft < max - 2);
      wrap.style.setProperty("--tab-scroller-top", `${row.offsetTop}px`);
      wrap.style.setProperty("--tab-scroller-h", `${row.offsetHeight}px`);
    };
    update();
    row.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(row);
    if (row.firstElementChild) observer?.observe(row.firstElementChild);
    return () => { row.removeEventListener("scroll", update); observer?.disconnect(); };
  });
  const scroll = direction => {
    const row = ref.current?.querySelector(":scope > :not(.tab-scroller-arrow)");
    row?.scrollBy({ left: direction * Math.max(120, row.clientWidth * 0.6), behavior: "smooth" });
  };
  return <div ref={ref} className={`tab-scroller ${className}`.trim()}>
    {children}
    <button type="button" className="tab-scroller-arrow is-start" tabIndex={-1} aria-label="Scroll tabs left" title="More tabs" onClick={() => scroll(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
    <button type="button" className="tab-scroller-arrow is-end" tabIndex={-1} aria-label="Scroll tabs right" title="More tabs" onClick={() => scroll(1)}><ChevronRight size={16} aria-hidden="true" /></button>
  </div>;
}
