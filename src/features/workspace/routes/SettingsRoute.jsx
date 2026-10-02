import { useNavigate, useOutletContext } from "react-router";
import { ReceiptSettingsPage } from "../../receipts/ReceiptSettingsPage.jsx";
import { workspacePaths } from "../paths.js";

// /settings: receipt and WhatsApp settings; Cancel returns to the dashboard.
export function SettingsRoute() {
  const { token, onSettingsSaved } = useOutletContext();
  const navigate = useNavigate();
  return <div className="ft-route-page">
    <ReceiptSettingsPage token={token} close={() => navigate(workspacePaths.dashboard)} onSettingsSaved={onSettingsSaved} />
  </div>;
}
