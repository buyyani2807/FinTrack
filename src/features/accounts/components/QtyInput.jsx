import { useEffect } from "react";
import { wholeQuantity } from "../model/inventoryModel.js";

/** Whole-number quantity. No spinner, and a decimal point is not accepted. */
export function QtyInput({ value, onValue, ...rest }) {
  const shown = wholeQuantity(value);
  useEffect(() => {
    if (String(value ?? "") !== shown) onValue(shown);
  }, [value, shown, onValue]);
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
