import { Navigate, useOutletContext } from "react-router";
import { workspacePaths } from "../paths.js";

// Guards a route: users without access to the module (role or feature pack) are redirected, by default to the dashboard.
export function RequireModule({ module, to = workspacePaths.dashboard, children }) {
  const { access } = useOutletContext();
  if (!access[module]) return <Navigate to={to} replace />;
  return children;
}
