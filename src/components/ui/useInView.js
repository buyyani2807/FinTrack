import { useEffect, useState } from "react";

// One IntersectionObserver per rootMargin, shared by every element on the page.
const observers = new Map();
const pending = new Set();
let listening = false;

// Safari rejects a rootMargin that mixes px and %, and often never delivers the first
// intersection callback until a scroll. Reveal stays at opacity 0 and the typewriter never starts.
// Desktop Chrome and device-mode both use Chromium, so they hide this.
function safariRootMargin(rootMargin) {
  return rootMargin.replace(/0px/g, "0%");
}

function insets(rootMargin) {
  const vh = window.innerHeight || 0;
  const vw = window.innerWidth || 0;
  const parts = rootMargin.trim().split(/\s+/);
  const [top, right = top, bottom = top, left = right] = parts;
  const length = (token, size) => {
    if (!token) return 0;
    if (token.endsWith("%")) return (parseFloat(token) / 100) * size;
    return parseFloat(token) || 0;
  };
  return { top: length(top, vh), right: length(right, vw), bottom: length(bottom, vh), left: length(left, vw) };
}

function intersects(node, rootMargin) {
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const inset = insets(rootMargin);
  const vh = window.innerHeight || 0;
  const vw = window.innerWidth || 0;
  return rect.bottom > inset.top && rect.right > inset.left && rect.top < vh - inset.bottom && rect.left < vw - inset.right;
}

function checkPending() {
  for (const item of pending) {
    if (!item.node.isConnected) continue;
    if (!intersects(item.node, item.rootMargin)) continue;
    pending.delete(item);
    item.mark();
  }
  if (pending.size === 0) stopListening();
}

function ensureListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("scroll", checkPending, { passive: true, capture: true });
  window.addEventListener("resize", checkPending);
  window.visualViewport?.addEventListener("resize", checkPending);
  window.visualViewport?.addEventListener("scroll", checkPending);
}

function stopListening() {
  if (!listening || typeof window === "undefined") return;
  listening = false;
  window.removeEventListener("scroll", checkPending, true);
  window.removeEventListener("resize", checkPending);
  window.visualViewport?.removeEventListener("resize", checkPending);
  window.visualViewport?.removeEventListener("scroll", checkPending);
}

function sharedObserver(rootMargin) {
  const key = safariRootMargin(rootMargin);
  let shared = observers.get(key);
  if (!shared) {
    const callbacks = new WeakMap();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        callbacks.get(entry.target)?.();
        callbacks.delete(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: key });
    shared = { observer, callbacks };
    observers.set(key, shared);
  }
  return shared;
}

// True once `ref` has entered the viewport; never flips back. Disabled or unsupported counts as already in view.
export function useInView(ref, { enabled = true, rootMargin = "0px 0px -6% 0px" } = {}) {
  const [seen, setSeen] = useState(false);
  const supported = typeof IntersectionObserver !== "undefined";
  useEffect(() => {
    const node = ref.current;
    if (!enabled || seen || !node) return undefined;
    let stopped = false;
    const item = {
      node,
      rootMargin,
      mark: () => {
        if (!stopped) setSeen(true);
      },
    };
    pending.add(item);
    ensureListening();
    checkPending();
    const frame = requestAnimationFrame(checkPending);
    const later = setTimeout(checkPending, 300);

    let shared = null;
    if (supported) {
      try {
        shared = sharedObserver(rootMargin);
        shared.callbacks.set(node, item.mark);
        shared.observer.observe(node);
      } catch {
        shared = null;
      }
    }

    return () => {
      stopped = true;
      pending.delete(item);
      cancelAnimationFrame(frame);
      clearTimeout(later);
      if (pending.size === 0) stopListening();
      if (!shared) return;
      shared.callbacks.delete(node);
      shared.observer.unobserve(node);
    };
  }, [ref, enabled, supported, seen, rootMargin]);
  return !enabled || seen;
}
