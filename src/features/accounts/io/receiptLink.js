import { supabase } from "../../../lib/supabase.js";

/**
 * A browser can't hand WhatsApp a PDF *and* a recipient number together: the phone's
 * share sheet takes a file but always asks "send to whom", and wa.me/<number> goes
 * straight to the customer's chat but only carries text. So when the bill has a
 * customer number, the receipt PDF is uploaded to a private Supabase Storage bucket
 * and a time-limited download link is added to the text sent to that number.
 *
 * Bucket and access rules: supabase/154_receipt_pdf_links.sql. Files live under
 * <accounts company id>/<bill id>.pdf and only members of the company's organization
 * can upload or sign them; the signed link itself works for anyone holding it until it
 * expires, which is what lets the customer open it.
 */
export const RECEIPT_BUCKET = "receipts";
export const RECEIPT_LINK_DAYS = 30;

const safeSegment = value => String(value || "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120);

export function receiptObjectPath(companyId, billKey) {
  const folder = safeSegment(companyId);
  const name = safeSegment(billKey);
  if (!folder || !name) return "";
  return `${folder}/${name}.pdf`;
}

/**
 * Uploads the PDF and returns the link to send. Prefers the short myfintracker.com/b/<code>
 * link (supabase/155_receipt_short_links.sql), which shows a preview card in WhatsApp; falls
 * back to the long signed Storage URL if the short link can't be made (e.g. 155 not run yet).
 * `details` feeds the preview card: { businessName, customerName, billNo, billDate, amount, balance, kind }.
 * kind: bill (default), invoice, receipt, quotation, sales_order, delivery_challan, purchase_order,
 * goods_receipt — sets the card wording; anything but "bill" needs 156_receipt_links_all_modules.sql.
 */
export async function uploadReceiptPdfLink({ token, companyId, billKey, file, details = {}, days = RECEIPT_LINK_DAYS }) {
  const path = receiptObjectPath(companyId, billKey);
  if (!token || !path || !file) throw new Error("Receipt link needs a signed-in company and a bill.");
  await supabase.storage.upload(RECEIPT_BUCKET, path, file, "application/pdf", token);
  const short = await createShortReceiptLink({ token, companyId, path, details, days }).catch(() => "");
  if (short) return short;
  const link = await supabase.storage.createSignedUrl(RECEIPT_BUCKET, path, days * 24 * 60 * 60, token);
  if (!link) throw new Error("Could not create the receipt link.");
  return link;
}

const isoDate = value => (/^\d{4}-\d{2}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 10) : null);

async function createShortReceiptLink({ token, companyId, path, details, days }) {
  if (typeof window === "undefined" || !window.location?.origin) return "";
  const code = await supabase.rpc("create_receipt_link", {
    p_company_id: companyId,
    p_storage_path: path,
    p_business_name: String(details.businessName || ""),
    p_customer_name: String(details.customerName || ""),
    p_bill_no: String(details.billNo || ""),
    p_bill_date: isoDate(details.billDate),
    p_amount: Number(details.amount || 0),
    p_balance: Number(details.balance || 0),
    p_days: days,
    // Sent only when needed, so bill links keep working before 156 is run.
    ...(details.kind && details.kind !== "bill" ? { p_kind: String(details.kind) } : {}),
  }, token);
  const value = String(code || "").trim();
  return /^[a-f0-9]{12}$/.test(value) ? `${window.location.origin}/b/${value}` : "";
}

/** Itemised fallback when no link could be made (offline): the bill text itself. */
export function withReceiptLink(text, link) {
  const body = String(text || "");
  return link ? `${body}\n\nDownload bill (PDF): ${link}` : body;
}

let orgFolder = null;
/** Storage folder for documents that belong to the organization (Finance, Chit Fund): its id. */
async function organizationFolder(token) {
  if (!orgFolder) {
    orgFolder = supabase.rpc("receipt_storage_folder", {}, token)
      .then(value => (/^[0-9a-f-]{36}$/i.test(String(value || "")) ? String(value) : ""))
      .catch(() => "");
  }
  const folder = await orgFolder;
  if (!folder) orgFolder = null;
  return folder;
}

/** Same as uploadReceiptPdfLink, filed under the organization instead of an Accounts company. */
export async function uploadOrganizationPdfLink({ token, billKey, file, details = {}, days = RECEIPT_LINK_DAYS }) {
  const folder = token ? await organizationFolder(token) : "";
  if (!folder) throw new Error("Receipt link needs supabase/156_receipt_links_all_modules.sql.");
  return uploadReceiptPdfLink({ token, companyId: folder, billKey, file, details, days });
}
