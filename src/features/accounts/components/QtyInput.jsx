import { useEffect, useRef } from "react";
import { parseItemQuantity } from "../model/inventoryModel.js";

/** Quantity input. Count units stay whole; weight/volume units allow up to 3 decimals. */
export function QtyInput({ value, onValue, unit = "Nos", ...rest }) {
  const shown = parseItemQuantity(value, unit);
  const onValueRef = useRef(onValue);
  useEffect(() => { onValueRef.current = onValue; });
  // Sync parent when a value is incompatible with the unit. Keep onValue out of deps so
  // inline handlers in tables do not re-fire this effect every render.
  useEffect(() => {
    if (String(value ?? "") !== shown) onValueRef.current?.(shown);
  }, [value, shown]);
  return (
    <input
      {...rest}
      type="text"
      inputMode={String(shown).includes(".") || unit === "Kg" || unit === "Gram" || unit === "Litre" || unit === "Millilitre" ? "decimal" : "numeric"}
      autoComplete="off"
      value={shown}
      onChange={event => onValue(parseItemQuantity(event.target.value, unit))}
    />
  );
}
