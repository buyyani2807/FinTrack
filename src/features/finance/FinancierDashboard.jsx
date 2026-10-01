import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Badge, Button, Metric } from "../../components/ui.jsx";
import { claimTransactionConfirmation, loadPaymentReminderLog, loadTransactionConfirmationLog, loadUpcomingChitPayments, recordTransactionConfirmationResend, updateTransactionConfirmationStatus } from "../../lib/financeRepository";
import { formatInr as money } from "../../lib/formatMoney.js";
import { C } from "../../styles/theme.js";
import { AccountsSummaryCard } from "../cashbook/AccountsSummaryCard.jsx";
import { trackProductEvent } from "../commercial/productAnalytics.js";
import { AttentionCenterCard } from "../intelligence/AttentionCenterCard.jsx";
import { buildChitAttentionItems, buildTodaysActionList } from "../intelligence/attentionCenter.js";
import { ReceiptSuccessModal } from "../receipts/components/ReceiptActions.jsx";
import { RouteCollectionsEntryCard } from "../routeCollections/RouteCollectionsPage.jsx";
import { UpcomingPaymentsSection } from "../receipts/components/UpcomingPaymentsSection.jsx";
import { buildFinanceReceipt, formatReceiptDate, nextMonthlyPayment } from "../receipts/model/receiptModel.js";
import { buildDailyAccountOpenedVariables, buildMonthlyAccountOpenedVariables, CONFIRMATION_EVENTS, eventTypeForFinanceLoan, financeConfirmationToast, sendTransactionConfirmation } from "../receipts/io/transactionConfirmations.js";
import { buildChitUpcomingRows } from "../receipts/model/upcomingPayments.js";
import { CustomerStatementPage } from "../statements/CustomerStatementPage.jsx";
import { EditAccount, NewFinance, Payment } from "./components/AccountForms.jsx";
import { CustomerPortalSetup, KycEditor, NewAccountPortalNotice } from "./components/CustomerPortalKyc.jsx";
import { DashboardFinanceSection } from "./components/DashboardFinanceSection.jsx";
import { FinanceInsightsBrief } from "./components/FinanceInsightsBrief.jsx";
import { OperationsDetail } from "./components/OperationsDetail.jsx";
import { PortfolioReport } from "./PortfolioReport.jsx";
import { TodayCollections } from "./components/TodayCollections.jsx";
import { byCollectionOrderThenName, mergeAccountOrder, reorderIds } from "./model/collectionOrder";
import { accountOutcome, annualRate, collectedOn, dailyProgress, isDailyCollectionDueOn, loanBalance, loanPaid, loanStatus, monthlyInterestPending, today } from "./model/loanState.js";
import { realizedLoss, realizedProfit } from "./model/pnl.js";
import { accountPath, collectionsPath, modulePath, workspacePaths } from "../workspace/paths.js";

export function Financier({
  loans,
  businessName,
  logout,
  setLoans,
  onCreateLoan,
  onRecordPayment,
  onUpdateLoan,
  onDeleteLoan,
  onSaveCustomerPortal,
  onLoadKyc,
  onSaveKyc, activeChitSchemes = []
  , role = "staff", onStatusChange, onPaymentNoteChange, onPaymentCorrect, onPaymentDelete, onCollectionOrderChange,
  authToken, orgSettings = {}, workspace = {}, onLogReceipt, module = "all", collections = false, accountId = null,
}) {
  const [modal, setModal] = useState(null),
    [editLoan, setEditLoan] = useState(null),
    [portalLoan, setPortalLoan] = useState(null),
    [editKycLoan, setEditKycLoan] = useState(null),
    [kyc, setKyc] = useState(null),
    [filter, setFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [reportDate, setReportDate] = useState(today()),
    [moduleSection, setModuleSection] = useState("overview"),
    [newAccountPortal, setNewAccountPortal] = useState(null);
  // Today's collections and account detail are routes (see workspace/paths.js); the Overview / Customers / Reports
  // tabs are plain state and reset to Overview on reload.
  const collectionMode = collections, customerMode = !collections && moduleSection === "customers";
  const detail = accountId ? { id: accountId } : null;
  const [receiptSuccess, setReceiptSuccess] = useState(null);
  const [reminderLogState, setReminderLogState] = useState([]);
  const [confirmationLogState, setConfirmationLogState] = useState([]);
  const [statementLoan, setStatementLoan] = useState(null);
  const [chitAttention, setChitAttention] = useState([]);
  const isOwner = role === "owner";
  const detailId = detail?.id || null;
  useEffect(() => {
    if (!authToken) return;
    loadPaymentReminderLog(authToken).then(setReminderLogState).catch(() => setReminderLogState([]));
    loadTransactionConfirmationLog(authToken).then(setConfirmationLogState).catch(() => setConfirmationLogState([]));
  }, [authToken, detailId]);
  useEffect(() => {
    if (!isOwner || !authToken) {
      setChitAttention([]);
      return undefined;
    }
    let cancelled = false;
    loadUpcomingChitPayments(authToken)
      .then(rows => {
        if (!cancelled) setChitAttention(buildChitAttentionItems(buildChitUpcomingRows(rows || [])));
      })
      .catch(() => {
        if (!cancelled) setChitAttention([]);
      });
    return () => { cancelled = true; };
  }, [isOwner, authToken, activeChitSchemes]);
  const runFinanceConfirmation = async (loanLike, { resend = false } = {}) => {
    const eventType = eventTypeForFinanceLoan(loanLike);
    const variables = eventType === CONFIRMATION_EVENTS.monthly
      ? buildMonthlyAccountOpenedVariables(loanLike, orgSettings, workspace)
      : buildDailyAccountOpenedVariables(loanLike, orgSettings, workspace);
    const result = await sendTransactionConfirmation({
      token: authToken,
      eventType,
      sourceId: loanLike.id,
      phone: loanLike.phone,
      variables,
      settings: orgSettings,
      claimConfirmation: claimTransactionConfirmation,
      updateConfirmationStatus: updateTransactionConfirmationStatus,
      recordResend: recordTransactionConfirmationResend,
      resend,
    });
    loadTransactionConfirmationLog(authToken).then(setConfirmationLogState).catch(() => {});
    return financeConfirmationToast(result);
  };
  const createAccount = async loan => {
    const result = await onCreateLoan(loan);
    setModal(null);
    const savedLoan = { ...loan, id: result?.accountId || loan.id, portalId: result?.portalId || "" };
    let whatsAppNotice = "";
    try {
      whatsAppNotice = await runFinanceConfirmation(savedLoan);
    } catch {
      whatsAppNotice = "WhatsApp confirmation could not be sent.";
    }
    if (result?.portalId && result?.pin) {
      setNewAccountPortal({ customerName: loan.customerName, portalId: result.portalId, pin: result.pin, whatsAppNotice });
    }
  };
  const portalNotice = newAccountPortal && <NewAccountPortalNotice customerName={newAccountPortal.customerName} portalId={newAccountPortal.portalId} pin={newAccountPortal.pin} whatsAppNotice={newAccountPortal.whatsAppNotice || ""} close={() => setNewAccountPortal(null)} />;
  const [draggedId, setDraggedId] = useState(null);
  const [dashboardCustomersOpen, setDashboardCustomersOpen] = useState({ daily: false, monthly: false });
  const touchTargetId = useRef(null);
  const activeLoans = loans.filter(loan => ["active", "overdue"].includes(loanStatus(loan)));
  const location = useLocation();
  const navigateTo = useNavigate();
  const openAccount = loan => navigateTo(accountPath(loan), { state: { from: location.pathname } });
  // Back returns to wherever the account was opened from; a bookmarked account falls back to its module.
  const closeAccount = () => (location.state?.from ? navigateTo(-1) : navigateTo(modulePath(module)));
  const goModuleSection = next => {
    if (next === "collections") return navigateTo(collectionsPath(module));
    setModuleSection(next);
    if (next !== "customers") setStatusFilter("all");
    if (collections) navigateTo(modulePath(module));
  };
  // The tab, search and filters start afresh when the module changes or a sidebar link asks for it, and switching
  // accounts closes an open statement.
  const [appliedView, setAppliedView] = useState({ module: null, resetKey: null, accountId });
  const resetRequested = Boolean(location.state?.resetView) && appliedView.resetKey !== location.key;
  if (appliedView.module !== module || resetRequested || appliedView.accountId !== accountId) {
    setAppliedView({ module, resetKey: resetRequested ? location.key : appliedView.resetKey, accountId });
    if (appliedView.module !== module || resetRequested) {
      setModuleSection("overview");
      setFilter(module);
      setStatusFilter("all");
      setSearch("");
    }
    if (appliedView.accountId !== accountId) setStatementLoan(null);
  }
  useEffect(() => {
    if (module !== "all") window.scrollTo(0, 0);
  }, [module, appliedView.resetKey]);
  const dedicatedModule = !customerMode && (module === "daily" || module === "monthly");
  // Daily / Monthly Finance keep one page frame (header, title, actions, tabs) for Overview, Customers and Reports;
  // only the content below the tabs changes.
  const inModule = module === "daily" || module === "monthly";
  const moduleName = module === "monthly" ? "Monthly" : "Daily";
  const moduleHeader = <header className="top"><div><div className="brand">{businessName || "My Finance Business"}</div><div className="sub">{isOwner ? "Financier dashboard" : "Collection agent dashboard"} · {moduleName} collections</div></div><Button onClick={logout}>Log out</Button></header>;
  const moduleToolbar = <div className="toolbar"><div><h1 className="title">{moduleName} Finance</h1><p className="copy">{module === "monthly" ? "Monthly interest accounts and payment reminders." : "Daily 100-day collection accounts."}</p></div><div className="tabs"><Button onClick={() => goModuleSection("collections")}>Today’s collections</Button>{isOwner && <Button className="primary" onClick={() => setModal("new")}>+ New finance account</Button>}</div></div>;
  const moduleNav = <nav className="module-section-nav" aria-label="Module sections"><button type="button" className={`module-section-tab ${moduleSection === "overview" ? "active" : ""}`} aria-current={moduleSection === "overview" ? "page" : undefined} onClick={() => goModuleSection("overview")}>Overview</button><button type="button" className={`module-section-tab ${moduleSection === "customers" ? "active" : ""}`} aria-current={moduleSection === "customers" ? "page" : undefined} onClick={() => goModuleSection("customers")}>Customers</button>{isOwner && <button type="button" className={`module-section-tab ${moduleSection === "reports" ? "active" : ""}`} aria-current={moduleSection === "reports" ? "page" : undefined} onClick={() => goModuleSection("reports")}>Reports</button>}</nav>;
  const customerPool = customerMode
    ? loans.filter(loan => (statusFilter === "all" || loanStatus(loan) === statusFilter) && (module === "all" || loan.kind === module))
    : activeLoans.filter(loan => module === "all" || loan.kind === module);
  const shown = ((filter === "all" || module !== "all") ? customerPool : customerPool.filter(l => l.kind === filter)).filter(loan => `${loan.customerName} ${loan.phone} ${loan.address || ""}`.toLowerCase().includes(search.trim().toLowerCase())).filter(loan => !dedicatedModule || loanStatus(loan) === "active").sort((a, b) => a.collectionOrder - b.collectionOrder);
  const reorder = async targetId => {
    if (!isOwner || !draggedId || draggedId === targetId) return;
    const ordered = [...loans].sort((a, b) => a.collectionOrder - b.collectionOrder);
    const from = ordered.findIndex(l => l.id === draggedId), to = ordered.findIndex(l => l.id === targetId);
    const [moved] = ordered.splice(from, 1); ordered.splice(to, 0, moved);
    setDraggedId(null); await onCollectionOrderChange(ordered.map(l => l.id));
  };
  const startTouchDrag = (event, accountId) => {
    if (!isOwner) return;
    touchTargetId.current = accountId;
    setDraggedId(accountId);
  };
  const moveTouchDrag = event => {
    if (!touchTargetId.current) return;
    const touch = event.touches?.[0];
    const target = touch && document.elementFromPoint(touch.clientX, touch.clientY)?.closest("[data-account-id]");
    if (target) {
      touchTargetId.current = target.dataset.accountId;
      event.preventDefault();
    }
  };
  const finishTouchDrag = async () => {
    const targetId = touchTargetId.current;
    touchTargetId.current = null;
    if (!targetId) { setDraggedId(null); return; }
    if (!customerMode && (module === "all" || collectionMode)) {
      const kind = module === "all" ? loans.find(loan => loan.id === targetId)?.kind : module;
      if (kind) await reorderDashboard(kind, targetId);
      else setDraggedId(null);
      return;
    }
    await reorder(targetId);
  };
  const reorderDashboard = async (kind, targetId) => {
    if (!isOwner || !draggedId || draggedId === targetId) { setDraggedId(null); return; }
    const source = loans.find(loan => loan.id === draggedId);
    const target = loans.find(loan => loan.id === targetId);
    if (!source || !target || source.kind !== kind || target.kind !== kind) { setDraggedId(null); return; }
    const moving = loans.filter(loan => loan.kind === kind && loanStatus(loan) === "active").sort(byCollectionOrderThenName);
    const nextMoving = reorderIds(moving.map(loan => loan.id), draggedId, targetId);
    setDraggedId(null);
    await onCollectionOrderChange(mergeAccountOrder(loans, nextMoving, nextMoving));
  };
  const moduleLoans = module === "all" ? loans : loans.filter(loan => loan.kind === module);
  const total = moduleLoans.reduce((s, l) => s + (l.kind === "daily" ? l.collectionAmount : l.principal), 0);
  const addPayment = async t => {
    const loan = modal;
    const result = await onRecordPayment(loan, t);
    setModal(null);
    const transaction = result?.transaction;
    if (transaction?.receiptNumber) {
      const loanForReceipt = { ...loan, transactions: [...loan.transactions.filter(item => item.id !== transaction.id), transaction] };
      setReceiptSuccess(buildFinanceReceipt({ loan: loanForReceipt, transaction, settings: orgSettings, workspace }));
    }
  };
  useEffect(() => {
    if (!detail) { setKyc(null); return; }
    onLoadKyc(detail).then(setKyc).catch(() => setKyc(null));
  }, [detail?.id]);
  if (collectionMode) return <><TodayCollections loans={loans.filter(loan => loan.kind === module)} kind={module} back={() => goModuleSection("overview")} collect={setModal} view={openAccount} canReorder={isOwner} draggedId={draggedId} setDraggedId={setDraggedId} onReorder={targetId => reorderDashboard(module, targetId)} startTouchDrag={startTouchDrag} moveTouchDrag={moveTouchDrag} finishTouchDrag={finishTouchDrag} cancelTouchDrag={() => { touchTargetId.current = null; setDraggedId(null); }} />{modal && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}{receiptSuccess && <ReceiptSuccessModal receipt={receiptSuccess} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} close={() => setReceiptSuccess(null)} />}</>;
  if (detail) {
    const loan = loans.find(l => l.id === detail.id);
    if (!loan) return loans.length ? <main className="shell"><Button onClick={closeAccount}>← Back</Button><p className="copy spacer">This account could not be found.</p></main> : null;
    if (statementLoan && isOwner) {
      return <CustomerStatementPage mode="finance" loans={loans} focusLoan={statementLoan} settings={orgSettings} back={() => setStatementLoan(null)} trail={[statementLoan.kind === "monthly" ? "Monthly Finance" : "Daily Finance", statementLoan.customerName]} />;
    }
    return <main className="shell"><OperationsDetail loan={loan} relatedLoans={loans.filter(item => item.customerId && item.customerId === loan.customerId)} back={closeAccount} collect={setModal} edit={setEditLoan} remove={async account => { await onDeleteLoan(account); closeAccount(); }} portal={setPortalLoan} kyc={kyc} editKyc={setEditKycLoan} isOwner={isOwner} changeStatus={onStatusChange} editPaymentNote={onPaymentNoteChange} correctPayment={onPaymentCorrect} deletePayment={onPaymentDelete} orgSettings={orgSettings} authToken={authToken} workspace={workspace} onLogReceipt={onLogReceipt} reminderLog={reminderLogState} confirmationLog={confirmationLogState} onStatement={setStatementLoan} onResendConfirmation={account => runFinanceConfirmation(account, { resend: true })} />{modal && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}{isOwner && editLoan && <EditAccount loan={loan} close={() => setEditLoan(null)} save={onUpdateLoan} />}{isOwner && portalLoan && <CustomerPortalSetup loan={loan} close={() => setPortalLoan(null)} save={onSaveCustomerPortal} />}{isOwner && editKycLoan && <KycEditor loan={loan} current={kyc} close={() => setEditKycLoan(null)} save={async (account, aadhaar, pan) => { await onSaveKyc(account, aadhaar, pan); setKyc(await onLoadKyc(account)); }} />}{receiptSuccess && <ReceiptSuccessModal receipt={receiptSuccess} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} close={() => setReceiptSuccess(null)} />}</main>;
  }
  if (!customerMode && module === "all") {
    const dailyCustomers = loans.filter(loan => loan.kind === "daily" && loanStatus(loan) === "active").sort(byCollectionOrderThenName);
    const monthlyCustomers = loans.filter(loan => loan.kind === "monthly" && loanStatus(loan) === "active").sort(byCollectionOrderThenName);
    const attention = buildTodaysActionList({
      dailyLoans: dailyCustomers,
      monthlyLoans: monthlyCustomers.map(loan => ({ ...loan, attentionDueAmount: monthlyInterestPending(loan) })),
      chitAttention,
      today: today(),
    });
    return <main className="shell dashboard-home"><header className="top"><div><div className="brand">{businessName || "My Finance Business"}</div><div className="sub">{isOwner ? "Financier dashboard" : "Collection agent dashboard"}</div></div><div className="top-actions"><Button onClick={logout}>Log out</Button></div></header><div className="toolbar"><div><h1 className="title">Dashboard</h1><p className="copy">Overview of your active finance customers and Chit Fund schemes.</p></div></div>{isOwner && <AttentionCenterCard attention={attention} kicker="Today's actions" onNavigate={href => {
      trackProductEvent("attention_navigate", { module: href?.panel || "", section: href?.section || "" });
      if (href?.panel === "chit") {
        navigateTo(workspacePaths.chit);
        return;
      }
      if (href?.panel === "accounts") {
        if (href.section) sessionStorage.setItem("fintrack-open-accounts-section", href.section);
        navigateTo(workspacePaths.accounts);
        return;
      }
      if (href?.panel === "daily" || href?.panel === "monthly") {
        if (href.section === "collections") {
          navigateTo(collectionsPath(href.panel));
          return;
        }
        if (href.detailId) { const target = loans.find(loan => loan.id === href.detailId); if (target) openAccount(target); }
        else navigateTo(modulePath(href.panel));
      }
    }} />}{isOwner && authToken && <AccountsSummaryCard token={authToken} moneyFmt={money} onOpen={() => navigateTo(workspacePaths.cashbook)} />}{authToken && <RouteCollectionsEntryCard token={authToken} onOpen={() => navigateTo(workspacePaths.routeCollections)} />}<DashboardFinanceSection title="Daily Finance" customerLabel="Active Daily Customers" kind="daily" loans={dailyCustomers} customersOpen={dashboardCustomersOpen.daily} onToggleCustomers={() => setDashboardCustomersOpen(current => ({ ...current, daily: !current.daily }))} onView={openAccount} canReorder={isOwner} showPnl={isOwner} draggedId={draggedId} setDraggedId={setDraggedId} onReorder={id => reorderDashboard("daily", id)} startTouchDrag={startTouchDrag} moveTouchDrag={moveTouchDrag} finishTouchDrag={finishTouchDrag} cancelTouchDrag={() => { touchTargetId.current = null; setDraggedId(null); }} /><DashboardFinanceSection title="Monthly Finance" customerLabel="Active Monthly Customers" kind="monthly" loans={monthlyCustomers} customersOpen={dashboardCustomersOpen.monthly} onToggleCustomers={() => setDashboardCustomersOpen(current => ({ ...current, monthly: !current.monthly }))} onView={openAccount} canReorder={isOwner} showPnl={isOwner} draggedId={draggedId} setDraggedId={setDraggedId} onReorder={id => reorderDashboard("monthly", id)} startTouchDrag={startTouchDrag} moveTouchDrag={moveTouchDrag} finishTouchDrag={finishTouchDrag} cancelTouchDrag={() => { touchTargetId.current = null; setDraggedId(null); }} />{portalNotice}{receiptSuccess && <ReceiptSuccessModal receipt={receiptSuccess} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} close={() => setReceiptSuccess(null)} />}</main>;
  }
  if (dedicatedModule && isOwner && moduleSection === "reports") {
    return <main className={`shell finance-module-shell ${module}`}>{moduleHeader}{moduleToolbar}{moduleNav}<PortfolioReport loans={loans.filter(loan => loan.kind === module)} token={authToken} lockedKind={module} showChit={false} embedded title={`${module === "monthly" ? "Monthly" : "Daily"} Reports`} />{isOwner && modal === "new" && <NewFinance kind={module} close={() => setModal(null)} save={createAccount} />}{portalNotice}</main>;
  }
  {
    const loans = moduleLoans;
    const totalProfit = loans.reduce((sum, loan) => sum + realizedProfit(loan), 0), totalLoss = loans.reduce((sum, loan) => sum + realizedLoss(loan), 0);
  return <main className={`shell finance-module-shell ${module}`}>{inModule ? <>{moduleHeader}{moduleToolbar}{moduleNav}</> : <><header className="top"><div><div className="brand">{businessName || "My Finance Business"}</div><div className="sub">{isOwner ? "Financier dashboard" : "Collection agent dashboard"}{dedicatedModule ? ` · ${module === "monthly" ? "Monthly" : "Daily"} collections` : " · Daily & monthly collections"}</div></div><Button onClick={logout}>Log out</Button></header><div className="toolbar"><div><h1 className="title">{customerMode ? "Customers" : module === "monthly" ? "Monthly Finance" : module === "daily" ? "Daily Finance" : "Finance portfolio"}</h1>{customerMode ? <p className="copy">Manage active and historical customer accounts.</p> : dedicatedModule ? <p className="copy">{module === "monthly" ? "Monthly interest accounts and payment reminders." : "Daily 100-day collection accounts."}</p> : !isOwner && <p className="copy">View assigned accounts and record only collections you receive.</p>}</div><div className="tabs">{customerMode ? <Button onClick={() => goModuleSection("overview")}>← Dashboard</Button> : <><Button onClick={() => goModuleSection("collections")}>Today’s collections</Button>{isOwner && <Button className="primary" onClick={() => setModal("new")}>+ New finance account</Button>}</>}</div></div></>}<div className="finance-module-body">{module === "monthly" && !customerMode && <UpcomingPaymentsSection moduleType="monthly" loans={loans} token={authToken} settings={orgSettings} workspace={workspace} isOwner={isOwner} />}<div className="grid metrics"><Metric label={dedicatedModule ? "Active customers" : "Customers"} value={dedicatedModule ? loans.filter(loan => loanStatus(loan) === "active").length : loans.length} color="blue" onClick={dedicatedModule ? () => goModuleSection("customers") : undefined} /><Metric label="Amount financed" value={money(total)} color="gold" /><Metric label="Amounts received" value={money(loans.reduce((s, l) => s + loanPaid(l), 0))} color="green" /><Metric label="Outstanding" value={money(loans.reduce((s, l) => s + loanBalance(l), 0))} color="red" />{isOwner && <Metric label="Profit / loss" value={`${money(totalProfit)} / ${money(totalLoss)}`} color={totalLoss ? "red" : "green"} />}</div>{dedicatedModule && !customerMode && <FinanceInsightsBrief kind={module} loans={loans} isOwner={isOwner} onViewCustomers={() => goModuleSection("customers")} />}</div><div className="card"><div className="toolbar"><strong>{customerMode ? "All customer accounts" : dedicatedModule ? "Active customers" : "Open collection accounts"}</strong>{!dedicatedModule && <div className="tabs">{customerMode && <><Button className={`tab ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>All</Button><Button className={`tab ${statusFilter === "active" ? "active" : ""}`} onClick={() => setStatusFilter("active")}>Active</Button><Button className={`tab ${statusFilter === "completed" ? "active" : ""}`} onClick={() => setStatusFilter("completed")}>Completed</Button><Button className={`tab ${statusFilter === "closed" ? "active" : ""}`} onClick={() => setStatusFilter("closed")}>Closed</Button><Button className={`tab ${statusFilter === "bankrupt" ? "active" : ""}`} onClick={() => setStatusFilter("bankrupt")}>{customerMode ? "Defaulters" : "Bankrupt"}</Button></>}{module === "all" && (customerMode ? <><Button className={`tab ${filter === "daily" ? "active" : ""}`} onClick={() => setFilter("daily")}>Daily</Button><Button className={`tab ${filter === "monthly" ? "active" : ""}`} onClick={() => setFilter("monthly")}>Monthly</Button></> : <><Button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</Button><Button className={`tab ${filter === "daily" ? "active" : ""}`} onClick={() => setFilter("daily")}>Daily</Button><Button className={`tab ${filter === "monthly" ? "active" : ""}`} onClick={() => setFilter("monthly")}>Monthly</Button></>)}</div>}</div><div className="customer-search"><input aria-label="Search customer" placeholder="Search name, phone, or address" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button onClick={() => setSearch("")}>Clear</Button>}</div><div className="table"><table><thead><tr>{isOwner && <th>Route</th>}<th>Customer</th><th>Finance</th><th>Amount financed</th><th>Paid</th><th>Balance</th>{dedicatedModule && module === "monthly" && <th>Next due</th>}<th>Status</th><th></th></tr></thead><tbody>{shown.map((l, index) => <tr key={l.id} data-account-id={l.id} className={draggedId === l.id ? "route-row-dragging" : ""} draggable={isOwner} onDragStart={() => setDraggedId(l.id)} onDragEnd={() => setDraggedId(null)} onDragOver={e => isOwner && e.preventDefault()} onDrop={() => reorder(l.id)}><td className={isOwner ? "small route-handle" : "small"} onTouchStart={event => startTouchDrag(event, l.id)} onTouchMove={moveTouchDrag} onTouchEnd={finishTouchDrag} onTouchCancel={() => { touchTargetId.current = null; setDraggedId(null); }}>{isOwner && `↕ ${index + 1}`}</td><td><div style={{ display:"flex", alignItems:"center", gap:10 }}><span style={{ width:34, height:34, borderRadius:"50%", display:"grid", placeItems:"center", background:"rgba(114,170,255,.16)", color:C.blue, fontWeight:700 }}>{l.customerName.charAt(0).toUpperCase()}</span><div><strong>{l.customerName}</strong><br /><a className="small phone-link" href={`tel:${l.phone}`}>{l.phone}</a></div></div></td><td>{l.kind === "daily" ? "Daily · 100 days" : "Monthly interest"}<br /><span className="small">{l.kind === "monthly" ? `${annualRate(l, today())}% per month` : `${money(l.dailyCollection)}/day`}</span>{l.kind === "daily" && loanStatus(l) === "active" && <><br /><span className="small">{`Day ${dailyProgress(l).completed} / 100 · ${dailyProgress(l).completed} completed · ${dailyProgress(l).remaining} remaining`}</span></>}{accountOutcome(l) && <><br /><span className="small">{`${accountOutcome(l).label} date: ${accountOutcome(l).date || "Not recorded"}${accountOutcome(l).days ? ` · ${accountOutcome(l).label} in ${accountOutcome(l).days} days` : ""}`}</span></>}</td><td>{money(l.kind === "daily" ? l.collectionAmount : l.principal)}</td><td className="green">{money(loanPaid(l))}</td><td className="red">{money(loanBalance(l))}</td>{dedicatedModule && module === "monthly" && <td>{formatReceiptDate(nextMonthlyPayment(l, today())?.dueDate) || "—"}</td>}<td><Badge status={loanStatus(l)} /></td><td><Button onClick={() => openAccount(l)}>View</Button>{["active", "overdue"].includes(loanStatus(l)) && (() => { const dueEligible = l.kind !== "daily" || isDailyCollectionDueOn(l); const paid = collectedOn(l); return <Button className="primary" disabled={!dueEligible || paid} onClick={() => dueEligible && !paid && setModal(l)}>{!dueEligible ? "Starts tomorrow" : paid ? "Collected today" : "Collect"}</Button>; })()}</td></tr>)}</tbody></table></div>{shown.length === 0 && <p className="small spacer">No customers match your search.</p>}</div>{isOwner && modal === "new" && <NewFinance kind={module === "monthly" || module === "daily" ? module : (filter === "monthly" || filter === "daily" ? filter : "daily")} close={() => setModal(null)} save={createAccount} />}{modal && modal !== "new" && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}{portalNotice}{receiptSuccess && <ReceiptSuccessModal receipt={receiptSuccess} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} close={() => setReceiptSuccess(null)} />}</main>;
  }
}
