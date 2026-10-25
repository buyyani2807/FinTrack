// Shared by the dropdown and its tests. A query matches a word that starts with it,
// so "t" finds Telangana and not Uttarakhand. The code in front of a name still matches on its own.
export const optionMatchesQuery = (text, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const words = String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(word => word.startsWith(q));
};
