import { pdfBinaryToBytes } from "./documentPdf.js";
import { renderTradeDocumentPdf } from "./tradeDocumentPdf.js";
import { uploadReceiptPdfLink } from "./receiptLink.js";
import { buildTradeDocumentLinkMessage, buildTradeDocumentMessage } from "../model/tradeDocumentModel.js";
import { openManualWhatsAppShare } from "../../receipts/io/receiptWhatsApp.js";

// Quotations, sales orders, delivery challans, purchase orders and goods receipts on WhatsApp,
// the same way as bills and receipts: the A4 PDF goes behind a short myfintracker.com/b/ link
// (preview card shows the document and its value) in a short note to the party's number.

function tradeDocumentFile(view) {
  if (typeof File !== "function") return null;
  const name = `${String(view.docNumber || view.docType || "document").replace(/[^A-Za-z0-9_-]/g, "-")}.pdf`;
  return new File([pdfBinaryToBytes(renderTradeDocumentPdf(view, { template: "a4" }))], name, { type: "application/pdf" });
}

export async function shareTradeDocumentOnWhatsApp(view, { token = "", companyId = "" } = {}) {
  let link = "";
  const file = token && companyId && view?.id ? tradeDocumentFile(view) : null;
  if (file && !(typeof navigator !== "undefined" && navigator.onLine === false)) {
    link = await uploadReceiptPdfLink({
      token,
      companyId,
      billKey: `doc-${view.id}`,
      file,
      details: {
        kind: view.docType,
        businessName: view.companyName || "",
        customerName: view.partyName || "",
        billNo: view.docNumber || "",
        billDate: view.docDate || "",
        amount: Number(view.total || 0),
        balance: 0,
      },
    }).catch(() => "");
  }
  return openManualWhatsAppShare({
    phone: view.partyPhone,
    message: link ? buildTradeDocumentLinkMessage(view, link) : buildTradeDocumentMessage(view),
    note: link || !file ? "" : "Sent as text only: the PDF link needs an internet connection.",
  });
}
