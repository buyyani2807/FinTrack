import { supabase } from "../../../lib/supabase";
import { getActiveAccountsCompanyId } from "../../accounts/data/accountingRepository.js";
import { insightRunPayload, reviewActionPayload } from "./aiReviewAudit.js";

const isMissing = err => /could not find|does not exist|schema cache|404|PGRST202|PGRST205/i.test(String(err?.message || err?.code || ""));

const companyArgs = module => {
  const companyId = module === "accounts" ? getActiveAccountsCompanyId() : null;
  return {
    args: companyId ? { input_company_id: companyId } : {},
    headers: companyId ? { "x-acc-company-id": companyId } : {},
    companyId,
  };
};

export const AI_AUDIT_MIGRATION_MESSAGE = "Run migration 099 in the Supabase SQL editor to save AI review decisions.";

/** Records a person's decision on an insight. The server enforces role, company, entitlement, and period locks. */
export async function recordAiReviewAction(token, input) {
  const payload = reviewActionPayload(input);
  const { args, headers } = companyArgs(payload.input_module);
  try {
    return await supabase.rpc("ai_record_review_action", { ...payload, ...args }, token, headers);
  } catch (err) {
    if (isMissing(err)) throw new Error(AI_AUDIT_MIGRATION_MESSAGE, { cause: err });
    throw err;
  }
}

/** Logs that insights were generated (counts only). Failures never block the screen. */
export async function recordAiInsightRun(token, input) {
  const payload = insightRunPayload(input);
  const { args, headers } = companyArgs(payload.input_module);
  try {
    return await supabase.rpc("ai_record_insight_run", { ...payload, ...args }, token, headers);
  } catch {
    return null;
  }
}

/** Review decisions visible to this user for the active company. Returns null when migration 099 is missing. */
export async function loadAiReviewActions(token, { module = "accounts", feature = null } = {}) {
  const { companyId, headers } = companyArgs(module);
  const filters = [
    `module=eq.${module}`,
    companyId ? `company_id=eq.${encodeURIComponent(companyId)}` : null,
    feature ? `feature=eq.${feature}` : null,
  ].filter(Boolean).join("&");
  try {
    const rows = await supabase.query(`/rest/v1/ai_review_actions?select=id,feature,insight_key,action,source_type,source_id,record_date,note,actor_id,created_at&${filters}&order=created_at.desc&limit=1000`, token, { headers });
    return (rows || []).map(row => ({
      id: row.id,
      feature: row.feature,
      insightKey: row.insight_key,
      action: row.action,
      sourceType: row.source_type,
      sourceId: row.source_id,
      recordDate: row.record_date,
      note: row.note || "",
      actorId: row.actor_id,
      createdAt: row.created_at,
    }));
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}
