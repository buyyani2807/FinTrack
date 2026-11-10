import { Navigate, useOutletContext } from "react-router";
import { ModuleLockedPanel } from "../../commercial/ModuleLockedPanel.jsx";
import { moduleLockInfo } from "../../commercial/moduleAccess.js";
import { workspacePaths } from "../paths.js";

// Guards a route: locked modules show Unlock UI; role/pack denial redirects to dashboard.
export function RequireModule({ module, to = workspacePaths.dashboard, children }) {
  const { access, moduleState } = useOutletContext() || {};
  if (access?.[module]) return children;

  const locked = access?.locked?.[module];
  if (locked) {
    const info = moduleLockInfo(moduleState, module);
    return (
      <ModuleLockedPanel
        title={info?.title || "Module locked"}
        body={info?.body}
        product={info?.product}
        unlockPath={`${workspacePaths.moduleStore}?product=${encodeURIComponent(info?.productKey || "")}`}
      />
    );
  }

  return <Navigate to={to} replace />;
}
