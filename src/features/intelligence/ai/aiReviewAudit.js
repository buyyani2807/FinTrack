export const AI_FEATURES = ["expenses", "cashflow", "receivables", "chit_health", "anomalies", "gst", "month_end", "bank_reconciliation", "inventory"];
export const AI_ACTIONS = ["approved", "rejected", "reviewed", "dismissed", "edited"];
const MODULES = ["accounts", "finance", "chit"];
const SAFE_SUGGESTION_KEYS = ["kind", "voucherLineId", "expenseCode", "confidencePct", "actionKind", "check", "pattern", "status"];

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

/**
 * The payload sent to `ai_record_review_action`. Only identifiers and suggestion metadata are kept: no names,
 * phone numbers, narrations, or message text leave the browser in the audit trail.
 */
export function reviewActionPayload({ module = "accounts", feature, insightKey, action, sourceType = null, sourceId = null, recordDate = null, suggestion = {}, note = "" } = {}) {
  if (!MODULES.includes(module)) throw new Error("Unknown AI module");
  if (!AI_FEATURES.includes(feature)) throw new Error("Unknown AI feature");
  if (!AI_ACTIONS.includes(action)) throw new Error("Unknown review action");
  if (!insightKey) throw new Error("Insight key is required");
  const safeSuggestion = Object.fromEntries(Object.entries(suggestion || {}).filter(([key, value]) => SAFE_SUGGESTION_KEYS.includes(key) && value != null && typeof value !== "object"));
  return {
    input_module: module,
    input_feature: feature,
    input_insight_key: clip(insightKey, 200),
    input_action: action,
    input_source_type: clip(sourceType, 60),
    input_source_id: clip(sourceId, 100),
    input_record_date: recordDate ? String(recordDate).slice(0, 10) : null,
    input_suggestion: safeSuggestion,
    input_note: clip(String(note || "").trim(), 500) || null,
  };
}

/** Counts only; the run log never stores insight text or personal data. */
export function insightRunPayload({ module = "accounts", feature, insights = [] } = {}) {
  if (!MODULES.includes(module)) throw new Error("Unknown AI module");
  if (!AI_FEATURES.includes(feature)) throw new Error("Unknown AI feature");
  const bySeverity = {};
  for (const row of insights || []) {
    const key = row?.severity || "info";
    bySeverity[key] = (bySeverity[key] || 0) + 1;
  }
  return {
    input_module: module,
    input_feature: feature,
    input_insight_count: (insights || []).length,
    input_summary: { bySeverity },
  };
}

/** Latest decision per insight key, for showing Approved / Rejected / Reviewed badges. */
export function latestDecisions(actions = []) {
  const map = new Map();
  for (const row of [...(actions || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    map.set(`${row.feature}:${row.insightKey}`, row);
  }
  return map;
}
