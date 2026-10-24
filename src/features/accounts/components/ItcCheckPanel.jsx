import { useState } from "react";
import { AccEmpty } from "./AccUi.jsx";
import { ITC_DISCLAIMER, buildItcCheck, parseGstr2b } from "../../intelligence/ai/gstr2bCheck.js";

const ACTION_LABEL = { accept: "Accept", pending: "Pending", reject: "Reject" };
const FILTERS = [
  { id: "all", label: "All in file" },
  { id: "accept", label: "Accept" },
  { id: "pending", label: "Pending" },
  { id: "reject", label: "Reject" },
];

export function ItcCheckPanel({ vouchers, parties }) {
  const [result, setResult] = useState(null);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [filter, setFilter] = useState("all");
  const [dragging, setDragging] = useState(false);

  const readFile = async file => {
    if (!file) return;
    setFileName(file.name);
    setFilter("all");
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

  const onFile = event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    readFile(file);
  };

  const onDrop = event => {
    event.preventDefault();
    setDragging(false);
    readFile(event.dataTransfer?.files?.[0]);
  };

  const counts = result ? { all: result.summary.portal, accept: result.summary.accept, pending: result.summary.pending, reject: result.summary.reject } : null;
  const rows = result ? result.rows.filter(row => filter === "all" || row.action === filter) : [];

  return <div className="air-stack">
    <p className="air-note">{ITC_DISCLAIMER}</p>
    <label className={`air-drop${dragging ? " is-over" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <strong>{fileName ? "Upload a different GSTR-2B" : "Upload GSTR-2B"}</strong>
      <span className="air-row-sub">{fileName || "Drop the file here or click to choose. JSON from the GST portal, or a CSV with GSTIN, invoice number, date, taxable value and tax."}</span>
      <input className="ft-sr-only" type="file" accept=".json,.csv,text/csv,application/json" onChange={onFile} />
    </label>
    {error ? <p className="air-error" role="alert">{error}</p> : null}
    {notes.map(note => <p key={note} className="air-note">{note}</p>)}
    {!result && !error ? <AccEmpty title="No GSTR-2B yet" copy="Upload the file for the month. Each bill is suggested as Accept, Reject or Pending. You still take the action on the GST portal." /> : null}
    {result && <>
      <div className="air-chips" role="group" aria-label="Filter by suggestion">
        {FILTERS.map(item => <button key={item.id} type="button" className={`air-chip${filter === item.id ? " active" : ""}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{counts[item.id]}</span></button>)}
      </div>
      {!result.rows.length ? <AccEmpty title="Nothing to compare" copy="The file had no invoices to match with posted purchases." /> : (
        <section className="air-section">
          <ul className="air-list">
            {rows.map(row => <li key={row.id} className={`air-row is-${row.action === "reject" ? "high" : row.action === "pending" ? "medium" : "ok"}`}>
              <div className="air-row-main">
                <strong className="air-row-title">{row.supplier}</strong>
                <span className="air-row-sub">{row.gstin} · Invoice {row.invoice}{row.voucherNumber && row.voucherNumber !== row.invoice ? ` (${row.voucherNumber})` : ""} · {row.date || "No date"}</span>
              </div>
              <div className="air-row-side"><span className={`badge${row.action === "reject" ? " warning" : ""}`}>{ACTION_LABEL[row.action]}</span></div>
              <div className="air-row-extra"><p className="air-text">{row.reason}</p></div>
            </li>)}
          </ul>
          {!rows.length ? <p className="air-note">No invoices with this suggestion.</p> : null}
        </section>
      )}
    </>}
  </div>;
}
