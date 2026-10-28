import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Star } from "lucide-react";
import { REPORT_CATEGORIES, visibleReports } from "./reportCatalog.js";
import { useReportPrefs } from "./useReportPrefs.js";
import "./reportsCenter.css";

function ReportCard({ report, pinned, onOpen, onTogglePin }) {
  return (
    <article className="ft-reports-card">
      <div className="ft-reports-card-top">
        <h3>{report.name}</h3>
        <button
          type="button"
          className={`ft-reports-pin${pinned ? " is-on" : ""}`}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${report.name}` : `Pin ${report.name}`}
          onClick={() => onTogglePin(report.id)}
        >
          <Star size={18} fill={pinned ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>
      <p>{report.description}</p>
      <p className="ft-reports-meta">Helps you: {report.helps}</p>
      <p className="ft-reports-meta">Period: {report.period}</p>
      <div className="ft-reports-card-actions">
        <button type="button" className="btn primary" onClick={() => onOpen(report)}>View report</button>
        {report.exportable ? <span className="small">Export inside report</span> : null}
      </div>
    </article>
  );
}

export function ReportsHub({ orgSettings = {}, access = {} }) {
  const navigate = useNavigate();
  const { recent, pinned, touchRecent, togglePinned } = useReportPrefs();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const reports = useMemo(() => visibleReports(orgSettings, access), [orgSettings, access]);
  const byId = useMemo(() => new Map(reports.map(report => [report.id, report])), [reports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter(report => {
      if (category !== "all" && report.category !== category) return false;
      if (!q) return true;
      return `${report.name} ${report.description} ${report.helps}`.toLowerCase().includes(q);
    });
  }, [reports, query, category]);

  const quick = reports.filter(report => report.quick);
  const pinnedReports = pinned.map(id => byId.get(id)).filter(Boolean);
  const recentReports = recent.map(id => byId.get(id)).filter(Boolean);

  const openReport = report => {
    touchRecent(report.id);
    navigate(report.href);
  };

  const categories = useMemo(
    () => REPORT_CATEGORIES.filter(item => reports.some(report => report.category === item.id)),
    [reports],
  );

  return (
    <main className="shell ft-reports" aria-label="Reports Center">
      <header className="ft-reports-hero">
        <p className="ft-reports-kicker">Reports Center</p>
        <h1 className="ft-reports-title">Understand your business in plain language</h1>
        <p className="ft-reports-lead">
          Pick a report to see what changed, what needs attention, and the numbers behind it.
          Accounts company reports stay under Accounts → Reports; this hub gathers FinTrack reports in one place.
        </p>
      </header>

      <div className="ft-reports-toolbar">
        <label className="ft-sr-only" htmlFor="ft-reports-search">Search reports</label>
        <span className="ft-reports-search-wrap">
          <Search size={16} aria-hidden="true" />
          <input
            id="ft-reports-search"
            className="ft-reports-search"
            type="search"
            placeholder="Search reports…"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </span>
      </div>

      <div className="ft-reports-chips" role="tablist" aria-label="Report categories">
        <button type="button" className={`ft-reports-chip${category === "all" ? " is-on" : ""}`} onClick={() => setCategory("all")}>All</button>
        {categories.map(item => (
          <button
            key={item.id}
            type="button"
            className={`ft-reports-chip${category === item.id ? " is-on" : ""}`}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!query && category === "all" && pinnedReports.length > 0 && (
        <section className="ft-reports-section" aria-label="Favourites">
          <h2>Favourites</h2>
          <div className="ft-reports-grid">
            {pinnedReports.map(report => (
              <ReportCard key={report.id} report={report} pinned onOpen={openReport} onTogglePin={togglePinned} />
            ))}
          </div>
        </section>
      )}

      {!query && category === "all" && recentReports.length > 0 && (
        <section className="ft-reports-section" aria-label="Recently viewed">
          <h2>Recently viewed</h2>
          <div className="ft-reports-grid">
            {recentReports.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                pinned={pinned.includes(report.id)}
                onOpen={openReport}
                onTogglePin={togglePinned}
              />
            ))}
          </div>
        </section>
      )}

      {!query && category === "all" && quick.length > 0 && (
        <section className="ft-reports-section" aria-label="Quick access">
          <h2>Quick access</h2>
          <div className="ft-reports-grid">
            {quick.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                pinned={pinned.includes(report.id)}
                onOpen={openReport}
                onTogglePin={togglePinned}
              />
            ))}
          </div>
        </section>
      )}

      <section className="ft-reports-section" aria-label="All matching reports">
        <h2>{category === "all" ? "All reports" : (categories.find(item => item.id === category)?.label || "Reports")}</h2>
        {filtered.length ? (
          <div className="ft-reports-grid">
            {filtered.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                pinned={pinned.includes(report.id)}
                onOpen={openReport}
                onTogglePin={togglePinned}
              />
            ))}
          </div>
        ) : (
          <p className="ft-reports-empty">
            {reports.length
              ? "No reports match that search. Try another word, or clear the category filter."
              : "No report modules are enabled on this plan yet. Turn on Accounts, Cashbook, or Finance in Settings."}
          </p>
        )}
      </section>
    </main>
  );
}
