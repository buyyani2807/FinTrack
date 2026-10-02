import { SegmentedControl } from "../../../../components/ui.jsx";
import { Select } from "../../../../components/Select.jsx";
import { AccEmpty, AccPager, AccSetupSection } from "../../components/AccUi.jsx";
import { money, PARTY_TYPE_FILTERS } from "../../accountsFormat.js";
import { PartyTypeBadge } from "../../components/PartyFields.jsx";

export function PartiesSetupPanel({
  importParties,
  openParty,
  parties,
  partySearch,
  setPartySearch,
  partyTypeFilter,
  setPartyTypeFilter,
  partyCountByType,
  setupParties,
  partyImportStatus,
  clearPartyFilters,
  pagedSetupParties,
  outstandingByParty,
  partyActions,
  setListPage,
}) {
  return (
    <AccSetupSection
      icon="P"
      title="Parties"
      copy="Customers, suppliers, employees, agents, and others used only by Accounts. They do not have to exist in Daily Finance, Monthly Finance, or Chit Fund."
      actions={<div className="acc-btn-group"><label className="btn">Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={importParties} /></label><button type="button" className="btn primary" onClick={() => openParty()}>+ Add Party</button></div>}
      collapsible
      summary={`${parties.length} ${parties.length === 1 ? "party" : "parties"}`}
    >
      <div className="acc-party-toolbar">
        <label className="accounts-filter-field acc-party-search">
          <span className="small">Search parties</span>
          <input value={partySearch} placeholder="Name, phone, or email" onChange={event => setPartySearch(event.target.value)} />
        </label>
        <label className="accounts-filter-field acc-party-type-select">
          <span className="small">Party type</span>
          <Select value={partyTypeFilter} onChange={event => setPartyTypeFilter(event.target.value)}>
            {PARTY_TYPE_FILTERS.map(item => <option key={item.id} value={item.id}>{item.label} ({partyCountByType[item.id] || 0})</option>)}
          </Select>
        </label>
        <SegmentedControl
          label="Party type"
          className="acc-party-chips"
          options={PARTY_TYPE_FILTERS.map(item => ({ id: item.id, label: <>{item.label} <span className="ft-segmented-count">{partyCountByType[item.id] || 0}</span></> }))}
          value={partyTypeFilter}
          onChange={setPartyTypeFilter}
        />
      </div>
      <p className="small acc-party-count">
        {partySearch || partyTypeFilter !== "all"
          ? `${setupParties.length} of ${parties.length} ${parties.length === 1 ? "party" : "parties"}`
          : `${parties.length} ${parties.length === 1 ? "party" : "parties"}`}
      </p>
      {partyImportStatus && <p className="small accounts-notice-ok" role="status">{partyImportStatus}</p>}
      {!parties.length ? (
        <AccEmpty title="No parties yet" copy="Add customers and suppliers to start managing your accounting relationships." actionLabel="+ Add Party" onAction={() => openParty()} />
      ) : !setupParties.length ? (
        <AccEmpty
          title={PARTY_TYPE_FILTERS.find(item => item.id === partyTypeFilter)?.emptyTitle || "No parties found"}
          copy={PARTY_TYPE_FILTERS.find(item => item.id === partyTypeFilter)?.emptyCopy || "Clear the filter to see all parties."}
          actionLabel="Clear filter"
          onAction={clearPartyFilters}
        />
      ) : <>
        <div className="table acc-table-wrap acc-party-table"><table><thead><tr><th>Party</th><th>Type</th><th>Contact</th><th className="acc-num">Outstanding</th><th>Status</th><th></th></tr></thead><tbody>
          {pagedSetupParties.items.map(party => {
            const outstanding = outstandingByParty.get(party.id);
            return <tr key={party.id}>
              <td>
                <strong>{party.name}</strong>
                {party.gstin ? <span className="small acc-party-meta">{party.gstin}</span> : null}
              </td>
              <td><PartyTypeBadge type={party.partyType} /></td>
              <td>
                <span className="acc-party-contact">{party.phone || "—"}</span>
                {party.email ? <span className="small acc-party-meta">{party.email}</span> : null}
              </td>
              <td className="acc-num">{outstanding?.balance ? money(outstanding.balance) : "—"}</td>
              <td><span className={`acc-status-pill ${party.isActive === false ? "inactive" : "active"}`}>{party.isActive === false ? "Inactive" : "Active"}</span></td>
              <td>{partyActions(party)}</td>
            </tr>;
          })}
        </tbody></table></div>
        <div className="acc-party-cards">
          {pagedSetupParties.items.map(party => {
            const outstanding = outstandingByParty.get(party.id);
            return <article key={party.id} className="card acc-party-card">
              <div className="acc-party-card-top">
                <div>
                  <strong>{party.name}</strong>
                  <div className="acc-party-card-meta">
                    <PartyTypeBadge type={party.partyType} />
                    <span className={`acc-status-pill ${party.isActive === false ? "inactive" : "active"}`}>{party.isActive === false ? "Inactive" : "Active"}</span>
                  </div>
                </div>
              </div>
              <p className="small">{party.phone || party.email || "No contact"}{party.phone && party.email ? ` · ${party.email}` : ""}</p>
              <p className="acc-party-outstanding">Outstanding: <strong>{outstanding?.balance ? money(outstanding.balance) : "—"}</strong></p>
              {partyActions(party)}
            </article>;
          })}
        </div>
        <AccPager page={pagedSetupParties.page} pages={pagedSetupParties.pages} total={pagedSetupParties.total} onPage={setListPage} noun="parties" />
      </>}
    </AccSetupSection>
  );
}
