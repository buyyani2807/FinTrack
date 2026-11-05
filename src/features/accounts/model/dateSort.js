/** Compare ISO dates (YYYY-MM-DD). Empty dates sort last when ascending. */
export function compareIsoDate(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left < right ? -1 : 1;
}

/** Best available instant on a voucher/invoice row for same-day ordering. */
export function rowInstant(row) {
  return String(row?.postedAt || row?.createdAt || row?.soldAt || row?.updatedAt || "");
}

/** Compare ISO timestamps. Empty values sort last when ascending. */
export function compareIsoInstant(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left < right ? -1 : 1;
}

/**
 * Sort rows by a date field, then by time within the same day.
 * Default direction is newest first.
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
    const timeCmp = compareIsoInstant(rowInstant(a), rowInstant(b));
    if (timeCmp !== 0) return timeCmp * dir;
    return dir * String(a?.voucherNumber || a?.reference || a?.id || "").localeCompare(
      String(b?.voucherNumber || b?.reference || b?.id || ""),
    );
  });
}
