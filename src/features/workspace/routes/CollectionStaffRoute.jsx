import { useOutletContext } from "react-router";
import { CollectionStaffPage } from "../../finance/CollectionStaffPage.jsx";

// /collection-staff: staff list, and one staff member's customer assignments.
export function CollectionStaffRoute() {
  const { loans, onLoadAgents, onCreateAgent, onAssignAgent, onUpdateAgent } = useOutletContext();
  return <CollectionStaffPage
    loans={loans}
    loadAgents={onLoadAgents}
    createAgent={onCreateAgent}
    assignAgent={onAssignAgent}
    updateAgent={onUpdateAgent}
  />;
}
