import { useNavigate, useOutletContext, useParams } from "react-router";
import { CashbookWorkspace } from "../../cashbook/CashbookWorkspace.jsx";

// /cashbook/:section (cashbook, expenses, bank, transfers, closing, reports)
export function CashbookRoute() {
  const { token, loans, access } = useOutletContext();
  const { section = "cashbook" } = useParams();
  const navigate = useNavigate();
  const canWrite = Boolean(access?.canWriteFinance ?? access?.isOwner);
  return <div className="ft-route-page">
    <CashbookWorkspace
      token={token}
      loans={loans}
      section={section}
      canWrite={canWrite}
      onSectionChange={next => navigate(`/cashbook/${next}`)}
    />
  </div>;
}
