import { useMemo, useState } from "react";
import { sortByDate } from "./dateSort.js";

/** Sort rows by date; starts with newest first. Toggle flips direction. */
export function useDateSort(rows, keyOrFn, defaultDirection = "desc") {
  const [direction, setDirection] = useState(defaultDirection);
  const sorted = useMemo(() => sortByDate(rows, keyOrFn, direction), [rows, keyOrFn, direction]);
  const toggle = () => setDirection(current => (current === "desc" ? "asc" : "desc"));
  return { sorted, direction, toggle, setDirection };
}
