import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { loadAccountsCompanies } from "../../accounts/data/accountingRepository.js";
import { CollectionStaffPage } from "../../finance/CollectionStaffPage.jsx";
import { workspacePaths } from "../paths.js";

// /collection-staff: staff list; /collection-staff/:staffId: one staff member's customer assignments.
export function CollectionStaffRoute() {
  const { loans, token, onLoadAgents, onCreateAgent, onAssignAgent, onUpdateAgent } = useOutletContext();
  const { staffId = null } = useParams();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    loadAccountsCompanies(token)
      .then(rows => { if (!cancelled) setCompanies(rows || []); })
      .catch(() => { if (!cancelled) setCompanies([]); });
    return () => { cancelled = true; };
  }, [token]);
  return <CollectionStaffPage
    loans={loans}
    companies={companies}
    loadAgents={onLoadAgents}
    createAgent={onCreateAgent}
    assignAgent={onAssignAgent}
    updateAgent={onUpdateAgent}
    staffId={staffId}
    onSelect={id => navigate(id ? `${workspacePaths.collectionStaff}/${encodeURIComponent(id)}` : workspacePaths.collectionStaff)}
  />;
}
