import { ArrowLeft, BookOpen, Mail, MapPin, Phone, Receipt } from "lucide-react";
import { CreditScoreCard } from "../../creditScore/CreditScoreCard.jsx";
import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { AccEmpty } from "../components/AccUi.jsx";
import { InvoiceTable } from "../components/InvoiceTable.jsx";
import { PartyTypeBadge } from "../components/PartyFields.jsx";
import { OutstandingWhatsAppButton, PartyStatementButton, VoucherNumberLink } from "../components/SalesInvoiceActions.jsx";
import { canOpenVoucherDocument } from "../model/salesInvoiceModel.js";
import { VOUCHER_TYPES } from "../model/accountingModel.js";
import { money, partyTypeLabel } from "../accountsFormat.js";

const initialsOf = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || "").join("") || "?";

const AGING_BUCKETS = [
  { id: "current", label: "Not yet due" },
  { id: "d1_30", label: "1–30 days" },
  { id: "d31_60", label: "31–60 days" },
  { id: "d61_90", label: "61–90 days" },
  { id: "d90", label: "90+ days" },
];

function HabitRow({ label, value, note }) {
  return <div className="acc-party-habit">
    <dt>{label}</dt>
    <dd><strong>{value}</strong>{note ? <span className="small">{note}</span> : null}</dd>
  </div>;
}

// What is open on one side of the party and how it gets paid: sales to them (with the credit score, owner only)
// or purchases from them.
function PartySide({ side, party, both, canAdmin, today, orgSettings, activeCompany, workspace, voucherItemLines, stockMovements, items, onViewDocument }) {
  const isPayable = side.kind === "payable";
  const showScore = !isPayable && canAdmin;
  const agingMax = Math.max(1, ...AGING_BUCKETS.map(bucket => side.aging[bucket.id] || 0));
  return (
    <section className="acc-party-side" aria-label={isPayable ? "Purchases from this party" : "Sales to this party"}>
      {both ? <div className="acc-party-side-head">
        <h3>{isPayable ? `Purchases from ${party.name}` : `Sales to ${party.name}`}</h3>
        <span className={`acc-party-side-total${side.overdue > 0 ? " is-due" : ""}`}>
          {side.advance > 0 ? `Advance ${money(side.advance)}` : `${isPayable ? "You owe" : "They owe you"} ${money(side.outstanding)}`}
          {side.overdue > 0 ? ` · ${money(side.overdue)} overdue` : ""}
        </span>
      </div> : null}

      <div className={`acc-party-profile-grid${showScore ? "" : " is-single"}`}>
        {showScore ? <CreditScoreCard invoices={side.creditInvoices} asOf={today} accountLabel="customer" /> : null}
        <section className="card acc-party-profile-card">
          <div className="acc-party-profile-part">
            <h3>{isPayable ? "How you pay them" : "How they pay you"}</h3>
            <dl className="acc-party-habits">
              <HabitRow
                label="Paid on time"
                value={side.onTimeRate === null ? "—" : `${side.onTimeRate}%`}
                note={side.paidCount ? `${side.paidCount - side.lateCount} of ${side.paidCount} paid invoices` : "No credit invoice paid yet"}
              />
              <HabitRow
                label="Average days to pay"
                value={side.avgDaysToPay === null ? "—" : `${side.avgDaysToPay} days`}
                note={side.avgDaysToPay === null ? "" : "From invoice date to full payment"}
              />
              <HabitRow
                label="Paid late"
                value={side.lateCount}
                note={side.lateCount ? `${side.avgDaysLate} days late on average` : ""}
              />
              <HabitRow
                label={isPayable ? "Total purchased" : "Total billed"}
                value={money(side.billed)}
                note={`${side.invoiceCount} invoice${side.invoiceCount === 1 ? "" : "s"}`}
              />
              <HabitRow
                label={isPayable ? "Last payment" : "Last receipt"}
                value={side.lastPayment ? money(side.lastPayment.amount) : "—"}
                note={side.lastPayment ? formatReceiptDate(side.lastPayment.date) : ""}
              />
            </dl>
          </div>
          <div className="acc-party-profile-part">
            <h3>Ageing of what is open</h3>
            <ul className="acc-party-aging">
              {AGING_BUCKETS.map(bucket => {
                const amount = side.aging[bucket.id] || 0;
                return <li key={bucket.id} className={`acc-party-aging-row is-${bucket.id}`}>
                  <span>{bucket.label}</span>
                  <span className="acc-party-aging-bar" aria-hidden="true"><i style={{ width: `${(amount / agingMax) * 100}%` }} /></span>
                  <strong>{money(amount)}</strong>
                </li>;
              })}
            </ul>
          </div>
        </section>
      </div>

      <section className="acc-party-profile-block">
        <h3>{isPayable ? "Open purchase bills" : "Open invoices"}</h3>
        {side.open.length
          ? <InvoiceTable rows={side.open} kind={side.kind} orgSettings={orgSettings} activeCompany={activeCompany} workspace={workspace} voucherItemLines={voucherItemLines} stockMovements={stockMovements} items={items} onViewDocument={onViewDocument} />
          : <p className="copy">Nothing open. Every {isPayable ? "purchase bill" : "invoice"} is settled.</p>}
      </section>

      <section className="acc-party-profile-block">
        <h3>{isPayable ? "Recent payments" : "Recent receipts"}</h3>
        {side.payments.length ? <ul className="acc-party-payments">
          {side.payments.map(row => <li key={`${row.voucherId}-${row.date}`}>
            <Receipt size={15} aria-hidden="true" />
            <span className="acc-party-payments-what">
              {onViewDocument && canOpenVoucherDocument(row.voucherType)
                ? <VoucherNumberLink number={row.voucherNumber} voucherType={row.voucherType} onView={() => onViewDocument(row)} />
                : <strong>{row.voucherNumber}</strong>}
              <span className="small">{formatReceiptDate(row.date)} · {VOUCHER_TYPES[row.voucherType]?.label || row.voucherType}</span>
            </span>
            <strong className="acc-num">{money(row.amount)}</strong>
          </li>)}
        </ul> : <p className="copy">No {isPayable ? "payment to this party" : "receipt from this party"} recorded yet.</p>}
      </section>
    </section>
  );
}

// One customer or supplier: who they are, what is open, and how they pay. A party you both sell to and buy from shows
// both sides with the net position.
export function PartyProfileSection({
  party,
  profile,
  loading,
  canWrite,
  canAdmin,
  today,
  openParty,
  onOpenLedger,
  onBack,
  orgSettings,
  activeCompany,
  workspace,
  voucherItemLines = [],
  stockMovements = [],
  items = [],
  onViewDocument,
}) {
  if (!party || !profile) {
    return <div className="acc-panel">
      {loading ? <AccEmpty title="Loading" copy="Reading this party's invoices and payments…" /> : <AccEmpty title="Party not found" copy="This customer or supplier is not in the open company's books." actionLabel="Back to Party Ledger" onAction={onBack} />}
    </div>;
  }
  const { primary, both } = profile;
  const isSupplier = profile.kind === "payable";
  const sideProps = { party, both, canAdmin, today, orgSettings, activeCompany, workspace, voucherItemLines, stockMovements, items, onViewDocument };

  return (
    <div className="acc-panel acc-party-profile">
      <button type="button" className="acc-party-profile-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />Party Ledger</button>
      <section className="card acc-party-ledger-identity">
        <div className="acc-party-profile-who">
          <span className="acc-party-avatar" aria-hidden="true">{initialsOf(party.name)}</span>
          <div className="acc-party-picker-text">
            <span className="acc-party-picker-kicker">{both ? "Customer and supplier" : partyTypeLabel(party.partyType)} profile</span>
            <h2>{party.name}</h2>
            <span className="acc-party-card-meta">
              <PartyTypeBadge type={party.partyType} />
              <span className={`acc-status-pill ${party.isActive === false ? "inactive" : "active"}`}>{party.isActive === false ? "Inactive" : "Active"}</span>
              {party.gstin ? <span className="acc-chip">GSTIN {party.gstin}</span> : null}
            </span>
          </div>
        </div>
        <div className="acc-party-ledger-side">
          {(party.phone || party.email || party.address) ? <ul className="acc-party-ledger-contact">
            {party.phone ? <li><Phone size={14} aria-hidden="true" />{party.phone}</li> : null}
            {party.email ? <li><Mail size={14} aria-hidden="true" />{party.email}</li> : null}
            {party.address ? <li><MapPin size={14} aria-hidden="true" />{party.address}</li> : null}
          </ul> : null}
          <div className="acc-party-ledger-actions">
            {canWrite ? <button type="button" className="btn" onClick={() => openParty(party)}>Edit</button> : null}
            <button type="button" className="btn" onClick={onOpenLedger}><BookOpen size={15} aria-hidden="true" />Ledger</button>
            <PartyStatementButton
              party={party}
              partyBook={primary.book}
              periodFrom={primary.book.rows[0]?.date || ""}
              periodTo={today}
              settings={orgSettings}
              company={activeCompany}
              workspace={workspace}
              money={money}
            />
            <OutstandingWhatsAppButton
              party={party}
              outstanding={primary.outstanding}
              kind={primary.kind}
              settings={orgSettings}
              company={activeCompany}
              workspace={workspace}
            />
          </div>
        </div>
      </section>

      {both ? <dl className="acc-party-ledger-stats">
        <div className={profile.receivable.overdue > 0 ? "is-due" : ""}>
          <dt>They owe you</dt>
          <dd>{money(profile.receivable.outstanding)}</dd>
          {profile.receivable.overdue > 0 ? <p className="small acc-party-profile-sub">{money(profile.receivable.overdue)} overdue</p> : null}
        </div>
        <div className={profile.payable.overdue > 0 ? "is-due" : ""}>
          <dt>You owe them</dt>
          <dd>{money(profile.payable.outstanding)}</dd>
          {profile.payable.overdue > 0 ? <p className="small acc-party-profile-sub">{money(profile.payable.overdue)} overdue</p> : null}
        </div>
        <div className={`is-key ${profile.net < 0 ? "is-owe" : ""}`.trim()}>
          <dt>{profile.net < 0 ? "Net, you owe them" : "Net, they owe you"}</dt>
          <dd>{money(Math.abs(profile.net))}</dd>
          <p className="small acc-party-profile-sub">After setting off both sides</p>
        </div>
        <div>
          <dt>Credit limit</dt>
          <dd>{profile.creditLimit > 0 ? money(profile.creditLimit) : "No limit"}</dd>
          {profile.limitUsed !== null ? <p className="small acc-party-profile-sub">{profile.limitUsed}% used</p> : null}
        </div>
      </dl> : <dl className="acc-party-ledger-stats">
        <div className={`is-key ${primary.advance > 0 ? "is-ok" : ""}`.trim()}>
          <dt>{primary.advance > 0 ? "Advance" : isSupplier ? "You owe" : "Outstanding"}</dt>
          <dd>{money(primary.advance > 0 ? primary.advance : primary.outstanding)}</dd>
        </div>
        <div className={primary.overdue > 0 ? "is-due" : ""}>
          <dt>Overdue</dt>
          <dd>{money(primary.overdue)}</dd>
        </div>
        <div>
          <dt>Credit limit</dt>
          <dd>{profile.creditLimit > 0 ? money(profile.creditLimit) : "No limit"}</dd>
          {profile.limitUsed !== null ? <p className="small acc-party-profile-sub">{profile.limitUsed}% used</p> : null}
        </div>
        <div>
          <dt>Credit days</dt>
          <dd>{profile.creditDays === null ? "7 (default)" : profile.creditDays}</dd>
        </div>
      </dl>}

      {profile.sides.map(side => <PartySide key={side.kind} side={side} {...sideProps} />)}
    </div>
  );
}
