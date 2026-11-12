import { useState } from "react";
import { prepareVoucherAttachmentFile, VOUCHER_ATTACHMENT_MAX_BYTES } from "../../data/voucherAttachments.js";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

export function ExpenseBillProof({ files = [], onChange, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const addFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled || busy) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareVoucherAttachmentFile(file);
      onChange([...(files || []), prepared]);
    } catch (err) {
      setError(err.message || "Could not attach that bill.");
    } finally {
      setBusy(false);
    }
  };

  const remove = index => {
    onChange((files || []).filter((_, item) => item !== index));
    setError("");
  };

  return (
    <section className="acc-form-section acc-expense-proof">
      <h3 className="acc-form-section-title">Bill / proof</h3>
      <p className="small">
        Attach the invoice, receipt, or a photo. It stays with this expense for audit.
        PDF or image, up to {Math.round(VOUCHER_ATTACHMENT_MAX_BYTES / 1024)} KB each — photos are compressed.
      </p>
      <div className="acc-expense-proof-row">
        {(files || []).map((file, index) => (
          <div key={`${file.fileName}-${index}`} className="acc-expense-proof-file">
            {String(file.contentType || "").startsWith("image/") && file.data ? (
              <img src={`data:${file.contentType};base64,${file.data}`} alt="" />
            ) : null}
            <span className="small">{file.fileName}</span>
            <button type="button" className="btn" disabled={disabled || busy} onClick={() => remove(index)}>
              Remove
            </button>
          </div>
        ))}
        <label className="btn">
          {busy ? "Working…" : files.length ? "Add another bill" : "Attach bill"}
          <input type="file" accept={ACCEPT} disabled={disabled || busy} onChange={addFile} />
        </label>
      </div>
      {error ? <p className="small acc-expense-proof-error" role="alert">{error}</p> : null}
    </section>
  );
}
