import { createContext, useContext } from "react";

// How strongly <Reveal> animates, by page context.
//   trigger "view"  – waits until the element scrolls into view (once).
//   trigger "mount" – plays as soon as it renders, so data is never held back by scroll position.
//   stagger         – seconds between siblings that pass `index`; capped at `maxStagger` steps.
// SMOOTH decelerates evenly; curves with a sharper start make long fades look like a jump followed by a crawl.
const SMOOTH = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";

export const REVEAL_PRESETS = {
  landing: { trigger: "view", y: 18, duration: 0.95, stagger: 0.11, maxStagger: 6, ease: SMOOTH },
  functional: { trigger: "mount", y: 10, duration: 0.4, stagger: 0.05, maxStagger: 5, ease: SMOOTH },
  content: { trigger: "view", y: 12, duration: 0.85, stagger: 0, maxStagger: 0, ease: SMOOTH },
  none: null,
};

// `intent="none"` still fades images and code blocks marked `media`.
const MEDIA_PRESET = { trigger: "view", y: 0, duration: 0.6, stagger: 0, maxStagger: 0, ease: SMOOTH };

export const REVEAL_INTENTS = Object.keys(REVEAL_PRESETS);

export const RevealIntentContext = createContext("functional");

export function useRevealIntent(intent) {
  const inherited = useContext(RevealIntentContext);
  return REVEAL_INTENTS.includes(intent) ? intent : inherited;
}

export function revealPreset(intent, media = false) {
  const preset = REVEAL_PRESETS[intent];
  if (preset === undefined) return REVEAL_PRESETS.functional;
  return preset ?? (media ? MEDIA_PRESET : null);
}
