/**
 * Meta Cloud API template mapping for FinTrack message keys.
 * Submit these names in Meta Business Manager (English / en). Body variables are positional {{1}}, {{2}}, …
 * Free-text drafts in Settings still drive wa.me; Cloud API business-initiated sends use these templates.
 */

export const META_TEMPLATE_LANGUAGE = "en";

/** FinTrack key → Meta template name + ordered variable keys from receipt/reminder variables. */
export const META_WHATSAPP_TEMPLATES = {
  payment_receipt: {
    name: "payment_receipt",
    bodyParams: ["customer_name", "amount", "receipt_number", "account_id", "payment_date", "remaining_balance", "company_name"],
    category: "UTILITY",
    sampleBody:
      "Hi {{1}}, we received your payment of {{2}}. Receipt {{3}}, account {{4}}, date {{5}}. Remaining {{6}}. Thank you, {{7}}.",
  },
  monthly_reminder: {
    name: "monthly_reminder",
    bodyParams: ["customer_name", "amount", "due_date", "account_id", "company_name"],
    category: "UTILITY",
    sampleBody:
      "Hi {{1}}, reminder: Monthly Finance payment of {{2}} is due on {{3}}. Account {{4}}. Thank you, {{5}}.",
  },
  ar_reminder: {
    name: "ar_reminder",
    bodyParams: ["customer_name", "invoice_number", "amount", "due_date", "outstanding", "days_overdue", "company_name"],
    category: "UTILITY",
    sampleBody:
      "Hi {{1}}, invoice {{2}} for {{3}} is outstanding. Due {{4}}, outstanding {{5}}, {{6}} days overdue. Please arrange payment. {{7}}.",
  },
  daily_payment_receipt: {
    name: "daily_payment_receipt",
    bodyParams: ["customer_name", "amount", "receipt_number", "account_id", "payment_date", "remaining_balance", "company_name"],
    category: "UTILITY",
    sampleBody:
      "Hi {{1}}, we received {{2}}. Receipt {{3}}, account {{4}}, date {{5}}. Remaining {{6}}. Thank you, {{7}}.",
  },
  chit_reminder: {
    name: "chit_reminder",
    bodyParams: ["customer_name", "amount", "due_date", "scheme_name", "month_number", "company_name"],
    category: "UTILITY",
    sampleBody:
      "Hi {{1}}, Chit installment of {{2}} is due on {{3}} for {{4}} (month {{5}}). Thank you, {{6}}.",
  },
  sales_invoice: {
    name: "sales_invoice",
    bodyParams: ["customer_name", "invoice_number", "invoice_date", "amount", "due_date", "company_name"],
    category: "UTILITY",
    sampleBody:
      "Hi {{1}}, invoice {{2}} dated {{3}} for {{4}} (due {{5}}). Thank you, {{6}}.",
  },
};

export function metaTemplateForKey(templateKey) {
  return META_WHATSAPP_TEMPLATES[templateKey] || null;
}

/** Build Meta template body component parameters from FinTrack variables. */
export function buildMetaTemplateComponents(templateKey, variables = {}) {
  const spec = metaTemplateForKey(templateKey);
  if (!spec) return null;
  const params = spec.bodyParams.map(key => ({
    type: "text",
    text: String(variables[key] ?? variables[key?.toLowerCase?.()] ?? "").slice(0, 1024) || "—",
  }));
  return [{ type: "body", parameters: params }];
}

export function listMetaTemplatesForSetup() {
  return Object.entries(META_WHATSAPP_TEMPLATES).map(([key, spec]) => ({
    fintrackKey: key,
    metaName: spec.name,
    category: spec.category,
    language: META_TEMPLATE_LANGUAGE,
    bodyParams: spec.bodyParams,
    sampleBody: spec.sampleBody,
  }));
}
