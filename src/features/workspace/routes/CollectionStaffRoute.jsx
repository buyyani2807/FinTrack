import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { accountsPath } from "../../accounts/accountsNavigation.js";
import { COMPANY_STORAGE_KEY } from "../../accounts/data/accountsCache.js";
import { loadAccountsCompanies, loadAgentRouteCustomers, loadRouteCustomerCounts } from "../../accounts/data/accountingRepository.js";
import { CollectionStaffPage } from "../../finance/CollectionStaffPage.jsx";
import { workspacePaths } from "../paths.js";

// /collection-staff: staff list; /collection-staff/:staffId: one staff member's customer assignments.
export function CollectionStaffRoute() {
  const { loans, token, onLoadAgents, onCreateAgent, onAssignAgent, onUpdateAgent } = useOutletContext();
  const { staffId = null } = useParams();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const loadRouteCustomers = useCallback(agent => loadAgentRouteCustomers(token, agent), [token]);
  const loadRouteCounts = useCallback(list => loadRouteCustomerCounts(token, list), [token]);
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
    loadRouteCustomers={loadRouteCustomers}
    loadRouteCounts={loadRouteCounts}
    onOpenRoutes={companyId => {
      if (companyId) {
        try { sessionStorage.setItem(COMPANY_STORAGE_KEY, companyId); } catch { /* keep the current company */ }
      }
      navigate(`${accountsPath({ section: "routes" })}?company=${encodeURIComponent(companyId)}`);
    }}
    loadAgents={onLoadAgents}
    createAgent={onCreateAgent}
    assignAgent={onAssignAgent}
    updateAgent={onUpdateAgent}
    staffId={staffId}
    onSelect={id => navigate(id ? `${workspacePaths.collectionStaff}/${encodeURIComponent(id)}` : workspacePaths.collectionStaff)}
  />;
}
