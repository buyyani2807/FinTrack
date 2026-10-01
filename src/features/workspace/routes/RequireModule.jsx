import { Navigate, Outlet, useOutletContext } from "react-router";
import { workspacePaths } from "../paths.js";

// Guards a route: users without access to the module (role or feature pack) are redirected, by default to the dashboard.
// With `outlet`, it guards a parent route and passes the workspace context on to its child routes.
export function RequireModule({ module, to = workspacePaths.dashboard, outlet = false, children = null }) {
  const context = useOutletContext();
  if (!context.access[module]) return <Navigate to={to} replace />;
  return outlet ? <Outlet context={context} /> : children;
}
