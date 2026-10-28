import { readZipEntries } from "./importReaders.js";
import { normalizeBillScan, reviewBillScan } from "./billScan.js";
import { stableUuid } from "./migrationAssistant.js";
import { itemizedEntryDraft } from "./inventoryModel.js";
import { simpleEntryDraft, roundMoney } from "./accountingModel.js";
import { gstStateFromGstin, isIntraGst } from "./accountingGst.js";

const BILL_EXT = /\.(jpe?g|png|webp|pdf)$/i;
const IMAGE_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

function mimeForName(name) {
  const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
  return IMAGE_MIME[ext] || "";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function fileToBillSource(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mimeType = file.type && file.type !== "application/octet-stream"
    ? (file.type === "image/jpg" ? "image/jpeg" : file.type)
    : mimeForName(file.name);
  if (!mimeType) throw new Error(`${file.name}: use JPEG, PNG, WebP or PDF.`);
  const data = bytesToBase64(bytes);
  if (data.length > 2_000_000) throw new Error(`${file.name} is too large for bill reading.`);
  return {
    id: `f-${file.name}-${file.size}-${file.lastModified}`,
    fileName: String(file.name || "bill").slice(0, 180),
    mimeType,
    data,
    byteSize: bytes.length,
    status: "queued",
    error: "",
    review: null,
    selected: true,
  };
}

/** Expand a file list into bill sources. ZIP archives are unpacked for image/PDF entries. */
export async function collectBillSources(fileList) {
  const files = [...(fileList || [])];
  const sources = [];
  for (const file of files) {
    const name = String(file.name || "");
    const isZip = /\.zip$/i.test(name) || (file.type === "application/zip");
    if (isZip) {
      const buffer = await file.arrayBuffer();
      const entries = readZipEntries(buffer);
      for (const [entryName, read] of entries) {
        if (entryName.endsWith("/") || !BILL_EXT.test(entryName)) continue;
        if (entryName.startsWith("__MACOSX") || entryName.includes("/.")) continue;
        const data = await read();
        const mimeType = mimeForName(entryName);
        if (!mimeType) continue;
        const base64 = bytesToBase64(data);
        if (base64.length > 2_000_000) {
          sources.push({
            id: `z-${entryName}`,
            fileName: entryName.split("/").pop().slice(0, 180),
            mimeType,
            data: "",
            byteSize: data.length,
            status: "error",
            error: "File is too large for bill reading.",
            review: null,
            selected: false,
          });
          continue;
        }
        sources.push({
          id: `z-${entryName}-${data.length}`,
          fileName: entryName.split("/").pop().slice(0, 180),
          mimeType,
          data: base64,
          byteSize: data.length,
          status: "queued",
          error: "",
          review: null,
          selected: true,
        });
      }
      continue;
    }
    sources.push(await fileToBillSource(file));
  }
  if (!sources.length) throw new Error("Choose bill photos, PDFs, or a ZIP of those files.");
  return sources;
}

async function scanOne(source, token) {
  const response = await fetch("/api/accounts/bill-scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ mimeType: source.mimeType, data: source.data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The bill could not be read.");
  return body.bill;
}

/** Run bill-scan with limited concurrency. Mutates via onUpdate callbacks. */
export async function scanBillQueue(sources, {
  token = "",
  parties = [],
  items = [],
  vouchers = [],
  accounts = [],
  companyState = "",
  today = "",
  concurrency = 2,
  shouldStop = () => false,
  onUpdate = () => {},
} = {}) {
  const queue = sources.filter(source => source.status === "queued" || source.status === "error");
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, async () => {
    while (cursor < queue.length) {
      if (shouldStop()) return;
      const index = cursor;
      cursor += 1;
      const source = queue[index];
      onUpdate(source.id, { status: "scanning", error: "" });
      try {
        const bill = await scanOne(source, token);
        const review = reviewBillScan(bill, {
          parties,
          items,
          form: { date: today },
          today,
          vouchers,
          accounts,
          companyState,
        });
        const hasDup = Boolean(review.duplicates?.length);
        onUpdate(source.id, {
          status: "ready",
          review,
          selected: !hasDup && review.draft?.form?.partyId && (review.draft.form.itemLines?.length || Number(review.bill?.total) > 0),
          error: "",
        });
      } catch (error) {
        onUpdate(source.id, {
          status: "error",
          error: error?.message || "The bill could not be read.",
          selected: false,
          review: null,
        });
      }
    }
  });
  await Promise.all(workers);
}

export function buildPurchaseDraftFromBillReview(review, {
  accounts = [],
  company = null,
  today = "",
  partyId = "",
} = {}) {
  const bill = normalizeBillScan(review?.bill || {});
  const form = review?.draft?.form || {};
  const resolvedPartyId = partyId || form.partyId || "";
  if (!resolvedPartyId) throw new Error("Choose the supplier before posting.");
  const date = form.date || bill.billDate || today;
  const gstOn = company?.gstRegistration === "regular";
  const partyState = gstStateFromGstin(bill.supplierGstin) || "";
  const intra = isIntraGst(company?.stateCode, partyState);
  const narration = [
    bill.billNumber ? `Invoice ${bill.billNumber}` : "",
    bill.supplierName ? `Bill from ${bill.supplierName}` : "Supplier bill",
  ].filter(Boolean).join(" · ").slice(0, 500);
  const itemLines = form.itemLines || [];
  const usableItems = itemLines.filter(line => line.itemId || line.itemName);
  if (usableItems.length && usableItems.every(line => line.itemId)) {
    return {
      draft: itemizedEntryDraft({
        kind: "purchase",
        accounts,
        date,
        partyId: resolvedPartyId,
        settlement: form.settlement === "paid" ? "paid" : "credit",
        moneyMode: form.moneyMode || "cash",
        narration,
        itemLines: usableItems,
        intra,
        taxInclusive: false,
        gstEnabled: gstOn,
        today,
      }),
      narration,
      date,
      partyId: resolvedPartyId,
      billNumber: bill.billNumber || "",
    };
  }
  const amount = roundMoney(
    Number(form.amount)
    || Number(bill.taxable)
    || Number(bill.total)
    || usableItems.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.rate || 0), 0),
  );
  if (!(amount > 0)) throw new Error("Could not read a purchase amount from this bill.");
  const gstRate = Number(usableItems.find(line => Number(line.gstRate) > 0)?.gstRate || bill.lines?.[0]?.gstRate || 0);
  return {
    draft: simpleEntryDraft({
      kind: "purchase",
      accounts,
      date,
      amount,
      partyId: resolvedPartyId,
      settlement: form.settlement === "paid" ? "paid" : "credit",
      moneyMode: form.moneyMode || "cash",
      narration,
      today,
      gst: gstOn && gstRate > 0 ? {
        enabled: true,
        rate: gstRate,
        intra,
        taxInclusive: false,
        itcEligible: true,
      } : gstOn ? { enabled: false, rate: 0, intra, taxInclusive: false } : undefined,
    }),
    narration,
    date,
    partyId: resolvedPartyId,
    billNumber: bill.billNumber || "",
  };
}

export async function runBulkBillPost(sources, api, {
  accounts = [],
  company = null,
  today = "",
  onProgress = () => {},
  shouldStop = () => false,
} = {}) {
  const selected = (sources || []).filter(source => source.selected && source.status === "ready" && source.review);
  const failed = [];
  const done = { vouchers: 0, attachments: 0 };
  let step = 0;
  const total = selected.length;
  for (const source of selected) {
    if (shouldStop()) return { done, failed, stopped: true };
    step += 1;
    onProgress({ step, total, label: source.fileName, done: { ...done }, failed: failed.length });
    try {
      const built = buildPurchaseDraftFromBillReview(source.review, {
        accounts,
        company,
        today,
        partyId: source.partyIdOverride || "",
      });
      const clientRequestId = stableUuid(`${company?.id || ""}|bill|${source.fileName}|${built.date}|${built.billNumber}|${built.partyId}`);
      const voucherId = await api.postVoucher({ ...built.draft, clientRequestId });
      done.vouchers += 1;
      if (voucherId && source.data && source.byteSize <= 512 * 1024) {
        try {
          await api.addAttachment({
            voucherId,
            fileName: source.fileName,
            contentType: source.mimeType,
            contentBase64: source.data,
            byteSize: source.byteSize,
          });
          done.attachments += 1;
        } catch {
          /* voucher posted; attachment is best-effort */
        }
      }
    } catch (error) {
      failed.push({ label: source.fileName, message: error?.message || "Failed" });
    }
  }
  return { done, failed, stopped: false };
}
