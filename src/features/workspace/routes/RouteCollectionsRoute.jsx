import { useNavigate, useOutletContext } from "react-router";
import { RouteCollectionsPage } from "../../routeCollections/RouteCollectionsPage.jsx";
import { workspacePaths } from "../paths.js";

// /route-collections: a collection agent's distributor route sheet (any signed-in user; the RPCs scope to their routes).
export function RouteCollectionsRoute() {
  const { token, workspace, access } = useOutletContext();
  const navigate = useNavigate();
  const page = <RouteCollectionsPage token={token} businessName={workspace?.businessName} back={() => navigate(workspacePaths.dashboard)} />;
  if (!access.isOwner) return page;
  return <div className="rc-owner-overlay">{page}</div>;
}
