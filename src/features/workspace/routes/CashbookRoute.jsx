import { useNavigate, useOutletContext } from "react-router";
import { C } from "../../../styles/theme.js";
import { CashbookWorkspace } from "../../accounts/AccountsModule.jsx";
import { workspacePaths } from "../paths.js";

// /cashbook
export function CashbookRoute() {
  const { token, loans } = useOutletContext();
  const navigate = useNavigate();
  return <div style={{ position: "fixed", inset: 0, zIndex: 5, overflow: "auto", background: C.bg }}>
    <CashbookWorkspace token={token} close={() => navigate(workspacePaths.dashboard)} loans={loans} />
  </div>;
}
