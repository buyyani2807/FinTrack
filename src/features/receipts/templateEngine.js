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
  chit_payment_receipt: `Hi {customer_name},

We have received your payment of {amount}.

Receipt No: {receipt_number}
Account: {account_id}
Payment Date: {payment_date}
Payment Mode: {payment_mode}
Payment Month: {payment_month}
Remaining Balance: {remaining_balance}

Thank you for your payment.
{company_name}
Bachupally | {company_phone}`,
  monthly_reminder: `Hi {customer_name},
This is a reminder that your Monthly Finance payment of {amount} is due on {due_date}.
Account: {account_id}
Please make the payment on or before the due date.
Thank you,
{company_name}`,
  chit_reminder: `Hi {customer_name},

This is a reminder from {company_name} that your Chit Fund installment of {amount} is due on {due_date}.

Chit Scheme: {scheme_name}
Chit Type: {chit_type}
Month: {month_number} of {total_months}

Please make the payment on or before the due date.

Thank you,
{company_name}
{company_phone}`,
  sales_invoice: `Hi {customer_name},
Thank you for your purchase.
Invoice No: {invoice_number}
Date: {invoice_date}
Amount: {amount}
Due date: {due_date}
Settlement: {settlement}
Thank you,
{company_name}
{company_phone}`,
  ar_reminder: `Hi {customer_name},
This is a reminder that invoice {invoice_number} for {amount} is outstanding.
Due date: {due_date}
Outstanding: {outstanding}
Days overdue: {days_overdue}
Please arrange payment at the earliest.
Thank you,
{company_name}
{company_phone}`,
  daily_account_opened: `Hello {customer_name},
Your Daily Finance account has been successfully opened.
Account No: {account_number}
Financed Amount: {financed_amount}
Amount Paid to Customer: {amount_paid}
Interest: {interest_amount}
Interest Rate: {interest_rate}
Total Repayment: {total_repayment}
Daily Payment: {daily_installment}
Repayment Period: {repayment_days} days
Start Date: {start_date}
Expected Completion: {completion_date}
Thank you,
{company_name}`,
  monthly_account_opened: `Hello {customer_name},
Your Monthly Finance account has been successfully opened.
Account No: {account_number}
Financed Amount: {financed_amount}
Amount Paid to Customer: {amount_paid}
Interest Rate: {interest_rate}
First Month Interest: {interest_amount}
Monthly Payment: {monthly_installment}
Start Date: {start_date}
First Payment Date: {first_payment_date}
Thank you,
{company_name}`,
  chit_lift_confirmation: `Hello {member_name},
Congratulations! Your chit has been successfully lifted.
Scheme: {scheme_name}
Chit Type: {chit_type}
Chit Value: {chit_value}
Month: Month {month_number}
Winning Bid / Amount Lifted: {amount_lifted}
Commission: {commission}
Discount: {discount}
Dividend: {dividend}
Monthly Installment: {monthly_installment}
Remaining Period: {remaining_months} months
Date: {lift_date}
Thank you,
{company_name}`,
  payment_advice: `Hi {supplier_name},
Please find payment advice for {amount}.
Payment Date: {payment_date}
Payment Mode: {payment_mode}
Reference: {payment_reference}
Voucher / Bill: {voucher_number}
Thank you,
{company_name}
{company_phone}`,
  purchase_document: `Hi {supplier_name},
Purchase document {document_number} dated {document_date}.
Amount: {amount}
Due date: {due_date}
Items / notes: {notes}
Thank you,
{company_name}
{company_phone}`,
  party_statement: `Hi {party_name},
Please find your statement from {company_name}.
Period: {period_from} to {period_to}
Opening: {opening_balance}
Closing: {closing_balance}
Please review and confirm.
{company_phone}`,
};

export function resolveWhatsAppTemplate(settings = {}, key = "payment_receipt") {
  const custom = settings?.whatsappTemplates?.[key];
  const trimmed = custom?.trim() || "";
  if (key === "chit_reminder" && trimmed) {
    // Upgrade older saved templates that omit chit type or still show days remaining.
    if (/days.?remaining/i.test(trimmed) || !/\{chit_type\}/i.test(trimmed) || !/\{scheme_name\}/i.test(trimmed)) {
      return DEFAULT_WHATSAPP_TEMPLATES.chit_reminder;
    }
  }
  return trimmed || DEFAULT_WHATSAPP_TEMPLATES[key] || "";
}
