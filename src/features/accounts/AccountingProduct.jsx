import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "./accountingProduct.css";
import {
  addBankStatement,
  addVoucherAttachment,
  archiveAccountsCompany,
  cancelVoucher,
  createAccountsCompany,
  createChartAccount,
  createParty,
  deleteChartAccount,
  deleteParty,
  deleteVoucherAttachment,
  ignoreBankLine,
  initializeAccounting,
  loadAccountsRoles,
  loadAccountsAccessRole,
  loadAuditLog,
  loadBankStatements,
  loadPeriodLocks,
  loadVoucherAttachments,
  loadVouchers,
  lockAccountingPeriod,
  matchBankLine as saveBankMatch,
  postVoucher,
  queueEinvoicePayload,
  reopenAccountingPeriod,
  reverseVoucher,
  saveAccountingSettings,
  saveGstSettings,
  setAccountingIntegration,
  setPartyPipelineStage,
  setActiveAccountsCompanyId,
  setAccountsUserRole,
  setItemActive,
  setPartyActive,
  syncAccountingOperations,
  trackProductEventRpc,
  updateChartAccount,
  updateParty,
  upsertItem,
  upsertItemCategory,
  deleteItem,
  deleteItemCategory,
  adjustStock,
  claimTeamInvites,
  inviteTeamMember,
  listTeamInvites,
  revokeTeamInvite,
  loadRecurringTemplates,
  upsertRecurringTemplate,
  deleteRecurringTemplate,
  markRecurringRun,
  setItemOpeningRate,
  loadInventorySettings,
  saveInventorySettings,
} from "./accountingRepository.js";
import {
  AccOnboardingWizard,
  isAccountsOnboardingDone,
  markAccountsOnboardingDone,
  INDUSTRY_TEMPLATES,
  readIndustry,
  saveIndustry,
} from "./AccOnboardingWizard.jsx";
import { parsePartyCsv, planPartyImport } from "./partyCsvImport.js";
import { AccMoreMenu, AccToolbar, Field, AccMetric, AccEmpty, AccPager, AccSetupSection, AccSkeleton, Modal, ReasonModal } from "./components/AccUi.jsx";
import { BANK_IMPORT_FIELDS, guessColumnMapping, mapBankImportRows, readBankStatementFile } from "./bankStatementImport.js";
import { backupDownloadFilename, buildAccountsCompanyBackup, parseAccountsCompanyBackup } from "./accountsBackup.js";
import { assertBackupRestorable, restoreAccountsCompanyBackup } from "./accountsRestore.js";
import {
  buildEinvoiceOutboundPayload,
  buildGstr1Preparation,
  buildGstr3bPreparation,
  EINVOICE_INTEGRATION_STUB,
  gstrPrepToCsvRows,
  gstrPrepToJson,
} from "./gstPrepExport.js";
import { buildAccountsAttentionItems } from "../intelligence/attentionCenter.js";
import { AttentionCenterCard } from "../intelligence/AttentionCenterCard.jsx";
import { trackProductEvent } from "../commercial/productAnalytics.js";
import {
  assertVoucherAttachmentMeta,
  attachmentDownloadHref,
  normalizeAttachmentContentType,
  readFileAsBase64,
  VOUCHER_ATTACHMENT_MAX_BYTES,
} from "./voucherAttachments.js";
import {
  MONEY_MODES,
  PARTY_TYPES,
  SIMPLE_ENTRY_KINDS,
  VOUCHER_TYPES,
  accountNormalSide,
  addDaysIso,
  assertBalancedVoucher,
  assertCanChangePartyType,
  assertCanDeleteLedger,
  assertCanDeleteParty,
  assertCoaParent,
  assertChartOpeningsBalanced,
  assertVoucherDateNotFuture,
  createSubmitLock,
  filterParties,
  indianFinancialYear,
  ledgerHasPostedLines,
  moneyAccounts,
  newClientRequestId,
  partyHasAccountingUse,
  previousIndianFinancialYear,
  roundMoney,
  simpleEntryDraft,
  standaloneVisibleAccounts,
  validatePartyForm,
  voucherTotals,
  salePaymentSummary,
  assertMoneyModeSplit,
} from "./accountingModel.js";
import { formatIstDateTime, todayIso } from "./cashbookModel.js";
import { INDIA_STATES, gstStateFromGstin, isIntraGst, validateGstSettings } from "./accountingGst.js";
import {
  accountLedger,
  balanceSheet,
  bankVoucherLines,
  cashFlow,
  dashboardMetrics,
  dayBook,
  defaultBankStatementLines,
  gstBooksReport,
  invoiceAgingTotals,
  invoiceRegister,
  partyBalances,
  partyLedger,
  partyTotalsFromInvoices,
  profitAndLoss,
  trialBalance,
} from "./accountingReports.js";
import { pageSlice } from "./accountsList.js";
import { AccIntelligenceBrief } from "./AccIntelligenceBrief.jsx";
import { previousComparisonRange } from "./accountsIntelligence.js";
import { downloadAccountsCsv, downloadAccountsExcel, downloadAccountsPdf } from "./accountingExport.js";
import { loadOrganizationSettings } from "../../lib/financeRepository.js";
import { buildSalesInvoice } from "./salesInvoiceModel.js";
import {
  ArReminderButton,
  OutstandingWhatsAppButton,
  PartyStatementButton,
  PaymentAdviceButton,
  PurchaseDocumentButton,
  SalesInvoiceActions,
  SalesInvoiceSuccessModal,
  SalesInvoiceViewerModal,
} from "./SalesInvoiceActions.jsx";
import { AccItemsSetup } from "./AccItemsSetup.jsx";
import { AccInventoryWorkspace } from "./AccInventoryWorkspace.jsx";
import { periodStockValues } from "./inventoryValuation.js";
import {
  currentStockForItem,
  itemPurchasesReport,
  itemSalesReport,
  itemizedEntryDraft,
  stockMovementReport,
  stockReasonLabel,
  usesItemLines,
} from "./inventoryModel.js";
import {
  COMPANY_STORAGE_KEY,
  readAccountsSnapshot,
  fetchAccountsBundle,
  inFlightAccountsPrefetch,
  clearAccountsSnapshot,
} from "./accountsCache.js";

// Re-exported for the workspace preloader, which lazy-loads this module.
export { prefetchAccounts } from "./accountsCache.js";
import {
  emptyLine,
  emptyBankLine,
  emptyPartyForm,
  emptyRecurringDraft,
  RECURRING_KINDS,
  RECURRING_FREQUENCIES,
  emptyVoucherForm,
  emptySimpleForm,
  emptyCoaForm,
} from "./accountsFormDefaults.js";
import { NAV_STORAGE_KEY, sectionTrail, SECTIONS, REPORT_TABS, MOBILE_TABS, MORE_LINKS } from "./accountsNavigation.js";
import { money, partyTypeLabel, gstStatusLabel, bankMatchLabel, bankMatchTone, PARTY_TYPE_FILTERS } from "./accountsFormat.js";
import { AccSidebar, AccCompanyBar, AccPageHeader } from "./components/AccLayout.jsx";
import { AccOverviewContextBar, ReportRangeBar } from "./components/AccPeriodBars.jsx";
import { AccountsBusinessPulse, AccCompareChart, AccOverviewRecent } from "./components/AccOverviewWidgets.jsx";
import { BankMatchControls } from "./components/BankMatchControls.jsx";
import { PartyTypeBadge, PartyFormFields } from "./components/PartyFields.jsx";
import { IndustryTemplateCard, SubscriptionMonitoringPanel } from "./components/AccSetupWidgets.jsx";
import { CustomerPipeline } from "./components/CustomerPipeline.jsx";
import { ManufacturingWorkspace } from "./components/ManufacturingWorkspace.jsx";
import { VoucherForm } from "./components/VoucherForm.jsx";
import { SimpleEntryForm } from "./components/SimpleEntryForm.jsx";
import { CoaFormFields } from "./components/CoaFormFields.jsx";

export function AccountsModule({ token, close, onOpenCashbook, logout, workspace = {}, orgSettings: orgSettingsProp = null }) {
  const [cached] = useState(() => {
    const snapshot = readAccountsSnapshot(token);
    if (snapshot) setActiveAccountsCompanyId(snapshot.activeCompanyId || null);
    return snapshot;
  });
  const [section, setSection] = useState("overview");
  const [reportTab, setReportTab] = useState("daybook");
  const [navExpanded, setNavExpanded] = useState(() => {
    try { return sessionStorage.getItem(NAV_STORAGE_KEY) === "expanded"; } catch { return false; }
  });
  const [settings, setSettings] = useState(cached?.settings ?? null);
  const [orgSettings, setOrgSettings] = useState(orgSettingsProp || {});
  const [pendingSalesInvoiceId, setPendingSalesInvoiceId] = useState(null);
  const [salesInvoiceSuccess, setSalesInvoiceSuccess] = useState(null);
  const [salesInvoiceView, setSalesInvoiceView] = useState(null);
  const [accounts, setAccounts] = useState(cached?.accounts ?? []);
  const [parties, setParties] = useState(cached?.parties ?? []);
  const [partyPipeline, setPartyPipeline] = useState(cached?.partyPipeline ?? {});
  const [vouchers, setVouchers] = useState(cached?.vouchers ?? []);
  const [items, setItems] = useState(cached?.items ?? []);
  const [itemCategories, setItemCategories] = useState(cached?.itemCategories ?? []);
  const [stockMovements, setStockMovements] = useState(cached?.stockMovements ?? []);
  const [voucherItemLines, setVoucherItemLines] = useState(cached?.voucherItemLines ?? []);
  const [inventorySettings, setInventorySettings] = useState({ available: false, allowNegativeStock: false });
  const [audit, setAudit] = useState([]);
  const [locks, setLocks] = useState([]);
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [search, setSearch] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const fy = useMemo(() => indianFinancialYear(todayIso()), []);
  const lastFy = useMemo(() => previousIndianFinancialYear(todayIso()), []);
  const [rangeFrom, setRangeFrom] = useState(fy.from);
  const [rangeTo, setRangeTo] = useState(fy.to);
  const range = useMemo(() => ({ from: rangeFrom, to: rangeTo }), [rangeFrom, rangeTo]);
  const intelligencePreviousRange = useMemo(
    () => previousComparisonRange({ from: range.from, to: range.to, fy, lastFy }),
    [range, fy, lastFy],
  );
  const submitLock = useMemo(() => createSubmitLock(), []);
  const [saving, setSaving] = useState(false);
  const [showVoucher, setShowVoucher] = useState(false);
  const [showParty, setShowParty] = useState(false);
  const [showCoa, setShowCoa] = useState(false);
  const [voucherType, setVoucherType] = useState("receipt");
  const [voucherForm, setVoucherForm] = useState(emptyVoucherForm);
  const [voucherRequestId, setVoucherRequestId] = useState(() => newClientRequestId());
  const [simpleRequestId, setSimpleRequestId] = useState(() => newClientRequestId());
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [partyForm, setPartyForm] = useState(emptyPartyForm);
  const [partyImportStatus, setPartyImportStatus] = useState("");
  const [coaForm, setCoaForm] = useState(emptyCoaForm);
  const [setupForm, setSetupForm] = useState({ companyName: "", booksStartedOn: todayIso() });
  const [lockForm, setLockForm] = useState({ from: fy.from, to: fy.to, reason: "" });
  const [bankForm, setBankForm] = useState({
    coaId: "",
    statementDate: todayIso(),
    openingBalance: "",
    closingBalance: "",
    lines: [emptyBankLine()],
  });
  const [bankImport, setBankImport] = useState(null);
  const [bankImportMapping, setBankImportMapping] = useState({});
  const [matchChoice, setMatchChoice] = useState({});
  const [pendingBankMatch, setPendingBankMatch] = useState(null);
  const [accountsRoles, setAccountsRoles] = useState([]);
  const [accountsAccessRole, setAccountsAccessRole] = useState(workspace?.role === "owner" ? "owner" : null);
  const [roleDraft, setRoleDraft] = useState({ userId: "", role: "accountant" });
  const [inviteDraft, setInviteDraft] = useState({ email: "", role: "viewer", note: "" });
  const [inviteEmailDraft, setInviteEmailDraft] = useState(null);
  const [teamInvites, setTeamInvites] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState(cached?.recurringTemplates ?? []);
  const [recurringDraft, setRecurringDraft] = useState(() => emptyRecurringDraft());
  const [pendingRecurringId, setPendingRecurringId] = useState(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [restoreDraft, setRestoreDraft] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [showSimple, setShowSimple] = useState(false);
  const [simpleKind, setSimpleKind] = useState("sale");
  const [simpleForm, setSimpleForm] = useState(emptySimpleForm);
  const [reasonDialog, setReasonDialog] = useState(null);
  const [reasonText, setReasonText] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [partyFocusId, setPartyFocusId] = useState("");
  const [partyTxnType, setPartyTxnType] = useState("");
  const [partyFrom, setPartyFrom] = useState(fy.from);
  const [partyTo, setPartyTo] = useState(fy.to);
  const [partyTypeFilter, setPartyTypeFilter] = useState("all");
  const [partySearch, setPartySearch] = useState("");
  const [partyDeleteDialog, setPartyDeleteDialog] = useState(null);
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [companies, setCompanies] = useState(cached?.companies ?? []);
  const [activeCompanyId, setActiveCompanyId] = useState(cached?.activeCompanyId ?? "");
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({ name: "", booksStartedOn: todayIso(), industry: "retail" });
  const [gstForm, setGstForm] = useState(cached?.gstForm ?? { gstRegistration: "unregistered", gstin: "", legalName: "", stateCode: "" });
  const [listPage, setListPage] = useState(1);
  const [expandedVoucherId, setExpandedVoucherId] = useState(null);
  const [voucherAttachments, setVoucherAttachments] = useState([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const deferredPartySearch = useDeferredValue(partySearch);
  const sectionRef = useRef(section);
  const refreshGen = useRef(0);
  const hasLoadedRef = useRef(Boolean(cached));
  sectionRef.current = section;

  const refresh = useCallback(async (preferredCompanyId) => {
    const gen = ++refreshGen.current;
    // Soft refresh after first load — avoid full-page skeleton that unmounts onboarding mid-flow.
    if (!hasLoadedRef.current) setLoading(true);
    setError("");
    try {
      const inFlight = !preferredCompanyId ? inFlightAccountsPrefetch(token) : null;
      const bundle = (inFlight && await inFlight.catch(() => null))
        || await fetchAccountsBundle(token, {
          preferredCompanyId,
          wantRecurring: sectionRef.current === "overview" || sectionRef.current === "bank",
        });
      if (gen !== refreshGen.current) return;
      setCompanies(bundle.companies);
      setActiveCompanyId(bundle.activeCompanyId);
      if (bundle.gstForm) setGstForm(bundle.gstForm);
      setSettings(bundle.settings);
      setAccounts(bundle.accounts);
      setParties(bundle.parties);
      setPartyPipeline(bundle.partyPipeline);
      setVouchers(bundle.vouchers);
      setItems(bundle.items);
      setItemCategories(bundle.itemCategories);
      setStockMovements(bundle.stockMovements);
      setVoucherItemLines(bundle.voucherItemLines);
      // Setup (audit, locks, roles, invites) and bank-statement data are loaded
      // by the section-specific effect below.
      if (bundle.recurringFetched) setRecurringTemplates(bundle.recurringTemplates);
      setMigrationRequired(false);
      if (bundle.settings?.companyName || bundle.settings?.booksStartedOn) {
        setSetupForm({ companyName: bundle.settings.companyName, booksStartedOn: bundle.settings.booksStartedOn || todayIso() });
      }
    } catch (err) {
      if (gen !== refreshGen.current) return;
      if (err.code === "MIGRATION_REQUIRED") setMigrationRequired(true);
      else setError(err.message || "Could not load Accounts.");
    } finally {
      if (gen === refreshGen.current) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    claimTeamInvites(token).then(result => {
      if (cancelled) return;
      const claimed = Number(result?.claimed || 0);
      if (claimed > 0) {
        setNotice(`Accounts access claimed for ${claimed} invite${claimed === 1 ? "" : "s"}.`);
        loadAccountsAccessRole(token).then(role => {
          if (!cancelled && role) setAccountsAccessRole(role);
        }).catch(() => {});
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    loadAccountsAccessRole(token).then(role => {
      if (cancelled) return;
      if (role) setAccountsAccessRole(role);
      else if (workspace?.role === "owner") setAccountsAccessRole("owner");
    }).catch(() => {
      if (!cancelled && workspace?.role === "owner") setAccountsAccessRole("owner");
    });
    return () => { cancelled = true; };
  }, [token, workspace?.role]);

  const canWrite = accountsAccessRole === "owner" || accountsAccessRole === "accountant";
  const canAdmin = accountsAccessRole === "owner";
  const readOnly = Boolean(accountsAccessRole) && !canWrite;
  const manufacturingEnabled = Boolean(activeCompanyId) && readIndustry(activeCompanyId) === "manufacturing";
  // Keep the wizard mounted across refresh()/loading so Continue does not
  // unmount mid-flow (that looked like “Step 1/6 finishes in 2 steps”).
  const showOnboarding = Boolean(
    settings
    && activeCompanyId
    && !migrationRequired
    && !onboardingDismissed
    && !isAccountsOnboardingDone(activeCompanyId),
  );

  useEffect(() => {
    if (orgSettingsProp && Object.keys(orgSettingsProp).length) setOrgSettings(orgSettingsProp);
  }, [orgSettingsProp]);

  useEffect(() => {
    if (!token || (orgSettingsProp && Object.keys(orgSettingsProp).length)) return undefined;
    let cancelled = false;
    loadOrganizationSettings(token)
      .then(next => { if (!cancelled && next) setOrgSettings(next); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, orgSettingsProp]);

  useEffect(() => {
    if (!pendingSalesInvoiceId) return;
    const voucher = vouchers.find(item => item.id === pendingSalesInvoiceId);
    if (!voucher || voucher.voucherType !== "sales") return;
    const party = parties.find(item => item.id === voucher.partyId) || null;
    const company = companies.find(item => item.id === activeCompanyId) || companies[0] || null;
    setSalesInvoiceSuccess(buildSalesInvoice({
      voucher,
      party,
      accounts,
      company,
      workspace,
      itemLines: voucherItemLines.filter(line => line.voucherId === voucher.id),
    }));
    setPendingSalesInvoiceId(null);
  }, [pendingSalesInvoiceId, vouchers, parties, accounts, companies, activeCompanyId, workspace, voucherItemLines]);

  useEffect(() => {
    if (!token || !expandedVoucherId || migrationRequired) {
      setVoucherAttachments([]);
      return undefined;
    }
    let cancelled = false;
    loadVoucherAttachments(token, expandedVoucherId)
      .then(rows => { if (!cancelled) setVoucherAttachments(rows); })
      .catch(err => {
        if (cancelled) return;
        if (err.code === "MIGRATION_REQUIRED") setVoucherAttachments([]);
        else setError(err.message || "Could not load attachments.");
      });
    return () => { cancelled = true; };
  }, [token, expandedVoucherId, migrationRequired]);

  useEffect(() => {
    if (!token || migrationRequired || section !== "inventory") return undefined;
    let cancelled = false;
    loadInventorySettings(token)
      .then(next => { if (!cancelled) setInventorySettings(next); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [section, token, activeCompanyId, migrationRequired]);

  useEffect(() => {
    if (!token || migrationRequired) return undefined;
    if (section !== "setup" && section !== "bank" && section !== "overview") return undefined;
    let cancelled = false;
    const loadExtras = async () => {
      try {
        if (section === "setup") {
          const [nextAudit, nextLocks, nextRoles, nextInvites, nextRecurring] = await Promise.all([
            loadAuditLog(token),
            loadPeriodLocks(token),
            loadAccountsRoles(token).catch(() => []),
            listTeamInvites(token).catch(() => []),
            loadRecurringTemplates(token).catch(() => []),
          ]);
          if (!cancelled) {
            setAudit(nextAudit);
            setLocks(nextLocks);
            setAccountsRoles(nextRoles || []);
            setTeamInvites(nextInvites || []);
            setRecurringTemplates(nextRecurring || []);
          }
          return;
        }
        const nextStatements = await loadBankStatements(token).catch(() => []);
        if (!cancelled) setStatements(nextStatements || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load this screen.");
      }
    };
    loadExtras();
    return () => { cancelled = true; };
  }, [section, token, activeCompanyId, migrationRequired]);

  useEffect(() => { setListPage(1); setExpandedVoucherId(null); }, [section, reportTab, deferredSearch, ledgerId, partyTypeFilter, deferredPartySearch]);

  const visibleAccounts = useMemo(
    () => standaloneVisibleAccounts(accounts, { integrationEnabled: settings?.integrationEnabled }),
    [accounts, settings],
  );
  const moreLinks = MORE_LINKS;
  const reportId = section === "pnl" || section === "balance" || section === "trial" ? section : (section === "reports" ? reportTab : "");
  const wantOverview = section === "overview";
  const wantTrial = reportId === "trial";
  const wantPnl = reportId === "pnl";
  const wantSheet = reportId === "balance";
  const wantFlow = reportId === "cashflow";
  const wantDayBook = reportId === "daybook" || reportId === "sales" || reportId === "purchases";
  const wantGst = reportId === "gst";
  const wantInvoices = section === "receivables" || section === "payables" || reportId === "receivables" || reportId === "payables";
  const wantArAp = wantOverview || wantInvoices || section === "setup";
  const wantLedger = section === "ledger";
  const wantPartyBook = section === "parties";

  useEffect(() => {
    if (ledgerId && !visibleAccounts.some(account => account.id === ledgerId) && visibleAccounts[0]) {
      setLedgerId(visibleAccounts[0].id);
    }
  }, [ledgerId, visibleAccounts]);

  const wantStockValue = wantOverview || wantPnl || wantSheet;
  const periodStock = useMemo(
    () => (wantStockValue && items.length
      ? periodStockValues({ items, movements: stockMovements, voucherItemLines, from: range.from, to: range.to })
      : null),
    [wantStockValue, items, stockMovements, voucherItemLines, range],
  );
  const metrics = useMemo(
    () => (wantOverview ? dashboardMetrics(visibleAccounts, vouchers, parties, { today: todayIso(), ...range, stock: periodStock }) : null),
    [wantOverview, visibleAccounts, vouchers, parties, range, periodStock],
  );
  const tb = useMemo(
    () => (wantTrial ? trialBalance(visibleAccounts, vouchers, range) : { rows: [], totalDebit: 0, totalCredit: 0, balanced: true }),
    [wantTrial, visibleAccounts, vouchers, range],
  );
  const pnl = useMemo(
    () => (wantPnl ? profitAndLoss(visibleAccounts, vouchers, range, { stock: periodStock }) : { income: [], expenses: [], totalIncome: 0, totalExpense: 0, openingStock: 0, closingStock: 0, stockAdjustment: 0, net: 0 }),
    [wantPnl, visibleAccounts, vouchers, range, periodStock],
  );
  const sheet = useMemo(
    () => (wantSheet ? balanceSheet(visibleAccounts, vouchers, range, { stock: periodStock }) : { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0, netProfit: 0, balanced: true }),
    [wantSheet, visibleAccounts, vouchers, range, periodStock],
  );
  const flow = useMemo(
    () => (wantFlow ? cashFlow(visibleAccounts, vouchers, range) : { inflow: 0, outflow: 0, transfers: 0, net: 0 }),
    [wantFlow, visibleAccounts, vouchers, range],
  );
  const books = useMemo(() => (wantDayBook ? dayBook(vouchers, range) : []), [wantDayBook, vouchers, range]);
  const ar = useMemo(
    () => (wantArAp ? partyBalances(accounts, vouchers, parties, { kind: "receivable", ...range }) : []),
    [wantArAp, accounts, vouchers, parties, range],
  );
  const ap = useMemo(
    () => (wantArAp ? partyBalances(accounts, vouchers, parties, { kind: "payable", ...range }) : []),
    [wantArAp, accounts, vouchers, parties, range],
  );
  const arInvoices = useMemo(
    () => (wantInvoices && (section === "receivables" || reportId === "receivables")
      ? invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: todayIso(), ...range, outstandingOnly })
      : []),
    [wantInvoices, section, reportId, accounts, vouchers, parties, range, outstandingOnly],
  );
  const apInvoices = useMemo(
    () => (wantInvoices && (section === "payables" || reportId === "payables")
      ? invoiceRegister(accounts, vouchers, parties, { kind: "payable", today: todayIso(), ...range, outstandingOnly })
      : []),
    [wantInvoices, section, reportId, accounts, vouchers, parties, range, outstandingOnly],
  );
  const overviewArAging = useMemo(
    () => (wantOverview
      ? invoiceAgingTotals(invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: todayIso(), ...range, outstandingOnly: true }))
      : { current: 0, overdue: 0, total: 0 }),
    [wantOverview, accounts, vouchers, parties, range],
  );
  const overviewApAging = useMemo(
    () => (wantOverview
      ? invoiceAgingTotals(invoiceRegister(accounts, vouchers, parties, { kind: "payable", today: todayIso(), ...range, outstandingOnly: true }))
      : { current: 0, overdue: 0, total: 0 }),
    [wantOverview, accounts, vouchers, parties, range],
  );
  const salesRows = useMemo(() => books.filter(row => row.voucherType === "sales"), [books]);
  const purchaseRows = useMemo(() => books.filter(row => row.voucherType === "purchase"), [books]);
  const gstReport = useMemo(
    () => (wantGst ? gstBooksReport(vouchers, range) : { rows: [], output: [], input: [], byRate: [], byHsn: [], outputTax: 0, inputTax: 0, netPayable: 0 }),
    [wantGst, vouchers, range],
  );
  const activeCompany = useMemo(() => companies.find(item => item.id === activeCompanyId) || companies[0] || null, [companies, activeCompanyId]);
  const settlementOpenInvoices = useMemo(() => {
    if (!showSimple || !["receipt", "payment", "credit_note", "debit_note"].includes(simpleKind)) return [];
    const kind = simpleKind === "receipt" || simpleKind === "credit_note" ? "receivable" : "payable";
    return invoiceRegister(accounts, vouchers, parties, {
      kind,
      today: todayIso(),
      outstandingOnly: true,
    });
  }, [showSimple, simpleKind, accounts, vouchers, parties]);
  const accountsAttention = useMemo(() => {
    if (!wantOverview) return null;
    const overdueInvoices = invoiceRegister(accounts, vouchers, parties, {
      kind: "receivable",
      today: todayIso(),
      ...range,
      outstandingOnly: true,
    }).filter(row => Number(row.daysOverdue || 0) > 0);
    const lowStockCount = items.filter(item => {
      const stock = currentStockForItem(item, stockMovements);
      const reorder = Number(item.reorderLevel || 0);
      return reorder > 0 && stock < reorder;
    }).length;
    const unmatchedBankLines = (statements || []).reduce((sum, statement) => {
      const lines = statement.lines || [];
      return sum + lines.filter(line => line.matchStatus !== "matched" && line.matchStatus !== "ignored").length;
    }, 0);
    const itemsList = buildAccountsAttentionItems({
      overdueReceivables: overdueInvoices.reduce((sum, row) => sum + Number(row.outstanding || 0), 0),
      overdueInvoiceCount: overdueInvoices.length,
      lowStockCount,
      unmatchedBankLines,
      gstEntryCount: activeCompany?.gstRegistration && activeCompany.gstRegistration !== "unregistered"
        ? new Set(gstBooksReport(vouchers, range).rows.map(row => `${row.voucherType}:${row.voucherNumber}`)).size
        : 0,
    });
    return {
      summary: itemsList.length ? `${itemsList.length} Accounts item${itemsList.length === 1 ? "" : "s"} need review` : "Accounts look clear",
      count: itemsList.length,
      items: itemsList,
      disclaimer: "Advisory only — never changes books.",
    };
  }, [wantOverview, accounts, vouchers, parties, range, items, stockMovements, statements, activeCompany]);
  const stockByItem = useMemo(() => {
    const map = {};
    for (const item of items) map[item.id] = currentStockForItem(item, stockMovements);
    return map;
  }, [items, stockMovements]);
  const itemSalesRows = useMemo(() => itemSalesReport(voucherItemLines, vouchers, range), [voucherItemLines, vouchers, range]);
  const itemPurchaseRows = useMemo(() => itemPurchasesReport(voucherItemLines, vouchers, range), [voucherItemLines, vouchers, range]);
  const stockMoveRows = useMemo(() => stockMovementReport(stockMovements, items, range).slice(0, 200), [stockMovements, items, range]);
  const focusedParty = useMemo(() => parties.find(party => party.id === partyFocusId) || parties[0] || null, [parties, partyFocusId]);
  const setupParties = useMemo(
    () => filterParties(parties, { type: partyTypeFilter, search: deferredPartySearch }),
    [parties, partyTypeFilter, deferredPartySearch],
  );
  const partyCountByType = useMemo(() => {
    const counts = { all: parties.length };
    for (const type of PARTY_TYPES) counts[type.id] = parties.filter(party => party.partyType === type.id).length;
    return counts;
  }, [parties]);
  const outstandingByParty = useMemo(() => {
    const map = new Map();
    for (const row of ar) map.set(row.id, { kind: "receivable", balance: row.balance });
    for (const row of ap) {
      if (!map.has(row.id) || Math.abs(row.balance) > Math.abs(map.get(row.id).balance)) {
        map.set(row.id, { kind: "payable", balance: row.balance });
      }
    }
    return map;
  }, [ar, ap]);
  const partyBook = useMemo(() => (wantPartyBook ? partyLedger(accounts, vouchers, focusedParty, {
    from: partyFrom,
    to: partyTo,
    voucherType: partyTxnType || undefined,
  }) : { party: focusedParty, rows: [], opening: 0, closing: 0, outstanding: 0 }), [wantPartyBook, accounts, vouchers, focusedParty, partyFrom, partyTo, partyTxnType]);
  const ledger = useMemo(
    () => (wantLedger ? accountLedger(accounts, vouchers, ledgerId, range) : { account: null, rows: [] }),
    [wantLedger, accounts, vouchers, ledgerId, range],
  );
  const q = String(deferredSearch || "").trim().toLowerCase();
  const shownVouchers = useMemo(() => vouchers.filter(voucher => {
    if (!q) return true;
    return `${voucher.voucherNumber} ${voucher.narration} ${voucher.voucherType}`.toLowerCase().includes(q);
  }), [vouchers, q]);
  const pagedVouchers = useMemo(() => pageSlice(shownVouchers, listPage), [shownVouchers, listPage]);
  const pagedLedger = useMemo(() => pageSlice(ledger.rows, listPage), [ledger.rows, listPage]);
  const pagedBooks = useMemo(() => pageSlice(books, listPage), [books, listPage]);
  const pagedAudit = useMemo(() => pageSlice(audit, listPage), [audit, listPage]);
  const pagedArInvoices = useMemo(() => pageSlice(arInvoices, listPage), [arInvoices, listPage]);
  const pagedApInvoices = useMemo(() => pageSlice(apInvoices, listPage), [apInvoices, listPage]);
  const pagedSetupParties = useMemo(() => pageSlice(setupParties, listPage), [setupParties, listPage]);
  const pagedPartyBook = useMemo(() => pageSlice(partyBook.rows, listPage), [partyBook.rows, listPage]);
  const pagedGstOutput = useMemo(() => pageSlice(gstReport.output, listPage), [gstReport.output, listPage]);
  const bankAccounts = useMemo(() => accounts.filter(account => account.accountType === "bank" && account.isActive !== false), [accounts]);
  const matchedLineIds = useMemo(() => new Set(
    statements.flatMap(statement => statement.lines.map(line => line.matchedVoucherLineId).filter(Boolean)),
  ), [statements]);

  const setReportRange = (from, to) => {
    if (from) setRangeFrom(from);
    if (to) setRangeTo(to);
  };

  const openSection = id => {
    if (id === "cashbook") {
      if (onOpenCashbook) onOpenCashbook();
      else close();
      return;
    }
    if (id === "gst") {
      setSection("reports");
      setReportTab("gst");
      window.scrollTo(0, 0);
      return;
    }
    setSection(id);
    if (id === "trial") setReportTab("trial");
    if (id === "pnl") setReportTab("pnl");
    if (id === "balance") setReportTab("balance");
    if (id === "reports") setReportTab("daybook");
    window.scrollTo(0, 0);
  };

  const switchCompany = id => {
    setAccounts([]);
    setParties([]);
    setVouchers([]);
    setStatements([]);
    setAudit([]);
    setLocks([]);
    setLedgerId("");
    setMatchChoice({});
    setTeamInvites([]);
    setRecurringTemplates([]);
    setOnboardingDismissed(false);
    refresh(id);
  };

  const archiveCompany = company => {
    if (company?.isPrimary) {
      setError("The primary company cannot be archived.");
      return;
    }
    askReason("Archive company", "Archive company", reason => run(async () => {
      await archiveAccountsCompany(token, company.id, reason);
      if (company.id === activeCompanyId) {
        const fallback = companies.find(item => item.isPrimary)?.id
          || companies.find(item => item.id !== company.id && item.status !== "archived")?.id
          || "";
        try { sessionStorage.setItem(COMPANY_STORAGE_KEY, fallback); } catch { /* ignore */ }
      }
    }, "Company archived."));
  };

  const toggleNav = () => {
    setNavExpanded(current => {
      const next = !current;
      try { sessionStorage.setItem(NAV_STORAGE_KEY, next ? "expanded" : "collapsed"); } catch { /* ignore */ }
      return next;
    });
  };

  const requestLogout = () => {
    if (!logout) return;
    setConfirmLogout(true);
  };

  const confirmAccountsLogout = async () => {
    if (!logout || signingOut) return;
    setSigningOut(true);
    try {
      sessionStorage.setItem("fintrack-login-context", "accounts");
      sessionStorage.setItem("fintrack-open-accounts", "1");
      clearAccountsSnapshot();
      await logout({ from: "accounts" });
    } finally {
      setSigningOut(false);
      setConfirmLogout(false);
    }
  };

  const recentVouchers = useMemo(
    () => [...vouchers].sort((a, b) => `${b.date}${b.voucherNumber}`.localeCompare(`${a.date}${a.voucherNumber}`)).slice(0, 5),
    [vouchers],
  );

  const run = async (work, success) => {
    let ok = false;
    const outcome = await submitLock.run(async () => {
      setSaving(true);
      setError("");
      setNotice("");
      try {
        const workResult = await work();
        // Only a returned company UUID is meaningful to the refresh helper.
        // Other save actions may return payloads for their own callers.
        const preferredCompanyId = typeof workResult === "string" && workResult ? workResult : undefined;
        setNotice(success);
        await refresh(preferredCompanyId || undefined);
        ok = true;
      } catch (err) {
        setError(err.message || "Could not save.");
      } finally {
        setSaving(false);
      }
    });
    if (outcome.skipped) return false;
    return ok;
  };

  const saveItemRecord = async form => {
    const savedId = await upsertItem(token, form);
    const itemId = form.id || savedId;
    if (form.itemType !== "product" || typeof itemId !== "string") return;
    const previous = items.find(item => item.id === itemId)?.openingRate ?? null;
    const next = String(form.openingRate ?? "").trim() === "" ? null : Number(form.openingRate);
    if (previous !== next) await setItemOpeningRate(token, itemId, next);
  };

  const importItems = async rows => {
    setSaving(true);
    setError("");
    const categoryIds = new Map(itemCategories.map(category => [category.name.trim().toLowerCase(), category.id]));
    let imported = 0;
    const failed = [];
    try {
      for (const row of rows) {
        try {
          let categoryId = null;
          const categoryKey = row.categoryName.trim().toLowerCase();
          if (categoryKey) {
            if (!categoryIds.has(categoryKey)) categoryIds.set(categoryKey, await upsertItemCategory(token, { name: row.categoryName.trim() }));
            categoryId = categoryIds.get(categoryKey) || null;
          }
          const itemId = await upsertItem(token, { ...row, categoryId });
          if (row.itemType === "product" && row.openingRate !== "" && typeof itemId === "string") {
            await setItemOpeningRate(token, itemId, row.openingRate);
          }
          imported += 1;
        } catch (err) {
          failed.push(`${row.sku}: ${err?.message || "could not save"}`);
        }
      }
      if (failed.length) setError(`Some items were not imported. ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}`);
      if (imported) await refresh();
    } finally {
      setSaving(false);
    }
    return `${imported} item${imported === 1 ? "" : "s"} imported.${failed.length ? ` ${failed.length} failed.` : ""}`;
  };

  // Each variance is its own stock RPC; report how far a partial run got.
  const applyPhysicalCount = ({ date, variances }) => run(async () => {
    let posted = 0;
    for (const row of variances) {
      try {
        await adjustStock(token, { itemId: row.itemId, date, quantityDelta: row.quantityDelta, reasonNote: `Physical stock count ${date}` });
        posted += 1;
      } catch (err) {
        throw new Error(`${row.name}: ${err.message || "could not adjust"}${posted ? ` (${posted} of ${variances.length} adjustments already posted)` : ""}`);
      }
    }
  }, `${variances.length} stock adjustment${variances.length === 1 ? "" : "s"} posted from the physical count.`);

  const saveStockRules = async payload => {
    const ok = await run(() => saveInventorySettings(token, payload), payload.allowNegativeStock ? "Negative stock allowed." : "Negative stock blocked.");
    if (ok) setInventorySettings(current => ({ ...current, allowNegativeStock: Boolean(payload.allowNegativeStock) }));
  };

  // Two stock RPCs cannot share a transaction, so undo the material
  // consumption if the finished-goods increase fails.
  const recordProductionRun = ({ date, note, materialId, materialQty, outputId, outputQty }) => run(async () => {
    await adjustStock(token, { itemId: materialId, date, quantityDelta: -materialQty, reasonNote: `${note} · material consumed` });
    try {
      await adjustStock(token, { itemId: outputId, date, quantityDelta: outputQty, reasonNote: `${note} · finished goods produced` });
    } catch (err) {
      try {
        await adjustStock(token, { itemId: materialId, date, quantityDelta: materialQty, reasonNote: `${note} · reversed (output failed)` });
      } catch {
        throw new Error(`Finished goods were not added and the material deduction could not be reversed. Add ${materialQty} back to the material in Items. (${err.message || "Unknown error"})`);
      }
      throw err;
    }
  }, "Production run saved.");

  const submitVoucher = () => run(async () => {
    assertVoucherDateNotFuture(voucherForm.date);
    const payload = {
      voucherType,
      date: voucherForm.date,
      dueDate: voucherForm.dueDate || null,
      narration: voucherForm.narration,
      partyId: voucherForm.partyId || null,
      lines: lines.map(line => ({
        coaId: line.coaId,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: voucherForm.narration,
        partyId: voucherForm.partyId || null,
      })),
    };
    assertBalancedVoucher(payload.lines);
    const voucherId = await postVoucher(token, { ...payload, clientRequestId: voucherRequestId });
    setShowVoucher(false);
    setVoucherForm(emptyVoucherForm());
    setLines([emptyLine(), emptyLine()]);
    setVoucherRequestId(newClientRequestId());
    if (voucherType === "sales") setPendingSalesInvoiceId(voucherId);
  }, "Voucher saved successfully");

const openVoucher = () => {
    if (!canWrite) {
      setError("Your Accounts role is view-only.");
      return;
    }
    setVoucherForm(emptyVoucherForm());
    setLines([emptyLine(), emptyLine()]);
    setVoucherRequestId(newClientRequestId());
    setShowVoucher(true);
  };

  const duplicateVoucher = voucher => {
    setVoucherType(voucher.voucherType || "journal");
    setVoucherForm({
      date: todayIso(),
      narration: voucher.narration || "",
      partyId: voucher.partyId || "",
      dueDate: addDaysIso(todayIso(), 7),
    });
    const copied = (voucher.lines || []).map(line => ({
      coaId: line.coaId || "",
      debit: line.debit ? String(line.debit) : "",
      credit: line.credit ? String(line.credit) : "",
      description: line.description || "",
    }));
    setLines(copied.length >= 2 ? copied : [...copied, emptyLine(), emptyLine()].slice(0, Math.max(2, copied.length)));
    setVoucherRequestId(newClientRequestId());
    setShowVoucher(true);
  };

  const showAdjacentVoucher = (voucherId, delta) => {
    const index = shownVouchers.findIndex(item => item.id === voucherId);
    if (index < 0) return;
    const next = shownVouchers[index + delta];
    if (next) setExpandedVoucherId(next.id);
  };

  const reloadExpandedAttachments = async voucherId => {
    const rows = await loadVoucherAttachments(token, voucherId);
    setVoucherAttachments(rows);
  };

  const onAttachVoucherFile = async (voucher, file) => {
    if (!file || attachmentBusy) return;
    setAttachmentBusy(true);
    setError("");
    try {
      const meta = assertVoucherAttachmentMeta({
        fileName: file.name,
        contentType: normalizeAttachmentContentType(file.type, file.name),
        byteSize: file.size,
      });
      const contentBase64 = await readFileAsBase64(file);
      await addVoucherAttachment(token, {
        voucherId: voucher.id,
        fileName: meta.fileName,
        contentType: meta.contentType,
        contentBase64,
      });
      await reloadExpandedAttachments(voucher.id);
      setNotice("Attachment saved.");
    } catch (err) {
      setError(err.message || "Could not save attachment.");
    } finally {
      setAttachmentBusy(false);
    }
  };

  const onDeleteAttachment = async (voucherId, attachmentId) => {
    if (attachmentBusy) return;
    setAttachmentBusy(true);
    setError("");
    try {
      await deleteVoucherAttachment(token, attachmentId);
      await reloadExpandedAttachments(voucherId);
      setNotice("Attachment removed.");
    } catch (err) {
      setError(err.message || "Could not remove attachment.");
    } finally {
      setAttachmentBusy(false);
    }
  };

  const closeVoucher = () => {
    if (saving) return;
    setShowVoucher(false);
    setVoucherForm(emptyVoucherForm());
    setLines([emptyLine(), emptyLine()]);
  };

  const openSimple = kind => {
    if (!canWrite) {
      setError("Your Accounts role is view-only. Ask the owner for accountant access to post entries.");
      return;
    }
    const money = moneyAccounts(visibleAccounts);
    setPendingBankMatch(null);
    setPendingRecurringId(null);
    setSimpleKind(kind);
    setSimpleRequestId(newClientRequestId());
    setSimpleForm({
      ...emptySimpleForm(),
      fromAccountId: money.find(account => account.accountType === "cash")?.id || money[0]?.id || "",
      toAccountId: money.find(account => account.accountType === "bank")?.id || money.find(account => account.id !== money[0]?.id)?.id || "",
    });
    setShowSimple(true);
  };

  const openSimpleFromBankLine = (line, statement) => {
    if (!canWrite) {
      setError("Your Accounts role is view-only.");
      return;
    }
    const kind = line.direction === "out" ? "payment" : "receipt";
    const moneyRows = moneyAccounts(visibleAccounts);
    setSimpleKind(kind);
    setSimpleRequestId(newClientRequestId());
    setPendingRecurringId(null);
    setPendingBankMatch({
      lineId: line.id,
      coaId: statement?.coaId || "",
      amount: Number(line.amount || 0),
      direction: line.direction || "in",
    });
    setSimpleForm({
      ...emptySimpleForm(),
      date: line.lineDate || todayIso(),
      amount: String(line.amount || ""),
      moneyMode: "bank",
      settlement: "cash",
      narration: [line.description, line.reference].filter(Boolean).join(" · ") || "Bank statement entry",
      fromAccountId: moneyRows.find(account => account.accountType === "cash")?.id || moneyRows[0]?.id || "",
      toAccountId: statement?.coaId || moneyRows.find(account => account.accountType === "bank")?.id || "",
    });
    setShowSimple(true);
    setNotice("Select the party, then save. FinTrack will suggest matching this bank line after posting.");
  };

  const openSimpleFromRecurring = template => {
    if (!canWrite) {
      setError("Your Accounts role is view-only.");
      return;
    }
    if (!template?.id) return;
    const moneyRows = moneyAccounts(visibleAccounts);
    setPendingBankMatch(null);
    setPendingRecurringId(template.id);
    setSimpleKind(template.kind || "sale");
    setSimpleRequestId(newClientRequestId());
    setSimpleForm({
      ...emptySimpleForm(),
      date: template.nextRunOn || todayIso(),
      amount: String(template.amount || ""),
      partyId: template.partyId || "",
      moneyMode: ["cash", "upi", "bank", "cash_upi"].includes(template.mode) ? template.mode : "cash",
      receivedCash: "",
      receivedUpi: "",
      narration: template.narration || template.name || "Recurring entry",
      fromAccountId: moneyRows.find(account => account.accountType === "cash")?.id || moneyRows[0]?.id || "",
      toAccountId: moneyRows.find(account => account.accountType === "bank")?.id || moneyRows.find(account => account.id !== moneyRows[0]?.id)?.id || "",
    });
    setShowSimple(true);
    setNotice("Review the recurring entry, then save. Next run date advances after posting.");
  };

  const acceptSuggestedBankMatches = (displayLines = []) => {
    if (!canWrite) {
      setError("Your Accounts role is view-only.");
      return;
    }
    const suggested = displayLines.filter(line => line.matchStatus === "suggested" && (matchChoice[line.id] || line.matchedVoucherLineId));
    if (!suggested.length) {
      setNotice("No high-confidence suggestions to accept.");
      return;
    }
    run(async () => {
      const used = new Set();
      let accepted = 0;
      for (const line of suggested) {
        const voucherLineId = matchChoice[line.id] || line.matchedVoucherLineId;
        if (!voucherLineId || used.has(voucherLineId)) continue;
        used.add(voucherLineId);
        await saveBankMatch(token, line.id, voucherLineId, "Accepted suggestion");
        accepted += 1;
      }
      if (!accepted) throw new Error("Could not accept suggestions — candidates may already be matched.");
    }, `Accepted ${suggested.length} bank match suggestion${suggested.length === 1 ? "" : "s"}.`);
  };

  const closeSimple = () => {
    if (saving) return;
    setShowSimple(false);
    setPendingBankMatch(null);
    setPendingRecurringId(null);
    setSimpleForm(emptySimpleForm());
  };

  const openParty = (party = null) => {
    if (party?.id) {
      setPartyForm({
        id: party.id,
        partyType: party.partyType || "customer",
        name: party.name || "",
        phone: party.phone || "",
        email: party.email || "",
        address: party.address || "",
        gstin: party.gstin || "",
        stateCode: party.stateCode || gstStateFromGstin(party.gstin),
        gstRegistration: party.gstRegistration || "",
        notes: party.notes || "",
      });
    } else {
      setPartyForm(emptyPartyForm());
    }
    setShowParty(true);
  };

  const closeParty = () => {
    if (saving) return;
    setShowParty(false);
    setPartyForm(emptyPartyForm());
  };

  const saveParty = () => {
    const message = validatePartyForm(partyForm);
    if (message) { setError(message); return; }
    const existing = partyForm.id ? parties.find(party => party.id === partyForm.id) : null;
    try {
      if (existing) assertCanChangePartyType(existing, partyForm.partyType, vouchers);
    } catch (err) {
      setError(err.message);
      return;
    }
    const createdLabel = partyForm.partyType === "customer" ? "Customer created successfully"
      : partyForm.partyType === "supplier" ? "Supplier created successfully"
      : "Party saved successfully";
    run(async () => {
      if (partyForm.id) await updateParty(token, partyForm);
      else await createParty(token, partyForm);
      setShowParty(false);
      setPartyForm(emptyPartyForm());
    }, partyForm.id ? "Party updated successfully" : createdLabel);
  };

  const importParties = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const rows = parsePartyCsv(await file.text());
    if (!rows.length) { setError("No valid party rows found. Use a CSV with a Name column."); return; }
    const { toCreate, duplicates } = planPartyImport(rows, parties);
    const skippedNote = duplicates.length ? ` ${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} skipped.` : "";
    if (!toCreate.length) { setPartyImportStatus(`Nothing to import.${skippedNote}`); return; }
    setPartyImportStatus(`Importing ${toCreate.length} parties…`);
    let imported = 0;
    const failed = [];
    for (const row of toCreate) {
      try {
        await createParty(token, { ...emptyPartyForm(), ...row });
        imported += 1;
      } catch (err) {
        failed.push(`${row.name}: ${err?.message || "could not save"}`);
      }
    }
    setPartyImportStatus(`${imported} ${imported === 1 ? "party" : "parties"} imported.${skippedNote}${failed.length ? ` ${failed.length} failed.` : ""}`);
    if (failed.length) setError(`Some parties were not imported. ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}`);
    if (imported) await refresh();
  };

  const requestDeleteParty = party => {
    if (!party?.id) return;
    if (partyHasAccountingUse(party.id, vouchers)) setPartyDeleteDialog({ mode: "blocked", party });
    else setPartyDeleteDialog({ mode: "confirm", party });
  };

  const confirmDeleteParty = () => {
    const party = partyDeleteDialog?.party;
    if (!party) return;
    try {
      assertCanDeleteParty(party, vouchers);
    } catch (err) {
      setPartyDeleteDialog({ mode: "blocked", party });
      setError(err.message);
      return;
    }
    run(async () => {
      await deleteParty(token, party.id);
      setPartyDeleteDialog(null);
    }, "Party deleted.");
  };

  const setPartyActiveState = (party, isActive) => {
    if (!party?.id) return;
    run(async () => {
      await setPartyActive(token, party.id, isActive);
      setPartyDeleteDialog(null);
    }, isActive ? "Party reactivated. Historical transactions are unchanged." : "Party deactivated. Historical transactions are unchanged.");
  };

  const clearPartyFilters = () => {
    setPartyTypeFilter("all");
    setPartySearch("");
  };

  const partyActions = party => (
    <div className="acc-party-actions acc-btn-group">
      <button type="button" className="btn" disabled={saving} onClick={() => openParty(party)}>Edit</button>
      <AccMoreMenu
        label="More"
        items={[
          party.isActive === false
            ? { id: "reactivate", label: "Reactivate", disabled: saving, onClick: () => setPartyActiveState(party, true) }
            : null,
          { id: "delete", label: "Delete", danger: true, disabled: saving, onClick: () => requestDeleteParty(party) },
        ]}
      />
    </div>
  );

  const submitSimple = () => run(async () => {
    const activeCompany = companies.find(item => item.id === activeCompanyId);
    const selectedParty = parties.find(party => party.id === simpleForm.partyId);
    const gstOn = activeCompany?.gstRegistration === "regular" && ["sale", "purchase", "credit_note", "debit_note"].includes(simpleKind);
    const partyState = selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin);
    const intra = isIntraGst(activeCompany?.stateCode, partyState);
    const useItems = usesItemLines(simpleKind, simpleForm);
    const moneyParts = simpleForm.moneyMode === "cash_upi"
      ? { cash: Number(simpleForm.receivedCash || 0), upi: Number(simpleForm.receivedUpi || 0) }
      : null;
    const needsMoneySplit = simpleForm.moneyMode === "cash_upi" && (
      simpleKind === "receipt"
      || simpleKind === "payment"
      || simpleKind === "expense"
      || ((simpleKind === "sale" || simpleKind === "purchase") && simpleForm.settlement === "paid")
      || (simpleKind === "sale" && simpleForm.settlement === "credit" && Number(simpleForm.amountReceived || 0) > 0)
    );
    if (needsMoneySplit) {
      const splitAmount = simpleKind === "sale" && simpleForm.settlement === "credit"
        ? Number(simpleForm.amountReceived || 0)
        : null; // validated after draft for paid sales (GST-inclusive total)
      if (splitAmount != null) assertMoneyModeSplit("cash_upi", splitAmount, moneyParts || {});
    }
    const draft = useItems
      ? itemizedEntryDraft({
        kind: simpleKind,
        accounts,
        date: simpleForm.date,
        partyId: simpleForm.partyId || null,
        moneyMode: simpleForm.moneyMode,
        moneyParts,
        settlement: simpleForm.settlement,
        dueDate: simpleForm.dueDate || null,
        narration: simpleForm.narration,
        itemLines: simpleForm.itemLines || [],
        intra,
        taxInclusive: false,
        gstEnabled: gstOn,
      })
      : simpleEntryDraft({
        kind: simpleKind,
        accounts,
        date: simpleForm.date,
        amount: simpleForm.amount,
        partyId: simpleForm.partyId || null,
        moneyMode: simpleForm.moneyMode,
        moneyParts,
        settlement: simpleForm.settlement,
        expenseCode: simpleForm.expenseCode,
        fromType: simpleForm.fromType,
        toType: simpleForm.toType,
        fromAccountId: simpleForm.fromAccountId || null,
        toAccountId: simpleForm.toAccountId || null,
        dueDate: simpleForm.dueDate || null,
        narration: simpleForm.narration,
        gst: gstOn ? {
          enabled: Number(simpleForm.gstRate) > 0,
          rate: simpleForm.gstRate,
          intra,
          taxInclusive: simpleForm.taxInclusive,
          hsnSac: simpleForm.hsnSac,
          itcEligible: simpleKind === "purchase" || simpleKind === "debit_note",
        } : undefined,
      });

    // Credit sale with amount received now: always post the FULL invoice, then a linked receipt.
    // Never shrink sales / GST / stock to the cash collected.
    let amountReceivedNow = 0;
    if (simpleKind === "sale" && simpleForm.settlement === "credit") {
      amountReceivedNow = roundMoney(Number(simpleForm.amountReceived || 0));
      const invoiceTotal = voucherTotals(draft.lines).debit;
      salePaymentSummary({ invoiceTotal, amountReceived: amountReceivedNow });
      if (amountReceivedNow > 0 && simpleForm.moneyMode === "cash_upi") {
        assertMoneyModeSplit(simpleForm.moneyMode, amountReceivedNow, moneyParts || {});
      }
    }

    const voucherId = await postVoucher(token, {
      ...draft,
      clientRequestId: simpleRequestId,
      settlements: (simpleKind === "receipt" || simpleKind === "payment" || simpleKind === "credit_note" || simpleKind === "debit_note")
        ? (simpleForm.settlements || []).filter(link => Number(link.amount || 0) > 0 && link.invoiceVoucherId)
        : undefined,
    });

    if (simpleKind === "sale" && simpleForm.settlement === "credit" && amountReceivedNow > 0 && voucherId) {
      const receiptDraft = simpleEntryDraft({
        kind: "receipt",
        accounts,
        date: simpleForm.date,
        amount: amountReceivedNow,
        partyId: simpleForm.partyId,
        moneyMode: simpleForm.moneyMode,
        moneyParts,
        narration: simpleForm.narration
          ? `Receipt against sale · ${simpleForm.narration}`
          : "Receipt against sale",
      });
      await postVoucher(token, {
        ...receiptDraft,
        clientRequestId: newClientRequestId(),
        settlements: [{ invoiceVoucherId: voucherId, amount: amountReceivedNow }],
      });
    }

    const pending = pendingBankMatch;
    const recurringId = pendingRecurringId;
    setShowSimple(false);
    setSimpleForm(emptySimpleForm());
    setSimpleRequestId(newClientRequestId());
    setPendingBankMatch(null);
    setPendingRecurringId(null);
    if (simpleKind === "sale") setPendingSalesInvoiceId(voucherId);
    if (recurringId) {
      try {
        await markRecurringRun(token, recurringId, todayIso());
      } catch {
        /* posting succeeded; schedule can be advanced manually */
      }
    }
    if (pending?.lineId && voucherId) {
      try {
        const nextVouchers = await loadVouchers(token);
        const created = (nextVouchers || []).find(item => item.id === voucherId);
        const bankLines = bankVoucherLines(accounts, created ? [created] : nextVouchers, pending.coaId, parties);
        const matchLine = bankLines.find(item => Math.abs(Number(item.amount || 0) - Number(pending.amount || 0)) < 0.01)
          || bankLines[0];
        if (matchLine?.id) {
          await saveBankMatch(token, pending.lineId, matchLine.id, "Created from bank statement");
        }
      } catch {
        /* posting succeeded; match can be done manually */
      }
    }
  }, `${SIMPLE_ENTRY_KINDS.find(item => item.id === simpleKind)?.label || "Entry"} saved successfully`);

  const openSalesInvoice = voucher => {
    if (!voucher || voucher.voucherType !== "sales") return;
    const party = parties.find(item => item.id === voucher.partyId) || null;
    setSalesInvoiceView(buildSalesInvoice({
      voucher,
      party,
      accounts,
      company: activeCompany,
      workspace,
      itemLines: voucherItemLines.filter(line => line.voucherId === voucher.id),
    }));
  };
  const openCoa = account => {
    if (account) {
      setCoaForm({
        id: account.id,
        code: account.code,
        name: account.name,
        groupType: account.groupType,
        accountType: account.accountType,
        openingBalance: account.openingBalance ? String(account.openingBalance) : "",
        openingSide: account.openingSide || accountNormalSide(account.groupType),
        isSystem: Boolean(account.isSystem),
        parentId: account.parentId || "",
      });
    } else {
      setCoaForm(emptyCoaForm());
    }
    setShowCoa(true);
  };

  const closeCoa = () => {
    if (saving) return;
    setShowCoa(false);
    setCoaForm(emptyCoaForm());
  };

  const saveCoa = () => {
    try {
      assertCoaParent(visibleAccounts, coaForm.id, coaForm.parentId);
      assertChartOpeningsBalanced(visibleAccounts, {
        id: coaForm.id || `new-${coaForm.code}`,
        openingBalance: Number(coaForm.openingBalance || 0),
        openingSide: coaForm.openingSide || "debit",
      });
    } catch (err) {
      setError(err.message);
      return;
    }
    run(async () => {
      if (coaForm.id) await updateChartAccount(token, coaForm);
      else await createChartAccount(token, coaForm);
      setShowCoa(false);
      setCoaForm(emptyCoaForm());
    }, coaForm.id ? "Account updated." : "Account added.");
  };

  const removeCoa = account => {
    try {
      assertCanDeleteLedger(account, vouchers);
    } catch (err) {
      setError(err.message);
      return;
    }
    if (!window.confirm(`Delete ${account.code} ${account.name}? This cannot be undone.`)) return;
    run(() => deleteChartAccount(token, account.id), "Account deleted.");
  };

  const patchBankLine = (index, patch) => setBankForm(current => ({
    ...current,
    lines: current.lines.map((row, i) => i === index ? { ...row, ...patch } : row),
  }));

  const submitBankStatement = () => run(async () => {
    const coaId = bankForm.coaId || bankAccounts[0]?.id;
    if (!coaId) throw new Error("Choose a bank account");
    const lines = bankForm.lines
      .filter(line => Number(line.amount) > 0)
      .map(line => ({
        line_date: line.lineDate,
        description: line.description,
        reference: line.reference || "",
        amount: Number(line.amount),
        direction: line.direction,
      }));
    if (!lines.length) throw new Error("Add at least one statement line with an amount");
    await addBankStatement(token, {
      coaId,
      statementDate: bankForm.statementDate,
      openingBalance: bankForm.openingBalance,
      closingBalance: bankForm.closingBalance,
      lines,
    });
    trackProductEvent("bank_statement_saved", { lines: lines.length });
    trackProductEventRpc(token, "bank_statement_saved", { lines: lines.length }).catch(() => {});
    setBankForm(current => ({ ...current, lines: [emptyBankLine()], openingBalance: "", closingBalance: "" }));
    setBankImport(null);
    setBankImportMapping({});
  }, "Bank statement saved. Accounting balances were not changed.");

  const onBankImportFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = await readBankStatementFile(file);
      const mapping = guessColumnMapping(parsed.headers);
      setBankImport(parsed);
      setBankImportMapping(mapping);
      trackProductEvent("bank_statement_import_parsed", { rows: parsed.rows.length });
    } catch (err) {
      setError(err.message || "Could not read bank statement file.");
    }
  };

  const applyBankImportMapping = () => {
    if (!bankImport) return;
    const mapped = mapBankImportRows({ ...bankImport, mapping: bankImportMapping });
    if (mapped.errors.length) {
      setError(mapped.errors.slice(0, 3).join(" "));
    }
    if (!mapped.lines.length) {
      setError("No statement lines found with the current column mapping.");
      return;
    }
    setBankForm(current => ({
      ...current,
      openingBalance: mapped.openingBalance || current.openingBalance,
      closingBalance: mapped.closingBalance || current.closingBalance,
      lines: mapped.lines.length ? mapped.lines : [emptyBankLine()],
    }));
    setNotice(`Imported ${mapped.lines.length} line(s). Review, then Save statement.`);
  };

  const downloadCompanyBackup = () => {
    try {
      const backup = buildAccountsCompanyBackup({
        company: companies.find(row => row.id === activeCompanyId) || { id: activeCompanyId, name: settings.companyName },
        settings,
        accounts,
        parties,
        items,
        vouchers,
        gstLines: [],
        voucherItemLines,
        stockMovements,
        statements,
        audit,
        periodLocks: locks,
      });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backupDownloadFilename(backup.company);
      anchor.click();
      URL.revokeObjectURL(url);
      trackProductEvent("accounts_backup_downloaded", { vouchers: vouchers.length });
      setNotice("Company backup downloaded. Keep it offline and company-specific.");
    } catch (err) {
      setError(err.message || "Backup failed.");
    }
  };

  const previewCompanyRestore = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const backup = parseAccountsCompanyBackup(await file.text());
      const active = companies.find(row => row.id === activeCompanyId);
      assertBackupRestorable(backup, { activeCompany: active || { id: activeCompanyId, name: settings.companyName }, vouchers });
      setRestoreDraft(backup);
      setNotice(`Backup ready for ${backup.company.name}: ${backup.counts?.vouchers || 0} vouchers, ${backup.counts?.parties || 0} parties. Confirm restore to import into this empty company.`);
    } catch (err) {
      setRestoreDraft(null);
      setError(err.message || "Invalid backup file.");
    }
  };

  const confirmCompanyRestore = () => {
    if (!restoreDraft || !canAdmin) return;
    const active = companies.find(row => row.id === activeCompanyId);
    run(async () => {
      setRestoreBusy(true);
      try {
        const result = await restoreAccountsCompanyBackup(token, restoreDraft, {
          activeCompany: active || { id: activeCompanyId, name: settings?.companyName },
          existingAccounts: accounts,
          existingVouchers: vouchers,
          onProgress: message => setNotice(message),
        });
        setRestoreDraft(null);
        trackProductEvent("accounts_backup_restored", { vouchers: result.vouchers || 0 });
        setNotice(`Restore finished: ${result.parties} parties, ${result.vouchers} vouchers, ${result.statements} statements. Voucher numbers were reassigned.`);
      } finally {
        setRestoreBusy(false);
      }
    }, "Company backup restored into this company only.");
  };

  const mobileTab = ["overview", "vouchers", "parties", "reports"].includes(section)
    ? section
    : section === "receivables" || section === "payables" ? "parties"
    : section === "pnl" || section === "balance" || section === "trial" ? "reports"
    : "more";

  const exportRows = () => {
    const active = ["receivables", "payables", "pnl", "balance", "trial"].includes(section) ? section : reportTab;
    const stamp = todayIso();
    if (active === "trial") {
      return { filename: `fintrack-trial-balance-${stamp}`, rows: [["Code", "Account", "Debit", "Credit"], ...tb.rows.map(row => [row.code, row.name, row.debit, row.credit]), ["", "Total", tb.totalDebit, tb.totalCredit]] };
    }
    if (active === "pnl") {
      return { filename: `fintrack-profit-loss-${stamp}`, rows: [["Section", "Account", "Amount"], ...pnl.income.map(row => ["Income", row.name, row.amount]), ["Income", "Total income", pnl.totalIncome], ...pnl.expenses.map(row => ["Expense", row.name, row.amount]), ["Expense", "Total expenses", pnl.totalExpense], ...(pnl.openingStock || pnl.closingStock ? [["Stock", "Opening stock", -pnl.openingStock], ["Stock", "Closing stock", pnl.closingStock]] : []), ["", "Net profit", pnl.net]] };
    }
    if (active === "balance") {
      return { filename: `fintrack-balance-sheet-${stamp}`, rows: [["Section", "Code", "Account", "Amount"], ...sheet.assets.map(row => ["Asset", row.code, row.name, row.balance]), ...sheet.liabilities.map(row => ["Liability", row.code, row.name, row.balance]), ...sheet.equity.map(row => ["Equity", row.code, row.name, row.balance])] };
    }
    if (active === "daybook") {
      return { filename: `fintrack-day-book-${stamp}`, rows: [["Date", "Number", "Type", "Narration", "Amount"], ...books.map(row => [row.date, row.voucherNumber, row.voucherType, row.narration, row.debit])] };
    }
    if (active === "receivables") {
      return { filename: `fintrack-receivables-${stamp}`, rows: [["Customer", "Invoice", "Invoice date", "Due date", "Amount", "Paid", "Outstanding", "Days outstanding", "Days overdue", "Status"], ...arInvoices.map(row => [row.partyName, row.reference, row.invoiceDate, row.dueDate, row.amount, row.paid, row.outstanding, row.daysOutstanding, row.daysOverdue, row.status])] };
    }
    if (active === "payables") {
      return { filename: `fintrack-payables-${stamp}`, rows: [["Supplier", "Invoice", "Invoice date", "Due date", "Amount", "Paid", "Outstanding", "Days overdue", "Status"], ...apInvoices.map(row => [row.partyName, row.reference, row.invoiceDate, row.dueDate, row.amount, row.paid, row.outstanding, row.daysOverdue, row.status])] };
    }
    if (active === "sales") {
      return { filename: `fintrack-sales-${stamp}`, rows: [["Date", "Number", "Narration", "Amount"], ...salesRows.map(row => [row.date, row.voucherNumber, row.narration, row.debit])] };
    }
    if (active === "purchases") {
      return { filename: `fintrack-purchases-${stamp}`, rows: [["Date", "Number", "Narration", "Amount"], ...purchaseRows.map(row => [row.date, row.voucherNumber, row.narration, row.debit])] };
    }
    if (active === "ledger") {
      return { filename: `fintrack-ledger-${stamp}`, rows: [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])] };
    }
    if (active === "gst") {
      return {
        filename: `fintrack-gst-books-${stamp}`,
        rows: [
          ["Date", "Voucher", "Type", "HSN / SAC", "Taxable", "Rate", "CGST", "SGST", "IGST", "Direction"],
          ...gstReport.rows.map(row => [row.date, row.voucherNumber, row.voucherType, row.hsnSac || "", row.taxable, row.rate, row.cgst, row.sgst, row.igst, row.direction]),
          ["", "", "", "Output GST", "", "", "", "", gstReport.outputTax, ""],
          ["", "", "", "Eligible ITC", "", "", "", "", gstReport.inputTax, ""],
          ["", "", "", "Net GST payable", "", "", "", "", gstReport.netPayable, ""],
        ],
      };
    }
    return { filename: `fintrack-cash-flow-${stamp}`, rows: [["Metric", "Amount"], ["Inflow", flow.inflow], ["Outflow", flow.outflow], ["Internal transfers (excluded)", flow.transfers || 0], ["Net", flow.net]] };
  };

  const exportReport = format => {
    setNotice("Preparing download…");
    window.setTimeout(() => {
      try {
        const { filename, rows } = exportRows();
        const active = ["receivables", "payables", "pnl", "balance", "trial"].includes(section) ? section : reportTab;
        const title = REPORT_TABS.find(item => item.id === active)?.label || "Accounts report";
        const subtitle = `${settings?.companyName || "FinTrack"} · ${rangeFrom} to ${rangeTo}`;
        if (format === "xlsx") downloadAccountsExcel(`${filename}.xlsx`, rows);
        else if (format === "pdf") downloadAccountsPdf(`${filename}.pdf`, { title, subtitle, rows });
        else downloadAccountsCsv(`${filename}.csv`, rows);
        setNotice("");
      } catch (err) {
        setNotice("");
        setError(err.message || "Could not export.");
      }
    }, 0);
  };

  const askReason = (title, confirmLabel, onConfirm) => {
    setReasonText("");
    setReasonDialog({ title, confirmLabel, onConfirm });
  };

  const submitReason = () => {
    const reason = String(reasonText || "").trim();
    if (!reason || !reasonDialog) return;
    const work = reasonDialog.onConfirm;
    setReasonDialog(null);
    setReasonText("");
    work(reason);
  };

  const invoiceStatusTone = status => {
    if (status === "Overdue") return "inv-overdue";
    if (status === "Due") return "inv-due";
    if (status === "Paid") return "inv-paid";
    if (status === "Partially Paid") return "inv-partial";
    return "inv-current";
  };
  const isInvoicePayables = section === "payables";
  const invoiceAging = invoiceAgingTotals(isInvoicePayables ? apInvoices : arInvoices);
  const pagedInvoiceRows = isInvoicePayables ? pagedApInvoices : pagedArInvoices;
  const invoicePartyRows = partyTotalsFromInvoices(isInvoicePayables ? apInvoices : arInvoices);

  const invoiceTable = (rows, kind) => {
    const emptyTitle = kind === "payable" ? "No outstanding payables" : "No outstanding receivables";
    const emptyCopy = kind === "payable"
      ? "Supplier invoices will appear here after you record a purchase."
      : "Customer invoices will appear here after you record a credit sale.";
    if (!rows.length) {
      return <AccEmpty title={emptyTitle} copy={emptyCopy} />;
    }
    return (
      <>
        <div className="table spacer acc-table-wrap accounts-invoice-table acc-invoice-desktop">
          <table>
            <thead>
              <tr>
                <th>{kind === "payable" ? "Supplier" : "Customer"}</th>
                <th>Invoice</th>
                <th>Invoice date</th>
                <th>Due date</th>
                <th className="acc-num">Amount</th>
                <th className="acc-num">Paid</th>
                <th className="acc-num">Outstanding</th>
                <th className="acc-num">Days overdue</th>
                <th>Status</th>
                <th>{kind === "payable" ? "Advice" : "Remind"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={row.status === "Overdue" ? "acc-invoice-overdue" : ""}>
                  <td>
                    <strong className="acc-invoice-party">{row.partyName}</strong>
                  </td>
                  <td><span className="acc-invoice-ref">{row.reference}</span></td>
                  <td>{row.invoiceDate}</td>
                  <td>{row.dueDate}</td>
                  <td className="acc-num">{money(row.amount)}</td>
                  <td className="acc-num acc-invoice-paid">{money(row.paid)}</td>
                  <td className={`acc-num acc-invoice-out${row.status === "Overdue" ? " is-overdue" : row.outstanding > 0 ? "" : " is-clear"}`}>{money(row.outstanding)}</td>
                  <td className="acc-num">{row.daysOverdue || 0}</td>
                  <td><span className={`acc-status-pill ${invoiceStatusTone(row.status)}`}>{row.status}</span></td>
                  <td className="acc-invoice-remind">
                    {kind === "payable"
                      ? <PaymentAdviceButton row={row} settings={orgSettings} company={activeCompany} workspace={workspace} compact />
                      : <ArReminderButton row={row} settings={orgSettings} company={activeCompany} workspace={workspace} compact />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="acc-invoice-cards spacer">
          {rows.map(row => (
            <article key={row.id} className={`card acc-invoice-card${row.status === "Overdue" ? " is-overdue" : ""}`}>
              <div className="acc-invoice-card-top">
                <div>
                  <strong>{row.partyName}</strong>
                  <p className="small">{row.reference} · due {row.dueDate}</p>
                </div>
                <span className={`acc-status-pill ${invoiceStatusTone(row.status)}`}>{row.status}</span>
              </div>
              <p className="acc-ledger-card-amounts">
                <span>Amount <strong>{money(row.amount)}</strong></span>
                <span>Paid <strong>{money(row.paid)}</strong></span>
                <span>Outstanding <strong>{money(row.outstanding)}</strong></span>
              </p>
              <div className="acc-invoice-remind">
                {kind === "payable"
                  ? <PaymentAdviceButton row={row} settings={orgSettings} company={activeCompany} workspace={workspace} compact />
                  : <ArReminderButton row={row} settings={orgSettings} company={activeCompany} workspace={workspace} compact />}
              </div>
            </article>
          ))}
        </div>
      </>
    );
  };

  return <div className={`acc-shell${navExpanded ? " nav-expanded" : ""}`}>
    <AccSidebar section={section} expanded={navExpanded} onToggle={toggleNav} onNavigate={openSection} />
    <main className="acc-main acc-print-root">
      <AccPageHeader
        backLabel={section === "overview" ? "← Dashboard" : "← Accounts"}
        onBack={section === "overview" ? close : () => openSection("overview")}
        title={SECTIONS.find(item => item.id === section)?.label || "Accounts"}
        trail={sectionTrail(section, reportTab)}
        copy={`${activeCompany?.name || settings?.companyName || workspace.businessName || "Your business"} · ${fy.label} · ${range.from} to ${range.to}`}
        workspace={workspace}
        onSetup={() => openSection("setup")}
        onLogout={requestLogout}
        companyBar={<AccCompanyBar
          companies={companies}
          activeId={activeCompanyId}
          onSelect={switchCompany}
          onCreate={() => { setCompanyDraft({ name: "", booksStartedOn: todayIso(), industry: "retail" }); setShowCreateCompany(true); }}
          gstLabel={gstStatusLabel(activeCompany)}
          fyLabel={fy?.label || ""}
          booksStartedOn={activeCompany?.booksStartedOn || settings?.booksStartedOn || ""}
        />}
        extras={canWrite ? <>
          <select className="acc-new-entry" defaultValue="" aria-label="New entry" onChange={event => {
            if (event.target.value) {
              openSimple(event.target.value);
              event.target.value = "";
            }
          }}>
            <option value="">+ New entry</option>
            {SIMPLE_ENTRY_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button type="button" className="btn primary acc-hide-mobile" onClick={openVoucher}>+ Voucher</button>
          <button type="button" className="btn acc-hide-mobile" onClick={openParty}>+ Party</button>
          <AccMoreMenu
            className="acc-show-mobile"
            label="More"
            items={[
              { id: "voucher", label: "+ Advanced voucher", onClick: openVoucher },
              { id: "party", label: "+ Party", onClick: openParty },
            ]}
          />
        </> : <span className="small">View-only · {accountsAccessRole || "viewer"}</span>}
      />
      {error && <div className="notice acc-toast error" role="alert">{error}</div>}
      {notice && <div className="notice accounts-notice-ok acc-toast ok" role="status">{notice}</div>}
      {readOnly && <div className="notice">Accounts access: <strong>viewer</strong>. You can review books and reports, but posting and setup changes are blocked.</div>}
      {migrationRequired && <div className="notice">Run <strong>052</strong> through <strong>076_fix_ambiguous_item_type.sql</strong> in the Supabase SQL editor (including <strong>059</strong>, <strong>064–067</strong>, <strong>070–076</strong>), then refresh. Cashbook, Daily Finance, Monthly Finance, and Chit Fund keep working without them.</div>}
      <nav className="acc-bottom-nav" aria-label="Accounts">
        {MOBILE_TABS.map(item => (
          <button key={item.id} type="button" className={`acc-bottom-item ${mobileTab === item.id ? "active" : ""}`} onClick={() => openSection(item.id)}>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {loading && !settings ? <><p className="copy">Loading Accounts…</p><AccSkeleton /></> : <>
        {section === "overview" && <div className="acc-panel acc-overview">
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
        </div>}

        {section === "ledger" && <div className="acc-panel">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          <div className="card accounts-filter-card spacer">
            <label className="accounts-filter-field"><span className="small">Account</span>
              <select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{visibleAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
            </label>
            <div className="acc-btn-group">
              <button type="button" className="btn acc-hide-mobile" onClick={() => downloadAccountsCsv(`fintrack-ledger-${todayIso()}.csv`, [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])])}>Export CSV</button>
              <button type="button" className="btn acc-hide-mobile" onClick={() => downloadAccountsExcel(`fintrack-ledger-${todayIso()}.xlsx`, [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])])}>Export Excel</button>
              <button type="button" className="btn acc-hide-mobile" onClick={() => downloadAccountsPdf(`fintrack-ledger-${todayIso()}.pdf`, { title: "Ledger", subtitle: `${ledger.account?.code || ""} ${ledger.account?.name || ""}`, rows: [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])] })}>Download PDF</button>
              <AccMoreMenu
                className="acc-show-mobile"
                label="Export"
                items={[
                  { id: "csv", label: "Export CSV", onClick: () => downloadAccountsCsv(`fintrack-ledger-${todayIso()}.csv`, [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])]) },
                  { id: "xlsx", label: "Export Excel", onClick: () => downloadAccountsExcel(`fintrack-ledger-${todayIso()}.xlsx`, [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])]) },
                  { id: "pdf", label: "Download PDF", onClick: () => downloadAccountsPdf(`fintrack-ledger-${todayIso()}.pdf`, { title: "Ledger", subtitle: `${ledger.account?.code || ""} ${ledger.account?.name || ""}`, rows: [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])] }) },
                ]}
              />
            </div>
          </div>
          <div className="table spacer acc-table-wrap acc-ledger-table"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
            {pagedLedger.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td><td className="acc-num">{money(row.balance)}</td></tr>)}
            {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger yet. Post a voucher to see movement here.</td></tr>}
          </tbody></table></div>
          <div className="acc-ledger-cards spacer">
            {pagedLedger.items.map((row, index) => (
              <article key={`${row.voucherNumber}-${index}`} className="acc-ledger-card">
                <div className="acc-ledger-card-top">
                  <strong>{row.voucherNumber}</strong>
                  <span className="small">{row.date}</span>
                </div>
                {row.narration ? <p className="small">{row.narration}</p> : null}
                <p className="acc-ledger-card-amounts">
                  {row.debit ? <span>Debit <strong>{money(row.debit)}</strong></span> : null}
                  {row.credit ? <span>Credit <strong>{money(row.credit)}</strong></span> : null}
                  <span>Balance <strong>{money(row.balance)}</strong></span>
                </p>
              </article>
            ))}
            {!ledger.rows.length && <p className="copy">No postings on this ledger yet. Post a voucher to see movement here.</p>}
          </div>
          <AccPager page={pagedLedger.page} pages={pagedLedger.pages} total={pagedLedger.total} onPage={setListPage} noun="postings" />
        </div>}

        {section === "vouchers" && <div className="acc-panel">
          {canWrite && (
            <AccToolbar
              className="spacer"
              start={(
                <div className="acc-btn-group">
                  <button type="button" className="btn primary" onClick={() => openSimple("sale")}>+ Sale</button>
                  <button type="button" className="btn" onClick={() => openSimple("purchase")}>+ Purchase</button>
                  <AccMoreMenu
                    label="More"
                    items={[
                      ...SIMPLE_ENTRY_KINDS
                        .filter(item => !["sale", "purchase"].includes(item.id))
                        .map(item => ({
                          id: item.id,
                          label: `+ ${item.label}`,
                          onClick: () => openSimple(item.id),
                        })),
                      { id: "advanced", label: "+ Advanced voucher", onClick: openVoucher },
                    ]}
                  />
                </div>
              )}
              end={(
                <input className="accounts-search" placeholder="Search voucher or narration" value={search} onChange={event => setSearch(event.target.value)} />
              )}
            />
          )}
          {!canWrite && (
            <div className="accounts-action-row spacer">
              <input className="accounts-search" placeholder="Search voucher or narration" value={search} onChange={event => setSearch(event.target.value)} />
            </div>
          )}
          <div className="accounts-entry-list spacer">
            {pagedVouchers.items.map(voucher => <article key={voucher.id} className="card accounts-entry-row">
              <div className="accounts-entry-main">
                <div>
                  <strong>{voucher.voucherNumber}</strong>
                  <p className="small">{voucher.date} · {VOUCHER_TYPES[voucher.voucherType]?.label} · {voucher.status}{voucher.sourceType ? ` · ${voucher.sourceModule}/${voucher.sourceType}` : ""}{voucher.status === "reversed" ? " · kept in ledgers with its reversal" : ""}</p>
                  <p className="small">{voucher.narration}</p>
                </div>
                <div className="accounts-entry-amounts">
                  <span>{money(voucherTotals(voucher.lines).debit)}</span>
                  <button type="button" className="btn" onClick={() => setExpandedVoucherId(current => current === voucher.id ? null : voucher.id)}>{expandedVoucherId === voucher.id ? "Hide" : "Lines"}</button>
                  <AccMoreMenu
                    label="More"
                    items={[
                      voucher.voucherType === "sales" && voucher.status === "posted"
                        ? { id: "invoice", label: "Invoice", onClick: () => openSalesInvoice(voucher) }
                        : null,
                      canWrite
                        ? { id: "duplicate", label: "Duplicate", onClick: () => duplicateVoucher(voucher) }
                        : null,
                      canWrite && voucher.status === "posted"
                        ? {
                          id: "reverse",
                          label: "Reverse",
                          disabled: saving,
                          onClick: () => askReason("Reverse voucher", "Post reversal", reason => run(() => reverseVoucher(token, voucher.id, todayIso(), reason), "Reversal posted.")),
                        }
                        : null,
                      canWrite && voucher.status === "posted"
                        ? {
                          id: "cancel",
                          label: "Cancel voucher",
                          danger: true,
                          disabled: saving,
                          onClick: () => askReason("Cancel voucher", "Cancel voucher", reason => run(() => cancelVoucher(token, voucher.id, reason), "Voucher cancelled.")),
                        }
                        : null,
                    ]}
                  />
                </div>
              </div>
              {expandedVoucherId === voucher.id && <>
                <div className="acc-voucher-nav">
                  <button type="button" className="btn" disabled={shownVouchers.findIndex(item => item.id === voucher.id) <= 0} onClick={() => showAdjacentVoucher(voucher.id, -1)}>Previous</button>
                  <button type="button" className="btn" disabled={shownVouchers.findIndex(item => item.id === voucher.id) >= shownVouchers.length - 1} onClick={() => showAdjacentVoucher(voucher.id, 1)}>Next</button>
                </div>
                {voucher.voucherType === "sales" && (
                  <div className="acc-sales-invoice-actions spacer">
                    <SalesInvoiceActions
                      invoice={buildSalesInvoice({
                        voucher,
                        party: parties.find(item => item.id === voucher.partyId) || null,
                        accounts,
                        company: activeCompany,
                        workspace,
                        itemLines: voucherItemLines.filter(line => line.voucherId === voucher.id),
                      })}
                      settings={orgSettings}
                      compact
                    />
                    {canWrite && activeCompany?.gstRegistration === "regular" && (
                      <button
                        type="button"
                        className="btn"
                        disabled={saving}
                        onClick={() => run(async () => {
                          const party = parties.find(item => item.id === voucher.partyId) || null;
                          const payload = buildEinvoiceOutboundPayload({
                            voucher,
                            party,
                            company: activeCompany,
                            workspace,
                          });
                          await queueEinvoicePayload(token, voucher.id, payload);
                          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `fintrack-einvoice-payload-${voucher.voucherNumber || voucher.id}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }, "E-invoice payload queued (not submitted) and downloaded.")}
                      >
                        Queue e-invoice payload
                      </button>
                    )}
                  </div>
                )}
                {voucher.voucherType === "purchase" && (
                  <div className="acc-sales-invoice-actions spacer">
                    <PurchaseDocumentButton
                      voucher={voucher}
                      party={parties.find(item => item.id === voucher.partyId) || null}
                      settings={orgSettings}
                      company={activeCompany}
                      workspace={workspace}
                      compact
                    />
                  </div>
                )}
                <div className="table spacer"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
                  {voucher.lines.map(line => <tr key={line.id}><td>{line.code} {line.name}</td><td>{line.debit ? money(line.debit) : ""}</td><td>{line.credit ? money(line.credit) : ""}</td></tr>)}
                </tbody></table></div>
                <div className="acc-voucher-attachments spacer">
                  <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>Attachments</strong>
                    {(voucher.status === "posted" || voucher.status === "reversed") && (
                      <label className="btn" style={{ cursor: attachmentBusy ? "wait" : "pointer" }}>
                        {attachmentBusy ? "Uploading…" : "Add file"}
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                          hidden
                          disabled={attachmentBusy}
                          onChange={event => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) onAttachVoucherFile(voucher, file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <p className="small">PDF or image up to {Math.round(VOUCHER_ATTACHMENT_MAX_BYTES / 1024)} KB. Kept with this company’s voucher only.</p>
                  <ul className="acc-attachment-list">
                    {voucherAttachments.map(file => (
                      <li key={file.id} className="acc-attachment-item">
                        <a className="link-button" href={attachmentDownloadHref(file)} download={file.fileName}>{file.fileName}</a>
                        <span className="small">{Math.max(1, Math.round(file.byteSize / 1024))} KB</span>
                        <button type="button" className="btn" disabled={attachmentBusy} onClick={() => onDeleteAttachment(voucher.id, file.id)}>Remove</button>
                      </li>
                    ))}
                    {!voucherAttachments.length && <li className="small">No attachments yet.</li>}
                  </ul>
                </div>
              </>}
            </article>)}
            {!shownVouchers.length && <AccEmpty title="No transactions yet" copy="Use a guided entry for everyday work, or an advanced voucher for a custom journal." actionLabel="+ Create transaction" onAction={() => openSimple("sale")} />}
          </div>
          <AccPager page={pagedVouchers.page} pages={pagedVouchers.pages} total={pagedVouchers.total} onPage={setListPage} noun="vouchers" />
        </div>}

        {(section === "receivables" || section === "payables") && <div className="acc-panel acc-invoice-page">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          <div className="acc-invoice-kpis">
            <article className={`acc-invoice-kpi ${isInvoicePayables ? "tone-gold" : "tone-blue"}`}>
              <span>Outstanding</span>
              <strong>{money(invoiceAging.total)}</strong>
            </article>
            <article className="acc-invoice-kpi tone-green">
              <span>Current</span>
              <strong>{money(invoiceAging.current)}</strong>
            </article>
            <article className="acc-invoice-kpi tone-red">
              <span>Overdue</span>
              <strong>{money(invoiceAging.overdue)}</strong>
            </article>
          </div>
          <div className="acc-invoice-aging" aria-label="Aging buckets">
            <span><em>1–30</em> {money(invoiceAging.d1_30 || 0)}</span>
            <span><em>31–60</em> {money(invoiceAging.d31_60 || 0)}</span>
            <span><em>61–90</em> {money(invoiceAging.d61_90 || 0)}</span>
            <span><em>90+</em> {money(invoiceAging.d90 || 0)}</span>
          </div>
          <p className="small">New receipts and payments store bill-wise links against selected invoices. Older vouchers without links still use party-level FIFO for remaining allocation.</p>
          <div className="acc-invoice-toolbar">
            <button
              type="button"
              className={`acc-outstanding-toggle${outstandingOnly ? " on" : ""}`}
              aria-pressed={outstandingOnly}
              onClick={() => setOutstandingOnly(current => !current)}
            >
              <span className="acc-switch" aria-hidden="true"><span className="acc-switch-knob" /></span>
              Outstanding only
            </button>
            <div className="acc-invoice-exports">
              <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("csv")}>Export CSV</button>
              <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("xlsx")}>Export Excel</button>
              <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("pdf")}>Download PDF</button>
              <AccMoreMenu
                className="acc-show-mobile"
                label="Export"
                items={[
                  { id: "csv", label: "Export CSV", onClick: () => exportReport("csv") },
                  { id: "xlsx", label: "Export Excel", onClick: () => exportReport("xlsx") },
                  { id: "pdf", label: "Download PDF", onClick: () => exportReport("pdf") },
                ]}
              />
            </div>
          </div>
          {invoiceTable(pagedInvoiceRows.items, isInvoicePayables ? "payable" : "receivable")}
          <AccPager
            page={pagedInvoiceRows.page}
            pages={pagedInvoiceRows.pages}
            total={pagedInvoiceRows.total}
            onPage={setListPage}
            noun="invoices"
          />
          <div className="acc-invoice-parties">
            <span className="acc-invoice-parties-label">Party totals</span>
            {invoicePartyRows.length
              ? invoicePartyRows.map(row => (
                <span key={row.id || row.name} className="acc-chip">{row.name} <strong>{money(row.balance)}</strong></span>
              ))
              : <span className="small">none</span>}
          </div>
        </div>}

        {section === "parties" && <div className="acc-panel acc-party-ledger">
          <div className="acc-party-ledger-toolbar">
            <p className="copy">Accounting customers and suppliers are independent of Daily Finance customers and Chit Fund members.</p>
            <div className="acc-party-ledger-links">
              {canWrite && <button type="button" className="btn primary" onClick={openParty}>+ Party</button>}
              <button type="button" className="btn" onClick={() => openSection("receivables")}>Receivables</button>
              <button type="button" className="btn" onClick={() => openSection("payables")}>Payables</button>
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
        </div>}

        {section === "manufacturing" && manufacturingEnabled && <ManufacturingWorkspace items={items} stockMovements={stockMovements} saving={saving} onItems={() => openSection("inventory")} onTransactions={() => openSection("vouchers")} onProductionRun={recordProductionRun} />}
        {section === "inventory" && <div className="acc-panel">
          <AccInventoryWorkspace
            items={items}
            movements={stockMovements}
            voucherItemLines={voucherItemLines}
            range={range}
            saving={saving}
            canEdit={canWrite}
            inventorySettings={inventorySettings}
            onSaveInventorySettings={saveStockRules}
            onImportItems={importItems}
            onApplyCount={applyPhysicalCount}
            itemsSetup={<AccItemsSetup
              items={items}
              categories={itemCategories}
              movements={stockMovements}
              voucherItemLines={voucherItemLines}
              vouchers={vouchers}
              saving={saving}
              onSaveItem={form => run(() => saveItemRecord(form), form.id ? "Item updated." : "Item created.")}
              onDeleteItem={item => run(() => deleteItem(token, item.id), "Item deleted.")}
              onSetItemActive={(id, active) => run(() => setItemActive(token, id, active), active ? "Item reactivated." : "Item deactivated.")}
              onSaveCategory={async payload => {
                const ok = await run(() => upsertItemCategory(token, payload), "Category saved.");
                if (!ok) throw new Error("Could not create category. Confirm migration 067 is applied, then try again.");
              }}
              onDeleteCategory={id => run(() => deleteItemCategory(token, id), "Category deleted.")}
              onAdjustStock={payload => run(() => adjustStock(token, payload), "Stock adjustment saved.")}
            />}
          />
        </div>}

        {section === "more" && <div className="acc-panel">
          <p className="copy">Ledger, banking, statements and setup. Day-to-day work stays on Home, Transactions, Parties and Reports.</p>
          <div className="acc-landing-grid spacer">
            {manufacturingEnabled && <button type="button" className="card acc-landing-card manufacturing-landing-card" onClick={() => openSection("manufacturing")}><strong>Manufacturing</strong><p className="small">Materials, production flow and finished goods</p></button>}
            {moreLinks.map(([id, title]) => (
              <button key={id} type="button" className="card acc-landing-card" onClick={() => openSection(id)}>
                <strong>{title}</strong>
              </button>
            ))}
          </div>
        </div>}

        {(section === "reports" || section === "pnl" || section === "balance" || section === "trial") && <div className="acc-panel">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          <div className="accounts-action-row spacer">
            <div className="accounts-section-nav">
            {REPORT_TABS.map(item => <button key={item.id} type="button" className={`accounts-section-tab ${(section === "pnl" ? "pnl" : section === "balance" ? "balance" : section === "trial" ? "trial" : reportTab) === item.id ? "active" : ""}`} onClick={() => {
              if (item.id === "pnl") openSection("pnl");
              else if (item.id === "balance") openSection("balance");
              else if (item.id === "trial") openSection("trial");
              else { setSection("reports"); setReportTab(item.id); }
            }}>{item.label}</button>)}
            </div>
            <div className="acc-btn-group">
              <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("csv")}>Export CSV</button>
              <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("xlsx")}>Export Excel</button>
              <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("pdf")}>Download PDF</button>
              <AccMoreMenu
                className="acc-show-mobile"
                label="Export"
                items={[
                  { id: "csv", label: "Export CSV", onClick: () => exportReport("csv") },
                  { id: "xlsx", label: "Export Excel", onClick: () => exportReport("xlsx") },
                  { id: "pdf", label: "Download PDF", onClick: () => exportReport("pdf") },
                ]}
              />
            </div>
          </div>
          {(section === "trial" || reportTab === "trial") && section !== "pnl" && section !== "balance" && <>
            <div className="acc-metric-grid three spacer">
              <AccMetric label="Total debit" value={money(tb.totalDebit)} />
              <AccMetric label="Total credit" value={money(tb.totalCredit)} />
              <AccMetric label="Difference" value={money(Math.abs(Number(tb.totalDebit || 0) - Number(tb.totalCredit || 0)))} tone={Math.abs(Number(tb.totalDebit || 0) - Number(tb.totalCredit || 0)) < 0.01 ? "green" : "red"} />
            </div>
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th></tr></thead><tbody>
            {tb.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td></tr>)}
            <tr><td></td><td><strong>Total</strong></td><td className="acc-num"><strong>{money(tb.totalDebit)}</strong></td><td className="acc-num"><strong>{money(tb.totalCredit)}</strong></td></tr>
          </tbody></table></div>
          </>}
          {(section === "pnl" || reportTab === "pnl") && section !== "trial" && section !== "balance" && <div className="grid two spacer">
            <div className="card"><strong>Income</strong>{pnl.income.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total income</span><strong className="green">{money(pnl.totalIncome)}</strong></p></div>
            <div className="card"><strong>Expenses</strong>{pnl.expenses.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total expenses</span><strong className="red">{money(pnl.totalExpense)}</strong></p></div>
            {(pnl.openingStock || pnl.closingStock) ? <div className="card span"><strong>Stock (weighted average)</strong>
              <p className="row spacer"><span>Opening stock (charged)</span><strong>{money(pnl.openingStock)}</strong></p>
              <p className="row"><span>Closing stock (added back)</span><strong>{money(pnl.closingStock)}</strong></p>
              <p className="row"><span>Stock adjustment to profit</span><strong className={pnl.stockAdjustment < 0 ? "red" : "green"}>{money(pnl.stockAdjustment)}</strong></p>
              <p className="small">Purchases are expensed when booked; cost of goods sold = opening stock + purchases − closing stock.</p>
            </div> : null}
            <div className="card span"><strong>Net {pnl.net < 0 ? "loss" : "profit"}</strong><p className={`metric-value ${pnl.net < 0 ? "red" : "green"}`}>{money(pnl.net)}</p></div>
          </div>}
          {(section === "balance" || reportTab === "balance") && section !== "trial" && section !== "pnl" && <div className="grid two spacer">
            <div className="card"><strong>Assets {money(sheet.totalAssets)}</strong>{sheet.assets.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}</div>
            <div className="card"><strong>Liabilities & equity {money(roundMoney(sheet.totalLiabilities + sheet.totalEquity))}</strong>
              {sheet.liabilities.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}
              {sheet.equity.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}
              <p className="small">{sheet.balanced ? "Assets equal liabilities plus equity." : "Balance sheet is out of equation."}</p>
            </div>
          </div>}
          {section === "reports" && reportTab === "daybook" && <>
            <div className="table spacer acc-table-wrap acc-daybook-table"><table><thead><tr><th>Date</th><th>Number</th><th>Type</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
            {pagedBooks.items.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.voucherType}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
            {!books.length && <tr><td colSpan="5">No posted vouchers in this period. Change the date range or record a transaction.</td></tr>}
          </tbody></table></div>
            <div className="acc-ledger-cards spacer">
              {pagedBooks.items.map(row => (
                <article key={row.id} className="acc-ledger-card">
                  <div className="acc-ledger-card-top">
                    <strong>{row.voucherNumber}</strong>
                    <span className="acc-voucher-chip">{row.voucherType}</span>
                  </div>
                  <p className="small">{row.date}{row.narration ? ` · ${row.narration}` : ""}</p>
                  <p className="acc-ledger-card-amounts"><span>Amount <strong>{money(row.debit)}</strong></span></p>
                </article>
              ))}
              {!books.length && <p className="copy">No posted vouchers in this period. Change the date range or record a transaction.</p>}
            </div>
            <AccPager page={pagedBooks.page} pages={pagedBooks.pages} total={pagedBooks.total} onPage={setListPage} noun="vouchers" />
          </>}
          {section === "reports" && reportTab === "cashflow" && <>
            <div className="acc-metric-grid three"><AccMetric label="Inflow" value={money(flow.inflow)} tone="green" /><AccMetric label="Outflow" value={money(flow.outflow)} tone="red" /><AccMetric label="Net cash" value={money(flow.net)} tone="gold" /></div>
            <p className="small">Internal cash/bank/UPI transfers ({money(flow.transfers || 0)}) are excluded from inflow and outflow. Closing cash still follows the ledgers.</p>
          </>}
          {section === "reports" && reportTab === "receivables" && <>
            {invoiceTable(pagedArInvoices.items, "receivable")}
            <AccPager page={pagedArInvoices.page} pages={pagedArInvoices.pages} total={pagedArInvoices.total} onPage={setListPage} noun="invoices" />
          </>}
          {section === "reports" && reportTab === "payables" && <>
            {invoiceTable(pagedApInvoices.items, "payable")}
            <AccPager page={pagedApInvoices.page} pages={pagedApInvoices.pages} total={pagedApInvoices.total} onPage={setListPage} noun="invoices" />
          </>}
          {section === "reports" && reportTab === "sales" && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Number</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
            {salesRows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
            {!salesRows.length && <tr><td colSpan="4">No sales vouchers in this period.</td></tr>}
          </tbody></table></div>}
          {section === "reports" && reportTab === "purchases" && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Number</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
            {purchaseRows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
            {!purchaseRows.length && <tr><td colSpan="4">No purchase vouchers in this period.</td></tr>}
          </tbody></table></div>}
          {section === "reports" && reportTab === "gst" && <div className="acc-gst-reports">
            <p className="copy">GST figures are from this company’s books for the selected dates. They are <strong>calculated</strong> data — not a filed GSTR-1 or GSTR-3B.</p>
            <div className="accounts-action-row spacer">
              <button type="button" className="btn" onClick={() => {
                const prep = buildGstr1Preparation({ vouchers, parties, range });
                downloadAccountsCsv(`fintrack-gstr1-prep-${todayIso()}.csv`, gstrPrepToCsvRows(prep));
                trackProductEvent("gstr1_prep_export");
                setNotice("GSTR-1 preparation CSV downloaded (calculated / not filed).");
              }}>Export GSTR-1 prep CSV</button>
              <button type="button" className="btn" onClick={() => {
                const prep = buildGstr1Preparation({ vouchers, parties, range });
                const blob = new Blob([JSON.stringify(gstrPrepToJson(prep), null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `fintrack-gstr1-prep-${todayIso()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                trackProductEvent("gstr1_prep_json_export");
                setNotice("GSTR-1 preparation JSON downloaded (calculated / not filed).");
              }}>Export GSTR-1 prep JSON</button>
              <button type="button" className="btn" onClick={() => {
                const prep = buildGstr3bPreparation({ vouchers, range });
                downloadAccountsCsv(`fintrack-gstr3b-prep-${todayIso()}.csv`, gstrPrepToCsvRows(prep));
                trackProductEvent("gstr3b_prep_export");
                setNotice("GSTR-3B preparation CSV downloaded (calculated / not filed).");
              }}>Export GSTR-3B prep CSV</button>
              <button type="button" className="btn" onClick={() => {
                const prep = buildGstr3bPreparation({ vouchers, range });
                const blob = new Blob([JSON.stringify(gstrPrepToJson(prep), null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `fintrack-gstr3b-prep-${todayIso()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                trackProductEvent("gstr3b_prep_json_export");
                setNotice("GSTR-3B preparation JSON downloaded (calculated / not filed).");
              }}>Export GSTR-3B prep JSON</button>
            </div>
            <div className="notice spacer">
              <strong>e-Invoice / e-Way:</strong> {EINVOICE_INTEGRATION_STUB.note} Queue a payload from a posted sales voucher — FinTrack will not invent IRNs or call the portal.
            </div>
            <div className="acc-metric-grid three">
              <AccMetric label="Output GST" value={money(gstReport.outputTax)} />
              <AccMetric label="Eligible ITC" value={money(gstReport.inputTax)} />
              <AccMetric label="Net GST payable" value={money(gstReport.netPayable)} tone={gstReport.netPayable > 0 ? "due" : ""} />
            </div>
            <h3 className="acc-section-title">Tax-rate summary</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>Rate</th><th className="acc-num">Taxable</th><th className="acc-num">CGST</th><th className="acc-num">SGST</th><th className="acc-num">IGST</th></tr></thead><tbody>
              {gstReport.byRate.map(row => <tr key={row.rate}><td>{row.rate}%</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.igst)}</td></tr>)}
              {!gstReport.byRate.length && <tr><td colSpan="5">No GST lines in this period.</td></tr>}
            </tbody></table></div>
            <h3 className="acc-section-title">HSN / SAC</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>HSN / SAC</th><th className="acc-num">Taxable</th><th className="acc-num">CGST</th><th className="acc-num">SGST</th><th className="acc-num">IGST</th></tr></thead><tbody>
              {gstReport.byHsn.map(row => <tr key={row.hsnSac}><td>{row.hsnSac}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.igst)}</td></tr>)}
              {!gstReport.byHsn.length && <tr><td colSpan="5">No HSN/SAC lines in this period.</td></tr>}
            </tbody></table></div>
            <h3 className="acc-section-title">Output GST</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>HSN</th><th className="acc-num">Taxable</th><th className="acc-num">Tax</th></tr></thead><tbody>
              {pagedGstOutput.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.hsnSac || "—"}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst + row.sgst + row.igst)}</td></tr>)}
              {!gstReport.output.length && <tr><td colSpan="5">No output GST in this period.</td></tr>}
            </tbody></table></div>
            <AccPager page={pagedGstOutput.page} pages={pagedGstOutput.pages} total={pagedGstOutput.total} onPage={setListPage} noun="output lines" />
            <h3 className="acc-section-title">Input GST / ITC</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>HSN</th><th className="acc-num">Taxable</th><th className="acc-num">ITC</th></tr></thead><tbody>
              {gstReport.input.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.hsnSac || "—"}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.itcEligible ? row.cgst + row.sgst + row.igst : 0)}</td></tr>)}
              {!gstReport.input.length && <tr><td colSpan="5">No input GST in this period.</td></tr>}
            </tbody></table></div>
          </div>}
          {section === "reports" && reportTab === "ledger" && <>
            <div className="card accounts-filter-card spacer">
              <label className="accounts-filter-field"><span className="small">Account</span>
                <select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{visibleAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
              </label>
            </div>
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
              {ledger.rows.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td><td className="acc-num">{money(row.balance)}</td></tr>)}
              {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger in this period.</td></tr>}
            </tbody></table></div>
          </>}
          {section === "reports" && reportTab === "item_sales" && (
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Item</th><th>SKU</th><th className="acc-num">Qty sold</th><th className="acc-num">Sales amount</th></tr></thead><tbody>
              {itemSalesRows.map(row => <tr key={row.itemId || row.name}><td>{row.name}</td><td>{row.sku || "—"}</td><td className="acc-num">{row.quantity}</td><td className="acc-num">{money(row.amount)}</td></tr>)}
              {!itemSalesRows.length && <tr><td colSpan="4">No itemized sales in this period. Use Line items on a Sale entry.</td></tr>}
            </tbody></table></div>
          )}
          {section === "reports" && reportTab === "item_purchases" && (
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Item</th><th>SKU</th><th className="acc-num">Qty bought</th><th className="acc-num">Purchase amount</th></tr></thead><tbody>
              {itemPurchaseRows.map(row => <tr key={row.itemId || row.name}><td>{row.name}</td><td>{row.sku || "—"}</td><td className="acc-num">{row.quantity}</td><td className="acc-num">{money(row.amount)}</td></tr>)}
              {!itemPurchaseRows.length && <tr><td colSpan="4">No itemized purchases in this period.</td></tr>}
            </tbody></table></div>
          )}
          {section === "reports" && reportTab === "stock_moves" && (
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Direction</th><th className="acc-num">Qty</th><th>Reason</th><th>Voucher</th></tr></thead><tbody>
              {stockMoveRows.map(row => <tr key={row.id}><td>{row.movementDate}</td><td>{row.itemName}</td><td>{row.direction}</td><td className="acc-num">{row.quantityDelta}</td><td>{stockReasonLabel(row.reason)}</td><td>{row.voucherNumber || "—"}</td></tr>)}
              {!stockMoveRows.length && <tr><td colSpan="6">No stock movements in this period.</td></tr>}
            </tbody></table></div>
          )}
        </div>}

        {section === "bank" && <div className="acc-panel acc-bank">
          <p className="acc-bank-note">Matching marks statement lines against posted voucher lines. It never changes cash, bank, P&amp;L, or the trial balance.</p>
          <AccSetupSection icon="B" title="Add bank statement" copy="Import a CSV from net banking, map columns, then save. PDF is not auto-parsed yet.">
            <h3 className="acc-section-title">Import file (CSV / Excel text export)</h3>
            <div className="accounts-action-row acc-bank-actions">
              <label className="btn">
                Choose statement file
                <input type="file" accept=".csv,.txt,.tsv,.xls,.xlsx" hidden onChange={onBankImportFile} />
              </label>
            </div>
            {bankImport && <>
              <p className="small">Map columns from your bank file, then apply. Amounts are not posted to ledgers until you create vouchers separately.</p>
              <div className="acc-bank-meta">
                {BANK_IMPORT_FIELDS.map(field => (
                  <Field key={field.id} label={field.label}>
                    <select
                      value={bankImportMapping[field.id] ?? ""}
                      onChange={event => setBankImportMapping(current => ({ ...current, [field.id]: event.target.value === "" ? undefined : Number(event.target.value) }))}
                    >
                      <option value="">Ignore</option>
                      {bankImport.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
              <button type="button" className="btn primary" onClick={applyBankImportMapping}>Apply mapping to draft lines</button>
            </>}
            <h3 className="acc-section-title">Statement details</h3>
            <div className="acc-bank-meta">
              <Field label="Bank account"><select value={bankForm.coaId || bankAccounts[0]?.id || ""} onChange={event => setBankForm(current => ({ ...current, coaId: event.target.value }))}><option value="">Select bank</option>{bankAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
              <Field label="Statement date"><input type="date" value={bankForm.statementDate} onChange={event => setBankForm(current => ({ ...current, statementDate: event.target.value }))} /></Field>
              <Field label="Opening balance"><input className="acc-num-input" type="number" step="0.01" placeholder="0.00" value={bankForm.openingBalance} onChange={event => setBankForm(current => ({ ...current, openingBalance: event.target.value }))} /></Field>
              <Field label="Closing balance"><input className="acc-num-input" type="number" step="0.01" placeholder="0.00" value={bankForm.closingBalance} onChange={event => setBankForm(current => ({ ...current, closingBalance: event.target.value }))} /></Field>
            </div>
            <h3 className="acc-section-title">Statement lines</h3>
            <div className="table acc-table-wrap acc-bank-line-table"><table><thead><tr><th>Date</th><th>Description</th><th className="acc-num">Amount</th><th>In / Out</th><th></th></tr></thead><tbody>
              {bankForm.lines.map((line, index) => <tr key={index}>
                <td><input type="date" value={line.lineDate} onChange={event => patchBankLine(index, { lineDate: event.target.value })} /></td>
                <td className="acc-bank-desc"><input value={line.description} placeholder="e.g. UPI from customer" onChange={event => patchBankLine(index, { description: event.target.value })} /></td>
                <td><input className="acc-num-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.amount} onChange={event => patchBankLine(index, { amount: event.target.value })} /></td>
                <td><select value={line.direction} onChange={event => patchBankLine(index, { direction: event.target.value })}><option value="in">In</option><option value="out">Out</option></select></td>
                <td>{bankForm.lines.length > 1 && <button type="button" className="btn danger" onClick={() => setBankForm(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove</button>}</td>
              </tr>)}
            </tbody></table></div>
            <div className="acc-bank-line-cards">
              {bankForm.lines.map((line, index) => (
                <article key={index} className="card acc-bank-line-card">
                  <div className="acc-bank-meta">
                    <Field label="Date"><input type="date" value={line.lineDate} onChange={event => patchBankLine(index, { lineDate: event.target.value })} /></Field>
                    <Field label="In / Out"><select value={line.direction} onChange={event => patchBankLine(index, { direction: event.target.value })}><option value="in">Money in</option><option value="out">Money out</option></select></Field>
                    <Field className="span" label="Description"><input value={line.description} placeholder="e.g. UPI from customer" onChange={event => patchBankLine(index, { description: event.target.value })} /></Field>
                    <Field label="Amount"><input className="acc-num-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.amount} onChange={event => patchBankLine(index, { amount: event.target.value })} /></Field>
                  </div>
                  {bankForm.lines.length > 1 && <button type="button" className="btn danger" onClick={() => setBankForm(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove line</button>}
                </article>
              ))}
            </div>
            <div className="accounts-action-row acc-bank-actions acc-form-actions">
              <button type="button" className="btn" onClick={() => setBankForm(current => ({ ...current, lines: [...current.lines, emptyBankLine()] }))}>+ Add line</button>
              <button type="button" className="btn primary" disabled={saving} onClick={submitBankStatement}>{saving ? "Saving…" : "Save statement"}</button>
            </div>
          </AccSetupSection>
          <h3 className="acc-section-title">Saved statements</h3>
          {statements.map(statement => {
            const voucherLines = bankVoucherLines(accounts, vouchers, statement.coaId, parties).map(line => ({
              ...line,
              matched: matchedLineIds.has(line.id),
            }));
            const displayLines = defaultBankStatementLines(statement.lines, voucherLines);
            const unmatched = displayLines.filter(line => line.matchStatus !== "matched" && line.matchStatus !== "ignored").length;
            const suggested = displayLines.filter(line => line.matchStatus === "suggested").length;
            return <article key={statement.id} className="card acc-bank-statement">
              <header className="acc-bank-statement-head">
                <div>
                  <h3>{statement.accountName}</h3>
                  <p className="small">{statement.statementDate}</p>
                </div>
                <div className="acc-bank-statement-stats">
                  <span>Opening <strong>{money(statement.openingBalance)}</strong></span>
                  <span>Closing <strong>{money(statement.closingBalance)}</strong></span>
                  {suggested > 0 ? <span className="acc-status-pill suggested">{suggested} suggested</span> : null}
                  <span className={`acc-status-pill ${unmatched ? "inactive" : "active"}`}>{unmatched ? `${unmatched} unmatched` : "Reconciled"}</span>
                  {canWrite && suggested > 0 ? (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={saving}
                      onClick={() => acceptSuggestedBankMatches(displayLines)}
                    >
                      Accept all suggestions
                    </button>
                  ) : null}
                </div>
              </header>
              <div className="table acc-table-wrap acc-bank-match-table"><table><thead><tr><th>Date</th><th>Description</th><th className="acc-num">Amount</th><th>Status</th><th>Match to books</th></tr></thead><tbody>
                {displayLines.map(line => {
                  const options = bankVoucherLines(accounts, vouchers, statement.coaId, parties).filter(item => !matchedLineIds.has(item.id) || item.id === line.matchedVoucherLineId);
                  const selected = matchChoice[line.id] || line.matchedVoucherLineId || "";
                  return <tr key={line.id}>
                    <td>{line.lineDate}</td>
                    <td>{line.description || "—"}{line.reference ? <span className="small"> · {line.reference}</span> : null}</td>
                    <td className="acc-num">{money(line.amount)} <span className={`acc-voucher-chip ${line.direction === "out" ? "out" : "in"}`}>{line.direction === "out" ? "Out" : "In"}</span></td>
                    <td><span className={`acc-status-pill ${bankMatchTone(line.matchStatus)}`}>{bankMatchLabel(line.matchStatus)}</span></td>
                    <td className="acc-bank-match-select">
                      <BankMatchControls
                        line={line}
                        selected={selected}
                        options={options}
                        saving={saving}
                        canWrite={canWrite}
                        onSelect={value => setMatchChoice(current => ({ ...current, [line.id]: value }))}
                        onMatch={() => run(() => saveBankMatch(token, line.id, selected, "Matched"), "Line reconciled. Books unchanged.")}
                        onUnmatch={() => run(() => saveBankMatch(token, line.id, null, "Unmatched"), "Line unmatched. Books unchanged.")}
                        onIgnore={() => run(() => ignoreBankLine(token, line.id, "Ignored from statement"), "Line ignored. Books unchanged.")}
                        onCreate={() => openSimpleFromBankLine(line, statement)}
                      />
                    </td>
                  </tr>;
                })}
              </tbody></table></div>
              <div className="acc-bank-match-cards">
                {displayLines.map(line => {
                  const options = bankVoucherLines(accounts, vouchers, statement.coaId, parties).filter(item => !matchedLineIds.has(item.id) || item.id === line.matchedVoucherLineId);
                  const selected = matchChoice[line.id] || line.matchedVoucherLineId || "";
                  return (
                    <article key={line.id} className="card acc-bank-match-card">
                      <div className="acc-bank-match-card-top">
                        <strong>{line.description || "Statement line"}</strong>
                        <span className={`acc-status-pill ${bankMatchTone(line.matchStatus)}`}>{bankMatchLabel(line.matchStatus)}</span>
                      </div>
                      <p className="small">{line.lineDate} · {money(line.amount)} · {line.direction === "out" ? "Out" : "In"}</p>
                      <BankMatchControls
                        line={line}
                        selected={selected}
                        options={options}
                        saving={saving}
                        canWrite={canWrite}
                        onSelect={value => setMatchChoice(current => ({ ...current, [line.id]: value }))}
                        onMatch={() => run(() => saveBankMatch(token, line.id, selected, "Matched"), "Line reconciled. Books unchanged.")}
                        onUnmatch={() => run(() => saveBankMatch(token, line.id, null, "Unmatched"), "Line unmatched. Books unchanged.")}
                        onIgnore={() => run(() => ignoreBankLine(token, line.id, "Ignored from statement"), "Line ignored. Books unchanged.")}
                        onCreate={() => openSimpleFromBankLine(line, statement)}
                      />
                    </article>
                  );
                })}
              </div>
            </article>;
          })}
          {!statements.length && <AccEmpty title="No bank statements yet" copy="Add opening, closing, and statement lines above. Matching never changes the books." />}
        </div>}

        {section === "crm" && <CustomerPipeline companyId={activeCompanyId} parties={parties} pipeline={partyPipeline} saving={saving} onStageChange={(partyId, stage) => run(async () => {
          await setPartyPipelineStage(token, partyId, stage);
          setPartyPipeline(current => ({ ...current, [partyId]: stage }));
        }, "Pipeline stage saved.")} />}

        {section === "setup" && <div className="acc-panel acc-setup">
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
        </div>}
      </>}

      {showVoucher && <Modal title="Post voucher" close={closeVoucher}>
        <p className="copy">Total debits must equal total credits. Unbalanced vouchers cannot be posted.</p>
        <VoucherForm accounts={visibleAccounts} parties={parties} voucherType={voucherType} setVoucherType={setVoucherType} form={voucherForm} setForm={setVoucherForm} lines={lines} setLines={setLines} onSubmit={submitVoucher} saving={saving} maxDate={todayIso()} />
      </Modal>}
      {showCreateCompany && <Modal title="Create company" close={() => !saving && setShowCreateCompany(false)} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={saving} onClick={() => setShowCreateCompany(false)}>Cancel</button><button type="button" className="btn primary" disabled={saving || !String(companyDraft.name || "").trim()} onClick={() => run(async () => {
        const created = await createAccountsCompany(token, companyDraft);
        const id = Array.isArray(created) ? created[0] : created;
        if (typeof id === "string") saveIndustry(id, companyDraft.industry || "retail");
        setShowCreateCompany(false);
        return typeof id === "string" ? id : undefined;
      }, "Company created. This company’s books start empty.")}>{saving ? "Saving…" : "Create company"}</button></div>}>
        <p className="copy">A new company has its own chart, parties, vouchers, bank, GST, and locks. It does not copy SriHitha Infra or any other company.</p>
        <div className="form">
          <Field required label="Company name"><input value={companyDraft.name} onChange={event => setCompanyDraft(current => ({ ...current, name: event.target.value }))} placeholder="e.g. ABC Traders" /></Field>
          <Field label="Books start date"><input type="date" value={companyDraft.booksStartedOn} onChange={event => setCompanyDraft(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
          <Field label="Industry template"><select value={companyDraft.industry || "retail"} onChange={event => setCompanyDraft(current => ({ ...current, industry: event.target.value }))}>{INDUSTRY_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.label}</option>)}</select><span className="small">{INDUSTRY_TEMPLATES.find(template => template.id === (companyDraft.industry || "retail"))?.hint}</span></Field>
          <div className="accounts-template-features span">{(INDUSTRY_TEMPLATES.find(template => template.id === (companyDraft.industry || "retail"))?.features || []).map(feature => <span key={feature}>{feature}</span>)}</div>
        </div>
      </Modal>}
      {showSimple && <Modal title={SIMPLE_ENTRY_KINDS.find(item => item.id === simpleKind)?.label || "Entry"} close={closeSimple}>
        <SimpleEntryForm kind={simpleKind} accounts={visibleAccounts} parties={parties} form={simpleForm} setForm={setSimpleForm} onSubmit={submitSimple} saving={saving} maxDate={todayIso()} gstCompany={activeCompany} onGstSetup={() => { setShowSimple(false); openSection("setup"); }} items={items} stockByItem={stockByItem} openInvoices={settlementOpenInvoices} />
      </Modal>}
      {showParty && <Modal title={partyForm.id ? "Edit party" : "Add party"} close={closeParty} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={saving} onClick={closeParty}>Cancel</button><button type="button" className="btn primary" disabled={saving} onClick={saveParty}>{saving ? "Saving…" : partyForm.id ? "Save changes" : "Save party"}</button></div>}>
        <p className="copy">{partyForm.id ? "Updates this party only. Existing vouchers and ledgers stay attached to the same party." : "Accounts parties are independent of Daily Finance customers and Chit Fund members."}</p>
        <PartyFormFields form={partyForm} setForm={setPartyForm} typeLocked={Boolean(partyForm.id && partyHasAccountingUse(partyForm.id, vouchers))} />
      </Modal>}
      {partyDeleteDialog?.mode === "confirm" && <Modal title="Delete party?" close={() => !saving && setPartyDeleteDialog(null)} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={saving} onClick={() => setPartyDeleteDialog(null)}>Cancel</button><button type="button" className="btn danger" disabled={saving} onClick={confirmDeleteParty}>{saving ? "Deleting…" : "Delete"}</button></div>}>
        <p className="copy">Are you sure you want to delete this party?</p>
        <p className="small"><strong>{partyDeleteDialog.party.name}</strong> · {partyTypeLabel(partyDeleteDialog.party.partyType)}</p>
      </Modal>}
      {partyDeleteDialog?.mode === "blocked" && <Modal title="This party cannot be deleted" close={() => !saving && setPartyDeleteDialog(null)} actions={<div className="tabs spacer">{partyDeleteDialog.party.isActive !== false && <button type="button" className="btn" disabled={saving} onClick={() => setPartyActiveState(partyDeleteDialog.party, false)}>{saving ? "Saving…" : "Deactivate instead"}</button>}<button type="button" className="btn primary" disabled={saving} onClick={() => setPartyDeleteDialog(null)}>Close</button></div>}>
        <p className="copy">This party cannot be deleted because accounting transactions already exist for this party.</p>
        <p className="small">Historical vouchers, ledgers, receivables, payables, and reports stay intact. Deactivate the party if it should no longer appear on new entries.</p>
      </Modal>}
      {showCoa && <Modal title={coaForm.id ? "Edit ledger account" : "Add ledger account"} close={closeCoa} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving} onClick={saveCoa}>{saving ? "Saving…" : "Save account"}</button></div>}>
        <CoaFormFields form={coaForm} setForm={setCoaForm} accounts={visibleAccounts} />
      </Modal>}
      {reasonDialog && <ReasonModal
        title={reasonDialog.title}
        label="Reason"
        value={reasonText}
        onChange={setReasonText}
        confirmLabel={reasonDialog.confirmLabel}
        saving={saving}
        onClose={() => { setReasonDialog(null); setReasonText(""); }}
        onConfirm={submitReason}
      />}
      {salesInvoiceSuccess && (
        <SalesInvoiceSuccessModal
          invoice={salesInvoiceSuccess}
          settings={orgSettings}
          close={() => setSalesInvoiceSuccess(null)}
        />
      )}
      {salesInvoiceView && (
        <SalesInvoiceViewerModal
          invoice={salesInvoiceView}
          settings={orgSettings}
          close={() => setSalesInvoiceView(null)}
        />
      )}
      {confirmLogout && <Modal title="Log out of Accounts?" close={() => !signingOut && setConfirmLogout(false)} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={signingOut} onClick={() => setConfirmLogout(false)}>Stay signed in</button><button type="button" className="btn danger" disabled={signingOut} onClick={confirmAccountsLogout}>{signingOut ? "Signing out…" : "Log out"}</button></div>}>
        <p className="copy">This ends your FinTrack session. You will need to sign in again to open Accounts or any other module.</p>
      </Modal>}
    </main>
  </div>;
}
