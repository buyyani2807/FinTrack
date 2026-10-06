import { useState } from "react";
import { money } from "../../accountsFormat.js";
import { VOUCHER_ATTACHMENT_MAX_BYTES } from "../../data/voucherAttachments.js";
import { reviewBillScan } from "../../model/billScan.js";

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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.readAsDataURL(blob);
  });
}

const PAYMENT_LABELS = { paid: "Paid", unpaid: "Unpaid", unknown: "Not read" };

export function BillPhotoDraft({ token, parties, items, form, setForm, today, vouchers = [], accounts = [], companyState = "" }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [photo, setPhoto] = useState(null);
  const [review, setReview] = useState(null);
  const [keepPhoto, setKeepPhoto] = useState(false);
  const [applied, setApplied] = useState(false);
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
    setApplied(false);
    setKeepPhoto(false);
    clearPhotoOnForm();
    try {
      const jpeg = await fileToJpeg(file);
      setPreview(await readFile(jpeg));
      const data = await blobToBase64(jpeg);
      setPhoto({ data, fileName: "supplier-bill.jpg", byteSize: jpeg.size });
      const response = await fetch("/api/accounts/bill-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mimeType: "image/jpeg", data }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "The bill could not be read.");
      setReview(reviewBillScan(body.bill, { parties, items, form, today, vouchers, accounts, companyState }));
    } catch (err) {
      setPhoto(null);
      setError(err.message || "The bill could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const useDraft = () => {
    if (!review) return;
    const billPhoto = keepPhoto && photoFits && photo ? photo : null;
    setForm(current => ({ ...current, ...review.draft.form, billPhoto }));
    setApplied(true);
  };

  const discard = () => {
    setReview(null);
    setPreview("");
    setPhoto(null);
    setKeepPhoto(false);
    setApplied(false);
    clearPhotoOnForm();
  };

  return (
    <section className="acc-form-section acc-bill-scan">
      <h3 className="acc-form-section-title">Supplier bill</h3>
      <p className="small">Photograph the bill. FinTrack shows what it read. The purchase form changes only after you use the draft, and nothing is posted until you save.</p>
      <div className="acc-bill-scan-row">
        {preview ? <img src={preview} alt="Scanned document" /> : null}
        <label className="btn">
          {busy ? "Reading the bill…" : "Scan bill"}
          <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={onFile} />
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
          <label className="small acc-bill-keep">
            <input
              type="checkbox"
              checked={keepPhoto && photoFits}
              disabled={!photoFits || applied}
              onChange={event => setKeepPhoto(event.target.checked)}
            />
            Keep this photo with the voucher after you save
          </label>
          {!photoFits ? <p className="small">This photo is larger than 512 KB, so it stays on screen and is not stored with the voucher.</p> : null}
          <div className="acc-bill-review-actions">
            <button type="button" className="btn primary" disabled={applied} onClick={useDraft}>{applied ? "Draft in the form" : "Use this draft"}</button>
            <button type="button" className="btn" onClick={discard}>Discard</button>
          </div>
          {applied ? <p className="small">Draft is in the form. Check it, then save. Nothing is posted until you save.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
