import { useRef } from "react";
import { RevealIntentContext, revealPreset, useRevealIntent } from "./revealIntent.js";
import { useInView } from "./useInView.js";
import "./reveal.css";

// Sets the default intent for every <Reveal> below it: "landing" | "functional" | "content" | "none".
export function RevealProvider({ intent, children }) {
  return <RevealIntentContext.Provider value={intent}>{children}</RevealIntentContext.Provider>;
}

// Animates its element in according to the page's intent. `index` staggers siblings (ignored by "content").
// y, duration and ease override the preset for one element.
export function Reveal({
  intent,
  media = false,
  as: Tag = "div",
  index = 0,
  delay = 0,
  y,
  duration,
  ease,
  className,
  style,
  children,
  ...rest
}) {
  const preset = revealPreset(useRevealIntent(intent), media);
  const ref = useRef(null);
  const inView = useInView(ref, { enabled: preset?.trigger === "view" });

  if (!preset) return <Tag ref={ref} className={className} style={style} {...rest}>{children}</Tag>;

  const step = Math.min(Math.max(index, 0), preset.maxStagger);
  const motion = {
    "--reveal-y": `${y ?? preset.y}px`,
    "--reveal-duration": `${duration ?? preset.duration}s`,
    "--reveal-delay": `${delay + step * preset.stagger}s`,
    "--reveal-ease": ease ?? preset.ease,
  };
  return <Tag
    ref={ref}
    className={["ui-reveal", inView && "is-visible", className].filter(Boolean).join(" ")}
    style={{ ...motion, ...style }}
    {...rest}
  >{children}</Tag>;
}