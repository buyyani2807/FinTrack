import { useMemo, useRef, useState } from "react";
import { FileUp, LoaderCircle, ImagePlus } from "lucide-react";
import { CloseButton, ModalScroll } from "../../../components/ui.jsx";
import { useDialogDismiss } from "../../../components/useDialogDismiss.js";
import { downloadAccountsCsv } from "../io/accountingExport.js";
import { VOUCHER_CSV_TEMPLATE, parseVoucherImportFile, planVoucherImport } from "../io/voucherCsvImport.js";
import { applyBulkPartyMappings } from "../model/bulkVoucherImport.js";
import { collectBillSources, scanBillQueue } from "../model/bulkBillImport.js";
import { money } from "../accountsFormat.js";
import { AccTable } from "./AccUi.jsx";
import "../bookkeeper.css";

const EXCEL_ACCEPT = ".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const BILL_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf,.zip,application/zip";

/**
 * Ongoing bulk entry: Excel sales/purchases, or a batch of supplier bill photos/PDFs.
 * Parent supplies posting APIs; nothing posts until the user confirms.
 */
export function AccBulkImportWorkspace({
  accounts = [],
  parties = [],
  items = [],
  vouchers = [],
  company = null,
  today = "",
  token = "",
  canWrite = false,
  partyMaps = null,
  loadPartyMaps = null,
  onRunExcel,
  onRunBills,
  onClose,
}) {
  const [tab, setTab] = useState("excel");
  const [error, setError] = useState("");
  const [stage, setStage] = useState("upload");
  const [plan, setPlan] = useState(null);
  const [createMissingParties, setCreateMissingParties] = useState(true);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [billSources, setBillSources] = useState([]);
  const [maps, setMaps] = useState(partyMaps || {});
  const stopRef = useRef(false);
  const excelInputRef = useRef(null);
  const billInputRef = useRef(null);
  const busy = stage === "reading" || stage === "scanning" || stage === "importing";

  const ensureMaps = async () => {
    if (partyMaps && Object.keys(partyMaps).length) {
      setMaps(partyMaps);
      return partyMaps;
    }
    if (!loadPartyMaps) return maps;
    try {
      const next = await loadPartyMaps();
      const resolved = next && typeof next === "object" ? next : {};
      setMaps(resolved);
      return resolved;
    } catch {
      return maps;
    }
  };

  const selectedExcel = useMemo(
    () => (plan?.entries || []).filter(entry => entry.selected && entry.status !== "error"),
    [plan],
  );
  const selectedBills = useMemo(
    () => billSources.filter(source => source.selected && source.status === "ready"),
    [billSources],
  );

  const close = () => {
    if (!busy) onClose?.();
  };
  const layerRef = useDialogDismiss(close);

  const resetExcel = () => {
    setPlan(null);
    setResult(null);
    setProgress(null);
    setError("");
    setStage("upload");
  };

  const resetBills = () => {
    setBillSources([]);
    setResult(null);
    setProgress(null);
    setError("");
    setStage("upload");
  };

  const readExcel = async fileList => {
    const file = [...(fileList || [])][0];
    if (!file) return;
    setError("");
    setStage("reading");
    try {
      const sharedMaps = await ensureMaps();
      const rows = await parseVoucherImportFile(file);
      if (!rows.length) throw new Error("No data rows found. Check the template columns.");
      const next = planVoucherImport(rows, {
        parties,
        items,
        vouchers,
        company,
        today,
        createMissingParties,
        companyId: company?.id || "",
      });
      setPlan({
        ...next,
        rawRows: rows,
        entries: applyBulkPartyMappings(next.entries, sharedMaps),
      });
      setStage("review");
    } catch (readError) {
      setError(readError?.message || "Could not read this file.");
      setStage("upload");
    }
  };

  const rebuildPlan = async nextCreate => {
    setCreateMissingParties(nextCreate);
    if (!plan?.rawRows) return;
    const sharedMaps = await ensureMaps();
    const next = planVoucherImport(plan.rawRows, {
      parties,
      items,
      vouchers,
      company,
      today,
      createMissingParties: nextCreate,
      companyId: company?.id || "",
    });
    setPlan({
      ...next,
      rawRows: plan.rawRows,
      entries: applyBulkPartyMappings(next.entries, sharedMaps),
    });
  };

  const toggleEntry = id => {
    setPlan(current => current ? {
      ...current,
      entries: current.entries.map(entry => entry.id === id && entry.status !== "error"
        ? { ...entry, selected: !entry.selected }
        : entry),
    } : current);
  };

  const startExcelImport = async () => {
    if (!plan || !onRunExcel || !canWrite || !selectedExcel.length) return;
    stopRef.current = false;
    setStage("importing");
    setProgress({ step: 0, total: selectedExcel.length, label: "Starting", done: {}, failed: 0 });
    const outcome = await onRunExcel(
      { ...plan, entries: plan.entries },
      {
        createMissingParties,
        onProgress: setProgress,
        shouldStop: () => stopRef.current,
      },
    );
    setResult(outcome || { done: {}, failed: [{ label: "Import", message: "The import did not start." }] });
    setStage("done");
  };

  const readBills = async fileList => {
    setError("");
    setStage("reading");
    try {
      const sources = await collectBillSources(fileList);
      setBillSources(sources);
      setStage("scanning");
      stopRef.current = false;
      await scanBillQueue(sources, {
        token,
        parties,
        items,
        vouchers,
        accounts,
        companyState: company?.stateCode || "",
        today,
        concurrency: 2,
        shouldStop: () => stopRef.current,
        onUpdate: (id, patch) => {
          setBillSources(current => current.map(source => (source.id === id ? { ...source, ...patch } : source)));
        },
      });
      setStage("review");
    } catch (readError) {
      setError(readError?.message || "Could not read these bills.");
      setStage("upload");
    }
  };

  const startBillImport = async () => {
    if (!onRunBills || !canWrite || !selectedBills.length) return;
    stopRef.current = false;
    setStage("importing");
    setProgress({ step: 0, total: selectedBills.length, label: "Starting", done: {}, failed: 0 });
    const outcome = await onRunBills(billSources, {
      onProgress: setProgress,
      shouldStop: () => stopRef.current,
    });
    setResult(outcome || { done: {}, failed: [{ label: "Import", message: "The import did not start." }] });
    setStage("done");
  };

  return (
    <div ref={layerRef} className="modal-bg" role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="modal acc-modal acc-modal-wide acc-mig" role="dialog" aria-modal="true" aria-label="Bulk import">
        <div className="row modal-head">
          <h2 className="title">Bulk import</h2>
          <CloseButton onClick={close} />
        </div>
        <div className="acc-bulk-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "excel"} className={`btn${tab === "excel" ? " primary" : ""}`} disabled={busy} onClick={() => { setTab("excel"); resetExcel(); }}>Excel / CSV</button>
          <button type="button" role="tab" aria-selected={tab === "bills"} className={`btn${tab === "bills" ? " primary" : ""}`} disabled={busy} onClick={() => { setTab("bills"); resetBills(); }}>Bill photos</button>
        </div>
        <ModalScroll>
          {tab === "excel" && (
            <div className="acc-mig-body">
              {(stage === "upload" || stage === "reading") && (
                <>
                  <p className="acc-setup-ask">Upload a CSV or Excel sheet of sales and purchases. FinTrack groups invoice lines, matches parties, and shows a review before anything is posted.</p>
                  <div className="accounts-action-row spacer">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => downloadAccountsCsv(
                        "fintrack-sales-purchases-template.csv",
                        VOUCHER_CSV_TEMPLATE.split("\n").map(line => {
                          const cells = [];
                          let field = "";
                          let quoted = false;
                          for (const char of line) {
                            if (char === "\"") quoted = !quoted;
                            else if (char === "," && !quoted) { cells.push(field); field = ""; }
                            else field += char;
                          }
                          cells.push(field);
                          return cells;
                        }),
                      )}
                    >
                      Download template
                    </button>
                  </div>
                  <label
                    className={`acc-mig-drop${stage === "reading" ? " is-busy" : ""}`}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => { event.preventDefault(); if (!busy) readExcel(event.dataTransfer.files); }}
                  >
                    <input ref={excelInputRef} type="file" accept={EXCEL_ACCEPT} disabled={busy || !canWrite} onChange={event => { readExcel(event.target.files); event.target.value = ""; }} />
                    {stage === "reading" ? <LoaderCircle size={22} className="acc-setup-spin" aria-hidden="true" /> : <FileUp size={22} aria-hidden="true" />}
                    <strong>{stage === "reading" ? "Reading your file…" : "Choose a CSV or Excel file"}</strong>
                    <span>Sales and purchases only. Use Type, Date, Party, Invoice number, Amount or Item lines.</span>
                  </label>
                  {!canWrite && <p className="small">You need write access to import vouchers.</p>}
                  {error && <p className="acc-bk-errors" role="alert">{error}</p>}
                </>
              )}

              {stage === "review" && plan && (
                <>
                  <p className="acc-setup-ask">
                    {plan.counts.ready} ready · {plan.counts.warnings} with warnings · {plan.counts.errors} with errors
                    {" · "}{plan.counts.sales} sales · {plan.counts.purchases} purchases
                  </p>
                  <label className="small acc-bulk-check">
                    <input
                      type="checkbox"
                      checked={createMissingParties}
                      onChange={event => {
                        rebuildPlan(event.target.checked);
                      }}
                    />
                    Create missing customers and suppliers when posting
                  </label>
                  <AccTable
                    spaced={false}
                    columns={["", "Entry", "Date", "Party", { label: "Amount", num: true }, "Status"]}
                  >
                    {plan.entries.map(entry => (
                      <tr key={entry.id} className={entry.status === "error" ? "acc-row-muted" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={entry.selected}
                            disabled={entry.status === "error"}
                            onChange={() => toggleEntry(entry.id)}
                            aria-label={`Select ${entry.label}`}
                          />
                        </td>
                        <td>
                          <strong>{entry.label}</strong>
                          {entry.mode === "items" ? <span className="small"> · items</span> : <span className="small"> · amount</span>}
                          {entry.errors.map(note => <div key={note} className="small acc-bill-scan-error">{note}</div>)}
                          {entry.warnings.map(note => <div key={note} className="small">{note}</div>)}
                        </td>
                        <td>{entry.date || "—"}</td>
                        <td>{entry.partyName || "—"}</td>
                        <td className="acc-num">{money(entry.amount)}</td>
                        <td>{entry.status}</td>
                      </tr>
                    ))}
                  </AccTable>
                  <div className="tabs spacer">
                    <button type="button" className="btn" onClick={resetExcel}>Back</button>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!canWrite || !selectedExcel.length}
                      onClick={startExcelImport}
                    >
                      Post {selectedExcel.length} selected
                    </button>
                  </div>
                </>
              )}

              {stage === "importing" && progress && (
                <div className="acc-mig-body">
                  <p className="acc-setup-ask">Posting {progress.step} of {progress.total}… {progress.label}</p>
                  <div className="acc-mig-progress" aria-hidden="true"><span style={{ width: `${progress.total ? (100 * progress.step) / progress.total : 0}%` }} /></div>
                  <button type="button" className="btn" onClick={() => { stopRef.current = true; }}>Stop</button>
                </div>
              )}

              {stage === "done" && result && (
                <div className="acc-mig-body">
                  <p className="acc-setup-ask">
                    Posted {result.done?.vouchers || 0} voucher{(result.done?.vouchers || 0) === 1 ? "" : "s"}
                    {result.done?.parties ? ` · created ${result.done.parties} part${result.done.parties === 1 ? "y" : "ies"}` : ""}
                    {result.stopped ? " · stopped early" : ""}.
                  </p>
                  {result.failed?.length ? (
                    <ul className="small acc-bk-errors">
                      {result.failed.slice(0, 12).map(item => <li key={`${item.label}-${item.message}`}>{item.label}: {item.message}</li>)}
                    </ul>
                  ) : <p className="small">No failures.</p>}
                  <div className="tabs spacer">
                    <button type="button" className="btn" onClick={resetExcel}>Import another file</button>
                    <button type="button" className="btn primary" onClick={close}>Done</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "bills" && (
            <div className="acc-mig-body">
              {(stage === "upload" || stage === "reading") && (
                <>
                  <p className="acc-setup-ask">Upload supplier bill photos or PDFs (or a ZIP of them). FinTrack reads each bill, then you review and post purchases.</p>
                  <label
                    className={`acc-mig-drop${stage === "reading" ? " is-busy" : ""}`}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => { event.preventDefault(); if (!busy) readBills(event.dataTransfer.files); }}
                  >
                    <input ref={billInputRef} type="file" multiple accept={BILL_ACCEPT} disabled={busy || !canWrite} onChange={event => { readBills(event.target.files); event.target.value = ""; }} />
                    {stage === "reading" ? <LoaderCircle size={22} className="acc-setup-spin" aria-hidden="true" /> : <ImagePlus size={22} aria-hidden="true" />}
                    <strong>{stage === "reading" ? "Preparing files…" : "Choose bills or a ZIP"}</strong>
                    <span>JPEG, PNG, WebP, PDF. Large batches scan a few at a time.</span>
                  </label>
                  {!canWrite && <p className="small">You need write access to import bills.</p>}
                  {error && <p className="acc-bk-errors" role="alert">{error}</p>}
                </>
              )}

              {stage === "scanning" && (
                <div className="acc-mig-body">
                  <p className="acc-setup-ask">Reading bills… {billSources.filter(source => source.status === "ready" || source.status === "error").length} of {billSources.length}</p>
                  <div className="acc-mig-progress" aria-hidden="true">
                    <span style={{ width: `${billSources.length ? (100 * billSources.filter(source => source.status !== "queued" && source.status !== "scanning").length) / billSources.length : 0}%` }} />
                  </div>
                  <button type="button" className="btn" onClick={() => { stopRef.current = true; }}>Stop scanning</button>
                </div>
              )}

              {(stage === "review" || (stage === "scanning" && billSources.some(source => source.review))) && billSources.length > 0 && stage !== "importing" && stage !== "done" && (
                <>
                  <p className="acc-setup-ask">
                    {billSources.filter(source => source.status === "ready").length} ready · {billSources.filter(source => source.status === "error").length} failed · {selectedBills.length} selected
                  </p>
                  <AccTable spaced={false} columns={["", "File", "Supplier", "Invoice", "Date", { label: "Total", num: true }, "Status"]}>
                    {billSources.map(source => {
                      const bill = source.review?.bill;
                      return (
                        <tr key={source.id} className={source.status === "error" ? "acc-row-muted" : ""}>
                          <td>
                            <input
                              type="checkbox"
                              checked={source.selected}
                              disabled={source.status !== "ready"}
                              onChange={() => setBillSources(current => current.map(row => row.id === source.id ? { ...row, selected: !row.selected } : row))}
                              aria-label={`Select ${source.fileName}`}
                            />
                          </td>
                          <td>
                            <strong>{source.fileName}</strong>
                            {source.error ? <div className="small acc-bill-scan-error">{source.error}</div> : null}
                            {source.review?.draft?.warnings?.slice(0, 2).map(note => <div key={note} className="small">{note}</div>)}
                          </td>
                          <td>{source.review?.supplier?.name || bill?.supplierName || "—"}</td>
                          <td>{bill?.billNumber || "—"}</td>
                          <td>{bill?.billDate || "—"}</td>
                          <td className="acc-num">{bill?.total != null ? money(bill.total) : "—"}</td>
                          <td>{source.status}</td>
                        </tr>
                      );
                    })}
                  </AccTable>
                  {stage === "review" && (
                    <div className="tabs spacer">
                      <button type="button" className="btn" onClick={resetBills}>Back</button>
                      <button type="button" className="btn primary" disabled={!canWrite || !selectedBills.length} onClick={startBillImport}>
                        Post {selectedBills.length} purchases
                      </button>
                    </div>
                  )}
                </>
              )}

              {stage === "importing" && progress && (
                <div className="acc-mig-body">
                  <p className="acc-setup-ask">Posting {progress.step} of {progress.total}… {progress.label}</p>
                  <div className="acc-mig-progress" aria-hidden="true"><span style={{ width: `${progress.total ? (100 * progress.step) / progress.total : 0}%` }} /></div>
                  <button type="button" className="btn" onClick={() => { stopRef.current = true; }}>Stop</button>
                </div>
              )}

              {stage === "done" && result && (
                <div className="acc-mig-body">
                  <p className="acc-setup-ask">
                    Posted {result.done?.vouchers || 0} purchase{(result.done?.vouchers || 0) === 1 ? "" : "s"}
                    {result.done?.attachments ? ` · attached ${result.done.attachments} file${result.done.attachments === 1 ? "" : "s"}` : ""}
                    {result.stopped ? " · stopped early" : ""}.
                  </p>
                  {result.failed?.length ? (
                    <ul className="small acc-bk-errors">
                      {result.failed.slice(0, 12).map(item => <li key={`${item.label}-${item.message}`}>{item.label}: {item.message}</li>)}
                    </ul>
                  ) : <p className="small">No failures.</p>}
                  <div className="tabs spacer">
                    <button type="button" className="btn" onClick={resetBills}>Import more bills</button>
                    <button type="button" className="btn primary" onClick={close}>Done</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </ModalScroll>
      </div>
    </div>
  );
}
