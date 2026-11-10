/**
 * Customer-facing product brand. Keep technical IDs (ft-*, askFintrack.js, storage keys) unchanged.
 */

export const PRODUCT_NAME = "MyFinTracker";
export const AI_NAME = "Finny";

export const ASK_LABEL = `Ask ${AI_NAME}`;
export const TELL_LABEL = `Tell ${AI_NAME}`;
export const POWERED_BY = `Powered by ${PRODUCT_NAME}`;
export const OPEN_PRODUCT = `Open ${PRODUCT_NAME}`;
export const CREDIT_SCORE_NAME = `${PRODUCT_NAME} Credit Score`;

export function productTitle(page) {
  const part = String(page || "").trim();
  return part ? `${part} — ${PRODUCT_NAME}` : PRODUCT_NAME;
}
