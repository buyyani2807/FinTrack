import { useNavigate, useOutletContext, useParams } from "react-router";
import { ReceiptSettingsPage } from "../../receipts/ReceiptSettingsPage.jsx";
import { workspacePaths } from "../paths.js";

// /settings/:tab (company, whatsapp, reminders): receipt and WhatsApp settings; Cancel returns to the dashboard.
export function SettingsRoute() {
  const { token, onSettingsSaved } = useOutletContext();
  const { tab = "company" } = useParams();
  const navigate = useNavigate();
  return <div className="ft-route-page">
    <ReceiptSettingsPage token={token} close={() => navigate(workspacePaths.dashboard)} onSettingsSaved={onSettingsSaved} tab={tab} onTabChange={next => navigate(`/settings/${next}`)} />
  </div>;
}
