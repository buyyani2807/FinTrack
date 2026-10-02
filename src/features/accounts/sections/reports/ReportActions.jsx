import { AccMoreMenu } from "../../components/AccUi.jsx";
import { ExportGroup } from "../../../../components/ui.jsx";

// Export actions for the open report (the report list itself is the Reports sub-tab row in the page header).
export function ReportActions({ exportReport }) {
  return (
    <div className="accounts-action-row spacer">
      <div className="acc-btn-group">
        <ExportGroup className="acc-hide-mobile" formats={[{ id: "csv", label: "CSV", onClick: () => exportReport("csv") }, { id: "xlsx", label: "Excel", onClick: () => exportReport("xlsx") }, { id: "pdf", label: "PDF", onClick: () => exportReport("pdf") }]} />
        <AccMoreMenu
          className="acc-show-mobile"
          label="Export"
          items={[
            { id: "csv", label: "Export CSV", onClick: () => exportReport("csv") },
            { id: "xlsx", label: "Export Excel", onClick: () => exportReport("xlsx") },
            { id: "pdf", label: "Download PDF", onClick: () => exportReport("pdf") },
          ]}
        />
      </div>
    </div>
  );
}
