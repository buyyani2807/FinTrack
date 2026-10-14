import { createParty, initializeAccounting, saveAccountingSettings, saveGstSettings, inviteTeamMember } from "../data/accountingRepository.js";
import { AccOnboardingWizard, markAccountsOnboardingDone } from "../components/AccOnboardingWizard.jsx";
import { Field, AccMetric } from "../components/AccUi.jsx";
import { AttentionCenterCard } from "../../intelligence/AttentionCenterCard.jsx";
import { AnomalyReviewCard } from "../../intelligence/AnomalyReviewCard.jsx";
import { trackProductEvent } from "../../commercial/productAnalytics.js";
import { todayIso } from "../../../lib/dates.js";
import { INDIA_STATES } from "../model/accountingGst.js";
import { AccIntelligenceBrief } from "../components/AccIntelligenceBrief.jsx";
import { AccAskBooks } from "../components/AccAskBooks.jsx";
import { emptyPartyForm } from "../accountsFormDefaults.js";
import { money } from "../accountsFormat.js";
import { AccOverviewContextBar } from "../components/AccPeriodBars.jsx";
import { AccountsBusinessPulse, AccMoneyTiles, AccOverviewRecent } from "../components/AccOverviewWidgets.jsx";
import { IndustryTemplateCard } from "../components/AccSetupWidgets.jsx";
import { AccOwnerDailyBrief } from "../components/AccOwnerDailyBrief.jsx";
import { AccArApAgingChart, AccMonthlyChart, AccSpendingDonut } from "../components/AccOverviewCharts.jsx";
import { AiAdvisoryPanel } from "../../intelligence/AiAdvisoryPanel.jsx";
import { isModuleEnabled } from "../../commercial/featurePacks.js";

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
  overviewCharts,
  overviewArAging,
  overviewApAging,
  items,
  stockMovements,
  accountsAttention,
  anomalyReview,
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
  statements = [],
  ownerBrief,
  orgSettings,
  workspace,
  openPaymentFor,
  createPurchaseOrderFromReorder,
  markGstFiled,
  lockMonth,
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

      {settings && metrics && <AccMoneyTiles
        metrics={metrics}
        periodLabel={rangeFrom === fy.from && rangeTo === fy.to ? "This FY" : rangeFrom === lastFy.from && rangeTo === lastFy.to ? "Last FY" : "Period"}
        onNavigate={target => {
          if (typeof target === "string") openSection(target);
          else if (target?.reportTab) setReportTab(target.reportTab);
        }}
      />}

      {ownerBrief && settings && <AccOwnerDailyBrief
        brief={ownerBrief}
        parties={parties}
        companyName={activeCompany?.name || settings?.companyName || ""}
        settings={orgSettings}
        company={activeCompany}
        workspace={workspace}
        canWrite={canWrite}
        saving={saving}
        onOpenSection={openSection}
        onPay={openPaymentFor}
        onCreatePurchaseOrder={createPurchaseOrderFromReorder}
        onMarkFiled={item => markGstFiled({ returnCode: item.code, period: item.period })}
        onLockPeriod={canAdmin ? lockMonth : null}
      />}

      <AccOverviewContextBar
        fy={fy}
        lastFy={lastFy}
        from={rangeFrom}
        to={rangeTo}
        onChange={setReportRange}
        equationHolds={Boolean(metrics?.equationHolds)}
        integrationEnabled={Boolean(settings?.integrationEnabled)}
      />

      {settings && overviewCharts && <div className="acc-ov-charts">
        <AccMonthlyChart rows={overviewCharts.trend} onOpenPnl={() => openSection("pnl")} />
        <AccSpendingDonut breakdown={overviewCharts.spending} onOpenPnl={() => openSection("pnl")} onOpenReview={() => openSection("ai")} />
      </div>}

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
          else if (target?.reportTab) setReportTab(target.reportTab);
          else if (target?.section) openSection(target.section);
        }}
      />

      {accountsAttention?.count > 0 && <AttentionCenterCard attention={accountsAttention} onNavigate={href => {
        trackProductEvent("accounts_attention_navigate", { section: href?.section || "" });
        if (href?.reportTab) setReportTab(href.reportTab);
        else if (href?.section) openSection(href.section);
      }} />}

      {anomalyReview && <AnomalyReviewCard review={anomalyReview} showWhenClear onNavigate={href => {
        trackProductEvent("accounts_review_navigate", { section: href?.section || "" });
        if (href?.section) openSection(href.section);
      }} />}

      <AccArApAgingChart
        ar={overviewArAging}
        ap={overviewApAging}
        onReceivables={() => openSection("receivables")}
        onPayables={() => openSection("payables")}
      />

      {settings && <AccAskBooks
        accounts={visibleAccounts}
        vouchers={vouchers}
        parties={parties}
        items={items}
        stockMovements={stockMovements}
        voucherItemLines={voucherItemLines}
        range={range}
        today={todayIso()}
        onNavigate={openSection}
      />}

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

      {settings && isModuleEnabled(orgSettings, "ai") && <AiAdvisoryPanel
        accounts={visibleAccounts}
        vouchers={vouchers}
        parties={parties}
        items={items}
        stockMovements={stockMovements}
        statements={statements}
        asOf={todayIso()}
        onNavigate={openSection}
      />}

      <section className="acc-section">
        <h2 className="acc-section-title">Metrics</h2>
        <div className="acc-metric-grid acc-ov-metrics acc-metric-compact">
          <AccMetric label="Income" value={money(metrics?.income)} tone="green" onClick={() => openSection("pnl")} />
          <AccMetric label="Expenses" value={money(metrics?.expenses)} tone="red" onClick={() => openSection("pnl")} />
          <AccMetric label="Net profit" value={money(metrics?.netProfit)} tone={metrics?.netProfit < 0 ? "red" : "green"} onClick={() => openSection("pnl")} />
        </div>
      </section>

      <AccOverviewRecent rows={recentVouchers} onViewAll={() => openSection("vouchers")} />
    </div>
  );
}
