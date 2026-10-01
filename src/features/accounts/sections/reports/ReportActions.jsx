import { AccMoreMenu } from "../../components/AccUi.jsx";

// Export actions for the open report (the report list itself is the Reports sub-tab row in the page header).
export function ReportActions({ exportReport }) {
  return (
    <div className="accounts-action-row spacer">
      <div className="acc-btn-group">
        <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("csv")}>Export CSV</button>
        <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("xlsx")}>Export Excel</button>
        <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("pdf")}>Download PDF</button>
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
