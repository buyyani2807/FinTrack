import { AccEmpty, AccPager } from "../components/AccUi.jsx";
import { VOUCHER_TYPES } from "../model/accountingModel.js";
import { OutstandingWhatsAppButton, PartyStatementButton } from "../components/SalesInvoiceActions.jsx";
import { money, partyTypeLabel } from "../accountsFormat.js";
import { PartyTypeBadge } from "../components/PartyFields.jsx";

export function PartiesSection({
  canWrite,
  openParty,
  focusedParty,
  setPartyFocusId,
  parties,
  partyFrom,
  setPartyFrom,
  partyTo,
  setPartyTo,
  partyTxnType,
  setPartyTxnType,
  partyBook,
  orgSettings,
  activeCompany,
  workspace,
  pagedPartyBook,
  setListPage,
}) {
  return (
    <div className="acc-panel acc-party-ledger">
      <div className="acc-party-ledger-toolbar">
        <p className="copy">Accounting customers and suppliers are independent of Daily Finance customers and Chit Fund members.</p>
        <div className="acc-party-ledger-links">
          {canWrite && <button type="button" className="btn primary" onClick={openParty}>+ Party</button>}
        </div>
      </div>
      <div className="card acc-party-ledger-filters">
        <label className="accounts-filter-field acc-party-ledger-party">
          <span className="small">Party</span>
          <select value={focusedParty?.id || ""} onChange={event => setPartyFocusId(event.target.value)}>
            <option value="">Select party</option>
            {parties.map(party => <option key={party.id} value={party.id}>{party.name} · {partyTypeLabel(party.partyType)}{party.isActive === false ? " · inactive" : ""}</option>)}
          </select>
        </label>
        <label className="accounts-filter-field"><span className="small">From</span>
          <input type="date" value={partyFrom} onChange={event => setPartyFrom(event.target.value)} />
        </label>
        <label className="accounts-filter-field"><span className="small">To</span>
          <input type="date" value={partyTo} onChange={event => setPartyTo(event.target.value)} />
        </label>
        <label className="accounts-filter-field"><span className="small">Type</span>
          <select value={partyTxnType} onChange={event => setPartyTxnType(event.target.value)}>
            <option value="">All</option>
            {Object.values(VOUCHER_TYPES).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
      </div>
      {focusedParty ? <>
        <div className="acc-party-ledger-identity">
          <div>
            <h2>{focusedParty.name}</h2>
            <div className="acc-party-card-meta">
              <PartyTypeBadge type={focusedParty.partyType} />
              <span className={`acc-status-pill ${focusedParty.isActive === false ? "inactive" : "active"}`}>{focusedParty.isActive === false ? "Inactive" : "Active"}</span>
            </div>
            {(focusedParty.phone || focusedParty.email) ? <p className="small acc-party-ledger-contact">{[focusedParty.phone, focusedParty.email].filter(Boolean).join(" · ")}</p> : null}
          </div>
          <div className="acc-party-ledger-stats">
            <article>
              <span>Opening</span>
              <strong>{money(partyBook.opening)}</strong>
            </article>
            <article>
              <span>Invoices (period)</span>
              <strong>{money(partyBook.rows.reduce((sum, row) => sum + Number(row.debit || 0), 0))}</strong>
            </article>
            <article>
              <span>Payments (period)</span>
              <strong>{money(partyBook.rows.reduce((sum, row) => sum + Number(row.credit || 0), 0))}</strong>
            </article>
            <article>
              <span>{partyBook.advance > 0 ? "Advance" : "Outstanding"}</span>
              <strong className={partyBook.advance > 0 ? "ok" : partyBook.outstanding ? "due" : ""}>{money(partyBook.advance > 0 ? partyBook.advance : partyBook.outstanding)}</strong>
            </article>
          </div>
        </div>
        <div className="accounts-action-row spacer">
          <PartyStatementButton
            party={focusedParty}
            partyBook={partyBook}
            periodFrom={partyFrom}
            periodTo={partyTo}
            settings={orgSettings}
            company={activeCompany}
            workspace={workspace}
            money={money}
          />
          <OutstandingWhatsAppButton
            party={focusedParty}
            outstanding={partyBook.advance > 0 ? 0 : partyBook.outstanding}
            kind={focusedParty.partyType === "supplier" ? "payable" : "receivable"}
            settings={orgSettings}
            company={activeCompany}
            workspace={workspace}
          />
        </div>
        <div className="table acc-table-wrap acc-party-ledger-table"><table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
          {pagedPartyBook.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}>
            <td>{row.date}</td>
            <td><strong>{row.voucherNumber}</strong></td>
            <td><span className="acc-voucher-chip">{VOUCHER_TYPES[row.voucherType]?.label || row.voucherType}</span></td>
            <td className="acc-party-ledger-narration">{row.narration || "—"}</td>
            <td className="acc-num">{row.debit ? money(row.debit) : ""}</td>
            <td className="acc-num">{row.credit ? money(row.credit) : ""}</td>
            <td className="acc-num acc-party-ledger-balance">{money(row.balance)}</td>
          </tr>)}
          {!partyBook.rows.length && <tr><td colSpan="7">No transactions for this party in the selected dates.</td></tr>}
        </tbody></table></div>
        <AccPager page={pagedPartyBook.page} pages={pagedPartyBook.pages} total={pagedPartyBook.total} onPage={setListPage} noun="transactions" />
        <div className="acc-party-ledger-cards">
          {pagedPartyBook.items.map((row, index) => (
            <article key={`${row.voucherNumber}-${index}`} className="card acc-party-ledger-card">
              <div className="acc-party-ledger-card-top">
                <strong>{row.voucherNumber}</strong>
                <span className="acc-voucher-chip">{VOUCHER_TYPES[row.voucherType]?.label || row.voucherType}</span>
              </div>
              <p className="small">{row.date}{row.narration ? ` · ${row.narration}` : ""}</p>
              <p className="acc-party-ledger-card-amounts">
                {row.debit ? <span>Debit <strong>{money(row.debit)}</strong></span> : null}
                {row.credit ? <span>Credit <strong>{money(row.credit)}</strong></span> : null}
                <span>Balance <strong>{money(row.balance)}</strong></span>
              </p>
            </article>
          ))}
          {!partyBook.rows.length && <p className="copy">No transactions for this party in the selected dates.</p>}
        </div>
      </> : <AccEmpty title="No customers or suppliers yet" copy="Accounts parties are independent of Daily Finance customers and Chit Fund members." actionLabel={canWrite ? "+ Add party" : ""} onAction={canWrite ? openParty : undefined} />}
    </div>
  );
}
