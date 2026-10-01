import { AccSetupSection } from "../components/AccUi.jsx";
import { SubscriptionMonitoringPanel } from "../components/AccSetupWidgets.jsx";
import { CompanySetupPanel } from "./setup/CompanySetupPanel.jsx";
import { GstSetupPanel } from "./setup/GstSetupPanel.jsx";
import { ChartOfAccountsPanel } from "./setup/ChartOfAccountsPanel.jsx";
import { PartiesSetupPanel } from "./setup/PartiesSetupPanel.jsx";
import { ProductionReadinessPanel } from "./setup/ProductionReadinessPanel.jsx";
import { IntegrationSetupPanel } from "./setup/IntegrationSetupPanel.jsx";
import { PeriodLockPanel } from "./setup/PeriodLockPanel.jsx";
import { AccessRolesPanel } from "./setup/AccessRolesPanel.jsx";
import { RecurringEntriesPanel } from "./setup/RecurringEntriesPanel.jsx";
import { AuditTrailPanel } from "./setup/AuditTrailPanel.jsx";

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
      <CompanySetupPanel
        setupForm={setupForm}
        setSetupForm={setSetupForm}
        canAdmin={canAdmin}
        saving={saving}
        setError={setError}
        run={run}
        token={token}
        downloadCompanyBackup={downloadCompanyBackup}
        previewCompanyRestore={previewCompanyRestore}
        restoreDraft={restoreDraft}
        restoreBusy={restoreBusy}
        confirmCompanyRestore={confirmCompanyRestore}
        activeCompany={activeCompany}
        setRestoreDraft={setRestoreDraft}
        companies={companies}
        activeCompanyId={activeCompanyId}
        switchCompany={switchCompany}
        archiveCompany={archiveCompany}
        setCompanyDraft={setCompanyDraft}
        setShowCreateCompany={setShowCreateCompany}
      />
      <GstSetupPanel
        activeCompany={activeCompany}
        canAdmin={canAdmin}
        gstForm={gstForm}
        setGstForm={setGstForm}
        saving={saving}
        setError={setError}
        run={run}
        token={token}
      />
      <ChartOfAccountsPanel
        settings={settings}
        openCoa={openCoa}
        visibleAccounts={visibleAccounts}
        vouchers={vouchers}
        saving={saving}
        removeCoa={removeCoa}
      />
      <PartiesSetupPanel
        importParties={importParties}
        openParty={openParty}
        parties={parties}
        partySearch={partySearch}
        setPartySearch={setPartySearch}
        partyTypeFilter={partyTypeFilter}
        setPartyTypeFilter={setPartyTypeFilter}
        partyCountByType={partyCountByType}
        setupParties={setupParties}
        partyImportStatus={partyImportStatus}
        clearPartyFilters={clearPartyFilters}
        pagedSetupParties={pagedSetupParties}
        outstandingByParty={outstandingByParty}
        partyActions={partyActions}
        setListPage={setListPage}
      />
      <ProductionReadinessPanel downloadCompanyBackup={downloadCompanyBackup} />
      <SubscriptionMonitoringPanel orgSettings={orgSettings} companyId={activeCompanyId} />
      <IntegrationSetupPanel
        settings={settings}
        saving={saving}
        run={run}
        token={token}
      />
      <AccSetupSection
        icon="I"
        title="Items & inventory"
        copy="Items, stock value, physical count, ageing, CSV import and stock rules now live in the Inventory section."
      >
        <button type="button" className="btn primary" onClick={() => openSection("inventory")}>Open Inventory</button>
      </AccSetupSection>
      <PeriodLockPanel
        canAdmin={canAdmin}
        lockForm={lockForm}
        setLockForm={setLockForm}
        saving={saving}
        run={run}
        token={token}
        locks={locks}
        askReason={askReason}
      />
      {canAdmin && <AccessRolesPanel
        accountsRoles={accountsRoles}
        teamInvites={teamInvites}
        inviteDraft={inviteDraft}
        setInviteDraft={setInviteDraft}
        saving={saving}
        run={run}
        token={token}
        setTeamInvites={setTeamInvites}
        setAccountsRoles={setAccountsRoles}
        setInviteEmailDraft={setInviteEmailDraft}
        setNotice={setNotice}
        inviteEmailDraft={inviteEmailDraft}
        roleDraft={roleDraft}
        setRoleDraft={setRoleDraft}
      />}
      {canWrite && <RecurringEntriesPanel
        recurringTemplates={recurringTemplates}
        recurringDraft={recurringDraft}
        setRecurringDraft={setRecurringDraft}
        parties={parties}
        saving={saving}
        run={run}
        token={token}
        setRecurringTemplates={setRecurringTemplates}
        canWrite={canWrite}
        openSimpleFromRecurring={openSimpleFromRecurring}
      />}
      <AuditTrailPanel audit={audit} pagedAudit={pagedAudit} setListPage={setListPage} />
    </div>
  );
}
