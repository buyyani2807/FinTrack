import { useEffect, useState } from "react";

// One IntersectionObserver per rootMargin, shared by every element on the page.
const observers = new Map();

function sharedObserver(rootMargin) {
  let shared = observers.get(rootMargin);
  if (!shared) {
    const callbacks = new WeakMap();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        callbacks.get(entry.target)?.();
        callbacks.delete(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin });
    shared = { observer, callbacks };
    observers.set(rootMargin, shared);
  }
  return shared;
}

// True once `ref` has entered the viewport; never flips back. Disabled or unsupported counts as already in view.
export function useInView(ref, { enabled = true, rootMargin = "0px 0px -6% 0px" } = {}) {
  const [seen, setSeen] = useState(false);
  const supported = typeof IntersectionObserver !== "undefined";
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !supported || seen || !node) return undefined;
    const { observer, callbacks } = sharedObserver(rootMargin);
    callbacks.set(node, () => setSeen(true));
    observer.observe(node);
    return () => {
      callbacks.delete(node);
      observer.unobserve(node);
    };
  }, [ref, enabled, supported, seen, rootMargin]);
  return !enabled || !supported || seen;
}
