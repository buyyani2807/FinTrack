import { Children, useEffect, useRef, useState } from "react";

function SliderArrow({ direction }) {
  const previous = direction === "prev";
  return (
    <svg className="ft-card-slider-arrow-icon" viewBox="0 0 40 120" aria-hidden="true">
      <path
        d={previous ? "M30 8 8 60l22 52" : "M10 8l22 52L10 112"}
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Horizontal card row with the same edge arrows and peek as Who to collect first.
export function CardSlider({ children, label, className = "" }) {
  const listRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const items = Children.toArray(children).filter(Boolean);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const update = () => {
      const cards = [...el.querySelectorAll(":scope > *")];
      const last = cards[cards.length - 1]?.getBoundingClientRect();
      setCanPrev(el.scrollLeft > 4);
      setCanNext(Boolean(last && last.right > el.getBoundingClientRect().right + 4));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [items.length]);

  const slide = direction => {
    const el = listRef.current;
    const cards = [...(el?.querySelectorAll(":scope > *") || [])];
    if (!el || !cards.length) return;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 16;
    const stride = cards[0].getBoundingClientRect().width + gap;
    const page = Math.max(1, Math.floor((el.clientWidth + 1) / stride));
    const origin = el.getBoundingClientRect().left;
    let current = cards.findIndex(card => card.getBoundingClientRect().left >= origin - 8);
    if (current < 0) current = cards.length - 1;
    const target = cards[Math.min(cards.length - 1, Math.max(0, current + direction * page))];
    const side = Math.max(0, (el.clientWidth - cards[0].getBoundingClientRect().width) / 2);
    const peek = page === 1 && target !== cards[0] ? side : 0;
    const left = el.scrollLeft + target.getBoundingClientRect().left - origin - peek;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  };

  if (!items.length) return null;
  return (
    <div className={`ft-card-slider${canPrev ? " has-prev" : ""}${canNext ? " has-next" : ""}${className ? ` ${className}` : ""}`}>
      {items.length > 1 ? (
        <button type="button" className="ft-card-slider-arrow is-prev" aria-label="Previous cards" disabled={!canPrev} onClick={() => slide(-1)}>
          <SliderArrow direction="prev" />
        </button>
      ) : null}
      <div className="ft-card-slider-track" ref={listRef} tabIndex={0} aria-label={label}>
        {items}
      </div>
      {items.length > 1 ? (
        <button type="button" className="ft-card-slider-arrow is-next" aria-label="Next cards" disabled={!canNext} onClick={() => slide(1)}>
          <SliderArrow direction="next" />
        </button>
      ) : null}
    </div>
  );
}
