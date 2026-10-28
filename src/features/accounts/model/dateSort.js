/** Compare ISO dates (YYYY-MM-DD). Empty dates sort last when ascending. */
export function compareIsoDate(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left < right ? -1 : 1;
}

/**
 * Sort rows by a date field. Default direction is newest first.
 * @param {object[]} rows
 * @param {string|((row: object) => string)} keyOrFn
 * @param {"asc"|"desc"} [direction="desc"]
 */
export function sortByDate(rows = [], keyOrFn, direction = "desc") {
  const get = typeof keyOrFn === "function" ? keyOrFn : row => row?.[keyOrFn];
  const dir = direction === "asc" ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const cmp = compareIsoDate(get(a), get(b));
    if (cmp !== 0) return cmp * dir;
    return String(a?.id || a?.voucherNumber || a?.reference || "").localeCompare(
      String(b?.id || b?.voucherNumber || b?.reference || ""),
    );
  });
}
