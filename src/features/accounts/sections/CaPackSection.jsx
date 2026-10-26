import { useEffect, useMemo, useState } from "react";
import { FilterSelect } from "../../../components/ui.jsx";
import { money } from "../accountsFormat.js";
import { AccPager } from "../components/AccUi.jsx";
import { buildCaPack } from "../model/caPack.js";
import { usePagedList } from "../model/usePagedList.js";
import { AI_AUDIT_MIGRATION_MESSAGE, loadAiReviewActions, recordAiReviewAction } from "../../intelligence/ai/aiReviewRepository.js";
import { shiftMonthKey } from "../../intelligence/ai/aiCommon.js";
import { todayIso } from "../../../lib/dates.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = key => {
  const [year, month] = String(key || "").split("-");
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : key;
};

function Pile({ title, note, rows, noun, onOpen, onReview, canWrite, busy }) {
  const paging = usePagedList(rows, rows.map(row => `${row.key}:${row.reviewed}`).join("|"));
  return <section className="acc-panel ca-pack-pile" aria-label={title}>
    <h3 className="ca-pack-h">{title}{rows.length ? <span className="ca-pack-count">{rows.length}</span> : null}</h3>
    {!rows.length && <p className="ca-pack-empty">{note}</p>}
    {rows.length > 0 && <>
      <div className="table acc-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{noun}</th>
              <th>What to check</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {paging.items.map(row => <tr key={row.key}>
              <td data-label={noun}>
                <strong>{row.kind === "bank" ? row.date : row.record || row.title}</strong>
                {row.kind === "bank" && row.detail ? <span className="ca-pack-sub">{row.detail}</span> : null}
                {row.kind !== "bank" && row.record ? <span className="ca-pack-sub">{row.title}</span> : null}
              </td>
              <td data-label="What to check">{row.kind === "bank" ? `${row.title} · ${row.direction} ${money(row.amount)}` : row.detail}</td>
              <td data-label="Status">{row.reviewed ? "Reviewed" : "Open"}</td>
              <td className="ca-pack-actions" data-label="">
                <button type="button" className="btn" onClick={() => onOpen(row)}>Open</button>
                {!row.reviewed && canWrite ? <button type="button" className="btn" disabled={busy} onClick={() => onReview(row)}>Mark reviewed</button> : null}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <AccPager page={paging.page} pages={paging.pages} total={paging.total} from={paging.from} to={paging.to} onPage={paging.setPage} noun={noun === "Item" ? "items" : "rows"} />
    </>}
  </section>;
}

export function CaPackSection({
  token,
  company,
  accounts,
  vouchers,
  parties,
  items,
  stockMovements,
  voucherItemLines,
  costLines,
  statements,
  locks,
  canWrite,
  aiEnabled,
  onOpenVoucher,
  onOpenSection,
  onOpenItem,
}) {
  const asOf = todayIso();
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => shiftMonthKey(asOf.slice(0, 7), -index)), [asOf]);
  const [month, setMonth] = useState(() => months[0]);
  const [decisionRows, setDecisionRows] = useState([]);
  const [auditAvailable, setAuditAvailable] = useState(true);
  const [auditError, setAuditError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const companyId = company?.id || "";
  const canMark = Boolean(canWrite && aiEnabled && auditAvailable);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    // Stored on the month-end audit feature. The allowlist already accepts it, and these keys
    // do not match a month-end checklist row, so marking a line reviewed does not close a check.
    loadAiReviewActions(token, { module: "accounts", feature: "month_end" })
      .then(rows => {
        if (cancelled) return;
        setAuditAvailable(rows !== null);
        setDecisionRows(rows || []);
      })
      .catch(err => { if (!cancelled) setAuditError(err.message || "Could not load review marks."); });
    return () => { cancelled = true; };
  }, [token, companyId]);

  const reviewedKeys = useMemo(() => new Set(
    decisionRows.filter(row => row.feature === "month_end" && row.action === "reviewed").map(row => row.insightKey),
  ), [decisionRows]);
  const pack = useMemo(() => buildCaPack({
    company, month, asOf, accounts, vouchers, parties, items, stockMovements, voucherItemLines, costLines, statements, locks, reviewedKeys,
  }), [company, month, asOf, accounts, vouchers, parties, items, stockMovements, voucherItemLines, costLines, statements, locks, reviewedKeys]);

  const markReviewed = async row => {
    if (!canWrite || busy || !auditAvailable) return;
    setBusy(true);
    try {
      const result = await recordAiReviewAction(token, {
        module: "accounts",
        feature: "month_end",
        insightKey: row.key,
        action: "reviewed",
        sourceType: row.kind,
        sourceId: row.voucherId || row.itemId || row.lineId || null,
      });
      setDecisionRows(rows => [...rows, {
        id: result?.id || row.key,
        feature: "month_end",
        insightKey: row.key,
        action: "reviewed",
        createdAt: new Date().toISOString(),
      }]);
      setAuditError("");
    } catch (err) {
      if (err.message === AI_AUDIT_MIGRATION_MESSAGE) setAuditAvailable(false);
      setAuditError(err.message || "Could not save the review mark.");
    } finally {
      setBusy(false);
    }
  };

  const openRow = row => {
    if (row.kind === "stock") {
      onOpenItem?.(row.itemId, pack.period.from, pack.period.to);
      return;
    }
    if (row.voucherId) {
      onOpenVoucher?.(row.voucherId);
      return;
    }
    if (row.source?.section) onOpenSection?.(row.source.section);
  };

  const printPack = () => {
    document.body.classList.add("ca-brief-print");
    const done = () => document.body.classList.remove("ca-brief-print");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  };

  const copyPack = async () => {
    try {
      await navigator.clipboard.writeText(pack.text);
      setCopied(true);
      setCopyError("");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Could not copy. Use Print and save it as a PDF.");
    }
  };

  const books = pack.books;
  return <div className="ca-pack">
    <header className="ca-pack-head">
      <div>
        <p className="ca-pack-kicker">For the CA</p>
        <h2 className="ca-pack-title">{pack.companyName}</h2>
        <p className="ca-pack-sub">{pack.gstin ? `GSTIN ${pack.gstin} · ` : ""}{pack.monthTitle} · Prepared {pack.preparedOn}</p>
        <p className="ca-pack-sub">{pack.locked ? "This month is locked." : "This month is open. Locking it is a separate step."}</p>
      </div>
      <div className="ca-pack-actions">
        <FilterSelect label="Month" value={month} allValue={month} onChange={setMonth}>
          {months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}
        </FilterSelect>
        <button type="button" className="btn primary" onClick={printPack}>Print</button>
        <button type="button" className="btn" onClick={copyPack}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </header>
    <p className="ca-pack-note">{pack.disclaimer}{canMark ? " Marking a row reviewed records that you saw it. The row stays, and nothing is posted." : ""}</p>
    {!auditAvailable && <div className="notice">{AI_AUDIT_MIGRATION_MESSAGE} The pack still opens. Review marks are not saved until then.</div>}
    {auditError && auditAvailable && <div className="notice">{auditError}</div>}
    {copyError ? <p className="ca-pack-sub">{copyError}</p> : null}

    <section className="acc-panel" aria-label="Books">
      <h3 className="ca-pack-h">Books</h3>
      <div className="ca-pack-books">
        <article className="card"><span>Trial balance</span><strong className={books.balanced ? "" : "ca-pack-loss"}>{books.balanced ? "Agrees" : `Differs by ${money(books.difference)}`}</strong></article>
        <article className="card"><span>Income</span><strong>{money(books.income)}</strong></article>
        <article className="card"><span>Expenses</span><strong>{money(books.expenses)}</strong></article>
        <article className="card"><span>Opening stock</span><strong>{money(books.openingStock)}</strong></article>
        <article className="card"><span>Closing stock</span><strong>{money(books.closingStock)}</strong></article>
        <article className="card"><span>{books.resultLabel}</span><strong className={books.loss ? "ca-pack-loss" : ""}>{money(books.resultAmount)}</strong></article>
      </div>
    </section>

    <Pile title="Invoices a GST check would reject" note={pack.gstNote} rows={pack.gst} noun="Invoice" onOpen={openRow} onReview={markReviewed} canWrite={canMark} busy={busy} />
    <Pile title="Bank lines still unmatched" note={pack.bankNote} rows={pack.bank} noun="Line" onOpen={openRow} onReview={markReviewed} canWrite={canMark} busy={busy} />
    <Pile title="Stock rows that need review" note={pack.stockNote} rows={pack.stock} noun="Item" onOpen={openRow} onReview={markReviewed} canWrite={canMark} busy={busy} />
  </div>;
}
