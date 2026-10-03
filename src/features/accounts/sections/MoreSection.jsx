import { ChevronRight } from "lucide-react";

export function MoreSection({ manufacturingEnabled, openSection, moreLinks }) {
  return (
    <div className="acc-panel">
      <p className="copy">Ledger, banking, statements and setup. Day-to-day work stays on Home, Transactions, Parties and Reports.</p>
      <div className="acc-landing-grid spacer">
        {manufacturingEnabled && <button type="button" className="card acc-landing-card manufacturing-landing-card" onClick={() => openSection("manufacturing")}><span><strong>Manufacturing</strong><p className="small">Materials, production flow and finished goods</p></span><ChevronRight className="acc-landing-arrow" size={18} aria-hidden="true" /></button>}
        {moreLinks.map(([id, title, copy]) => (
          <button key={id} type="button" className="card acc-landing-card" onClick={() => openSection(id)}>
            <span><strong>{title}</strong>{copy && <p className="small">{copy}</p>}</span>
            <ChevronRight className="acc-landing-arrow" size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
