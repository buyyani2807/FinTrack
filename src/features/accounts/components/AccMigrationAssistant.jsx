import { useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, FileUp, LoaderCircle, Sparkles } from "lucide-react";
import { CloseButton } from "../../../components/ui.jsx";
import { Select } from "../../../components/Select.jsx";
import { readImportFile } from "../model/importReaders.js";
import {
  AUTO_MAP_CONFIDENCE,
  NEW_LEDGER_TARGETS,
  analyzeMigration,
  applyAiSuggestions,
  buildMigrationPlan,
  targetValue,
} from "../model/migrationAssistant.js";
import { shortDate } from "../model/bookkeeper.js";
import { money } from "../accountsFormat.js";
import "../bookkeeper.css";

const ACCEPT = ".xml,.csv,.tsv,.txt,.xlsx";
const PAGE = 60;
const GROUP_LABEL = { asset: "Assets", liability: "Liabilities", equity: "Capital", income: "Income", expense: "Expenses" };

async function suggestWithAssistant(ledgers, targets, token) {
  if (!token || typeof fetch === "undefined" || !ledgers.length) return [];
  try {
    const response = await fetch("/api/accounts/bookkeeper", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
      body: JSON.stringify({
        kind: "ledgers",
        ledgers: ledgers.slice(0, 80).map(ledger => ({ name: ledger.name, group: ledger.group })),
        targets,
      }),
    });
    if (!response.ok || !/json/i.test(response.headers.get("content-type") || "")) return [];
    const body = await response.json();
    return Array.isArray(body?.suggestions) ? body.suggestions : [];
  } catch {
    return [];
  }
}

const formatCount = value => Number(value || 0).toLocaleString("en-IN");
const joinAnd = list => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] || "");

/**
 * Upload Tally, Zoho Books, Book Keeper or Excel data, review what FinTrack could not
 * place on its own, then import. The parent runs the plan with `onRun`.
 */
export function AccMigrationAssistant({
  accounts = [],
  parties = [],
  company = null,
  existingEntries = 0,
  token = "",
  today = "",
  aiEnabled = false,
  canAdmin = false,
  onRun,
  onClose,
}) {
  const [stage, setStage] = useState("upload");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [asking, setAsking] = useState(false);
  const [targets, setTargets] = useState({});
  const [separate, setSeparate] = useState(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const stopRef = useRef(false);
  const inputRef = useRef(null);
  const busy = stage === "reading" || stage === "importing";

  const accountOptions = useMemo(() => accounts
    .filter(account => account.isActive !== false)
    .map(account => ({ value: `coa:${account.id}`, label: `${account.name} (${GROUP_LABEL[account.groupType] || account.groupType})` })), [accounts]);

  const plan = useMemo(() => (analysis ? buildMigrationPlan(analysis, { targets, separate }, {
    accounts,
    parties,
    booksStartedOn: company?.booksStartedOn || "",
    today,
    companyId: company?.id || "",
  }) : null), [analysis, targets, separate, accounts, parties, company, today]);

  const readFiles = async fileList => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setError("");
    setStage("reading");
    try {
      const read = [];
      for (const file of files) {
        if (file.size > 60 * 1024 * 1024) throw new Error(`${file.name} is larger than 60 MB. Export one financial year at a time.`);
        read.push(await readImportFile(file));
      }
      const next = analyzeMigration(read, { accounts, parties });
      if (!next.ledgers.length && !next.vouchers.length) throw new Error("FinTrack could not find parties, ledgers or transactions in these files. Check that the first row has column names.");
      setAnalysis(next);
      setTargets({});
      setSeparate(new Set());
      setStage("summary");
      const unsure = next.ledgers.filter(ledger => ledger.suggested.confidence < AUTO_MAP_CONFIDENCE);
      if (aiEnabled && unsure.length) {
        setAsking(true);
        const suggestions = await suggestWithAssistant(unsure, [...accountOptions, ...NEW_LEDGER_TARGETS], token);
        if (suggestions.length) setAnalysis(current => (current === next ? { ...applyAiSuggestions(next, suggestions) } : current));
        setAsking(false);
      }
    } catch (readError) {
      setError(readError?.message || "Could not read these files.");
      setStage(analysis ? "summary" : "upload");
    }
  };

  const startImport = async () => {
    if (!plan || !onRun || !canAdmin) return;
    stopRef.current = false;
    setStage("importing");
    setProgress({ step: 0, total: plan.totalSteps, label: "Starting", done: {}, failed: 0 });
    const outcome = await onRun(plan, { onProgress: setProgress, shouldStop: () => stopRef.current });
    setResult(outcome || { done: {}, failed: [{ label: "Import", message: "The import did not start." }] });
    setStage("done");
  };

  const close = () => {
    if (!busy) onClose?.();
  };

  const reviewRows = analysis
    ? analysis.ledgers.filter(ledger => showAll || ledger.suggested.confidence < AUTO_MAP_CONFIDENCE)
    : [];
  const counts = analysis?.counts;

  return (
    <div className="modal-bg" role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="modal acc-modal acc-modal-wide acc-mig" role="dialog" aria-modal="true" aria-label="Move your books to FinTrack">
        <div className="row">
          <h2 className="title">Move your books to FinTrack</h2>
          <CloseButton onClick={close} />
        </div>

        {stage === "upload" || stage === "reading" ? (
          <div className="acc-mig-body">
            <p className="acc-setup-ask">Upload what you exported from Tally, Zoho Books, Book Keeper or Excel. I will read it, map your ledgers and parties, and show you anything I am unsure about before importing.</p>
            <label
              className={`acc-mig-drop${stage === "reading" ? " is-busy" : ""}`}
              onDragOver={event => event.preventDefault()}
              onDrop={event => { event.preventDefault(); if (!busy) readFiles(event.dataTransfer.files); }}
            >
              <input ref={inputRef} type="file" multiple accept={ACCEPT} disabled={busy} onChange={event => { readFiles(event.target.files); event.target.value = ""; }} />
              {stage === "reading" ? <LoaderCircle size={22} className="acc-setup-spin" aria-hidden="true" /> : <FileUp size={22} aria-hidden="true" />}
              <strong>{stage === "reading" ? "Reading your files…" : "Choose files or drop them here"}</strong>
              <span>Tally XML, Excel (.xlsx) or CSV. You can pick several files at once.</span>
            </label>
            <details className="acc-mig-help">
              <summary>How to export</summary>
              <ul>
                <li><strong>Tally:</strong> Gateway of Tally → Export → Masters (All Masters) and Day Book, format XML. Upload both files.</li>
                <li><strong>Zoho Books:</strong> export Contacts, Chart of Accounts and Journals (or Invoices, Bills and Payments) as CSV or XLSX.</li>
                <li><strong>Book Keeper or Excel:</strong> a party list with balances, a ledger list with groups, and a day book with date, ledger, debit and credit columns.</li>
              </ul>
            </details>
            {error && <p className="acc-bk-errors" role="alert">{error}</p>}
          </div>
        ) : null}

        {stage === "summary" && analysis && (
          <div className="acc-mig-body">
            <p className="acc-setup-ask">I read {analysis.files.length === 1 ? analysis.files[0] : `${analysis.files.length} files`}{analysis.sources.length ? ` from ${joinAnd(analysis.sources)}` : ""}. Here is what I found.</p>
            <div className="acc-mig-tiles">
              <Tile label="Customers" value={counts.customers} />
              <Tile label="Suppliers" value={counts.suppliers} />
              <Tile label="Ledger accounts" value={counts.ledgers} />
              <Tile label="Transactions" value={counts.transactions} />
              <Tile label="Duplicate parties" value={counts.duplicates} tone={counts.duplicates ? "warn" : ""} />
              <Tile label="Accounts requiring mapping" value={counts.needsMapping} tone={counts.needsMapping ? "warn" : ""} />
            </div>
            <div className="acc-bk-reply">
              <p className="acc-bk-reply-lead"><Sparkles size={15} aria-hidden="true" /> I mapped {analysis.autoMappedPercent}% of your accounts automatically.</p>
              {asking && <p className="small"><LoaderCircle size={13} className="acc-setup-spin" aria-hidden="true" /> Asking FinTrack AI about the ledgers I was unsure of…</p>}
              <ul className="acc-setup-summary">
                <li><CheckCircle2 size={15} aria-hidden="true" /><span><strong>Opening balances</strong> {counts.openings ? `${formatCount(counts.openings)} ledgers carry balances, posted as of ${shortDate(plan.openingDate)}.` : "None in these files."}{plan.openingDifference ? ` They differ by ${money(Math.abs(plan.openingDifference))}; the gap goes to Opening Balance Adjustment for your CA to check.` : ""}</span></li>
                <li><CheckCircle2 size={15} aria-hidden="true" /><span><strong>To create</strong> {formatCount(plan.newParties.length)} parties and {formatCount(plan.newLedgers.length)} ledgers. Ones already in FinTrack are reused.</span></li>
                <li><CheckCircle2 size={15} aria-hidden="true" /><span><strong>To post</strong> {formatCount(plan.vouchers.length)} transactions{analysis.firstDate ? ` from ${shortDate(analysis.firstDate)} to ${shortDate(analysis.lastDate)}` : ""}.</span></li>
                {(plan.skipped.invalid + plan.skipped.future + plan.skipped.unmapped + counts.cancelled) > 0 && (
                  <li className="is-warn"><CircleAlert size={15} aria-hidden="true" /><span><strong>Left out</strong> {[
                    plan.skipped.invalid && `${formatCount(plan.skipped.invalid)} that do not balance or have no date`,
                    plan.skipped.future && `${formatCount(plan.skipped.future)} dated in the future`,
                    plan.skipped.unmapped && `${formatCount(plan.skipped.unmapped)} that use a ledger you chose to leave out`,
                    counts.cancelled && `${formatCount(counts.cancelled)} cancelled or optional in Tally`,
                  ].filter(Boolean).join(", ")}.</span></li>
                )}
                {analysis.skippedSheets.length > 0 && <li className="is-warn"><CircleAlert size={15} aria-hidden="true" /><span><strong>Sheets not read</strong> {analysis.skippedSheets.map(sheet => sheet.sheet || sheet.file).join(", ")}: the columns were not recognised.</span></li>}
                {existingEntries > 0 && <li className="is-warn"><CircleAlert size={15} aria-hidden="true" /><span><strong>Heads up</strong> This company already has {formatCount(existingEntries)} entries. Imported balances are added to them.</span></li>}
              </ul>
              <div className="acc-bk-actions">
                {analysis.exceptions > 0 && <button type="button" className="btn primary" onClick={() => { setShowAll(false); setLimit(PAGE); setStage("review"); }}>Review {formatCount(analysis.exceptions)} exceptions</button>}
                <button type="button" className={`btn${analysis.exceptions > 0 ? "" : " primary"}`} disabled={!canAdmin || !plan.totalSteps || asking} onClick={startImport}>Import into FinTrack</button>
                <button type="button" className="btn" onClick={() => { setAnalysis(null); setStage("upload"); }}>Choose other files</button>
                {!canAdmin && <span className="small">Only the owner can import.</span>}
              </div>
            </div>
            {error && <p className="acc-bk-errors" role="alert">{error}</p>}
          </div>
        )}

        {stage === "review" && analysis && (
          <div className="acc-mig-body">
            <button type="button" className="acc-ov-link-btn acc-mig-back" onClick={() => setStage("summary")}><ArrowLeft size={14} aria-hidden="true" /> Back to summary</button>
            <section className="acc-mig-section">
              <div className="acc-mig-section-head">
                <h3>{showAll ? "All ledgers" : "Accounts to map"}</h3>
                <label className="acc-bk-check"><input type="checkbox" checked={showAll} onChange={event => { setShowAll(event.target.checked); setLimit(PAGE); }} /> Show all {formatCount(analysis.ledgers.length)}</label>
              </div>
              {reviewRows.length === 0 ? <p className="small">Nothing left to map.</p> : (
                <div className="acc-mig-table" role="table" aria-label="Ledger mapping">
                  <div className="acc-mig-tr acc-mig-th" role="row"><span role="columnheader">Old ledger</span><span role="columnheader">Balance</span><span role="columnheader">Goes to</span></div>
                  {reviewRows.slice(0, limit).map(ledger => {
                    const value = targets[ledger.key] || targetValue(ledger.suggested);
                    const unsure = !targets[ledger.key] && ledger.suggested.confidence < AUTO_MAP_CONFIDENCE;
                    return (
                      <div key={ledger.key} className={`acc-mig-tr${unsure ? " is-unsure" : ""}`} role="row">
                        <span role="cell"><strong>{ledger.name}</strong><em>{ledger.group || "No group"} · {targets[ledger.key] ? "Your choice" : ledger.suggested.reason}</em></span>
                        <span role="cell">{ledger.openingBalance ? `${money(ledger.openingBalance)} ${ledger.openingSide === "debit" ? "Dr" : "Cr"}` : "—"}</span>
                        <span role="cell">
                          <Select aria-label={`Where ${ledger.name} goes`} value={value} onChange={event => setTargets(current => ({ ...current, [ledger.key]: event.target.value }))}>
                            {NEW_LEDGER_TARGETS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            {accountOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </Select>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {reviewRows.length > limit && <button type="button" className="btn" onClick={() => setLimit(current => current + PAGE)}>Show {Math.min(PAGE, reviewRows.length - limit)} more</button>}
            </section>

            {analysis.duplicates.length > 0 && (
              <section className="acc-mig-section">
                <div className="acc-mig-section-head"><h3>Duplicate parties</h3><span className="small">Merged parties share one balance and one ledger.</span></div>
                <ul className="acc-mig-dups">
                  {analysis.duplicates.slice(0, 200).map(group => {
                    const members = group.members.map(key => analysis.ledgers.find(ledger => ledger.key === key)).filter(Boolean);
                    const merged = !separate.has(group.id);
                    return (
                      <li key={group.id}>
                        <label className="acc-bk-check">
                          <input type="checkbox" checked={merged} onChange={() => setSeparate(current => {
                            const next = new Set(current);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          })} />
                          Merge into <strong>{members[0]?.name}</strong>
                        </label>
                        <span className="small">{members.map(ledger => [ledger.name, ledger.gstin, ledger.phone].filter(Boolean).join(" · ")).join("  |  ")}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {analysis.invalid.length > 0 && (
              <details className="acc-mig-section">
                <summary>{formatCount(analysis.invalid.length)} transactions will be left out</summary>
                <ul className="acc-mig-skipped">
                  {analysis.invalid.slice(0, 100).map(({ voucher, reason }, index) => (
                    <li key={`${voucher.source}-${voucher.sourceIndex}-${index}`}>{voucher.date ? shortDate(voucher.date) : "No date"} · {voucher.type || "Entry"} {voucher.number} · {reason}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="acc-bk-actions acc-mig-sticky">
              <button type="button" className="btn primary" disabled={!canAdmin || !plan?.totalSteps} onClick={startImport}>Import into FinTrack</button>
              <span className="small">{formatCount(plan?.newParties.length)} parties · {formatCount(plan?.newLedgers.length)} ledgers · {formatCount(plan?.vouchers.length)} transactions</span>
            </div>
          </div>
        )}

        {stage === "importing" && progress && (
          <div className="acc-mig-body">
            <p className="acc-setup-ask">Importing. Keep this window open; you can stop at any time and run the import again later without creating duplicates.</p>
            <div className="acc-mig-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.step}>
              <span style={{ width: `${progress.total ? Math.round((progress.step / progress.total) * 100) : 0}%` }} />
            </div>
            <p className="small">{formatCount(progress.step)} of {formatCount(progress.total)} · {progress.label}{progress.failed ? ` · ${formatCount(progress.failed)} need attention` : ""}</p>
            <div className="acc-bk-actions"><button type="button" className="btn" onClick={() => { stopRef.current = true; }}>Stop</button></div>
          </div>
        )}

        {stage === "done" && result && (
          <div className="acc-mig-body">
            <div className="acc-bk-reply">
              <p className="acc-bk-reply-lead">{result.stopped ? "Import stopped." : result.failed?.length ? "Import finished, with a few problems." : "Your books are in FinTrack."}</p>
              <ul className="acc-setup-summary">
                <li><CheckCircle2 size={15} aria-hidden="true" /><span><strong>{formatCount(result.done?.parties)}</strong> parties, <strong>{formatCount(result.done?.ledgers)}</strong> ledgers, <strong>{formatCount(result.done?.openings)}</strong> opening entries and <strong>{formatCount(result.done?.vouchers)}</strong> transactions added.</span></li>
              </ul>
              {result.failed?.length > 0 && (
                <ul className="acc-mig-skipped">
                  {result.failed.slice(0, 50).map((item, index) => <li key={`${item.label}-${index}`}><CircleAlert size={13} aria-hidden="true" /> {item.label}: {item.message}</li>)}
                  {result.failed.length > 50 && <li>…and {formatCount(result.failed.length - 50)} more.</li>}
                </ul>
              )}
              <div className="acc-bk-actions">
                <button type="button" className="btn primary" onClick={() => onClose?.()}>Done</button>
                {(result.stopped || result.failed?.length > 0) && <span className="small">Fix the problem and upload the same files again; finished entries are skipped.</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone = "" }) {
  return (
    <div className={`acc-mig-tile${tone ? ` is-${tone}` : ""}`}>
      <strong>{formatCount(value)}</strong>
      <span>{label}</span>
    </div>
  );
}
