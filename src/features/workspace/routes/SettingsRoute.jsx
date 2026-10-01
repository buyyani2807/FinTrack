import { useNavigate, useOutletContext } from "react-router";
import { C } from "../../../styles/theme.js";
import { ReceiptSettingsPage } from "../../receipts/ReceiptSettingsPage.jsx";
import { workspacePaths } from "../paths.js";

// /settings: receipt and WhatsApp settings; closing returns to the dashboard with the More menu expanded.
export function SettingsRoute() {
  const { token, onSettingsSaved } = useOutletContext();
  const navigate = useNavigate();
  return <div style={{ position: "fixed", inset: 0, zIndex: 5, overflow: "auto", background: C.bg }}>
    <ReceiptSettingsPage token={token} close={() => navigate(workspacePaths.dashboard, { state: { moreOpen: true } })} onSettingsSaved={onSettingsSaved} />
  </div>;
}
