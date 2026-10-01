import { useNavigate, useOutletContext } from "react-router";
import { CollectionStaffPage } from "../../finance/CollectionStaffPage.jsx";
import { workspacePaths } from "../paths.js";

// /collection-staff: opens over the dashboard; closing returns to it with the More menu expanded.
export function CollectionStaffRoute() {
  const { loans, onLoadAgents, onCreateAgent, onAssignAgent, onUpdateAgent } = useOutletContext();
  const navigate = useNavigate();
  return <CollectionStaffPage
    loans={loans}
    close={() => navigate(workspacePaths.dashboard, { state: { moreOpen: true } })}
    loadAgents={onLoadAgents}
    createAgent={onCreateAgent}
    assignAgent={onAssignAgent}
    updateAgent={onUpdateAgent}
  />;
}
