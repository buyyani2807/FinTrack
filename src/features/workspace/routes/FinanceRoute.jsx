import { Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { Financier } from "../../finance/FinancierDashboard.jsx";
import { ActiveChitSchemes } from "../ActiveChitSchemes.jsx";
import { chitSchemePath, workspacePaths } from "../paths.js";

// The finance dashboard: /dashboard (module "all"), /daily-finance and /monthly-finance, each with
// Today's collections (view "collections") and an account's page (view "account", /accounts/:accountId).
// Every one of these routes renders this same component, so moving between them keeps the dashboard's state.
export function FinanceRoute({ module, view = "overview" }) {
  const { access, session, chitSchemes } = useOutletContext();
  const { accountId = null } = useParams();
  const navigate = useNavigate();
  if (module !== "all" && !access[module]) return <Navigate to={workspacePaths.dashboard} replace />;

  const {
    loans, workspace, setLoans, createLoan, savePayment, updateLoan, removeLoan, saveCustomerPortal, getKyc, updateKyc,
    changeStatus, changePaymentNotes, correctPayment, removePayment, changeCollectionOrder, showOwnerChrome, logout, user, logReceipt,
  } = session;
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
      collections={view === "collections"}
      accountId={view === "account" ? accountId : null}
    />
    {module === "all" && access.chit && <ActiveChitSchemes schemes={chitSchemes} onOpen={schemeId => navigate(chitSchemePath(schemeId))} />}
  </>;
}
