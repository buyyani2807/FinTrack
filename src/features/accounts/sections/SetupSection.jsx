import { ArrowRight } from "lucide-react";
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
import { PriceListsPanel } from "./setup/PriceListsPanel.jsx";
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
  setNotice,
  canWrite,
  recurringTemplates,
  recurringDraft,
  setRecurringDraft,
  setRecurringTemplates,
  openSimpleFromRecurring,
  priceLists = [],
  setPriceLists,
  items = [],
  audit,
  pagedAudit,
  openMigration = null,
  openSetupAssistant = null,
  setUpNewCompany = null,
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
      {(openSetupAssistant || setUpNewCompany) && (
        <AccSetupSection
          icon="AI"
          title="Set up with AI"
          copy={`For a different business, set up a new company: it gets its own books, and FinTrack asks what kind of business it is. To add missing bank ledgers, stock categories and ledgers to ${activeCompany?.name || "this company"}, fill its gaps; its name, GST and books start date are not changed.`}
          collapsible
          summary="Setup options"
        >
          <div className="acc-form-actions">
            {setUpNewCompany && <button type="button" className="btn primary acc-setup-link-btn" onClick={setUpNewCompany}>Set up a new company<ArrowRight size={15} aria-hidden="true" /></button>}
            {openSetupAssistant && <button type="button" className="btn acc-setup-link-btn" onClick={openSetupAssistant}>Fill gaps in {activeCompany?.name || "this company"}</button>}
          </div>
        </AccSetupSection>
      )}
      {openMigration && (
        <AccSetupSection
          icon="↥"
          title="Move from Tally, Zoho or Excel"
          copy="Upload your Tally XML, Zoho Books or Book Keeper export, or an Excel sheet. FinTrack maps ledgers and parties, finds duplicates, and shows you what it is unsure about before importing."
          collapsible
          summary="Migration"
        >
          <button type="button" className="btn primary acc-setup-link-btn" onClick={openMigration}>Start migration<ArrowRight size={15} aria-hidden="true" /></button>
        </AccSetupSection>
      )}
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
        collapsible
        summary="Inventory"
      >
        <button type="button" className="btn primary acc-setup-link-btn" onClick={() => openSection("inventory")}>Open Inventory<ArrowRight size={15} aria-hidden="true" /></button>
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
      <AccessRolesPanel
        saving={saving}
        run={run}
        token={token}
        setNotice={setNotice}
        canAdmin={canAdmin}
        companies={companies}
        activeCompanyId={activeCompanyId}
      />
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
      <PriceListsPanel
        priceLists={priceLists}
        setPriceLists={setPriceLists}
        parties={parties}
        items={items}
        token={token}
        canWrite={canWrite}
        saving={saving}
        run={run}
      />
      <AuditTrailPanel audit={audit} pagedAudit={pagedAudit} setListPage={setListPage} />
    </div>
  );
}
