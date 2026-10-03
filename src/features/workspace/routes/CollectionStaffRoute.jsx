import { useNavigate, useOutletContext, useParams } from "react-router";
import { CollectionStaffPage } from "../../finance/CollectionStaffPage.jsx";
import { workspacePaths } from "../paths.js";

// /collection-staff: staff list; /collection-staff/:staffId: one staff member's customer assignments.
export function CollectionStaffRoute() {
  const { loans, onLoadAgents, onCreateAgent, onAssignAgent, onUpdateAgent } = useOutletContext();
  const { staffId = null } = useParams();
  const navigate = useNavigate();
  return <CollectionStaffPage
    loans={loans}
    loadAgents={onLoadAgents}
    createAgent={onCreateAgent}
    assignAgent={onAssignAgent}
    updateAgent={onUpdateAgent}
    staffId={staffId}
    onSelect={id => navigate(id ? `${workspacePaths.collectionStaff}/${encodeURIComponent(id)}` : workspacePaths.collectionStaff)}
  />;
}
