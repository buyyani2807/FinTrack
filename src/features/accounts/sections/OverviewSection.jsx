import { createParty, initializeAccounting, saveAccountingSettings, saveGstSettings, inviteTeamMember } from "../accountingRepository.js";
import { AccOnboardingWizard, markAccountsOnboardingDone } from "../AccOnboardingWizard.jsx";
import { Field, AccMetric } from "../components/AccUi.jsx";
import { AttentionCenterCard } from "../../intelligence/AttentionCenterCard.jsx";
import { trackProductEvent } from "../../commercial/productAnalytics.js";
import { todayIso } from "../cashbookModel.js";
import { INDIA_STATES } from "../accountingGst.js";
import { AccIntelligenceBrief } from "../AccIntelligenceBrief.jsx";
import { emptyPartyForm } from "../accountsFormDefaults.js";
import { money } from "../accountsFormat.js";
import { AccOverviewContextBar } from "../components/AccPeriodBars.jsx";
import { AccountsBusinessPulse, AccCompareChart, AccOverviewRecent } from "../components/AccOverviewWidgets.jsx";
import { IndustryTemplateCard } from "../components/AccSetupWidgets.jsx";

export function OverviewSection({
  settings,
  setupForm,
  setSetupForm,
  saving,
  run,
  token,
  showOnboarding,
  activeCompanyId,
  activeCompany,
  canAdmin,
  canWrite,
  setOnboardingDismissed,
  setNotice,
  fy,
  lastFy,
  rangeFrom,
  rangeTo,
  setReportRange,
  metrics,
  overviewArAging,
  overviewApAging,
  items,
  stockMovements,
  accountsAttention,
  close,
  openSection,
  setReportTab,
  visibleAccounts,
  vouchers,
  parties,
  range,
  intelligencePreviousRange,
  voucherItemLines,
  recentVouchers,
}) {
  return (
    <div className="acc-panel acc-overview">
      {!settings && <div className="card accounts-form-card">
        <strong>Open the books</strong>
        <p className="copy">Create a chart of accounts for this business. You do not need Daily Finance, Monthly Finance, or Chit Fund records.</p>
        <div className="form spacer">
          <Field label="Business name"><input value={setupForm.companyName} onChange={event => setSetupForm(current => ({ ...current, companyName: event.target.value }))} /></Field>
          <Field label="Books start date"><input type="date" value={setupForm.booksStartedOn} onChange={event => setSetupForm(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
        </div>
        <button type="button" className="btn primary" disabled={saving} onClick={() => run(() => initializeAccounting(token, setupForm), "Accounts opened.")}>{saving ? "Saving…" : "Create chart of accounts"}</button>
      </div>}

      {showOnboarding && (
        <AccOnboardingWizard
          key={activeCompanyId || "onboarding"}
          company={activeCompany}
          canAdmin={canAdmin}
          canWrite={canWrite}
          saving={saving}
          onSaveCompany={async ({ companyName, booksStartedOn }) => {
            const ok = await run(() => saveAccountingSettings(token, { companyName, booksStartedOn }), "Company saved.");
            if (!ok) throw new Error("Could not save company.");
          }}
          onSaveGst={async payload => {
            const ok = await run(() => saveGstSettings(token, {
              ...payload,
              stateName: INDIA_STATES.find(state => state.code === payload.stateCode)?.name || "",
            }), "GST settings saved.");
            if (!ok) throw new Error("Could not save GST.");
          }}
          onCreateParty={async payload => {
            const ok = await run(() => createParty(token, {
              ...emptyPartyForm(),
              ...payload,
            }), "Party created.");
            if (!ok) throw new Error("Could not create party.");
          }}
          onInviteCa={async ({ email, role }) => {
            const ok = await run(async () => {
              await inviteTeamMember(token, { email, role });
            }, `Invite processed for ${email}.`);
            if (!ok) throw new Error("Could not invite. Apply migration 075 if this is the first invite.");
          }}
          onFinish={() => {
            markAccountsOnboardingDone(activeCompanyId);
            setOnboardingDismissed(true);
            setNotice("Accounts setup complete.");
          }}
          onSkip={() => {
            markAccountsOnboardingDone(activeCompanyId);
            setOnboardingDismissed(true);
          }}
        />
      )}

      <AccOverviewContextBar
        fy={fy}
        lastFy={lastFy}
        from={rangeFrom}
        to={rangeTo}
        onChange={setReportRange}
        equationHolds={Boolean(metrics?.equationHolds)}
        integrationEnabled={Boolean(settings?.integrationEnabled)}
      />

      <IndustryTemplateCard companyId={activeCompanyId} />

      <AccountsBusinessPulse
        metrics={metrics}
        receivables={overviewArAging}
        payables={overviewApAging}
        items={items}
        stockMovements={stockMovements}
        attention={accountsAttention}
        onOpenCollections={close}
        onNavigate={target => {
          if (typeof target === "string") openSection(target);
          else if (target?.section) {
            openSection(target.section);
            if (target.reportTab) setReportTab(target.reportTab);
          }
        }}
      />

      {accountsAttention?.count > 0 && <AttentionCenterCard attention={accountsAttention} onNavigate={href => {
        trackProductEvent("accounts_attention_navigate", { section: href?.section || "" });
        if (href?.section) openSection(href.section);
        if (href?.reportTab) setReportTab(href.reportTab);
      }} />}

      <AccCompareChart
        ar={overviewArAging}
        ap={overviewApAging}
        onReceivables={() => openSection("receivables")}
        onPayables={() => openSection("payables")}
      />

      <AccIntelligenceBrief
        accounts={visibleAccounts}
        vouchers={vouchers}
        parties={parties}
        range={range}
        previousRange={intelligencePreviousRange}
        today={todayIso()}
        companyId={activeCompanyId}
        companyName={activeCompany?.name || settings?.companyName || ""}
        items={items}
        stockMovements={stockMovements}
        voucherItemLines={voucherItemLines}
        onNavigate={openSection}
      />

      <section className="acc-section">
        <h2 className="acc-section-title">Metrics</h2>
        <div className="acc-metric-grid acc-ov-metrics acc-metric-compact">
          <AccMetric label="Cash" value={money(metrics?.cash)} tone="gold" />
          <AccMetric label="Bank" value={money(metrics?.bank)} tone="gold" />
          <AccMetric label="UPI" value={money(metrics?.upi)} tone="gold" />
          <AccMetric label="Receivables" value={money(metrics?.receivables)} tone="blue" onClick={() => openSection("receivables")} />
          <AccMetric label="Payables" value={money(metrics?.payables)} tone="gold" onClick={() => openSection("payables")} />
          <AccMetric label="Income" value={money(metrics?.income)} tone="green" onClick={() => openSection("pnl")} />
          <AccMetric label="Expenses" value={money(metrics?.expenses)} tone="red" onClick={() => openSection("pnl")} />
          <AccMetric label="Net profit" value={money(metrics?.netProfit)} tone={metrics?.netProfit < 0 ? "red" : "green"} onClick={() => openSection("pnl")} />
        </div>
      </section>

      <AccOverviewRecent rows={recentVouchers} onViewAll={() => openSection("vouchers")} />
    </div>
  );
}
