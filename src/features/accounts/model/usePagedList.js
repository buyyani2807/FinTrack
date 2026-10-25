import { useState } from "react";
import { pageSlice } from "./accountsList.js";

/** Page a list already in memory. A new reset key returns to page 1. */
export function usePagedList(items, resetKey = "") {
  const key = typeof resetKey === "string" ? resetKey : JSON.stringify(resetKey ?? "");
  const [page, setPage] = useState(1);
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setPage(1);
  }
  return { ...pageSlice(items, seenKey === key ? page : 1), setPage };
}
