import { useEffect, useRef } from "react";

// On narrow screens tab rows scroll sideways; this keeps each row's open tab in view. Returns the ref for the wrapper.
export function useActiveTabInView(deps) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelectorAll(".active").forEach(tab => {
      const row = tab.parentElement;
      if (!row || row.scrollWidth <= row.clientWidth) return;
      const offset = tab.getBoundingClientRect().left - row.getBoundingClientRect().left;
      row.scrollLeft += offset - (row.clientWidth - tab.offsetWidth) / 2;
    });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
