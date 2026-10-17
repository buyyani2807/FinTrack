import { useState } from "react";
import { AccEmpty, AccTable } from "./AccUi.jsx";
import { ITC_DISCLAIMER, buildItcCheck, parseGstr2b } from "../../intelligence/ai/gstr2bCheck.js";

const ACTION_LABEL = { accept: "Accept", pending: "Pending", reject: "Reject" };

export function ItcCheckPanel({ vouchers, parties }) {
  const [result, setResult] = useState(null);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const onFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = parseGstr2b(await file.text());
      if (parsed.error) {
        setResult(null);
        setNotes([]);
        setError(parsed.error);
        return;
      }
      setError("");
      setNotes(parsed.notes || []);
      setResult(buildItcCheck({ invoices: parsed.invoices, vouchers, parties }));
    } catch {
      setResult(null);
      setError("This file could not be read.");
    }
  };

  return <>
    <p className="small muted">{ITC_DISCLAIMER}</p>
    <div className="ai-toolbar">
      <label className="btn">
        Upload GSTR-2B
        <input className="ft-sr-only" type="file" accept=".json,.csv,text/csv,application/json" onChange={onFile} />
      </label>
      {fileName ? <span className="small muted">{fileName}</span> : <span className="small muted">JSON from the GST portal, or a CSV with GSTIN, invoice number, date, taxable value and tax.</span>}
    </div>
    {error ? <p className="red small">{error}</p> : null}
    {notes.map(note => <p key={note} className="small">{note}</p>)}
    {!result && !error ? <AccEmpty title="No GSTR-2B yet" copy="Upload the file for the month. Each bill is suggested as Accept, Reject or Pending. You still take the action on the GST portal." /> : null}
    {result && <>
      <div className="acc-metric-grid acc-metric-compact">
        <div className="card"><span className="small">In the file</span><strong>{result.summary.portal}</strong></div>
        <div className="card"><span className="small">Accept</span><strong>{result.summary.accept}</strong></div>
        <div className="card"><span className="small">Pending</span><strong>{result.summary.pending}</strong></div>
        <div className="card"><span className="small">Reject</span><strong>{result.summary.reject}</strong></div>
      </div>
      {!result.rows.length ? <AccEmpty title="Nothing to compare" copy="The file had no invoices to match with posted purchases." /> : (
        <AccTable columns={["Supplier", "Invoice", "Date", "Suggestion", "Why"]}>
          {result.rows.map(row => <tr key={row.id}>
            <td><strong>{row.supplier}</strong><div className="small muted">{row.gstin}</div></td>
            <td>{row.invoice}{row.voucherNumber && row.voucherNumber !== row.invoice ? <div className="small muted">{row.voucherNumber}</div> : null}</td>
            <td>{row.date || "—"}</td>
            <td><span className={`badge${row.action === "reject" ? " warning" : ""}`}>{ACTION_LABEL[row.action]}</span></td>
            <td className="small">{row.reason}</td>
          </tr>)}
        </AccTable>
      )}
    </>}
  </>;
}
