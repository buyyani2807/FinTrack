import { useEffect, useRef, useState } from "react";
import { useInView } from "./useInView.js";
import "./typewriter.css";

const prefersReducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

// Types `text` once it scrolls into view. delay is ms before the first characters, speed is ms between ticks.
// onDone runs once the full text is shown.
export function TypewriterText({ text, as: Tag = "p", className, delay = 0, speed = 8, step = 1, onDone }) {
  const ref = useRef(null);
  const [reduced] = useState(prefersReducedMotion);
  const inView = useInView(ref, { enabled: !reduced, rootMargin: "0px 0px -10% 0px" });
  const [chars, setChars] = useState(0);
  const done = reduced || chars >= text.length;

  useEffect(() => {
    if (!inView || done) return undefined;
    const timer = setTimeout(() => setChars(count => Math.min(text.length, count + step)), chars === 0 ? delay : speed);
    return () => clearTimeout(timer);
  }, [inView, done, chars, delay, speed, step, text.length]);

  useEffect(() => {
    if (done) onDone?.();
  }, [done, onDone]);

  return <Tag ref={ref} className={["ui-typewriter", className].filter(Boolean).join(" ")}>
    <span className="ui-typewriter-sr">{text}</span>
    <span className="ui-typewriter-ghost" aria-hidden="true">{text}</span>
    <span className="ui-typewriter-typed" aria-hidden="true">
      {done ? text : text.slice(0, chars)}{inView && !done ? <span className="ui-typewriter-caret" /> : null}
    </span>
  </Tag>;
}
