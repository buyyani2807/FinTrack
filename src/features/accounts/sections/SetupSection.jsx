import {
  loadAccountsRoles,
  lockAccountingPeriod,
  reopenAccountingPeriod,
  saveAccountingSettings,
  saveGstSettings,
  setAccountingIntegration,
  setAccountsUserRole,
  syncAccountingOperations,
  inviteTeamMember,
  listTeamInvites,
  revokeTeamInvite,
  loadRecurringTemplates,
  upsertRecurringTemplate,
  deleteRecurringTemplate,
} from "../accountingRepository.js";
import { Field, AccEmpty, AccPager, AccSetupSection } from "../components/AccUi.jsx";
import { MONEY_MODES, ledgerHasPostedLines } from "../accountingModel.js";
import { formatIstDateTime, todayIso } from "../cashbookModel.js";
import { INDIA_STATES, gstStateFromGstin, validateGstSettings } from "../accountingGst.js";
import { emptyRecurringDraft, RECURRING_KINDS, RECURRING_FREQUENCIES } from "../accountsFormDefaults.js";
import { money, gstStatusLabel, PARTY_TYPE_FILTERS } from "../accountsFormat.js";
import { PartyTypeBadge } from "../components/PartyFields.jsx";
import { SubscriptionMonitoringPanel } from "../components/AccSetupWidgets.jsx";

export function SetupSection({
  activeCompany,
  setupForm,
  setSetupForm,
  canAdmin,
  saving,
  setError,
  run,
  token,
  downloadCompanyBackup,
  previewCompanyRestore,
  restoreDraft,
  restoreBusy,
  confirmCompanyRestore,
  setRestoreDraft,
  companies,
  activeCompanyId,
  switchCompany,
  archiveCompany,
  setCompanyDraft,
  setShowCreateCompany,
  gstForm,
  setGstForm,
  settings,
  openCoa,
  visibleAccounts,
  vouchers,
  removeCoa,
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
  orgSettings,
  openSection,
  lockForm,
  setLockForm,
  locks,
  askReason,
  accountsRoles,
  teamInvites,
  inviteDraft,
  setInviteDraft,
  setTeamInvites,
  setAccountsRoles,
  setInviteEmailDraft,
  setNotice,
  inviteEmailDraft,
  roleDraft,
  setRoleDraft,
  canWrite,
  recurringTemplates,
  recurringDraft,
  setRecurringDraft,
  setRecurringTemplates,
  openSimpleFromRecurring,
  audit,
  pagedAudit,
}) {
  return (
    <div className="acc-panel acc-setup">
      <p className="copy acc-setup-lead">Books, chart, parties, GST, and locks for {activeCompany?.name || "this Accounts company"} only. Daily Finance, Monthly Finance, and Chit Fund stay on the Finance workspace.</p>
      <AccSetupSection icon="FY" title="Company / financial year" copy="Indian financial year is 1 April to 31 March. Saving the name here updates the current Accounts company, not Finance.">
        <div className="form">
          <Field label="Business name"><input value={setupForm.companyName} onChange={event => setSetupForm(current => ({ ...current, companyName: event.target.value }))} /></Field>
          <Field label="Books start date"><input type="date" value={setupForm.booksStartedOn} onChange={event => setSetupForm(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
        </div>
        <div className="acc-form-actions">
          <button type="button" className="btn primary" disabled={!canAdmin || saving} onClick={() => {
            if (!canAdmin) {
              setError("Only the business owner can change company settings.");
              return;
            }
            run(() => saveAccountingSettings(token, { ...setupForm, fyStartMonth: 4 }), "Company details saved.");
          }}>{saving ? "Saving…" : "Save company"}</button>
          <button type="button" className="btn" onClick={downloadCompanyBackup}>Download company backup</button>
          {canAdmin && <label className="btn">
            Choose restore file
            <input type="file" accept="application/json,.json" hidden onChange={previewCompanyRestore} />
          </label>}
          {canAdmin && restoreDraft && (
            <button type="button" className="btn primary" disabled={saving || restoreBusy} onClick={confirmCompanyRestore}>
              {restoreBusy ? "Restoring…" : `Confirm restore into ${activeCompany?.name || "this company"}`}
            </button>
          )}
          {canAdmin && restoreDraft && (
            <button type="button" className="btn" disabled={restoreBusy} onClick={() => setRestoreDraft(null)}>Cancel restore</button>
          )}
        </div>
        {!canAdmin && <p className="small">Only the business owner can change company name / books start settings.</p>}
        <p className="small">Backups are company-isolated. Restore only works into the same company when it has no vouchers yet. Cross-company overwrite is blocked.</p>
        <div className="acc-company-setup-list">
          <p className="small">Each company has its own books. Switching never mixes vouchers.</p>
          {companies.map(company => (
            <div
              key={company.id}
              className={`acc-company-setup-item${company.id === activeCompanyId ? " current" : ""}${company.status === "archived" ? " archived" : ""}`}
            >
              <button
                type="button"
                className="acc-company-setup-pick"
                disabled={company.status === "archived"}
                onClick={() => company.id !== activeCompanyId && company.status !== "archived" && switchCompany(company.id)}
              >
                <strong>{company.name}</strong>
                <span className="small">
                  {company.isPrimary ? "Primary" : "Company"}
                  {company.status === "archived" ? " · archived" : ""}
                  {company.id === activeCompanyId ? " · current" : ""}
                  {` · ${gstStatusLabel(company)}`}
                </span>
              </button>
              {canAdmin && company.status !== "archived" && !company.isPrimary && (
                <button type="button" className="btn" disabled={saving} onClick={() => archiveCompany(company)}>Archive</button>
              )}
            </div>
          ))}
          {canAdmin && <button type="button" className="btn" onClick={() => { setCompanyDraft({ name: "", booksStartedOn: todayIso(), industry: "retail" }); setShowCreateCompany(true); }}>+ Create company</button>}
          {!canAdmin && <p className="small">Only the owner can create or archive Accounts companies.</p>}
        </div>
      </AccSetupSection>
      <AccSetupSection icon="GST" title={`GST${activeCompany?.name ? ` · ${activeCompany.name}` : ""}`} copy="GST is per company. These settings never apply to another Accounts company or to Daily / Monthly Finance. Books reports only — not GST portal filing. Owner manages GST registration.">
        {!canAdmin && <p className="small">View GST details below. Only the owner can change GST registration settings.</p>}
        <div className="form">
          <Field label="Registration">
            <select value={gstForm.gstRegistration} disabled={!canAdmin} onChange={event => setGstForm(current => ({ ...current, gstRegistration: event.target.value }))}>
              <option value="unregistered">Unregistered</option>
              <option value="regular">Regular</option>
              <option value="composition">Composition</option>
            </select>
          </Field>
          <Field label="GSTIN"><input value={gstForm.gstin} disabled={!canAdmin} placeholder="e.g. 36AAAAA0000A1Z3" onChange={event => setGstForm(current => ({ ...current, gstin: event.target.value, stateCode: gstStateFromGstin(event.target.value) || current.stateCode }))} /></Field>
          <Field label="Legal name"><input value={gstForm.legalName} disabled={!canAdmin} onChange={event => setGstForm(current => ({ ...current, legalName: event.target.value }))} /></Field>
          <Field label="State">
            <select value={gstForm.stateCode} disabled={!canAdmin} onChange={event => setGstForm(current => ({ ...current, stateCode: event.target.value }))}>
              <option value="">Select state</option>
              {INDIA_STATES.map(state => <option key={state.code} value={state.code}>{state.code} · {state.name}</option>)}
            </select>
          </Field>
        </div>
        {canAdmin && (
          <div className="acc-form-actions">
            <button type="button" className="btn primary" disabled={saving} onClick={() => {
              const message = validateGstSettings(gstForm);
              if (message) { setError(message); return; }
              run(() => saveGstSettings(token, { ...gstForm, stateName: INDIA_STATES.find(state => state.code === gstForm.stateCode)?.name || "" }), "GST settings saved.");
            }}>{saving ? "Saving…" : "Save GST"}</button>
          </div>
        )}
      </AccSetupSection>
      <AccSetupSection
        icon="#"
        title="Chart of accounts"
        copy={`Opening debit and credit sides across the chart should balance. System accounts can be renamed and given openings, but not deleted.${settings?.integrationEnabled ? "" : " Daily Finance, Monthly Finance, and Chit Fund ledgers stay hidden while integration is off."}`}
        actions={<button type="button" className="btn" onClick={() => openCoa(null)}>+ Account</button>}
        collapsible
        summary={`${visibleAccounts.length} ${visibleAccounts.length === 1 ? "account" : "accounts"}`}
      >
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th>Group</th><th>Opening</th><th></th></tr></thead><tbody>
          {visibleAccounts.map(account => {
            const used = ledgerHasPostedLines(account, vouchers);
            return <tr key={account.id}>
              <td>{account.code}</td>
              <td style={account.parentId ? { paddingLeft: 22 } : undefined}>{account.parentId ? "↳ " : ""}{account.name}{account.isSystem ? " · system" : ""}</td>
              <td>{account.groupType}</td>
              <td>{account.openingBalance ? `${money(account.openingBalance)} ${account.openingSide}` : "—"}</td>
              <td>
                <button type="button" className="btn" disabled={saving} onClick={() => openCoa(account)}>Edit</button>
                <button type="button" className="btn danger" disabled={saving || account.isSystem || used} onClick={() => removeCoa(account)}>{account.isSystem ? "System" : used ? "In use" : "Delete"}</button>
              </td>
            </tr>;
          })}
        </tbody></table></div>
      </AccSetupSection>
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
            <select value={partyTypeFilter} onChange={event => setPartyTypeFilter(event.target.value)}>
              {PARTY_TYPE_FILTERS.map(item => <option key={item.id} value={item.id}>{item.label} ({partyCountByType[item.id] || 0})</option>)}
            </select>
          </label>
          <div className="acc-party-chips" role="group" aria-label="Party type">
            {PARTY_TYPE_FILTERS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`acc-filter-chip ${partyTypeFilter === item.id ? "active" : ""}`}
                onClick={() => setPartyTypeFilter(item.id)}
              >
                {item.label} <span>{partyCountByType[item.id] || 0}</span>
              </button>
            ))}
          </div>
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
      <AccSetupSection icon="✓" title="Production readiness" copy="A practical checklist for running FinTrack safely in production." collapsible summary="Operational safeguards">
        <div className="production-readiness-grid">
          <div className="card"><strong>Backups</strong><p className="small">Download a company backup after each important month-end and store it outside the browser.</p><button type="button" className="btn" onClick={downloadCompanyBackup}>Download backup now</button></div>
          <div className="card"><strong>Restore drill</strong><p className="small">Test restore in a separate empty company before relying on a backup. Existing restore safeguards prevent overwriting posted books.</p><span className="acc-chip ok">Protected workflow</span></div>
          <div className="card"><strong>Period control</strong><p className="small">Lock completed periods so posted vouchers cannot be changed accidentally.</p><button type="button" className="btn" onClick={() => document.getElementById("accounts-period-lock")?.scrollIntoView({ behavior: "smooth" })}>Open period locks</button></div>
          <div className="card"><strong>Scale safely</strong><p className="small">Use date filters, company separation, and regular exports as transaction volume grows.</p><span className="acc-chip">Company isolated</span></div>
        </div>
      </AccSetupSection>
      <SubscriptionMonitoringPanel orgSettings={orgSettings} companyId={activeCompanyId} />
      <AccSetupSection
        icon="↔"
        title="Accounting integration"
        copy="Cashbook is always available from Finance. This switch only copies eligible Daily, Monthly, Chit, and Cashbook rows into the primary Accounts company. Keep it off if Accounts books belong to a different business. The same payment is never posted twice."
        actions={<span className={`acc-chip ${settings?.integrationEnabled ? "ok" : ""}`}>Status: {settings?.integrationEnabled ? "ON" : "OFF"}</span>}
      >
        <div className="accounts-action-row">
          <button type="button" className="btn" disabled={saving} onClick={() => run(() => setAccountingIntegration(token, !settings?.integrationEnabled), `Integration ${settings?.integrationEnabled ? "disabled" : "enabled"}.`)}>{settings?.integrationEnabled ? "Turn integration off" : "Turn integration on"}</button>
          {settings?.integrationEnabled && <button type="button" className="btn" disabled={saving} onClick={() => run(() => syncAccountingOperations(token), "Linked vouchers synced from operations.")}>Sync linked vouchers</button>}
        </div>
      </AccSetupSection>
      <AccSetupSection
        icon="I"
        title="Items & inventory"
        copy="Items, stock value, physical count, ageing, CSV import and stock rules now live in the Inventory section."
      >
        <button type="button" className="btn primary" onClick={() => openSection("inventory")}>Open Inventory</button>
      </AccSetupSection>
      <div id="accounts-period-lock"><AccSetupSection icon="L" title="Period locking" copy="Lock a closed period so posted vouchers in that range cannot be changed. Owner only.">
        {!canAdmin && <p className="small">Only the business owner can lock or reopen periods.</p>}
        {canAdmin && <>
        <div className="form">
          <Field label="From"><input type="date" value={lockForm.from} onChange={event => setLockForm(current => ({ ...current, from: event.target.value }))} /></Field>
          <Field label="To"><input type="date" value={lockForm.to} onChange={event => setLockForm(current => ({ ...current, to: event.target.value }))} /></Field>
        </div>
        <div className="acc-form-actions">
          <button type="button" className="btn primary" disabled={saving} onClick={event => {
            event.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
            run(() => lockAccountingPeriod(token, lockForm.from, lockForm.to), "Period locked.");
          }}>{saving ? "Saving…" : "Lock period"}</button>
        </div>
        <div className="table acc-table-wrap"><table><thead><tr><th>Period</th><th>Status</th><th></th></tr></thead><tbody>
          {locks.map(lock => <tr key={lock.id}><td>{lock.periodFrom} to {lock.periodTo}</td><td>{lock.isLocked ? "Locked" : "Reopened"}</td>              <td>{lock.isLocked && <button type="button" className="btn" disabled={saving} onClick={() => askReason("Reopen period", "Reopen", reason => run(() => reopenAccountingPeriod(token, lock.id, reason), "Period reopened."))}>Reopen</button>}</td></tr>)}
        </tbody></table></div>
        </>}
        {!canAdmin && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Period</th><th>Status</th></tr></thead><tbody>
          {locks.map(lock => <tr key={lock.id}><td>{lock.periodFrom} to {lock.periodTo}</td><td>{lock.isLocked ? "Locked" : "Reopened"}</td></tr>)}
          {!locks.length && <tr><td colSpan="2">No period locks yet.</td></tr>}
        </tbody></table></div>}
      </AccSetupSection></div>
      {canAdmin && <AccSetupSection
        icon="R"
        title="Accounts access roles"
        copy="Invite your CA by email (viewer recommended), or paste a user UUID. Requires migrations 070–076."
        collapsible
        summary={`${accountsRoles.length} assigned · ${teamInvites.filter(row => row.status === "pending").length} pending`}
      >
        <div className="accounts-collab-guide">
          <div><strong>Recommended collaboration setup</strong><p className="small">Give your accountant <b>Accountant</b> access to post and reconcile. Give an external reviewer <b>Viewer</b> access. The owner remains the only user who can manage roles, lock periods, or change company settings.</p></div>
          <span className="acc-chip ok">Owner controlled</span>
        </div>
        <h4 className="acc-subsection-title">Invite by email</h4>
        <div className="form">
          <Field label="Email"><input type="email" value={inviteDraft.email} onChange={event => setInviteDraft(current => ({ ...current, email: event.target.value }))} placeholder="ca@example.com" /></Field>
          <Field label="Role">
            <select value={inviteDraft.role} onChange={event => setInviteDraft(current => ({ ...current, role: event.target.value }))}>
              <option value="viewer">Viewer (read only)</option>
              <option value="accountant">Accountant (can post)</option>
            </select>
          </Field>
          <Field label="Note (optional)"><input value={inviteDraft.note} onChange={event => setInviteDraft(current => ({ ...current, note: event.target.value }))} placeholder="e.g. FY 2026-27 review" /></Field>
        </div>
        <div className="acc-form-actions">
          <button type="button" className="btn primary" disabled={saving || !inviteDraft.email.trim()} onClick={() => run(async () => {
            const result = await inviteTeamMember(token, inviteDraft);
            setInviteDraft({ email: "", role: "viewer", note: "" });
            setTeamInvites(await listTeamInvites(token));
            setAccountsRoles(await loadAccountsRoles(token));
            if (result?.status === "pending") setInviteEmailDraft({ email: result.email, role: result.role, expiresAt: result.expiresAt });
            if (result?.status === "assigned") {
              setNotice(`Assigned ${result.role} to ${result.email}.`);
            }
          }, inviteDraft.email ? `Invite processed for ${inviteDraft.email.trim()}.` : "Invite saved.")}>{saving ? "Saving…" : "Send invite"}</button>
        </div>
        {inviteEmailDraft && <div className="notice accounts-invite-email" role="status"><strong>Invite recorded for {inviteEmailDraft.email}</strong><p className="small">The current backend does not send email automatically. Use your email client to send the instructions below; after the user signs up with this email, the invite is claimed automatically.</p><button type="button" className="btn" onClick={() => { const subject = encodeURIComponent(`FinTrack Accounts access · ${inviteEmailDraft.role}`); const body = encodeURIComponent(`You have been invited to FinTrack Accounts as ${inviteEmailDraft.role}. Sign up or sign in using this email address. Your Accounts access will be activated automatically after sign-in.`); window.location.href = `mailto:${inviteEmailDraft.email}?subject=${subject}&body=${body}`; }}>Open email draft</button><button type="button" className="btn" onClick={() => setInviteEmailDraft(null)}>Dismiss</button></div>}
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
          {teamInvites.map(row => (
            <tr key={row.id}>
              <td>{row.email}</td>
              <td>{row.role}</td>
              <td>{row.status}</td>
              <td>{row.status === "pending" ? <button type="button" className="btn" disabled={saving} onClick={() => run(async () => {
                await revokeTeamInvite(token, row.id);
                setTeamInvites(await listTeamInvites(token));
              }, "Invite revoked.")}>Revoke</button> : null}</td>
            </tr>
          ))}
          {!teamInvites.length && <tr><td colSpan="4">No email invites yet.</td></tr>}
        </tbody></table></div>
        <h4 className="acc-subsection-title">Assign by user ID</h4>
        <div className="form">
          <Field label="User ID (auth UUID)"><input value={roleDraft.userId} onChange={event => setRoleDraft(current => ({ ...current, userId: event.target.value.trim() }))} placeholder="Paste Supabase auth user UUID" /></Field>
          <Field label="Role">
            <select value={roleDraft.role} onChange={event => setRoleDraft(current => ({ ...current, role: event.target.value }))}>
              <option value="accountant">Accountant (read + write)</option>
              <option value="viewer">Viewer (read only)</option>
            </select>
          </Field>
        </div>
        <div className="acc-form-actions">
          <button type="button" className="btn primary" disabled={saving || !roleDraft.userId} onClick={() => run(async () => {
            await setAccountsUserRole(token, roleDraft.userId, roleDraft.role);
            setRoleDraft({ userId: "", role: "accountant" });
            setAccountsRoles(await loadAccountsRoles(token));
          }, "Accounts role saved.")}>{saving ? "Saving…" : "Assign role"}</button>
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>User ID</th><th>Role</th><th></th></tr></thead><tbody>
          {accountsRoles.map(row => (
            <tr key={row.id}>
              <td className="small">{row.userId}</td>
              <td>{row.role}</td>
              <td><button type="button" className="btn" disabled={saving} onClick={() => run(async () => {
                await setAccountsUserRole(token, row.userId, null);
                setAccountsRoles(await loadAccountsRoles(token));
              }, "Accounts role cleared.")}>Remove</button></td>
            </tr>
          ))}
          {!accountsRoles.length && <tr><td colSpan="3">No accountant or viewer roles assigned yet. Owner keeps full access.</td></tr>}
        </tbody></table></div>
      </AccSetupSection>}
      {canWrite && <AccSetupSection
        icon="↻"
        title="Recurring entries"
        copy="Templates for monthly rent, retainers, or standing expenses. Run now opens a pre-filled entry; posting advances the next run date. Requires migration 075."
        collapsible
        summary={`${recurringTemplates.filter(row => row.isActive).length} active`}
      >
        <div className="form">
          <Field label="Name"><input value={recurringDraft.name} onChange={event => setRecurringDraft(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Office rent" /></Field>
          <Field label="Kind">
            <select value={recurringDraft.kind} onChange={event => setRecurringDraft(current => ({ ...current, kind: event.target.value }))}>
              {RECURRING_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Frequency">
            <select value={recurringDraft.frequency} onChange={event => setRecurringDraft(current => ({ ...current, frequency: event.target.value }))}>
              {RECURRING_FREQUENCIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Next run"><input type="date" value={recurringDraft.nextRunOn} onChange={event => setRecurringDraft(current => ({ ...current, nextRunOn: event.target.value }))} /></Field>
          <Field label="Amount"><input className="acc-num-input" type="number" min="0" step="0.01" value={recurringDraft.amount} onChange={event => setRecurringDraft(current => ({ ...current, amount: event.target.value }))} /></Field>
          <Field label="Party">
            <select value={recurringDraft.partyId} onChange={event => setRecurringDraft(current => ({ ...current, partyId: event.target.value }))}>
              <option value="">Optional</option>
              {parties.filter(party => party.isActive !== false).map(party => <option key={party.id} value={party.id}>{party.name}</option>)}
            </select>
          </Field>
          <Field label="Payment mode">
            <select value={recurringDraft.mode} onChange={event => setRecurringDraft(current => ({ ...current, mode: event.target.value }))}>
              {MONEY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
          </Field>
          <Field className="span" label="Narration"><input value={recurringDraft.narration} onChange={event => setRecurringDraft(current => ({ ...current, narration: event.target.value }))} /></Field>
        </div>
        <div className="acc-form-actions">
          <button type="button" className="btn primary" disabled={saving || !recurringDraft.name.trim() || !recurringDraft.nextRunOn} onClick={() => run(async () => {
            await upsertRecurringTemplate(token, {
              ...recurringDraft,
              amount: Number(recurringDraft.amount || 0),
              partyId: recurringDraft.partyId || null,
            });
            setRecurringDraft(emptyRecurringDraft());
            setRecurringTemplates(await loadRecurringTemplates(token));
          }, recurringDraft.id ? "Recurring template updated." : "Recurring template saved.")}>{saving ? "Saving…" : recurringDraft.id ? "Update template" : "Save template"}</button>
          {recurringDraft.id ? <button type="button" className="btn" disabled={saving} onClick={() => setRecurringDraft(emptyRecurringDraft())}>Clear</button> : null}
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Name</th><th>Kind</th><th>Next</th><th className="acc-num">Amount</th><th></th></tr></thead><tbody>
          {recurringTemplates.map(row => (
            <tr key={row.id}>
              <td>{row.name}{row.isActive === false ? " · inactive" : ""}</td>
              <td>{RECURRING_KINDS.find(item => item.id === row.kind)?.label || row.kind} · {row.frequency}</td>
              <td>{row.nextRunOn || "—"}</td>
              <td className="acc-num">{money(row.amount)}</td>
              <td className="accounts-action-row">
                <button type="button" className="btn primary" disabled={saving || !canWrite} onClick={() => openSimpleFromRecurring(row)}>Run now</button>
                <button type="button" className="btn" disabled={saving} onClick={() => setRecurringDraft({
                  id: row.id,
                  name: row.name,
                  kind: row.kind,
                  frequency: row.frequency,
                  nextRunOn: row.nextRunOn || todayIso(),
                  amount: String(row.amount || ""),
                  partyId: row.partyId || "",
                  narration: row.narration || "",
                  mode: row.mode || "cash",
                  isActive: row.isActive !== false,
                })}>Edit</button>
                <button type="button" className="btn danger" disabled={saving} onClick={() => run(async () => {
                  await deleteRecurringTemplate(token, row.id);
                  setRecurringTemplates(await loadRecurringTemplates(token));
                }, "Template deleted.")}>Delete</button>
              </td>
            </tr>
          ))}
          {!recurringTemplates.length && <tr><td colSpan="5">No recurring templates yet.</td></tr>}
        </tbody></table></div>
      </AccSetupSection>}
      <AccSetupSection
        icon="A"
        title="Audit trail"
        copy="Owner actions on books, parties, and settings. Posted amounts are not edited here."
        collapsible
        summary={`${audit.length} ${audit.length === 1 ? "event" : "events"}`}
      >
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>When (IST)</th><th>Action</th><th>Entity</th><th>Before → After</th><th>Reason</th></tr></thead><tbody>
          {pagedAudit.items.map(row => <tr key={row.id}>
            <td>{formatIstDateTime(row.createdAt)}</td>
            <td>{row.action}</td>
            <td>{row.entityType}</td>
            <td className="small">{row.oldValue || row.newValue ? `${JSON.stringify(row.oldValue || {})} → ${JSON.stringify(row.newValue || {})}` : "—"}</td>
            <td>{row.reason || "—"}</td>
          </tr>)}
          {!audit.length && <tr><td colSpan="5">No accounting audit events yet.</td></tr>}
        </tbody></table></div>
        <AccPager page={pagedAudit.page} pages={pagedAudit.pages} total={pagedAudit.total} onPage={setListPage} noun="events" />
      </AccSetupSection>
    </div>
  );
}
