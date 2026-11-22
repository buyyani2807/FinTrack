import { receiptPdfFile } from "./receiptPdf.js";
import { buildWhatsAppMessage, openManualWhatsAppShare } from "./receiptWhatsApp.js";
import { uploadOrganizationPdfLink, uploadReceiptPdfLink } from "../../accounts/io/receiptLink.js";

// Finance and Chit Fund receipts on WhatsApp, the same way as Counter bills and sales
// invoices: the receipt PDF is uploaded (filed under the organization, see
// supabase/156_receipt_links_all_modules.sql) and the message to the customer's number
// carries a short myfintracker.com/b/<code> link with a preview card.

const pending = new Map();

const storageKey = receipt => `${receipt?.source || "finance"}-${receipt?.paymentId || receipt?.receiptNumber || ""}`;

/**
 * Upload once per receipt version; resolves to the link, or "" when it can't be made.
 * Filed under the organization (Finance, Chit Fund) unless an Accounts `companyId` is given
 * (Route Collections receipts belong to an Accounts company).
 */
export function receiptLinkFor(receipt, token, { companyId = "" } = {}) {
  if (!token || !receipt?.receiptNumber || !receipt?.paymentId) return Promise.resolve("");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve("");
  const key = storageKey(receipt);
  // An edited payment uploads again (same file name, so the link stays the same).
  const version = `${key}:${receipt.amount}:${receipt.remainingBalance}:${receipt.paymentMode}`;
  if (pending.has(version)) return pending.get(version);
  const file = receiptPdfFile(receipt);
  if (!file) return Promise.resolve("");
  const upload = companyId
    ? options => uploadReceiptPdfLink({ ...options, companyId })
    : uploadOrganizationPdfLink;
  const promise = upload({
    token,
    billKey: key,
    file,
    details: {
      kind: "receipt",
      businessName: receipt.companyName || "",
      customerName: receipt.customerName || "",
      billNo: receipt.receiptNumber,
      billDate: receipt.paymentDate,
      amount: Number(receipt.amount || 0),
      balance: Number(receipt.remainingBalance || 0),
    },
  }).catch(() => "");
  pending.set(version, promise);
  promise.then(link => { if (!link) pending.delete(version); });
  return promise;
}

export async function shareReceiptOnWhatsApp(receipt, settings, token, options = {}) {
  const link = await receiptLinkFor(receipt, token, options);
  return openManualWhatsAppShare({
    phone: receipt.customerPhone,
    message: buildWhatsAppMessage({ ...receipt, receiptLink: link }, settings),
    note: link || !token ? "" : "Sent as text only: the receipt link needs an internet connection.",
  });
}
