import { useEffect, useLayoutEffect, useRef } from "react";
import { revealPreset, useRevealIntent } from "./revealIntent.js";

const ANIMATION_ID = "ft-page-reveal";
// Modals and dialogs bring their own entrance; animating their full-screen backdrop would shift it.
const SKIP = ".modal-bg, [role='dialog'], [aria-modal='true']";

// The page's main content if it has one, otherwise the route's own root elements.
function pageRoot(container) {
  return container.querySelector("main, .shell") ?? container;
}

function play(elements, preset) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  elements
    .filter(element => element.nodeType === 1 && !element.matches(SKIP))
    .filter(element => !element.getAnimations?.().some(animation => animation.id === ANIMATION_ID && animation.playState === "running"))
    .forEach((element, index) => {
      // `translate` rather than `transform`, so elements that position themselves with transform keep doing so.
      const animation = element.animate(
        [{ opacity: 0, translate: `0 ${preset.y}px` }, {}],
        { duration: preset.duration * 1000, delay: Math.min(index, preset.maxStagger) * preset.stagger * 1000, easing: preset.ease, fill: "backwards" },
      );
      animation.id = ANIMATION_ID;
    });
}

// Reveals a page's top-level sections without wrapping each one: on every route change, and whenever a section
// appears later (a spinner replaced by data, a lazily loaded module). Uses the Web Animations API, so React's
// markup and class names are never touched.
export function PageReveal({ routeKey, intent, children }) {
  const preset = revealPreset(useRevealIntent(intent));
  const ref = useRef(null);
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || !preset || typeof Element === "undefined" || !Element.prototype.animate) return;
    const root = pageRoot(container);
    rootRef.current = root;
    play([...root.children], preset);
  }, [routeKey, preset]);

  useEffect(() => {
    const container = ref.current;
    if (!container || !preset || typeof MutationObserver === "undefined" || !Element.prototype.animate) return undefined;
    const observer = new MutationObserver(records => {
      const root = pageRoot(container);
      if (root !== rootRef.current) {
        rootRef.current = root;
        play([...root.children], preset);
        return;
      }
      const added = records.filter(record => record.target === root).flatMap(record => [...record.addedNodes]);
      if (added.length) play(added, preset);
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [preset]);

  return <div ref={ref} className="ft-page-reveal" style={{ display: "contents" }}>{children}</div>;
}
