import { useState } from "react";
import { money } from "../../accountsFormat.js";
import { upsertItem } from "../../data/accountingRepository.js";
import { VOUCHER_ATTACHMENT_MAX_BYTES } from "../../data/voucherAttachments.js";
import { linkBillLinesToItems, planMissingBillItems, reviewBillScan } from "../../model/billScan.js";

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that photo. Use a JPEG or PNG."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that photo. Use a JPEG or PNG."));
    image.src = src;
  });
}

async function fileToJpeg(file) {
  const source = await readFile(file);
  const image = await loadImage(source);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read that photo. Use a JPEG or PNG.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => {
      if (result) resolve(result);
      else reject(new Error("Could not read that photo. Use a JPEG or PNG."));
    }, "image/jpeg", 0.72);
  });
  return blob;
}

function isPdfFile(file) {
  const type = String(file?.type || "").toLowerCase();
  return type === "application/pdf" || String(file?.name || "").toLowerCase().endsWith(".pdf");
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.readAsDataURL(blob);
  });
}

const PAYMENT_LABELS = { paid: "Paid", unpaid: "Unpaid", unknown: "Not read" };

export function BillPhotoDraft({
  token,
  parties,
  items,
  form,
  setForm,
  today,
  vouchers = [],
  accounts = [],
  companyState = "",
  onItemsCreated = null,
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [photo, setPhoto] = useState(null);
  const [review, setReview] = useState(null);
  const [keepPhoto, setKeepPhoto] = useState(false);
  const [createMissingItems, setCreateMissingItems] = useState(true);
  const [applied, setApplied] = useState(false);
  const [acceptDuplicate, setAcceptDuplicate] = useState(false);
  const [error, setError] = useState("");
  const photoFits = Boolean(photo && photo.byteSize > 0 && photo.byteSize <= VOUCHER_ATTACHMENT_MAX_BYTES);

  const clearPhotoOnForm = () => setForm(current => (current.billPhoto ? { ...current, billPhoto: null } : current));

  const onFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setReview(null);
    setPreview("");
    setFileLabel("");
    setApplied(false);
    setKeepPhoto(false);
    setAcceptDuplicate(false);
    clearPhotoOnForm();
    try {
      const pdf = isPdfFile(file);
      let data = "";
      let mimeType = "image/jpeg";
      if (pdf) {
        const source = await readFile(file);
        data = source.split(",")[1] || "";
        if (!data.slice(0, 1400).includes("JVBERi")) throw new Error("Could not read that PDF.");
        mimeType = "application/pdf";
        const fileName = String(file.name || "supplier-bill.pdf").slice(0, 180);
        setFileLabel(fileName);
        setPhoto({ data, fileName, byteSize: file.size, contentType: mimeType });
      } else {
        const jpeg = await fileToJpeg(file);
        setPreview(await readFile(jpeg));
        data = await blobToBase64(jpeg);
        setPhoto({ data, fileName: "supplier-bill.jpg", byteSize: jpeg.size, contentType: mimeType });
      }
      if (data.length > 2_000_000) {
        throw new Error(pdf ? "That PDF is too large. Choose a smaller file." : "That photo is too large. Take it again, closer to the bill.");
      }
      const response = await fetch("/api/accounts/bill-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mimeType, data }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "The bill could not be read.");
      setReview(reviewBillScan(body.bill, {
        parties,
        items,
        form,
        today,
        vouchers,
        accounts,
        companyState,
        createMissingItems: true,
      }));
    } catch (err) {
      setPhoto(null);
      setPreview("");
      setFileLabel("");
      setError(err.message || "The bill could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const useDraft = async () => {
    if (!review) return;
    setBusy(true);
    setError("");
    try {
      let formPatch = { ...review.draft.form };
      let catalogue = items || [];
      if (createMissingItems) {
        const planned = planMissingBillItems(formPatch.itemLines, catalogue);
        const created = [];
        for (const row of planned) {
          const savedId = await upsertItem(token, row);
          const id = typeof savedId === "string" ? savedId : savedId?.id;
          if (!id) throw new Error(`Could not create inventory item ${row.name}.`);
          created.push({
            id,
            name: row.name,
            sku: row.sku,
            itemType: "product",
            unit: row.unit,
            gstRate: row.gstRate,
            hsnSac: row.hsnSac,
            purchasePrice: Number(row.purchasePrice || 0),
            sellingPrice: 0,
            isActive: true,
          });
        }
        if (created.length) {
          catalogue = [...catalogue, ...created];
          formPatch = {
            ...formPatch,
            itemLines: linkBillLinesToItems(formPatch.itemLines || [], catalogue),
          };
          if (typeof onItemsCreated === "function") await onItemsCreated(created);
        }
      }
      const billPhoto = keepPhoto && photoFits && photo ? photo : null;
      setForm(current => ({ ...current, ...formPatch, billPhoto }));
      setApplied(true);
    } catch (err) {
      setError(err.message || "Could not add items from this bill.");
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setReview(null);
    setPreview("");
    setFileLabel("");
    setPhoto(null);
    setKeepPhoto(false);
    setApplied(false);
    setAcceptDuplicate(false);
    clearPhotoOnForm();
  };

  const unmatchedCount = (review?.draft?.form?.itemLines || []).filter(line => !line.itemId).length;

  return (
    <section className="acc-form-section acc-bill-scan">
      <h3 className="acc-form-section-title">Supplier bill</h3>
      <p className="small">Photograph the bill, or choose a PDF. MyFinTracker shows what it read. The purchase form changes only after you use the draft, and nothing is posted until you save. New items are added to inventory when you use the draft; stock increases when you save the purchase.</p>
      <div className="acc-bill-scan-row">
        {preview ? <img src={preview} alt="Scanned bill" /> : null}
        {fileLabel ? <p className="small">{fileLabel}</p> : null}
        <label className="btn">
          {busy ? "Working…" : "Scan bill"}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" disabled={busy} onChange={onFile} />
        </label>
      </div>
      {error ? <p className="small acc-bill-scan-error" role="alert">{error}</p> : null}
      {review ? (
        <div className="acc-bill-review" role="status">
          <dl>
            <dt>Document</dt>
            <dd>{review.documentLabel}</dd>
            <dt>Confidence</dt>
            <dd>{review.confidence}</dd>
            <dt>Supplier</dt>
            <dd>{review.supplier?.name || review.bill.supplierName || "Not read"}</dd>
            <dt>GSTIN</dt>
            <dd>{review.bill.supplierGstin || "Not read"}</dd>
            <dt>Invoice number</dt>
            <dd>{review.bill.billNumber || "Not read"}</dd>
            <dt>Date</dt>
            <dd>{review.bill.billDate || "Not read"}</dd>
            <dt>Payment</dt>
            <dd>{PAYMENT_LABELS[review.bill.paymentStatus] || "Not read"}</dd>
            <dt>GST</dt>
            <dd>{review.gst.label}</dd>
            {review.expense ? (
              <>
                <dt>Expense ledger</dt>
                <dd>{review.expense.expenseName}, last posted {money(review.expense.amount)}{review.expense.date ? ` on ${review.expense.date}` : ""}</dd>
              </>
            ) : null}
            <dt>Missing</dt>
            <dd>{review.missing.length ? review.missing.join(", ") : "None"}</dd>
          </dl>
          {review.draft.warnings.length ? (
            <ul className="acc-bill-scan-notes">{review.draft.warnings.map(note => <li key={note}>{note}</li>)}</ul>
          ) : null}
          <div className="acc-bill-keep-list">
            {unmatchedCount > 0 ? (
              <label className="acc-bill-keep">
                <input
                  type="checkbox"
                  checked={createMissingItems}
                  disabled={applied || busy}
                  onChange={event => setCreateMissingItems(event.target.checked)}
                />
                <span>Add {unmatchedCount} new item{unmatchedCount === 1 ? "" : "s"} to inventory when I use this draft</span>
              </label>
            ) : null}
            <label className="acc-bill-keep">
              <input
                type="checkbox"
                checked={keepPhoto && photoFits}
                disabled={!photoFits || applied}
                onChange={event => setKeepPhoto(event.target.checked)}
              />
              <span>Keep this file with the voucher after you save</span>
            </label>
            {(review.duplicates || []).length ? (
              <label className="acc-bill-keep">
                <input type="checkbox" checked={acceptDuplicate} onChange={event => setAcceptDuplicate(event.target.checked)} />
                <span>Use this draft anyway. I have checked it is not the same bill as {(review.duplicates || []).map(voucher => voucher.voucherNumber).filter(Boolean).join(", ")}.</span>
              </label>
            ) : null}
          </div>
          {!photoFits ? <p className="small">This file is larger than 512 KB, so it stays on screen and is not stored with the voucher.</p> : null}
          <div className="acc-bill-review-actions">
            <button type="button" className="btn primary" disabled={applied || busy || ((review.duplicates || []).length > 0 && !acceptDuplicate)} onClick={useDraft}>{applied ? "Draft in the form" : "Use this draft"}</button>
            <button type="button" className="btn" disabled={busy} onClick={discard}>Discard</button>
          </div>
          {applied ? <p className="small">Draft is in the form. Check it, then save. Stock updates when you save the purchase.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
