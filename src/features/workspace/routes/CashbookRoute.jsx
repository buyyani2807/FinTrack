import { useOutletContext } from "react-router";
import { CashbookWorkspace } from "../../cashbook/CashbookWorkspace.jsx";

// /cashbook
export function CashbookRoute() {
  const { token, loans } = useOutletContext();
  return <div className="ft-route-page">
    <CashbookWorkspace token={token} loans={loans} />
  </div>;
}
