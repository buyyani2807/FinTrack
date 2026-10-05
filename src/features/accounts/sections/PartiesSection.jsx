import { Fragment, useState } from "react";
import { ChevronDown, Mail, Phone } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { FilterSelect } from "../../../components/ui.jsx";
import { formatReceiptDate } from "../../receipts/model/receiptModel.js";
import { AccEmpty, AccPager } from "../components/AccUi.jsx";
import { GoodsLines, SettledGoods, linesForVoucher } from "../components/InvoiceTable.jsx";
import { VOUCHER_TYPES } from "../model/accountingModel.js";
import { OutstandingWhatsAppButton, PartyStatementButton } from "../components/SalesInvoiceActions.jsx";
import { money, partyTypeLabel } from "../accountsFormat.js";
import { PartyTypeBadge } from "../components/PartyFields.jsx";

const initialsOf = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || "").join("") || "?";

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
  vouchers = [],
  voucherItemLines = [],
}) {
  const [openKey, setOpenKey] = useState(null);
  const goodsFor = row => {
    const voucher = vouchers.find(item => item.id === row.voucherId);
    const settled = row.voucherType === "receipt" || row.voucherType === "payment" || row.voucherType === "credit_note" || row.voucherType === "debit_note";
    if (settled) {
      return <SettledGoods voucher={voucher} vouchers={vouchers} voucherItemLines={voucherItemLines} kind={row.voucherType === "payment" || row.voucherType === "debit_note" ? "payable" : "receivable"} />;
    }
    if (row.voucherType === "sales" || row.voucherType === "purchase") {
      return (
        <GoodsLines
          lines={linesForVoucher(voucherItemLines, row.voucherId)}
          narration={row.narration}
          empty={row.voucherType === "purchase" ? "This purchase was entered as an amount, with no item lines." : "This sale was entered as an amount, with no item lines."}
        />
      );
    }
    return <p className="small">{row.narration || "No item lines on this voucher."}</p>;
  };
  return (
    <div className="acc-panel acc-party-ledger">
      <div className="acc-party-ledger-toolbar">
        <p className="copy">Accounting customers and suppliers are independent of Daily Finance customers and Chit Fund members.</p>
        <div className="acc-party-ledger-links">
          {canWrite && <button type="button" className="btn primary" onClick={openParty}>+ Party</button>}
        </div>
      </div>
      {focusedParty ? <>
        <section className="card acc-party-ledger-identity">
          <Select
            bare
            className="acc-party-picker"
            aria-label="Party"
            value={focusedParty.id}
            onChange={event => setPartyFocusId(event.target.value)}
            renderValue={() => <>
              <span className="acc-party-avatar" aria-hidden="true">{initialsOf(focusedParty.name)}</span>
              <span className="acc-party-picker-text">
                <span className="acc-party-picker-kicker">Party ledger</span>
                <strong>{focusedParty.name}</strong>
                <span className="acc-party-card-meta">
                  <PartyTypeBadge type={focusedParty.partyType} />
                  <span className={`acc-status-pill ${focusedParty.isActive === false ? "inactive" : "active"}`}>{focusedParty.isActive === false ? "Inactive" : "Active"}</span>
                </span>
              </span>
              <ChevronDown className="acc-party-picker-chevron" size={18} aria-hidden="true" />
            </>}
          >
            {parties.map(party => <option key={party.id} value={party.id}>{party.name} · {partyTypeLabel(party.partyType)}{party.isActive === false ? " · inactive" : ""}</option>)}
          </Select>
          <div className="acc-party-ledger-side">
            {(focusedParty.phone || focusedParty.email) ? <ul className="acc-party-ledger-contact">
              {focusedParty.phone ? <li><Phone size={14} aria-hidden="true" />{focusedParty.phone}</li> : null}
              {focusedParty.email ? <li><Mail size={14} aria-hidden="true" />{focusedParty.email}</li> : null}
            </ul> : null}
            <div className="acc-party-ledger-actions">
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
          </div>
        </section>
        <section className="card acc-party-ledger-filters" aria-label="Ledger period and type">
          <div className="acc-party-ledger-range">
            <label className="accounts-filter-field"><span className="small">From</span>
              <input type="date" value={partyFrom} onChange={event => setPartyFrom(event.target.value)} />
            </label>
            <span className="acc-party-ledger-range-sep" aria-hidden="true">→</span>
            <label className="accounts-filter-field"><span className="small">To</span>
              <input type="date" value={partyTo} onChange={event => setPartyTo(event.target.value)} />
            </label>
          </div>
          <FilterSelect label="Type" value={partyTxnType} onChange={setPartyTxnType} allValue="">
            <option value="">All vouchers</option>
            {Object.values(VOUCHER_TYPES).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </FilterSelect>
        </section>
        <dl className="acc-party-ledger-stats">
          <div><dt>Opening</dt><dd>{money(partyBook.opening)}</dd></div>
          <div><dt>Invoices in period</dt><dd>{money(partyBook.rows.reduce((sum, row) => sum + Number(row.debit || 0), 0))}</dd></div>
          <div><dt>Payments in period</dt><dd>{money(partyBook.rows.reduce((sum, row) => sum + Number(row.credit || 0), 0))}</dd></div>
          <div className={`is-key ${partyBook.advance > 0 ? "is-ok" : partyBook.outstanding ? "is-due" : ""}`.trim()}><dt>{partyBook.advance > 0 ? "Advance" : "Outstanding"}</dt><dd>{money(partyBook.advance > 0 ? partyBook.advance : partyBook.outstanding)}</dd></div>
        </dl>
        <div className="table acc-table-wrap acc-party-ledger-table"><table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
          {pagedPartyBook.items.map((row, index) => {
            const key = `${row.voucherId || row.voucherNumber}-${index}`;
            const open = openKey === key;
            return (
              <Fragment key={key}>
                <tr>
                  <td className="acc-nowrap">{formatReceiptDate(row.date)}</td>
                  <td>
                    <button type="button" className="acc-invoice-ref-btn" aria-expanded={open} onClick={() => setOpenKey(current => current === key ? null : key)}>
                      {row.voucherNumber}
                    </button>
                  </td>
                  <td><span className="acc-voucher-chip">{VOUCHER_TYPES[row.voucherType]?.label || row.voucherType}</span></td>
                  <td className="acc-party-ledger-narration">{row.narration || "—"}</td>
                  <td className="acc-num">{row.debit ? money(row.debit) : ""}</td>
                  <td className="acc-num">{row.credit ? money(row.credit) : ""}</td>
                  <td className="acc-num acc-party-ledger-balance">{money(row.balance)}</td>
                </tr>
                {open ? <tr className="acc-goods-row"><td colSpan={7}>{goodsFor(row)}</td></tr> : null}
              </Fragment>
            );
          })}
          {!partyBook.rows.length && <tr><td colSpan="7">No transactions for this party in the selected dates.</td></tr>}
        </tbody></table></div>
        <AccPager page={pagedPartyBook.page} pages={pagedPartyBook.pages} total={pagedPartyBook.total} onPage={setListPage} noun="transactions" />
        <div className="acc-party-ledger-cards">
          {pagedPartyBook.items.map((row, index) => {
            const key = `${row.voucherId || row.voucherNumber}-${index}`;
            const open = openKey === key;
            return (
              <article key={key} className="card acc-party-ledger-card">
                <div className="acc-party-ledger-card-top">
                  <button type="button" className="acc-invoice-ref-btn" aria-expanded={open} onClick={() => setOpenKey(current => current === key ? null : key)}>
                    {row.voucherNumber}
                  </button>
                  <span className="acc-voucher-chip">{VOUCHER_TYPES[row.voucherType]?.label || row.voucherType}</span>
                </div>
                <p className="small">{formatReceiptDate(row.date)}{row.narration ? ` · ${row.narration}` : ""}</p>
                <p className="acc-party-ledger-card-amounts">
                  {row.debit ? <span>Debit <strong>{money(row.debit)}</strong></span> : null}
                  {row.credit ? <span>Credit <strong>{money(row.credit)}</strong></span> : null}
                  <span>Balance <strong>{money(row.balance)}</strong></span>
                </p>
                {open ? goodsFor(row) : null}
              </article>
            );
          })}
          {!partyBook.rows.length && <p className="copy">No transactions for this party in the selected dates.</p>}
        </div>
      </> : <AccEmpty title="No customers or suppliers yet" copy="Accounts parties are independent of Daily Finance customers and Chit Fund members." actionLabel={canWrite ? "+ Add party" : ""} onAction={canWrite ? openParty : undefined} />}
    </div>
  );
}
