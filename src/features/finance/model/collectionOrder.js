export function byCollectionOrderThenName(a, b) {
  const order = Number(a?.collectionOrder || 999999) - Number(b?.collectionOrder || 999999);
  if (order) return order;
  return String(a?.customerName || "").localeCompare(String(b?.customerName || ""), undefined, { sensitivity: "base" });
}

export function reorderIds(ids, fromId, toId) {
  const next = [...ids];
  const from = next.indexOf(fromId);
  const to = next.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function mergeAccountOrder(allLoans, movingIds, newMovingOrder) {
  const moving = movingIds instanceof Set ? movingIds : new Set(movingIds);
  const queue = [...newMovingOrder];
  return [...(allLoans || [])]
    .sort(byCollectionOrderThenName)
    .map(loan => (moving.has(loan.id) && queue.length ? queue.shift() : loan.id));
}
