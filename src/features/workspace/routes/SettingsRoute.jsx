import { useNavigate, useOutletContext, useParams } from "react-router";
import { ReceiptSettingsPage } from "../../receipts/ReceiptSettingsPage.jsx";
import { partnerVisibleModuleLabels, workspacePaths } from "../paths.js";

// /settings/:tab (company, whatsapp, reminders, partners, backup): org settings, partners, workspace backup.
export function SettingsRoute() {
  const { token, access, onSettingsSaved } = useOutletContext();
  const { tab = "company" } = useParams();
  const navigate = useNavigate();
  return <div className="ft-route-page">
    <ReceiptSettingsPage
      token={token}
      close={() => navigate(workspacePaths.dashboard)}
      onSettingsSaved={onSettingsSaved}
      tab={tab}
      onTabChange={next => navigate(`/settings/${next}`)}
      partnerModules={partnerVisibleModuleLabels(access)}
    />
  </div>;
}
