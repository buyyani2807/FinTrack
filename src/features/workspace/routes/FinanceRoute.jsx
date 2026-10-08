import { Navigate, useNavigate, useOutletContext } from "react-router";
import { Financier } from "../../finance/FinancierDashboard.jsx";
import { ActiveChitSchemes } from "../ActiveChitSchemes.jsx";
import { chitSchemePath, collectionsPath, financeSectionPath, workspacePaths } from "../paths.js";

// The finance dashboard: /dashboard (module "all"), and each tab of /daily-finance and /monthly-finance
// (section: overview, collections, customers, users, reports). Every one of these routes renders this same component,
// so moving between them keeps the dashboard's state.
export function FinanceRoute({ module, section = "overview" }) {
  const { access, session, chitSchemes } = useOutletContext();
  const navigate = useNavigate();
  if (module !== "all" && !access[module]) return <Navigate to={workspacePaths.dashboard} replace />;
  const {
    loans, workspace, setLoans, createLoan, savePayment, updateLoan, removeLoan, saveCustomerPortal, getKyc, updateKyc,
    changeStatus, changePaymentNotes, correctPayment, removePayment, changeCollectionOrder, showOwnerChrome, logout, user, logReceipt,
  } = session;
  if (!showOwnerChrome && workspace?.collectionScope === "accounts" && (module === "daily" || module === "monthly")) {
    return <Navigate to={workspacePaths.routeCollections} replace />;
  }
  // Finance agents start on Today's collections, so that tab is present before a customer is opened.
  if (!showOwnerChrome && workspace?.collectionScope !== "accounts" && module === "all") {
    const hasDaily = (loans || []).some(loan => loan.kind === "daily");
    const hasMonthly = (loans || []).some(loan => loan.kind === "monthly");
    if (hasDaily && access.daily) return <Navigate to={collectionsPath("daily")} replace />;
    if (hasMonthly && access.monthly) return <Navigate to={collectionsPath("monthly")} replace />;
  }
  // Reports are for owners; collection agents land on Overview.
  if (section === "reports" && !access.isOwner) return <Navigate to={financeSectionPath(module, "overview")} replace />;

  return <>
    <Financier
      loans={loans}
      businessName={workspace?.businessName}
      setLoans={setLoans}
      onCreateLoan={createLoan}
      onRecordPayment={savePayment}
      onUpdateLoan={updateLoan}
      onDeleteLoan={removeLoan}
      onSaveCustomerPortal={saveCustomerPortal}
      onLoadKyc={getKyc}
      onSaveKyc={updateKyc}
      onStatusChange={changeStatus}
      onPaymentNoteChange={changePaymentNotes}
      onPaymentCorrect={correctPayment}
      onPaymentDelete={removePayment}
      onCollectionOrderChange={changeCollectionOrder}
      role={showOwnerChrome ? "owner" : "staff"}
      logout={logout}
      authToken={user.authToken}
      orgSettings={workspace?.organizationSettings || {}}
      workspace={workspace || {}}
      onLogReceipt={logReceipt}
      activeChitSchemes={chitSchemes}
      module={module}
      section={module === "all" ? null : section}
    />
    {module === "all" && access.chit && <ActiveChitSchemes schemes={chitSchemes} onOpen={schemeId => navigate(chitSchemePath(schemeId))} />}
  </>;
}
