import { useState } from "react";
import { purchaseFormFromBill } from "../../model/billScan.js";

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

export function BillPhotoDraft({ token, parties, items, form, setForm, today }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState("");

  const onFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setNotes([]);
    try {
      const jpeg = await fileToJpeg(file);
      setPreview(await readFile(jpeg));
      const data = await blobToBase64(jpeg);
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
      const draft = purchaseFormFromBill(body.bill, { parties, items, form, today });
      setForm(current => ({ ...current, ...draft.form }));
      setNotes(["Draft filled from the bill. Check it, then save. Nothing is posted until you save.", ...draft.warnings]);
    } catch (err) {
      setError(err.message || "The bill could not be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="acc-form-section acc-bill-scan">
      <h3 className="acc-form-section-title">Supplier bill</h3>
      <p className="small">Photograph the bill. The purchase form fills in as a draft.</p>
      <div className="acc-bill-scan-row">
        {preview ? <img src={preview} alt="Supplier bill" /> : null}
        <label className="btn">
          {busy ? "Reading the bill…" : "Scan bill"}
          <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={onFile} />
        </label>
      </div>
      {error ? <p className="small acc-bill-scan-error" role="alert">{error}</p> : null}
      {notes.length ? <ul className="acc-bill-scan-notes">{notes.map(note => <li key={note}>{note}</li>)}</ul> : null}
    </section>
  );
}
