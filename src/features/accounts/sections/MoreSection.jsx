export function MoreSection({ manufacturingEnabled, openSection, moreLinks }) {
  return (
    <div className="acc-panel">
      <p className="copy">Ledger, banking, statements and setup. Day-to-day work stays on Home, Transactions, Parties and Reports.</p>
      <div className="acc-landing-grid spacer">
        {manufacturingEnabled && <button type="button" className="card acc-landing-card manufacturing-landing-card" onClick={() => openSection("manufacturing")}><strong>Manufacturing</strong><p className="small">Materials, production flow and finished goods</p></button>}
        {moreLinks.map(([id, title]) => (
          <button key={id} type="button" className="card acc-landing-card" onClick={() => openSection(id)}>
            <strong>{title}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
