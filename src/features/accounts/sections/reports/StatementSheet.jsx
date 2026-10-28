/**
 * Premium financial-statement layout for on-screen reports.
 * rows: { id, label, amount?, display?, kind?: "section"|"line"|"total"|"result"|"note"|"blank", tone?: "good"|"bad" }
 */
export function StatementSheet({ title, periodLabel = "", columns = ["Particulars", "Amount (₹)"], rows = [] }) {
  const amountLabel = columns[1] || "Amount (₹)";
  return (
    <section className="acc-stmt" aria-label={title || "Statement"}>
      {(title || periodLabel) && (
        <header className="acc-stmt-head">
          {title ? <h3 className="acc-stmt-title">{title}</h3> : null}
          {periodLabel ? <p className="acc-stmt-period">{periodLabel}</p> : null}
        </header>
      )}
      <div className="acc-stmt-table-wrap">
        <table className="acc-stmt-table">
          <thead>
            <tr>
              <th scope="col">{columns[0] || "Particulars"}</th>
              <th scope="col" className="acc-num">{amountLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              if (row.kind === "blank") {
                return <tr key={row.id} className="acc-stmt-blank" aria-hidden="true"><td colSpan={2} /></tr>;
              }
              if (row.kind === "note") {
                return (
                  <tr key={row.id} className="acc-stmt-note">
                    <td colSpan={2}>{row.label}</td>
                  </tr>
                );
              }
              const tone = row.tone === "good" ? " is-good" : row.tone === "bad" ? " is-bad" : "";
              return (
                <tr key={row.id} className={`acc-stmt-${row.kind || "line"}${tone}`}>
                  <td>{row.label}</td>
                  <td className="acc-num">{row.display ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Two-column statement (Balance Sheet assets vs liabilities). */
export function StatementSheetPair({ left, right }) {
  return (
    <div className="acc-stmt-pair">
      <StatementSheet {...left} />
      <StatementSheet {...right} />
    </div>
  );
}
