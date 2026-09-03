export const LIST_PAGE_SIZE = 50;

export function pageSlice(items = [], page = 1, size = LIST_PAGE_SIZE) {
  const rows = items || [];
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  return {
    items: rows.slice((current - 1) * size, current * size),
    total,
    pages,
    page: current,
  };
}

export function groupByKey(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const id = row?.[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}
