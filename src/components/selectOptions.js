// Shared by the dropdown and its tests. A query matches any part of the label, ignoring case.
export const optionMatchesQuery = (text, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return String(text || "").toLowerCase().includes(q);
};
