import { useNavigate, useOutletContext } from "react-router";
import { ReceiptSettingsPage } from "../../receipts/ReceiptSettingsPage.jsx";
import { workspacePaths } from "../paths.js";

// /settings: receipt and WhatsApp settings; closing returns to the dashboard with the More menu expanded.
export function SettingsRoute() {
  const { token, onSettingsSaved } = useOutletContext();
  const navigate = useNavigate();
  return <div className="ft-route-page">
    <ReceiptSettingsPage token={token} close={() => navigate(workspacePaths.dashboard, { state: { moreOpen: true } })} onSettingsSaved={onSettingsSaved} />
  </div>;
}
