import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Toasts } from "../../components/Toasts.jsx";
import "./accountingProduct.css";
import {
  addBankStatement,
  addVoucherAttachment,
  archiveAccountsCompany,
  createChartAccount,
  createParty,
  deleteChartAccount,
  deleteParty,
  deleteVoucherAttachment,
  loadAccountsRoles,
  loadAccountsAccessRole,
  loadAuditLog,
  loadBankStatements,
  loadPeriodLocks,
  loadVoucherAttachments,
  loadVouchers,
  matchBankLine as saveBankMatch,
  postVoucher,
  setPartyPipelineStage,
  setActiveAccountsCompanyId,
  setPartyActive,
  trackProductEventRpc,
  updateChartAccount,
  updateParty,
  upsertItem,
  upsertItemCategory,
  adjustStock,
  claimTeamInvites,
  listTeamInvites,
  loadRecurringTemplates,
  markRecurringRun,
  setItemOpeningRate,
  loadInventorySettings,
  saveInventorySettings,
  DEFAULT_DOCUMENT_SETTINGS,
  deleteCollectionRoute,
  lockAccountingPeriod,
  saveCollectionRoute,
  saveDocumentSettings,
  saveTradeDocument,
  setComplianceFiling,
  setPartyCredit,
  setRouteStops,
  setTradeDocumentStatus,
} from "./data/accountingRepository.js";
import { isAccountsOnboardingDone, readIndustry } from "./components/AccOnboardingWizard.jsx";
import { parsePartyCsv, planPartyImport } from "./io/partyCsvImport.js";
import { AccMoreMenu, Modal, ReasonModal } from "./components/AccUi.jsx";
import { guessColumnMapping, mapBankImportRows, readBankStatementFile } from "./io/bankStatementImport.js";
import { backupDownloadFilename, buildAccountsCompanyBackup, parseAccountsCompanyBackup } from "./data/accountsBackup.js";
import { assertBackupRestorable, restoreAccountsCompanyBackup } from "./data/accountsRestore.js";
import { buildAccountsAttentionItems } from "../intelligence/attentionCenter.js";
import { trackProductEvent } from "../commercial/productAnalytics.js";
import { assertVoucherAttachmentMeta, normalizeAttachmentContentType, readFileAsBase64 } from "./data/voucherAttachments.js";
import {
  PARTY_TYPES,
  SIMPLE_ENTRY_KINDS,
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
} from "./model/accountingModel.js";
import { todayIso } from "../../lib/dates.js";
import { gstStateFromGstin, isIntraGst } from "./model/accountingGst.js";
import {
  accountLedger,
  balanceSheet,
  bankVoucherLines,
  cashFlow,
  dashboardMetrics,
  dayBook,
  gstBooksReport,
  invoiceAgingTotals,
  invoiceRegister,
  partyBalances,
  partyLedger,
  partyTotalsFromInvoices,
  profitAndLoss,
  trialBalance,
} from "./model/accountingReports.js";
import { pageSlice } from "./model/accountsList.js";
import { previousComparisonRange } from "./model/accountsIntelligence.js";
import { downloadAccountsCsv, downloadAccountsExcel, downloadAccountsPdf } from "./io/accountingExport.js";
import { loadOrganizationSettings } from "../../lib/financeRepository.js";
import { buildSalesInvoice } from "./model/salesInvoiceModel.js";
import { SalesInvoiceSuccessModal, SalesInvoiceViewerModal } from "./components/SalesInvoiceActions.jsx";
import { periodStockValues } from "./model/inventoryValuation.js";
import {
  currentStockForItem,
  itemPurchasesReport,
  itemSalesReport,
  itemizedEntryDraft,
  stockMovementReport,
  usesItemLines,
} from "./model/inventoryModel.js";
import {
  COMPANY_STORAGE_KEY,
  readAccountsSnapshot,
  fetchAccountsBundle,
  inFlightAccountsPrefetch,
  clearAccountsSnapshot,
} from "./data/accountsCache.js";
import {
  emptyLine,
  emptyBankLine,
  emptyPartyForm,
  emptyRecurringDraft,
  emptyVoucherForm,
  emptySimpleForm,
  emptyCoaForm,
} from "./accountsFormDefaults.js";
import { REPORT_TABS, MORE_LINKS } from "./accountsNavigation.js";
import { gstStatusLabel } from "./accountsFormat.js";
import { AccSectionTabs, AccCompanyBar, AccPageHeader } from "./components/AccLayout.jsx";
import { CustomerPipeline } from "./components/CustomerPipeline.jsx";
import { ManufacturingWorkspace } from "./components/ManufacturingWorkspace.jsx";
import { VoucherForm } from "./components/VoucherForm.jsx";
import { SimpleEntryForm } from "./components/SimpleEntryForm.jsx";
import { OverviewSection } from "./sections/OverviewSection.jsx";
import { LedgerSection } from "./sections/LedgerSection.jsx";
import { VouchersSection } from "./sections/VouchersSection.jsx";
import { InvoicesSection } from "./sections/InvoicesSection.jsx";
import { PartiesSection } from "./sections/PartiesSection.jsx";
import { InventorySection } from "./sections/InventorySection.jsx";
import { MoreSection } from "./sections/MoreSection.jsx";
import { ReportsSection } from "./sections/ReportsSection.jsx";
import { BankSection } from "./sections/BankSection.jsx";
import { SetupSection } from "./sections/SetupSection.jsx";
import { NewEntryActions } from "./components/NewEntryActions.jsx";
import { CreateCompanyModal } from "./components/dialogs/CreateCompanyModal.jsx";
import { PartyModal } from "./components/dialogs/PartyModal.jsx";
import { DeletePartyModal } from "./components/dialogs/DeletePartyModal.jsx";
import { PartyDeleteBlockedModal } from "./components/dialogs/PartyDeleteBlockedModal.jsx";
import { CoaModal } from "./components/dialogs/CoaModal.jsx";
import { LogoutConfirmModal } from "./components/dialogs/LogoutConfirmModal.jsx";
import { AccDocumentsWorkspace } from "./components/AccDocumentsWorkspace.jsx";
import { AccRoutesWorkspace } from "./components/AccRoutesWorkspace.jsx";
import { creditCheck, documentFulfilment, documentLabel, pendingOrderRows } from "./model/tradeDocumentModel.js";
import { receivablePositions } from "./model/routeCollectionsModel.js";
import { buildOwnerDailyBrief, reorderPurchaseOrderLines } from "./model/ownerDailyBrief.js";
import { addMonths, gstFilingSchedule, monthKey, monthLabel, monthRange, readGstFrequency, writeGstFrequency } from "./model/gstCalendar.js";
import { Spinner } from "../../components/ui.jsx";

// Re-exported for the workspace preloader, which lazy-loads this module.
export { prefetchAccounts } from "./data/accountsCache.js";
// The open section, report and sub-tab come from the URL (see accountsPath / app/AppRoutes.jsx); `onNavigate` changes them.
export function AccountsModule({ token, close, onOpenCashbook, logout, workspace = {}, orgSettings: orgSettingsProp = null, view = {}, onNavigate }) {
  const [cached] = useState(() => {
    const snapshot = readAccountsSnapshot(token);
    if (snapshot) setActiveAccountsCompanyId(snapshot.activeCompanyId || null);
    return snapshot;
  });
  const section = view.section || "overview";
  const reportTab = view.reportTab || "daybook";
  const go = next => onNavigate?.({ section: "overview", reportTab: "daybook", sub: null, ...next });
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
  const [tradeDocuments, setTradeDocuments] = useState(cached?.tradeDocuments ?? null);
  const [documentSettings, setDocumentSettings] = useState(cached?.documentSettings ?? { ...DEFAULT_DOCUMENT_SETTINGS, available: false });
  const [complianceFilings, setComplianceFilings] = useState(cached?.complianceFilings ?? null);
  const [collectionRoutes, setCollectionRoutes] = useState(cached?.collectionRoutes ?? null);
  const [documentPrefill, setDocumentPrefill] = useState(null);
  const [gstFrequencyState, setGstFrequencyState] = useState(null);
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
      setTradeDocuments(bundle.tradeDocuments);
      setDocumentSettings(bundle.documentSettings);
      setComplianceFilings(bundle.complianceFilings);
      setCollectionRoutes(bundle.collectionRoutes);
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
      company: company ? { ...company, documentSettings } : null,
      workspace,
      itemLines: voucherItemLines.filter(line => line.voucherId === voucher.id),
    }));
    setPendingSalesInvoiceId(null);
  }, [pendingSalesInvoiceId, vouchers, parties, accounts, companies, activeCompanyId, workspace, voucherItemLines, documentSettings]);

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
        const [nextStatements, nextLocks] = await Promise.all([
          loadBankStatements(token).catch(() => []),
          section === "overview" ? loadPeriodLocks(token).catch(() => null) : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setStatements(nextStatements || []);
          if (nextLocks) setLocks(nextLocks);
        }
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
  const wantLedger = section === "ledger" || reportId === "ledger";
  const wantPartyBook = section === "parties";

  useEffect(() => {
    if (ledgerId && !visibleAccounts.some(account => account.id === ledgerId) && visibleAccounts[0]) {
      setLedgerId(visibleAccounts[0].id);
    }
  }, [ledgerId, visibleAccounts]);

  const costLines = useMemo(() => {
    const documentLines = (tradeDocuments || []).filter(doc => doc.docType === "goods_receipt").flatMap(doc => doc.lines || []);
    return documentLines.length ? [...voucherItemLines, ...documentLines] : voucherItemLines;
  }, [tradeDocuments, voucherItemLines]);
  const fulfilment = useMemo(
    () => documentFulfilment({ documents: tradeDocuments || [], voucherItemLines, vouchers }),
    [tradeDocuments, voucherItemLines, vouchers],
  );
  const wantStockValue = wantOverview || wantPnl || wantSheet;
  const periodStock = useMemo(
    () => (wantStockValue && items.length
      ? periodStockValues({ items, movements: stockMovements, voucherItemLines: costLines, from: range.from, to: range.to })
      : null),
    [wantStockValue, items, stockMovements, costLines, range],
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
  const activeCompany = useMemo(() => {
    const company = companies.find(item => item.id === activeCompanyId) || companies[0] || null;
    return company ? { ...company, documentSettings } : null;
  }, [companies, activeCompanyId, documentSettings]);
  const saleCreditInfo = useMemo(() => {
    if (!showSimple || simpleKind !== "sale" || !simpleForm.partyId) return null;
    const party = parties.find(item => item.id === simpleForm.partyId);
    if (!party) return null;
    const balance = partyBalances(accounts, vouchers, [party], { kind: "receivable" }).find(row => row.id === party.id)?.balance || 0;
    const overdueDays = invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: todayIso(), outstandingOnly: true })
      .filter(row => row.partyId === party.id)
      .reduce((max, row) => Math.max(max, Number(row.daysOverdue || 0)), 0);
    return { party, outstanding: Math.max(0, balance), overdueDays, settings: documentSettings };
  }, [showSimple, simpleKind, simpleForm.partyId, parties, accounts, vouchers, documentSettings]);
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
  const gstFrequency = gstFrequencyState?.companyId === activeCompanyId ? gstFrequencyState.value : readGstFrequency(activeCompanyId);
  const changeGstFrequency = value => {
    writeGstFrequency(activeCompanyId, value);
    setGstFrequencyState({ companyId: activeCompanyId, value });
  };
  const wantBrief = wantOverview && canWrite;
  const gstSchedule = useMemo(() => {
    if (!wantBrief || !activeCompany) return null;
    return gstFilingSchedule({
      today: todayIso(),
      registration: activeCompany.gstRegistration,
      frequency: gstFrequency,
      stateCode: activeCompany.stateCode,
      filings: complianceFilings || [],
      since: activeCompany.booksStartedOn || settings?.booksStartedOn || "",
    });
  }, [wantBrief, activeCompany, gstFrequency, complianceFilings, settings]);
  const ownerBrief = useMemo(() => {
    if (!wantBrief) return null;
    const today = todayIso();
    const unmatchedBankLines = (statements || []).reduce((sum, statement) => sum + (statement.lines || []).filter(line => line.matchStatus !== "matched" && line.matchStatus !== "ignored").length, 0);
    const lastMonth = addMonths(monthKey(today), -1);
    const lastRange = monthRange(lastMonth);
    const lastMonthReturns = (gstSchedule?.all || []).filter(item => item.period === lastMonth);
    const lastMonthLocked = (locks || []).some(lock => lock.isLocked && lock.periodFrom <= lastRange.from && lock.periodTo >= lastRange.to);
    const periodToLock = canAdmin && complianceFilings && lastMonthReturns.length && lastMonthReturns.every(item => item.status === "filed") && !lastMonthLocked
      ? { ...lastRange, label: monthLabel(lastMonth) }
      : null;
    return buildOwnerDailyBrief({
      today,
      receivables: invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today, outstandingOnly: true }),
      payables: invoiceRegister(accounts, vouchers, parties, { kind: "payable", today, outstandingOnly: true }),
      items,
      stockByItem,
      pendingPurchaseRows: pendingOrderRows({ documents: tradeDocuments || [], fulfilment, side: "purchase", parties, today }),
      voucherItemLines,
      vouchers,
      parties,
      gstSchedule,
      unmatchedBankLines,
      periodToLock,
    });
  }, [wantBrief, accounts, vouchers, parties, items, stockByItem, tradeDocuments, fulfilment, voucherItemLines, gstSchedule, statements, locks, canAdmin, complianceFilings]);
  const routePositions = useMemo(() => {
    if (section !== "routes") return new Map();
    return receivablePositions(invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: todayIso(), outstandingOnly: true }));
  }, [section, accounts, vouchers, parties]);
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
    if (id !== "documents") setDocumentPrefill(null);
    if (id === "cashbook") {
      if (onOpenCashbook) onOpenCashbook();
      else close();
      return;
    }
    if (id === "gst") {
      go({ section: "reports", reportTab: "gst" });
      window.scrollTo(0, 0);
      return;
    }
    go({ section: id, reportTab: ["trial", "pnl", "balance"].includes(id) ? id : "daybook" });
    window.scrollTo(0, 0);
  };

  // A report from the Reports sub-tabs: the three statements are their own sections, the rest are tabs of the Reports page.
  const openReport = id => {
    if (["trial", "pnl", "balance"].includes(id)) openSection(id);
    else go({ section: "reports", reportTab: id });
  };
  const setReportTab = openReport;

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
    setTradeDocuments(null);
    setDocumentSettings({ ...DEFAULT_DOCUMENT_SETTINGS, available: false });
    setComplianceFilings(null);
    setCollectionRoutes(null);
    setDocumentPrefill(null);
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

  const openSimpleFromDocument = (doc, kind, itemLines) => {
    if (!canWrite) {
      setError("Your Accounts role is view-only.");
      return;
    }
    const party = parties.find(item => item.id === doc.partyId);
    const moneyRows = moneyAccounts(visibleAccounts);
    const date = todayIso();
    setPendingBankMatch(null);
    setPendingRecurringId(null);
    setSimpleKind(kind);
    setSimpleRequestId(newClientRequestId());
    setSimpleForm({
      ...emptySimpleForm(),
      date,
      partyId: doc.partyId,
      settlement: "credit",
      entryMode: "items",
      itemLines,
      dueDate: addDaysIso(date, party?.creditDays ?? 7),
      narration: `${documentLabel(doc.docType)} ${doc.docNumber}${doc.reference ? ` · ${doc.reference}` : ""}`,
      fromAccountId: moneyRows.find(account => account.accountType === "cash")?.id || moneyRows[0]?.id || "",
      toAccountId: moneyRows.find(account => account.accountType === "bank")?.id || moneyRows.find(account => account.id !== moneyRows[0]?.id)?.id || "",
    });
    setShowSimple(true);
    setNotice(`Items from ${documentLabel(doc.docType).toLowerCase()} ${doc.docNumber} are filled in. Check rates and quantities, then save.`);
  };

  const saveDocument = draft => run(async () => {
    await saveTradeDocument(token, draft);
  }, `${documentLabel(draft.docType)} saved.`);

  const changeDocumentStatus = (doc, status, reason = "") => run(async () => {
    await setTradeDocumentStatus(token, doc.id, status, reason);
  }, status === "cancelled" ? `${documentLabel(doc.docType)} ${doc.docNumber} cancelled.` : `${documentLabel(doc.docType)} ${doc.docNumber} updated.`);

  const saveDocSettings = next => run(async () => {
    await saveDocumentSettings(token, next);
  }, "Document settings saved.");

  const openPaymentFor = row => {
    if (!canWrite) {
      setError("Your Accounts role is view-only.");
      return;
    }
    const moneyRows = moneyAccounts(visibleAccounts);
    setPendingBankMatch(null);
    setPendingRecurringId(null);
    setSimpleKind("payment");
    setSimpleRequestId(newClientRequestId());
    setSimpleForm({
      ...emptySimpleForm(),
      partyId: row.partyId,
      amount: String(row.due || ""),
      moneyMode: "bank",
      narration: `Payment to ${row.partyName}`,
      fromAccountId: moneyRows.find(account => account.accountType === "cash")?.id || moneyRows[0]?.id || "",
      toAccountId: moneyRows.find(account => account.accountType === "bank")?.id || moneyRows.find(account => account.id !== moneyRows[0]?.id)?.id || "",
    });
    setShowSimple(true);
  };

  const createPurchaseOrderFromReorder = group => {
    const lines = reorderPurchaseOrderLines(group?.rows || []);
    if (!lines.length) return;
    setDocumentPrefill({
      key: `${Date.now()}`,
      docType: "purchase_order",
      partyId: group.supplierId || "",
      notes: "Reorder from daily brief",
      lines,
    });
    go({ section: "documents", sub: "purchase_order" });
  };

  const saveRoute = form => run(async () => {
    await saveCollectionRoute(token, form);
  }, form.id ? "Route updated." : "Route created.");

  const removeRoute = route => run(async () => {
    await deleteCollectionRoute(token, route.id);
  }, `Route ${route.name} deleted.`);

  const saveRouteStops = (routeId, partyIds) => run(async () => {
    await setRouteStops(token, routeId, partyIds);
  }, "Route customers saved.");

  const markGstFiled = ({ returnCode, period, filedOn = null, reference = "", clear = false }) => run(async () => {
    await setComplianceFiling(token, { returnCode, period, filedOn, reference, clear });
  }, clear ? "Filing mark removed." : "Marked as filed.");

  const lockMonth = period => run(async () => {
    await lockAccountingPeriod(token, period.from, period.to);
    setLocks(await loadPeriodLocks(token));
  }, `${period.label} locked.`);

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
        creditLimit: party.creditLimit ? String(party.creditLimit) : "",
        creditDays: party.creditDays == null ? "" : String(party.creditDays),
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
    const creditLimit = partyForm.partyType === "customer" ? Number(partyForm.creditLimit || 0) : 0;
    const creditDays = String(partyForm.creditDays ?? "").trim() === "" ? null : Number(partyForm.creditDays);
    if (!(creditLimit >= 0) || (creditDays != null && !(Number.isInteger(creditDays) && creditDays >= 0 && creditDays <= 365))) {
      setError("Credit limit cannot be negative and credit days must be a whole number from 0 to 365.");
      return;
    }
    const creditChanged = existing
      ? Number(existing.creditLimit || 0) !== creditLimit || (existing.creditDays ?? null) !== creditDays
      : creditLimit > 0 || creditDays != null;
    run(async () => {
      let partyId = partyForm.id;
      if (partyForm.id) await updateParty(token, partyForm);
      else {
        const created = await createParty(token, partyForm);
        partyId = Array.isArray(created) ? created[0] : created;
      }
      if (creditChanged && typeof partyId === "string") await setPartyCredit(token, partyId, { creditLimit, creditDays });
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
      if (saleCreditInfo) {
        const exposure = roundMoney(voucherTotals(draft.lines).debit - amountReceivedNow);
        const check = creditCheck({ ...saleCreditInfo, invoiceTotal: exposure });
        if (check.level === "block") {
          throw new Error(`${check.messages.join(" ")} Credit sales to this customer are blocked by credit control in Documents → Document settings.`);
        }
      }
    }

    if (useItems) {
      const pendingByLine = new Map();
      for (const summary of fulfilment.values()) {
        for (const line of summary.lines) pendingByLine.set(line.lineId, line.pending);
      }
      (simpleForm.itemLines || []).forEach((line, index) => {
        if (!line.sourceDocumentLineId || !pendingByLine.has(line.sourceDocumentLineId)) return;
        const pending = pendingByLine.get(line.sourceDocumentLineId);
        if (Number(line.quantity || 0) - pending > 0.0005) {
          throw new Error(`Line ${index + 1}: only ${pending} ${line.unit || ""} is still pending on the source document.`.replace(/ {2}/g, " "));
        }
      });
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

  const isInvoicePayables = section === "payables";
  const invoiceAging = invoiceAgingTotals(isInvoicePayables ? apInvoices : arInvoices);
  const pagedInvoiceRows = isInvoicePayables ? pagedApInvoices : pagedArInvoices;
  const invoicePartyRows = partyTotalsFromInvoices(isInvoicePayables ? apInvoices : arInvoices);


  return <div className="acc-shell">
    <main className="acc-main acc-print-root">
      <AccPageHeader
        title="Accounts"
        copy={`${activeCompany?.name || settings?.companyName || workspace.businessName || "Your business"} · ${fy.label} · ${range.from} to ${range.to}`}
        tabs={<AccSectionTabs section={section} reportTab={reportTab} onNavigate={openSection} openReport={openReport} />}
        companyBar={<AccCompanyBar
          companies={companies}
          activeId={activeCompanyId}
          onSelect={switchCompany}
          onCreate={() => { setCompanyDraft({ name: "", booksStartedOn: todayIso(), industry: "retail" }); setShowCreateCompany(true); }}
          gstLabel={gstStatusLabel(activeCompany)}
          fyLabel={fy?.label || ""}
          booksStartedOn={activeCompany?.booksStartedOn || settings?.booksStartedOn || ""}
          rangeFrom={range.from}
          rangeTo={range.to}
          fallbackName={settings?.companyName || workspace.businessName || ""}
        />}
        extras={canWrite ? <NewEntryActions openSimple={openSimple} openVoucher={openVoucher} openParty={openParty} /> : <span className="small">View-only · {accountsAccessRole || "viewer"}</span>}
      />
      <Toasts items={[{ id: "error", tone: "error", message: error, onClose: () => setError("") }, { id: "notice", message: notice, onClose: () => setNotice("") }]} />
      {readOnly && <div className="notice">Accounts access: <strong>viewer</strong>. You can review books and reports, but posting and setup changes are blocked.</div>}
      {migrationRequired && <div className="notice">Run <strong>052</strong> through <strong>076_fix_ambiguous_item_type.sql</strong> in the Supabase SQL editor (including <strong>059</strong>, <strong>064–067</strong>, <strong>070–076</strong>), then refresh. Cashbook, Daily Finance, Monthly Finance, and Chit Fund keep working without them.</div>}
      {loading && !settings ? <Spinner label="Loading Accounts" /> : <>
        {section === "overview" && <OverviewSection
          settings={settings}
          setupForm={setupForm}
          setSetupForm={setSetupForm}
          saving={saving}
          run={run}
          token={token}
          showOnboarding={showOnboarding}
          activeCompanyId={activeCompanyId}
          activeCompany={activeCompany}
          canAdmin={canAdmin}
          canWrite={canWrite}
          setOnboardingDismissed={setOnboardingDismissed}
          setNotice={setNotice}
          fy={fy}
          lastFy={lastFy}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          setReportRange={setReportRange}
          metrics={metrics}
          overviewArAging={overviewArAging}
          overviewApAging={overviewApAging}
          items={items}
          stockMovements={stockMovements}
          accountsAttention={accountsAttention}
          close={close}
          openSection={openSection}
          setReportTab={setReportTab}
          visibleAccounts={visibleAccounts}
          vouchers={vouchers}
          parties={parties}
          range={range}
          intelligencePreviousRange={intelligencePreviousRange}
          voucherItemLines={voucherItemLines}
          recentVouchers={recentVouchers}
          ownerBrief={ownerBrief}
          parties={parties}
          activeCompany={activeCompany}
          orgSettings={orgSettings}
          workspace={workspace}
          canWrite={canWrite}
          saving={saving}
          openSection={openSection}
          openPaymentFor={openPaymentFor}
          createPurchaseOrderFromReorder={createPurchaseOrderFromReorder}
          markGstFiled={markGstFiled}
          canAdmin={canAdmin}
          lockMonth={lockMonth}
        />}

        {section === "ledger" && <LedgerSection
          fy={fy}
          lastFy={lastFy}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          setReportRange={setReportRange}
          ledgerId={ledgerId}
          setLedgerId={setLedgerId}
          visibleAccounts={visibleAccounts}
          ledger={ledger}
          pagedLedger={pagedLedger}
          setListPage={setListPage}
        />}

        {section === "vouchers" && <VouchersSection
          canWrite={canWrite}
          openSimple={openSimple}
          openVoucher={openVoucher}
          search={search}
          setSearch={setSearch}
          pagedVouchers={pagedVouchers}
          setExpandedVoucherId={setExpandedVoucherId}
          expandedVoucherId={expandedVoucherId}
          openSalesInvoice={openSalesInvoice}
          duplicateVoucher={duplicateVoucher}
          saving={saving}
          askReason={askReason}
          run={run}
          token={token}
          shownVouchers={shownVouchers}
          showAdjacentVoucher={showAdjacentVoucher}
          parties={parties}
          accounts={accounts}
          activeCompany={activeCompany}
          workspace={workspace}
          voucherItemLines={voucherItemLines}
          orgSettings={orgSettings}
          attachmentBusy={attachmentBusy}
          onAttachVoucherFile={onAttachVoucherFile}
          voucherAttachments={voucherAttachments}
          onDeleteAttachment={onDeleteAttachment}
          setListPage={setListPage}
        />}

        {(section === "receivables" || section === "payables") && <InvoicesSection
          fy={fy}
          lastFy={lastFy}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          setReportRange={setReportRange}
          isInvoicePayables={isInvoicePayables}
          invoiceAging={invoiceAging}
          outstandingOnly={outstandingOnly}
          setOutstandingOnly={setOutstandingOnly}
          exportReport={exportReport}
          pagedInvoiceRows={pagedInvoiceRows}
          orgSettings={orgSettings}
          activeCompany={activeCompany}
          workspace={workspace}
          setListPage={setListPage}
          invoicePartyRows={invoicePartyRows}
        />}

        {section === "parties" && <PartiesSection
          canWrite={canWrite}
          openParty={openParty}
          openSection={openSection}
          focusedParty={focusedParty}
          setPartyFocusId={setPartyFocusId}
          parties={parties}
          partyFrom={partyFrom}
          setPartyFrom={setPartyFrom}
          partyTo={partyTo}
          setPartyTo={setPartyTo}
          partyTxnType={partyTxnType}
          setPartyTxnType={setPartyTxnType}
          partyBook={partyBook}
          orgSettings={orgSettings}
          activeCompany={activeCompany}
          workspace={workspace}
          pagedPartyBook={pagedPartyBook}
          setListPage={setListPage}
        />}

        {section === "manufacturing" && manufacturingEnabled && <ManufacturingWorkspace items={items} stockMovements={stockMovements} saving={saving} onItems={() => openSection("inventory")} onTransactions={() => openSection("vouchers")} onProductionRun={recordProductionRun} />}
        {section === "documents" && <div className="acc-panel">
          <AccDocumentsWorkspace
            documents={tradeDocuments}
            fulfilment={fulfilment}
            parties={parties}
            items={items}
            stockByItem={stockByItem}
            company={activeCompany}
            workspace={workspace}
            documentSettings={documentSettings}
            canEdit={canWrite}
            canAdmin={canAdmin}
            saving={saving}
            onSaveDocument={saveDocument}
            onSetStatus={changeDocumentStatus}
            onConvertToEntry={openSimpleFromDocument}
            onSaveSettings={saveDocSettings}
            prefill={documentPrefill}
            tab={view.sub}
            onTabChange={next => go({ section: "documents", sub: next })}
          />
        </div>}
        {section === "routes" && <div className="acc-panel">
          <AccRoutesWorkspace
            token={token}
            tab={view.sub}
            onTabChange={next => go({ section: "routes", sub: next })}
            routesData={collectionRoutes}
            parties={parties}
            positions={routePositions}
            canEdit={canWrite}
            saving={saving}
            today={todayIso()}
            onSaveRoute={saveRoute}
            onDeleteRoute={removeRoute}
            onSetStops={saveRouteStops}
          />
        </div>}
        {section === "inventory" && <InventorySection
          tab={view.sub}
          onTabChange={next => go({ section: "inventory", sub: next })}
          items={items}
          stockMovements={stockMovements}
          voucherItemLines={voucherItemLines}
          range={range}
          saving={saving}
          canWrite={canWrite}
          inventorySettings={inventorySettings}
          saveStockRules={saveStockRules}
          importItems={importItems}
          applyPhysicalCount={applyPhysicalCount}
          itemCategories={itemCategories}
          vouchers={vouchers}
          run={run}
          saveItemRecord={saveItemRecord}
          token={token}
          costLines={costLines}
        />}

        {section === "more" && <MoreSection manufacturingEnabled={manufacturingEnabled} openSection={openSection} moreLinks={moreLinks} />}

        {(section === "reports" || section === "pnl" || section === "balance" || section === "trial") && <ReportsSection
          fy={fy}
          lastFy={lastFy}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          setReportRange={setReportRange}
          section={section}
          reportTab={reportTab}
          exportReport={exportReport}
          tb={tb}
          pnl={pnl}
          sheet={sheet}
          pagedBooks={pagedBooks}
          books={books}
          setListPage={setListPage}
          flow={flow}
          pagedArInvoices={pagedArInvoices}
          orgSettings={orgSettings}
          activeCompany={activeCompany}
          workspace={workspace}
          pagedApInvoices={pagedApInvoices}
          salesRows={salesRows}
          purchaseRows={purchaseRows}
          vouchers={vouchers}
          parties={parties}
          range={range}
          setNotice={setNotice}
          gstReport={gstReport}
          pagedGstOutput={pagedGstOutput}
          ledgerId={ledgerId}
          setLedgerId={setLedgerId}
          visibleAccounts={visibleAccounts}
          ledger={ledger}
          itemSalesRows={itemSalesRows}
          itemPurchaseRows={itemPurchaseRows}
          stockMoveRows={stockMoveRows}
          activeCompany={activeCompany}
          workspace={workspace}
          settings={settings}
          voucherItemLines={voucherItemLines}
          complianceFilings={complianceFilings}
          gstFrequency={gstFrequency}
          changeGstFrequency={changeGstFrequency}
          canWrite={canWrite}
          saving={saving}
          markGstFiled={markGstFiled}
        />}

        {section === "bank" && <BankSection
          onBankImportFile={onBankImportFile}
          bankImport={bankImport}
          bankImportMapping={bankImportMapping}
          setBankImportMapping={setBankImportMapping}
          applyBankImportMapping={applyBankImportMapping}
          bankForm={bankForm}
          bankAccounts={bankAccounts}
          setBankForm={setBankForm}
          patchBankLine={patchBankLine}
          saving={saving}
          submitBankStatement={submitBankStatement}
          statements={statements}
          accounts={accounts}
          vouchers={vouchers}
          parties={parties}
          matchedLineIds={matchedLineIds}
          canWrite={canWrite}
          acceptSuggestedBankMatches={acceptSuggestedBankMatches}
          matchChoice={matchChoice}
          setMatchChoice={setMatchChoice}
          run={run}
          token={token}
          openSimpleFromBankLine={openSimpleFromBankLine}
        />}

        {section === "crm" && <CustomerPipeline companyId={activeCompanyId} parties={parties} pipeline={partyPipeline} saving={saving} onStageChange={(partyId, stage) => run(async () => {
          await setPartyPipelineStage(token, partyId, stage);
          setPartyPipeline(current => ({ ...current, [partyId]: stage }));
        }, "Pipeline stage saved.")} />}

        {section === "setup" && <SetupSection
          activeCompany={activeCompany}
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
          setRestoreDraft={setRestoreDraft}
          companies={companies}
          activeCompanyId={activeCompanyId}
          switchCompany={switchCompany}
          archiveCompany={archiveCompany}
          setCompanyDraft={setCompanyDraft}
          setShowCreateCompany={setShowCreateCompany}
          gstForm={gstForm}
          setGstForm={setGstForm}
          settings={settings}
          openCoa={openCoa}
          visibleAccounts={visibleAccounts}
          vouchers={vouchers}
          removeCoa={removeCoa}
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
          orgSettings={orgSettings}
          openSection={openSection}
          lockForm={lockForm}
          setLockForm={setLockForm}
          locks={locks}
          askReason={askReason}
          accountsRoles={accountsRoles}
          teamInvites={teamInvites}
          inviteDraft={inviteDraft}
          setInviteDraft={setInviteDraft}
          setTeamInvites={setTeamInvites}
          setAccountsRoles={setAccountsRoles}
          setInviteEmailDraft={setInviteEmailDraft}
          setNotice={setNotice}
          inviteEmailDraft={inviteEmailDraft}
          roleDraft={roleDraft}
          setRoleDraft={setRoleDraft}
          canWrite={canWrite}
          recurringTemplates={recurringTemplates}
          recurringDraft={recurringDraft}
          setRecurringDraft={setRecurringDraft}
          setRecurringTemplates={setRecurringTemplates}
          openSimpleFromRecurring={openSimpleFromRecurring}
          audit={audit}
          pagedAudit={pagedAudit}
        />}
      </>}

      {showVoucher && <Modal title="Post voucher" close={closeVoucher}>
        <p className="copy">Total debits must equal total credits. Unbalanced vouchers cannot be posted.</p>
        <VoucherForm accounts={visibleAccounts} parties={parties} voucherType={voucherType} setVoucherType={setVoucherType} form={voucherForm} setForm={setVoucherForm} lines={lines} setLines={setLines} onSubmit={submitVoucher} saving={saving} maxDate={todayIso()} />
      </Modal>}
      {showCreateCompany && <CreateCompanyModal
        saving={saving}
        setShowCreateCompany={setShowCreateCompany}
        companyDraft={companyDraft}
        run={run}
        token={token}
        setCompanyDraft={setCompanyDraft}
      />}
      {showSimple && <Modal title={SIMPLE_ENTRY_KINDS.find(item => item.id === simpleKind)?.label || "Entry"} close={closeSimple}>
        <SimpleEntryForm kind={simpleKind} accounts={visibleAccounts} parties={parties} form={simpleForm} setForm={setSimpleForm} onSubmit={submitSimple} saving={saving} maxDate={todayIso()} gstCompany={activeCompany} onGstSetup={() => { setShowSimple(false); openSection("setup"); }} items={items} stockByItem={stockByItem} openInvoices={settlementOpenInvoices} creditInfo={saleCreditInfo} />
      </Modal>}
      {showParty && <PartyModal
        partyForm={partyForm}
        closeParty={closeParty}
        saving={saving}
        saveParty={saveParty}
        setPartyForm={setPartyForm}
        vouchers={vouchers}
      />}
      {partyDeleteDialog?.mode === "confirm" && <DeletePartyModal
        saving={saving}
        setPartyDeleteDialog={setPartyDeleteDialog}
        confirmDeleteParty={confirmDeleteParty}
        partyDeleteDialog={partyDeleteDialog}
      />}
      {partyDeleteDialog?.mode === "blocked" && <PartyDeleteBlockedModal
        saving={saving}
        setPartyDeleteDialog={setPartyDeleteDialog}
        partyDeleteDialog={partyDeleteDialog}
        setPartyActiveState={setPartyActiveState}
      />}
      {showCoa && <CoaModal
        coaForm={coaForm}
        closeCoa={closeCoa}
        saving={saving}
        saveCoa={saveCoa}
        setCoaForm={setCoaForm}
        visibleAccounts={visibleAccounts}
      />}
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
      {confirmLogout && <LogoutConfirmModal signingOut={signingOut} setConfirmLogout={setConfirmLogout} confirmAccountsLogout={confirmAccountsLogout} />}
    </main>
  </div>;
}
