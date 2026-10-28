import { useEffect } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { ReportsHub } from "../../reportsCenter/ReportsHub.jsx";
import { reportById, visibleReports } from "../../reportsCenter/reportCatalog.js";
import { useReportPrefs } from "../../reportsCenter/useReportPrefs.js";

/** Top-level Reports Center for owners — catalogs reports and deep-links into existing modules. */
export function ReportsCenterRoute() {
  const { orgSettings, access } = useOutletContext();
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { touchRecent } = useReportPrefs();

  useEffect(() => {
    if (!reportId) return;
    const allowed = visibleReports(orgSettings, access);
    const report = allowed.find(item => item.id === reportId) || null;
    if (report?.href) {
      touchRecent(report.id);
      navigate(report.href, { replace: true });
      return;
    }
    if (reportById(reportId)) {
      navigate("/reports", { replace: true });
      return;
    }
    navigate("/reports", { replace: true });
  }, [reportId, orgSettings, access, navigate, touchRecent]);

  if (reportId) return null;

  return <ReportsHub orgSettings={orgSettings} access={access} />;
}
