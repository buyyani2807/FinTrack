import { useEffect, useRef } from "react";

// Escape closes only the topmost dialog, so a confirm sitting on another popup does not dismiss both.
export function useDialogDismiss(close) {
  const layerRef = useRef(null);
  useEffect(() => {
    if (!close) return undefined;
    const onKey = event => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const layers = [...document.querySelectorAll(".modal-bg, .ft-ask-backdrop")];
      if (layers.at(-1) !== layerRef.current) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return layerRef;
}
