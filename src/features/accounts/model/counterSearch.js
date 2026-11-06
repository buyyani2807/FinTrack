/**
 * Counter item search — barcode/SKU exact match, then fuzzy name search with
 * common Indian-retail transliteration aliases. Advisory ranking only.
 */

/** Synonym groups: any token in a group matches every other member. */
const SEARCH_SYNONYM_GROUPS = [
  ["toor", "tur", "tuar", "thuvar", "arhar"],
  ["chana", "channa", "chenna", "bengalgram"],
  ["moong", "mung", "mug"],
  ["urad", "ulundu", "blackgram"],
  ["jeera", "zeera", "jira", "cumin"],
  ["haldi", "turmeric", "manjal"],
  ["mirchi", "chilli", "chili", "lalmirch"],
  ["atta", "wheatflour", "flour"],
  ["sunflower", "sunflow"],
  ["groundnut", "peanut", "ground nut"],
  ["basmati", "basmathi"],
  ["paracetamol", "acetaminophen", "crocin"],
];

const synonymLookup = (() => {
  const map = new Map();
  for (const group of SEARCH_SYNONYM_GROUPS) {
    const normalized = group.map(normalizeToken).filter(Boolean);
    for (const token of normalized) map.set(token, normalized);
  }
  return map;
})();

export function normalizeCounterQuery(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value) {
  return normalizeCounterQuery(value).replace(/\s+/g, "");
}

function tokensOf(value) {
  return normalizeCounterQuery(value).split(" ").filter(Boolean);
}

function expandToken(token) {
  const key = normalizeToken(token);
  if (!key) return [];
  const group = synonymLookup.get(key);
  return group ? [...new Set([key, ...group])] : [key];
}

function expandQueryTokens(query) {
  const out = new Set();
  for (const token of tokensOf(query)) {
    for (const expanded of expandToken(token)) out.add(expanded);
  }
  return [...out];
}

/** Levenshtein distance capped early for short retail tokens. */
export function editDistance(a, b, max = 2) {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > max) return max + 1;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const prev = new Array(cols);
  const curr = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j];
  }
  return prev[right.length];
}

function itemHaystack(item) {
  return normalizeCounterQuery([
    item?.name,
    item?.sku,
    item?.barcode,
    item?.brand,
    item?.hsnSac,
    item?.description,
  ].filter(Boolean).join(" "));
}

function itemTokens(item) {
  return tokensOf(itemHaystack(item)).map(normalizeToken).filter(Boolean);
}

function tokenScore(queryToken, itemTokenList) {
  let best = 0;
  for (const itemToken of itemTokenList) {
    if (itemToken === queryToken) best = Math.max(best, 100);
    else if (itemToken.startsWith(queryToken) || queryToken.startsWith(itemToken)) {
      best = Math.max(best, 70 + Math.min(20, Math.min(itemToken.length, queryToken.length)));
    } else if (queryToken.length >= 4 && itemToken.length >= 4) {
      const dist = editDistance(queryToken, itemToken, 2);
      if (dist === 1) best = Math.max(best, 55);
      else if (dist === 2) best = Math.max(best, 35);
    }
  }
  return best;
}

export function scoreCounterItem(item, query) {
  const q = normalizeCounterQuery(query);
  if (!q) return 0;
  const haystack = itemHaystack(item);
  const sku = normalizeCounterQuery(item?.sku);
  const barcode = normalizeCounterQuery(item?.barcode);
  if (sku && sku === q) return 1000;
  if (barcode && barcode === q) return 1000;
  if (sku && sku.startsWith(q)) return 900;
  if (barcode && barcode.startsWith(q)) return 900;
  if (haystack.includes(q)) return 800;

  const queryTokens = expandQueryTokens(q);
  if (!queryTokens.length) return 0;
  const itemTokenList = itemTokens(item);
  if (!itemTokenList.length) return 0;

  let total = 0;
  let matched = 0;
  for (const token of queryTokens) {
    const score = tokenScore(token, itemTokenList);
    if (score > 0) {
      matched += 1;
      total += score;
    }
  }
  if (!matched) return 0;
  // Prefer matching more of the query tokens; synonym expansions can inflate length.
  const coverage = matched / Math.max(1, tokensOf(q).length);
  return Math.round((total / queryTokens.length) * (0.55 + 0.45 * coverage));
}

export function findCounterItemByCode(items = [], query = "") {
  const q = normalizeCounterQuery(query);
  if (!q) return null;
  return (items || []).find(item => (
    item.isActive !== false
    && (
      normalizeCounterQuery(item.sku) === q
      || normalizeCounterQuery(item.barcode) === q
    )
  )) || null;
}

/**
 * Ranked catalog matches for the Counter search box.
 * Empty query returns [] (same as before — favourites/categories handle empty state).
 */
export function matchCounterItems(items = [], query = "", { limit = 40 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  const scored = [];
  for (const item of items || []) {
    if (item?.isActive === false) continue;
    const score = scoreCounterItem(item, q);
    if (score < 30) continue;
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.item.name || "").localeCompare(String(b.item.name || "")));
  return scored.slice(0, limit).map(row => row.item);
}
