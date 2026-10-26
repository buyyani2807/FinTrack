import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { TabScroller } from "../../../components/TabScroller.jsx";
import { todayIso } from "../../../lib/dates.js";
import { dateIsLocked } from "../model/accountingModel.js";
import { matchBankLine as saveBankMatch } from "../data/accountingRepository.js";
import { buildExpenseComparisons, buildSupplierPriceInsights, buildSupplierSpendInsights } from "../../intelligence/ai/expenseIntelligence.js";
import { buildCashFlowForecast } from "../../intelligence/ai/cashFlowForecast.js";
import { buildReceivablesCollectionPlan } from "../../intelligence/ai/receivablesAgent.js";
import { buildAnomalyAlerts } from "../../intelligence/ai/anomalyDetection.js";
import { GST_DISCLAIMER, buildGstWarnings } from "../../intelligence/ai/gstAssistant.js";
import { buildMonthEndReadiness, defaultCloseMonth, monthRange } from "../../intelligence/ai/monthEndReadiness.js";
import { buildCaBrief } from "../../intelligence/ai/caBrief.js";
import { buildBankReconciliationSuggestions } from "../../intelligence/ai/bankReconciliationAgent.js";
import { buildInventoryForecast } from "../../intelligence/ai/inventoryForecast.js";
import { daysBetween, shiftMonthKey } from "../../intelligence/ai/aiCommon.js";
import { latestDecisions } from "../../intelligence/ai/aiReviewAudit.js";
import { AI_AUDIT_MIGRATION_MESSAGE, loadAiReviewActions, recordAiInsightRun, recordAiReviewAction } from "../../intelligence/ai/aiReviewRepository.js";
import { AccEmpty } from "./AccUi.jsx";
import { AlertsPanel, BankPanel, CashFlowPanel, CollectionsPanel, ExpensesPanel, InventoryPanel, MonthEndPanel } from "./AccAiReviewPanels.jsx";
import { ItcCheckPanel } from "./ItcCheckPanel.jsx";

const HOW_TEXT = "Verified figures come from posted records. Predictions are labelled and are not guaranteed. Nothing is posted, matched, or changed until you approve it.";

function HowThisWorks() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const tipRef = useRef(null);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") close(); };
    const onPointer = event => {
      if (triggerRef.current?.contains(event.target) || tipRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const trigger = triggerRef.current;
      const tip = tipRef.current;
      if (!trigger || !tip) return;
      const box = trigger.getBoundingClientRect();
      const tipBox = tip.getBoundingClientRect();
      const view = document.documentElement.clientWidth;
      let left = box.left;
      left = Math.min(left, Math.max(8, view - tipBox.width - 8));
      left = Math.max(8, left);
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(8, box.top - tipBox.height - 8)}px`;
      const icon = trigger.querySelector("svg");
      const iconBox = icon?.getBoundingClientRect();
      if (iconBox) {
        const arrow = iconBox.left + iconBox.width / 2 - left;
        tip.style.setProperty("--air-how-arrow", `${Math.max(12, Math.min(arrow, tipBox.width - 12))}px`);
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(tipRef.current);
    document.fonts?.ready.then(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <p className="air-lede">Advisory insights from this company's saved books. Nothing here changes your records unless you approve it.</p>
      <button
        type="button"
        className="air-how"
        ref={triggerRef}
        aria-expanded={open}
        aria-describedby={open ? "air-how-tip" : undefined}
        onClick={() => setOpen(current => !current)}
      >
        <Info aria-hidden="true" />
        How this works
      </button>
      {open ? createPortal(
        <span ref={tipRef} id="air-how-tip" role="tooltip" className="air-how-tip">
          <span>{HOW_TEXT}</span>
          <button type="button" className="air-how-close" aria-label="Close" onClick={close}><X aria-hidden="true" /></button>
        </span>,
        document.body,
      ) : null}
    </>
  );
}

// `group` only decides where a divider sits in the tab bar: money, risk, then close and stock.
const TABS = [
  { id: "expenses", label: "Expenses", feature: "expenses", group: "money" },
  { id: "cashflow", label: "Cash flow", feature: "cashflow", group: "money" },
  { id: "collections", label: "Collections", feature: "receivables", group: "money" },
  { id: "anomalies", label: "Anomalies", feature: "anomalies", group: "risk" },
  { id: "gst", label: "GST health", feature: "gst", group: "risk" },
  { id: "itc", label: "GSTR-2B", feature: "gst", group: "risk" },
  { id: "month_end", label: "Month-end", feature: "month_end", group: "close" },
  { id: "bank", label: "Bank reconciliation", feature: "bank_reconciliation", group: "close" },
  { id: "inventory", label: "Inventory", feature: "inventory", group: "close" },
];

/**
 * AI Review: advisory insights computed from this company's verified books. Nothing here posts, matches,
 * settles, or changes records; approvals hand off to the existing, permission-checked Accounts flows.
 */
export function AccAiReviewWorkspace({
  token,
  aiEnabled,
  loading,
  accounts,
  vouchers,
  parties,
  items,
  stockMovements,
  voucherItemLines,
  tradeDocuments,
  statements,
  locks,
  cashbookEntries,
  collectionRoutes,
  company,
  role,
  canWrite,
  matchedLineIds,
  run,
  openSimpleFromBankLine,
  openSource,
}) {
  const [tab, setTab] = useState("expenses");
  const [decisionRows, setDecisionRows] = useState([]);
  const [auditAvailable, setAuditAvailable] = useState(true);
  const [auditError, setAuditError] = useState("");
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => defaultCloseMonth(todayIso()));
  const logged = useRef(new Set());
  const asOf = todayIso();
  const companyId = company?.id || "";

  useEffect(() => {
    if (!token || !aiEnabled) return undefined;
    let cancelled = false;
    loadAiReviewActions(token, { module: "accounts" })
      .then(rows => {
        if (cancelled) return;
        setAuditAvailable(rows !== null);
        setDecisionRows(rows || []);
      })
      .catch(err => { if (!cancelled) setAuditError(err.message || "Could not load review decisions."); });
    return () => { cancelled = true; };
  }, [token, aiEnabled, companyId]);

  const decisions = useMemo(() => latestDecisions(decisionRows), [decisionRows]);
  const needs = id => tab === id;
  const needsAnomalies = needs("anomalies");
  const needsGst = needs("gst");

  const expenses = useMemo(() => {
    if (!needs("expenses")) return null;
    const comparisons = buildExpenseComparisons({ accounts, vouchers, asOf });
    return {
      comparisons,
      supplierPrices: buildSupplierPriceInsights({ vouchers, voucherItemLines, parties, asOf }),
      supplierSpend: buildSupplierSpendInsights({ vouchers, parties, asOf }),
    };
  }, [tab, accounts, vouchers, voucherItemLines, parties, asOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const forecast = useMemo(() => (needs("cashflow") ? buildCashFlowForecast({ accounts, vouchers, parties, asOf }) : null), [tab, accounts, vouchers, parties, asOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const collections = useMemo(() => (needs("collections") ? buildReceivablesCollectionPlan({ accounts, vouchers, parties, asOf, collectionRoutes, role }) : null), [tab, accounts, vouchers, parties, asOf, collectionRoutes, role]); // eslint-disable-line react-hooks/exhaustive-deps
  const anomalies = useMemo(() => (needsAnomalies ? buildAnomalyAlerts({ accounts, vouchers, parties, stockMovements, items, statements, cashbookEntries: cashbookEntries || [], asOf }) : null), [needsAnomalies, accounts, vouchers, parties, stockMovements, items, statements, cashbookEntries, asOf]);
  const gstReview = useMemo(() => (needsGst ? buildGstWarnings({ vouchers, parties, company: company || {}, voucherItemLines, asOf }) : null), [needsGst, vouchers, parties, company, voucherItemLines, asOf]);
  const gstWarnings = gstReview?.warnings || null;
  const resolvedKeys = useMemo(() => new Set(decisionRows.filter(row => row.feature === "month_end").map(row => row.insightKey)), [decisionRows]);
  const readiness = useMemo(() => {
    if (!needs("month_end")) return null;
    const range = monthRange(month);
    const monthEnd = range.to < asOf ? range.to : asOf;
    return buildMonthEndReadiness({
      month, asOf, accounts, vouchers, parties, items, stockMovements, locks, statements, resolvedKeys,
      anomalies: buildAnomalyAlerts({ accounts, vouchers, parties, stockMovements, items, asOf: monthEnd, lookbackDays: Math.max(1, daysBetween(range.from, monthEnd) || 0) }),
      gstWarnings: buildGstWarnings({ vouchers, parties, company: company || {}, voucherItemLines, from: range.from, to: range.to }).warnings,
    });
  }, [tab, month, asOf, accounts, vouchers, parties, items, stockMovements, locks, statements, resolvedKeys, company, voucherItemLines]); // eslint-disable-line react-hooks/exhaustive-deps
  const brief = useMemo(() => (needs("month_end") ? buildCaBrief({
    company, month, asOf, accounts, vouchers, parties, items, stockMovements, locks, statements, voucherItemLines, resolvedKeys,
  }) : null), [tab, company, month, asOf, accounts, vouchers, parties, items, stockMovements, locks, statements, voucherItemLines, resolvedKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const bank = useMemo(() => (needs("bank") ? buildBankReconciliationSuggestions({ statements, accounts, vouchers, parties, matchedLineIds }) : null), [tab, statements, accounts, vouchers, parties, matchedLineIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const inventory = useMemo(() => (needs("inventory") ? buildInventoryForecast({ items, stockMovements, tradeDocuments: tradeDocuments || [], asOf }) : null), [tab, items, stockMovements, tradeDocuments, asOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = TABS.find(item => item.id === tab);
  const tabInsights = {
    expenses: expenses ? [...expenses.comparisons.insights, ...expenses.supplierPrices.insights, ...expenses.supplierSpend] : null,
    cashflow: forecast ? [forecast] : null,
    collections,
    anomalies,
    gst: gstWarnings,
    month_end: readiness ? readiness.checks.filter(check => check.count > 0) : null,
    bank: bank?.suggestions || null,
    inventory,
  }[tab];

  useEffect(() => {
    if (!token || !aiEnabled || loading || !tabInsights) return;
    const key = `${companyId}:${current.feature}:${asOf}`;
    if (logged.current.has(key)) return;
    logged.current.add(key);
    recordAiInsightRun(token, { module: "accounts", feature: current.feature, insights: tabInsights });
  }, [token, aiEnabled, loading, tabInsights, companyId, current, asOf]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => shiftMonthKey(asOf.slice(0, 7), -index)), [asOf]);

  const saveDecision = async (input) => {
    try {
      const result = await recordAiReviewAction(token, { module: "accounts", ...input });
      setDecisionRows(rows => [...rows, { id: result?.id || `${input.feature}:${input.insightKey}`, feature: input.feature, insightKey: input.insightKey, action: input.action, createdAt: new Date().toISOString() }]);
      setAuditError("");
      return true;
    } catch (err) {
      if (err.message === AI_AUDIT_MIGRATION_MESSAGE) setAuditAvailable(false);
      setAuditError(err.message || "Could not save the review decision.");
      return false;
    }
  };

  const decideAlert = async (feature, alert, action) => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      await saveDecision({
        feature,
        insightKey: alert.id,
        action,
        sourceType: alert.source?.section || null,
        sourceId: alert.source?.voucherId || alert.source?.partyId || alert.source?.itemId || alert.source?.lineId || null,
        suggestion: { pattern: alert.pattern || alert.check || null },
      });
    } finally {
      setBusy(false);
    }
  };

  const resolveCheck = async check => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      await saveDecision({ feature: "month_end", insightKey: `${month}:${check.key}`, action: "reviewed", sourceType: "month_end", sourceId: month, suggestion: { check: check.key } });
    } finally {
      setBusy(false);
    }
  };

  const bankLocked = row => dateIsLocked(row.date, locks || []);

  const approveBank = async (row, voucherLineId, edited) => {
    if (!canWrite || busy) return;
    if (bankLocked(row)) {
      setAuditError(`${row.date} is in a locked period. Unlock it in Setup before reconciling this line.`);
      return;
    }
    const decision = {
      feature: "bank_reconciliation",
      insightKey: row.id,
      sourceType: "bank_statement_line",
      sourceId: row.lineId,
      recordDate: row.date,
      suggestion: { actionKind: row.actionKind, voucherLineId: voucherLineId || row.voucherLineId || null, expenseCode: row.entrySuggestion?.expenseCode || null, kind: row.entrySuggestion?.kind || null, confidencePct: row.confidencePct },
    };
    if (voucherLineId) {
      setBusy(true);
      try {
        await run(async () => {
          await saveBankMatch(token, row.lineId, voucherLineId, edited ? "Matched after editing AI suggestion" : "Approved AI suggestion");
          await saveDecision({ ...decision, action: edited ? "edited" : "approved" });
        }, "Bank line matched.");
      } finally {
        setBusy(false);
      }
      return;
    }
    // Opening the prefilled form is a review step; the entry is only posted (and the line matched) when the form is saved.
    await saveDecision({ ...decision, action: edited ? "edited" : "reviewed", note: "Prefilled entry opened from AI suggestion." });
    openSimpleFromBankLine({ ...row.rawLine, entrySuggestion: row.entrySuggestion }, row.statement);
  };

  const rejectBank = async row => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      await saveDecision({ feature: "bank_reconciliation", insightKey: row.id, action: "rejected", sourceType: "bank_statement_line", sourceId: row.lineId, suggestion: { actionKind: row.actionKind, confidencePct: row.confidencePct } });
    } finally {
      setBusy(false);
    }
  };

  const reminderOpened = row => {
    saveDecision({ feature: "receivables", insightKey: row.id, action: "reviewed", sourceType: "party", sourceId: row.partyId, suggestion: { status: "reminder_opened" } });
  };

  const openLink = link => {
    if (link?.section === "ai") {
      if (link.tab) setTab(link.tab);
      return;
    }
    openSource(link);
  };

  if (!aiEnabled) {
    return <div className="acc-panel"><AccEmpty title="AI Review is unavailable" copy="AI insights are turned off for this organisation. Your books, reports, and reconciliation work as usual." /></div>;
  }

  const panelLoading = loading && !accounts?.length;
  return (
    <div className="acc-panel ai-review air">
      <header className="air-head">
        <HowThisWorks />
      </header>
      {!auditAvailable && <div className="notice">{AI_AUDIT_MIGRATION_MESSAGE} Insights still work; decisions are not saved until then.</div>}
      {auditError && auditAvailable && <div className="notice">{auditError}</div>}
      <TabScroller className="is-sub"><nav className="accounts-section-nav" aria-label="AI Review pages">
        {TABS.map((item, index) => [
          index > 0 && TABS[index - 1].group !== item.group ? <span key={`${item.id}-sep`} className="air-tab-sep" aria-hidden="true" /> : null,
          <button key={item.id} type="button" className={`accounts-section-tab ${tab === item.id ? "active" : ""}`} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}>{item.label}</button>,
        ])}
      </nav></TabScroller>
      {panelLoading ? <AccEmpty title="Loading" copy="Reading this company's books…" /> : <section className="air-body" aria-live="polite">
        {tab === "expenses" && expenses && <ExpensesPanel data={expenses} openSource={openLink} />}
        {tab === "cashflow" && forecast && <CashFlowPanel forecast={forecast} openSource={openLink} />}
        {tab === "collections" && collections && <CollectionsPanel rows={collections} openSource={openLink} businessName={company?.name} asOf={asOf} canWrite={canWrite} onReminderOpened={reminderOpened} />}
        {tab === "anomalies" && anomalies && <AlertsPanel
          alerts={anomalies}
          decisions={decisions}
          feature="anomalies"
          canWrite={canWrite && auditAvailable}
          busy={busy}
          onDecide={decideAlert}
          openSource={openLink}
          emptyTitle="No unusual activity"
          emptyCopy="Nothing in the last 90 days stands out from this company's own history."
          header={<p className="small muted">Possible issues found by comparing each record with similar records in this company. These are prompts to review, not conclusions. Nothing is reversed, deleted, or blocked automatically.</p>}
        />}
        {tab === "itc" && <ItcCheckPanel vouchers={vouchers} parties={parties} />}
        {tab === "gst" && gstWarnings && <AlertsPanel
          alerts={gstWarnings}
          decisions={decisions}
          feature="gst"
          canWrite={canWrite && auditAvailable}
          busy={busy}
          onDecide={decideAlert}
          openSource={openLink}
          emptyTitle="No GST warnings"
          emptyCopy={`${gstReview.documentsChecked} GST document(s) from ${gstReview.period.from} to ${gstReview.period.to} passed these checks.`}
          header={<p className="small muted">{GST_DISCLAIMER} Checked {gstReview.documentsChecked} document(s) from {gstReview.period.from} to {gstReview.period.to}.</p>}
        />}
        {tab === "month_end" && readiness && <MonthEndPanel readiness={readiness} brief={brief} months={months} month={month} setMonth={setMonth} canWrite={canWrite && auditAvailable} busy={busy} onResolve={resolveCheck} openSource={openLink} />}
        {tab === "bank" && bank && <BankPanel result={bank} decisions={decisions} canWrite={canWrite} busy={busy} isLocked={bankLocked} onApprove={approveBank} onReject={rejectBank} openSource={openLink} />}
        {tab === "inventory" && inventory && <InventoryPanel rows={inventory} openSource={openLink} />}
      </section>}
    </div>
  );
}
