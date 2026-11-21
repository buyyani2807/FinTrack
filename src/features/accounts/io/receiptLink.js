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

export async function uploadReceiptPdfLink({ token, companyId, billKey, file, days = RECEIPT_LINK_DAYS }) {
  const path = receiptObjectPath(companyId, billKey);
  if (!token || !path || !file) throw new Error("Receipt link needs a signed-in company and a bill.");
  await supabase.storage.upload(RECEIPT_BUCKET, path, file, "application/pdf", token);
  const link = await supabase.storage.createSignedUrl(RECEIPT_BUCKET, path, days * 24 * 60 * 60, token);
  if (!link) throw new Error("Could not create the receipt link.");
  return link;
}

export function withReceiptLink(text, link) {
  const body = String(text || "");
  return link ? `${body}\n\nDownload bill (PDF): ${link}` : body;
}
