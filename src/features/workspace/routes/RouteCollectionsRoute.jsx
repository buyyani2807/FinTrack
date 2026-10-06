import { Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { RouteCollectionsPage } from "../../routeCollections/RouteCollectionsPage.jsx";
import { workspacePaths } from "../paths.js";

// /route-collections: a collection agent's distributor route sheet (any signed-in user; the RPCs scope to their routes).
export function RouteCollectionsRoute() {
  const { token, workspace, access } = useOutletContext();
  const { routeId = "today" } = useParams();
  const navigate = useNavigate();
  if (!access.isOwner && workspace?.collectionScope === "finance") return <Navigate to={workspacePaths.dashboard} replace />;
  const page = <RouteCollectionsPage token={token} businessName={workspace?.businessName} back={access.isOwner ? null : () => navigate(workspacePaths.dashboard)} routeId={routeId} onRouteChange={next => navigate(next === "today" ? workspacePaths.routeCollections : `${workspacePaths.routeCollections}/${encodeURIComponent(next)}`)} />;
  if (!access.isOwner) return page;
  return <div className="rc-owner-overlay">{page}</div>;
}
