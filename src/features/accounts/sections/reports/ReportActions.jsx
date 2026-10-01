import { AccMoreMenu } from "../../components/AccUi.jsx";
import { REPORT_TABS } from "../../accountsNavigation.js";

export function ReportActions({ section, reportTab, openSection, setSection, setReportTab, exportReport }) {
  return (
    <div className="accounts-action-row spacer">
      <div className="accounts-section-nav">
      {REPORT_TABS.map(item => <button key={item.id} type="button" className={`accounts-section-tab ${(section === "pnl" ? "pnl" : section === "balance" ? "balance" : section === "trial" ? "trial" : reportTab) === item.id ? "active" : ""}`} onClick={() => {
        if (item.id === "pnl") openSection("pnl");
        else if (item.id === "balance") openSection("balance");
        else if (item.id === "trial") openSection("trial");
        else { setSection("reports"); setReportTab(item.id); }
      }}>{item.label}</button>)}
      </div>
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
