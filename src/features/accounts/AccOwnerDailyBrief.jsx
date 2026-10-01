import { useMemo, useState } from "react";
import { formatInr } from "../../lib/formatMoney.js";
import { OutstandingWhatsAppButton } from "./SalesInvoiceActions.jsx";
import { ownerBriefShareText, reorderBySupplier } from "./ownerDailyBrief.js";

const money = formatInr;
const LIMIT = 5;

function Column({ title, total, empty, children, footer }) {
  return <article className="acc-brief-col">
    <header>
      <h4>{title}</h4>
      {total ? <strong>{total}</strong> : null}
    </header>
    {children || <p className="small muted">{empty}</p>}
    {footer}
  </article>;
}

/** Owner's morning card: who to collect from, what to pay, what to reorder and what to file. */
export function AccOwnerDailyBrief({
  brief,
  parties = [],
  companyName = "",
  settings = {},
  company = null,
  workspace = {},
  canWrite = false,
  saving = false,
  onOpenSection,
  onPay,
  onCreatePurchaseOrder,
  onMarkFiled,
  onLockPeriod,
}) {
  const [expanded, setExpanded] = useState(false);
  const partyById = useMemo(() => new Map(parties.map(party => [party.id, party])), [parties]);
  const supplierGroups = useMemo(() => reorderBySupplier(brief?.reorder || []), [brief]);
  if (!brief) return null;
  const show = list => (expanded ? list : list.slice(0, LIMIT));
  const more = list => list.length > LIMIT;
  const toOrder = brief.reorder.filter(row => !row.covered);
  const covered = brief.reorder.filter(row => row.covered);

  const share = () => {
    if (typeof window !== "undefined") window.open(`https://wa.me/?text=${encodeURIComponent(ownerBriefShareText(brief, { companyName }))}`, "_blank", "noopener,noreferrer");
  };

  return <section className="card acc-brief" aria-label="Today's brief">
    <header className="acc-brief-head">
      <div>
        <p className="acc-kicker">Daily brief · {new Date(`${brief.today}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</p>
        <h3>{brief.allClear ? "All clear today" : `${brief.actionCount} thing${brief.actionCount === 1 ? "" : "s"} to do today`}</h3>
      </div>
      <div className="acc-btn-group">
        {(more(brief.collect) || more(brief.pay) || more(toOrder)) && <button type="button" className="btn ghost" onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "Show all"}</button>}
        <button type="button" className="btn" onClick={share}>Share on WhatsApp</button>
      </div>
    </header>

    <div className="acc-brief-grid">
      <Column
        title="Collect"
        total={brief.totals.collect ? money(brief.totals.collect) : ""}
        empty="No customer payments overdue or due today."
        footer={brief.collect.length ? <button type="button" className="btn linkish" onClick={() => onOpenSection?.("receivables")}>All receivables →</button> : null}
      >
        {brief.collect.length ? <ul className="acc-brief-list">
          {show(brief.collect).map(row => <li key={row.partyId}>
            <div className="acc-brief-row-main">
              <strong>{row.partyName}</strong>
              <span className={`small ${row.overdue > 0 ? "red" : ""}`}>{row.overdue > 0 ? `${row.maxDaysOverdue}d late · ${row.invoices} bill${row.invoices === 1 ? "" : "s"}` : "Due today"}</span>
            </div>
            <span className="acc-num">{money(row.due)}</span>
            <OutstandingWhatsAppButton party={partyById.get(row.partyId)} outstanding={row.outstanding} kind="receivable" settings={settings} company={company} workspace={workspace} compact />
          </li>)}
        </ul> : null}
      </Column>

      <Column
        title="Pay"
        total={brief.totals.pay ? money(brief.totals.pay) : ""}
        empty="No supplier bills due in the next 7 days."
        footer={brief.pay.length ? <button type="button" className="btn linkish" onClick={() => onOpenSection?.("payables")}>All payables →</button> : null}
      >
        {brief.pay.length ? <ul className="acc-brief-list">
          {show(brief.pay).map(row => <li key={row.partyId}>
            <div className="acc-brief-row-main">
              <strong>{row.partyName}</strong>
              <span className={`small ${row.overdueFlag ? "red" : ""}`}>{row.overdueFlag ? `Overdue since ${row.earliestDue}` : row.earliestDue === brief.today ? "Due today" : `Due ${row.earliestDue}`}</span>
            </div>
            <span className="acc-num">{money(row.due)}</span>
            {canWrite && <button type="button" className="btn" disabled={saving} onClick={() => onPay?.(row)}>Pay</button>}
          </li>)}
        </ul> : null}
      </Column>

      <Column
        title="Reorder"
        total={toOrder.length ? `${toOrder.length} item${toOrder.length === 1 ? "" : "s"}` : ""}
        empty={covered.length ? "Low items are already on order." : "Stock is above reorder levels."}
        footer={<>
          {covered.length > 0 && <p className="small muted">{covered.length} low item{covered.length === 1 ? " is" : "s are"} covered by open purchase orders.</p>}
          {brief.reorder.length > 0 && <button type="button" className="btn linkish" onClick={() => onOpenSection?.("inventory")}>Inventory →</button>}
        </>}
      >
        {toOrder.length ? <>
          <ul className="acc-brief-list">
            {show(toOrder).map(row => <li key={row.itemId}>
              <div className="acc-brief-row-main">
                <strong>{row.itemName}</strong>
                <span className="small">Stock {row.stock} / level {row.reorderLevel}{row.onOrder ? ` · ${row.onOrder} on order` : ""}{row.supplierName ? ` · ${row.supplierName}` : ""}</span>
              </div>
              <span className="acc-num">{row.suggested} {row.unit}</span>
            </li>)}
          </ul>
          {canWrite && <div className="acc-brief-po">
            {supplierGroups.slice(0, 3).map(group => <button key={group.supplierId || "none"} type="button" className="btn primary" disabled={saving} onClick={() => onCreatePurchaseOrder?.(group)}>
              {group.supplierId ? `PO to ${group.supplierName || "supplier"}` : "Create PO"} · {group.rows.length} item{group.rows.length === 1 ? "" : "s"}
            </button>)}
          </div>}
        </> : null}
      </Column>

      <Column title="File" total="" empty="Nothing to file right now.">
        {brief.file.length ? <ul className="acc-brief-list">
          {brief.file.map(row => <li key={row.key} className={`tone-${row.status}`}>
            <div className="acc-brief-row-main">
              <strong>{row.title}</strong>
              <span className={`small ${row.status === "overdue" ? "red" : ""}`}>{row.detail}</span>
            </div>
            {row.kind === "gst" && <span className="acc-btn-group">
              <button type="button" className="btn" onClick={() => onOpenSection?.("gst")}>GST pack</button>
              {canWrite && !row.upcoming && <button type="button" className="btn ghost" disabled={saving} onClick={() => onMarkFiled?.(row.item)}>Mark filed</button>}
            </span>}
            {row.kind === "bank" && <button type="button" className="btn" onClick={() => onOpenSection?.("bank")}>Match</button>}
            {row.kind === "lock" && onLockPeriod && <button type="button" className="btn" disabled={saving} onClick={() => onLockPeriod(row.period)}>Lock</button>}
          </li>)}
        </ul> : null}
      </Column>
    </div>
  </section>;
}
