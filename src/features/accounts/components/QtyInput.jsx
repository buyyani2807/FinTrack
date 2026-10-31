import { useEffect, useRef } from "react";
import { wholeQuantity } from "../model/inventoryModel.js";

/** Whole-number quantity. No spinner, and a decimal point is not accepted. */
export function QtyInput({ value, onValue, ...rest }) {
  const shown = wholeQuantity(value);
  const onValueRef = useRef(onValue);
  useEffect(() => { onValueRef.current = onValue; });
  // Sync parent when a non-whole value is passed in. Keep onValue out of deps so
  // inline handlers in tables do not re-fire this effect every render.
  useEffect(() => {
    if (String(value ?? "") !== shown) onValueRef.current?.(shown);
  }, [value, shown]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      onChange={event => onValue(wholeQuantity(event.target.value))}
    />
  );
}
