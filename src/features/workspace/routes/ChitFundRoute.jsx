import { useNavigate, useOutletContext, useParams } from "react-router";
import { ChitFundPage } from "../../chitFund/ChitFundPage.jsx";
import { workspacePaths } from "../paths.js";

// /chit and /chit/:schemeId (opens that scheme, e.g. from a dashboard card).
export function ChitFundRoute() {
  const { token, orgSettings, workspace, onLogReceipt, setChitSchemes } = useOutletContext();
  const { schemeId = null } = useParams();
  const navigate = useNavigate();
  return <div className="chit-dashboard ft-route-page">
    <ChitFundPage
      token={token}
      orgSettings={orgSettings}
      workspace={workspace}
      onLogReceipt={onLogReceipt}
      openSchemeId={schemeId}
      onOpenSchemeConsumed={() => navigate(workspacePaths.chit, { replace: true })}
      onSchemesChanged={schemes => setChitSchemes((schemes || []).filter(scheme => scheme.status === "active"))}
    />
  </div>;
}
