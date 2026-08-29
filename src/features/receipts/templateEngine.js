export function applyTemplate(template = "", variables = {}) {
  return String(template || "").replace(/\{([a-z_]+)\}/gi, (_, key) => {
    const value = variables[key.toLowerCase()] ?? variables[key] ?? "";
    return value == null ? "" : String(value);
  });
}

export const DEFAULT_WHATSAPP_TEMPLATES = {
  payment_receipt: `Hi {customer_name},
We have received your payment of {amount}.
Receipt No: {receipt_number}
Account: {account_id}
Payment Date: {payment_date}
Payment Mode: {payment_mode}
Remaining Balance: {remaining_balance}
Thank you.
{company_name}`,
  monthly_reminder: `Hi {customer_name},
This is a reminder that your Monthly Finance payment of {amount} is due on {due_date}.
Account: {account_id}
Please make the payment on or before the due date.
Thank you,
{company_name}`,
  chit_reminder: `Hi {customer_name},
This is a reminder that your Chit Fund installment of {amount} is due on {due_date}.
Chit Type: {chit_type}
Chit Scheme: {scheme_name}
Month: {month_number} of {total_months}
Please make the payment on or before the due date.
Thank you,
{company_name}`,
};

export function resolveWhatsAppTemplate(settings = {}, key = "payment_receipt") {
  const custom = settings?.whatsappTemplates?.[key];
  return custom?.trim() || DEFAULT_WHATSAPP_TEMPLATES[key] || "";
}
