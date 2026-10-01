import { useNavigate, useOutletContext } from "react-router";
import { CashbookWorkspace } from "../../cashbook/CashbookWorkspace.jsx";
import { workspacePaths } from "../paths.js";

// /cashbook
export function CashbookRoute() {
  const { token, loans } = useOutletContext();
  const navigate = useNavigate();
  return <div className="ft-route-page">
    <CashbookWorkspace token={token} close={() => navigate(workspacePaths.dashboard)} loans={loans} />
  </div>;
}
