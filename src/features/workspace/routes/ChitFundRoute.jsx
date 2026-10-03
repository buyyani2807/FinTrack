import { useNavigate, useOutletContext, useParams } from "react-router";
import { ChitFundPage } from "../../chitFund/ChitFundPage.jsx";
import { chitPath } from "../paths.js";

// /chit-fund/:tab, /chit-fund/schemes/:schemeId/:schemeTab and /chit-fund/schemes/:schemeId/members/:memberId.
export function ChitFundRoute() {
  const { token, orgSettings, workspace, onLogReceipt, setChitSchemes } = useOutletContext();
  const { tab = "schemes", schemeId = null, schemeTab = "overview", memberId = null } = useParams();
  const navigate = useNavigate();
  return <div className="chit-dashboard ft-route-page">
    <ChitFundPage
      token={token}
      orgSettings={orgSettings}
      workspace={workspace}
      onLogReceipt={onLogReceipt}
      tab={tab}
      schemeId={schemeId}
      schemeTab={memberId ? "members" : schemeTab}
      memberId={memberId}
      onNavigate={target => navigate(chitPath(target))}
      onSchemesChanged={schemes => setChitSchemes((schemes || []).filter(scheme => scheme.status === "active"))}
    />
  </div>;
}
