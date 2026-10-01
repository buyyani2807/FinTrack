import { useNavigate, useOutletContext } from "react-router";
import { ActiveChitSchemes } from "../ActiveChitSchemes.jsx";
import { chitSchemePath } from "../paths.js";

// /dashboard: the finance dashboard itself is drawn by the layout; this adds the owner's active Chit schemes below it.
export function DashboardRoute() {
  const { access, chitSchemes } = useOutletContext();
  const navigate = useNavigate();
  if (!access.chit) return null;
  return <ActiveChitSchemes schemes={chitSchemes} onOpen={schemeId => navigate(chitSchemePath(schemeId))} />;
}
